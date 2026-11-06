import { engineeringOperation, registerOperation } from "./engineering/runtime";
import type { CollectorMaterial, DnEntity, InputEntity, SettingsEntity, ValveConnection } from "./project-config";
import { isMultistagePump, resolvePumpPort, resolvePumpPortData } from "./pump-ports";
import { pressureChecksEnabled } from "./pressure-check-policy";
import { baseVelocityLimit, type VelocityRule } from "./base-values";
import type { Pump } from "./pump-catalog";

export type InletPressureCheck = { status: "missing-head" | "unknown-limit" | "exceeded" | "within-limit" | "nonpositive"; message: string; pressureBar: number | null; limitBar: number | null };
export const coreInletPressureBar = (head: number | null | undefined) => typeof head === "number" && Number.isFinite(head) ? head * 0.0980665 : null;
export const pressureCheckWarning = (check: InletPressureCheck) => ["missing-head", "unknown-limit", "exceeded"].includes(check.status);
export function coreCheckInletPressure(head: number | null | undefined, element: string, limit: number | null | undefined, limitLabel?: string): InletPressureCheck {
  const pressureBar = inletPressureBar(head), limitBar = typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? limit : null;
  const format = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  const result = (status: InletPressureCheck["status"], message: string) => ({ status, message, pressureBar, limitBar });
  if (pressureBar === null) return result("missing-head", `${element}: напор на входе не задан — проверка давления по напору на входе не выполнена.`);
  const basis = `Напор на входе ${format(head!)} м соответствует ${format(pressureBar)} бар`;
  if (limitBar === null) return result("unknown-limit", `${basis}. ${element}: допустимое давление неизвестно — данных для проверки недостаточно.`);
  if (pressureBar <= 0) return result("nonpositive", `${basis}. ${element}: превышения положительного ограничения давления нет; работа под вакуумом этой проверкой не оценивается.`);
  const restriction = limitLabel ?? `${format(limitBar)} бар`;
  return pressureBar > limitBar + 1e-9
    ? result("exceeded", `${basis} и превышает ${restriction}: ${element}.`)
    : result("within-limit", `${basis}. ${element}: ограничение ${restriction} по указанному напору не превышено.`);
}

export const STANDARD_DN = [25,32,40,50,65,80,100,125,150,200,250,300,350,400,450,500,600,700,800,900,1000,1200] as const;
export const dnVelocityLimit = (dn: number, rules?: VelocityRule[]) => baseVelocityLimit(dn,rules);
// Existing nominal-DN recommendation used by the DN tool. Collector velocities
// themselves are calculated from catalogue internal diameters.
export const coreFlowVelocity = (flow: number, dn: number) => flow / 3600 / (Math.PI * (dn / 1000) ** 2 / 4);
export const coreRecommendedDn = (flow: number, rules?: VelocityRule[]) => STANDARD_DN.find(dn => flowVelocity(flow, dn) <= dnVelocityLimit(dn,rules)) ?? STANDARD_DN.at(-1)!;
export const defaultCollectorMaterial = (settings: SettingsEntity): CollectorMaterial => settings.stationType === "fire" ? "st20" : "aisi304";

export const circuitSupportsThread = (settings: Pick<SettingsEntity, "stationType">, secondary = false) =>
  secondary || settings.stationType === "utility" || settings.stationType === "smart";

export function coreResolveDnConnection(settings: Pick<SettingsEntity, "stationType">, dn: number | null, secondary = false, saved?: ValveConnection | null) {
  const forcedFlanged = !circuitSupportsThread(settings, secondary);
  const threadedAllowed = !forcedFlanged && dn !== null && dn > 0 && dn <= 50;
  const connection: ValveConnection = threadedAllowed ? saved ?? "threaded" : "flanged";
  return { connection, threadedAllowed, forcedFlanged };
}

function lineHydraulics(entity: DnEntity, input: InputEntity, settings: SettingsEntity, secondary: boolean, side: "inlet" | "outlet", pump?: Pump) {
  const port = resolvePumpPort(entity, input, secondary, side, pump);
  const portData = resolvePumpPortData(entity, input, secondary, side, pump);
  const saved = secondary ? entity.secondaryConnectionType : entity.connectionType;
  const suction = side === "inlet";
  const savedType = suction ? (secondary ? entity.secondarySuctionValveType : entity.suctionValveType) : (secondary ? entity.secondaryDischargeValveType : entity.dischargeValveType);
  const savedDn = suction ? (secondary ? entity.secondarySuctionValveDn : entity.suctionValveDn) : (secondary ? entity.secondaryDischargeValveDn : entity.dischargeValveDn);
  const nozzleDefault = isMultistagePump(input.selectedPumpId, pump);
  const rawDn = savedDn ?? (nozzleDefault ? portData?.dn : undefined) ?? recommendedDn((input.flowRate ?? 0) / Math.max(1, input.workingPumpCount ?? 1), settings.baseValues?.values.velocity);
  const defaultDn = port?.connection === "threaded" && saved !== "flanged" && circuitSupportsThread(settings, secondary) ? port.dn : rawDn;
  const pairDn = suction ? (secondary ? entity.secondaryDischargeValveDn : entity.dischargeValveDn) : (secondary ? entity.secondarySuctionValveDn : entity.suctionValveDn);
  const commonDn = port ? defaultDn : Math.max(rawDn, pairDn ?? recommendedDn((input.flowRate ?? 0) / Math.max(1, input.workingPumpCount ?? 1), settings.baseValues?.values.velocity));
  const resolved = resolveDnConnection(settings, commonDn, secondary, saved);
  const valveType = resolved.connection === "threaded" ? "ball" : savedType ?? "butterfly";
  const connection: ValveConnection = valveType === "ball" ? "threaded" : "flanged";
  const locked = port?.connection === "threaded" && connection === "threaded";
  const dn = locked ? port.dn : rawDn;
  const pn = (secondary ? entity.secondaryPn : entity.pn) ?? 16;
  const errors: string[] = [];
  if (!port) errors.push(`Укажите ${portData?.dn ? "тип соединения" : portData?.connection ? "DN" : "DN и соединение"} ${suction ? "всасывающего" : "напорного"} патрубка выбранного насоса.`);
  if (connection === "threaded" && dn > 50) errors.push(`Шаровой кран DN${dn}: резьбовое исполнение доступно только до DN50.`);
  if (port?.connection === "flanged" && connection === "flanged" && port.dn > dn) errors.push(`DN патрубка насоса (${port.dn}) больше DN арматуры (${dn}). Увеличьте DN арматуры.`);
  return { port, dn, connection, valveType, locked, errors, pn, nozzleDefault };
}

export function coreSuctionHydraulics(entity: DnEntity, input: InputEntity, settings: SettingsEntity, secondary = false, pump?: Pump) {
  const inletPressureCheck = pressureChecksEnabled(settings) ? checkInletPressure(settings.inletHead, `Насос контура ${secondary ? 2 : 1}: допустимое давление на входе`, resolvePumpPortData(entity, input, secondary, "inlet", pump)?.maxInletPressure) : null;
  return { ...lineHydraulics(entity, input, settings, secondary, "inlet", pump), inletPressureCheck };
}

export function coreDischargeHydraulics(entity: DnEntity, input: InputEntity, settings: SettingsEntity, secondary = false, pump?: Pump) {
  return lineHydraulics(entity, input, settings, secondary, "outlet", pump);
}

export function checkInletPressure(...args: Parameters<typeof coreCheckInletPressure>): ReturnType<typeof coreCheckInletPressure> {
  return engineeringOperation("checkInletPressure", coreCheckInletPressure, args);
}

export function resolveDnConnection(...args: Parameters<typeof coreResolveDnConnection>): ReturnType<typeof coreResolveDnConnection> {
  return engineeringOperation("resolveDnConnection", coreResolveDnConnection, args);
}

export function suctionHydraulics(...args: Parameters<typeof coreSuctionHydraulics>): ReturnType<typeof coreSuctionHydraulics> {
  return engineeringOperation("suctionHydraulics", coreSuctionHydraulics, args);
}

export function dischargeHydraulics(...args: Parameters<typeof coreDischargeHydraulics>): ReturnType<typeof coreDischargeHydraulics> {
  return engineeringOperation("dischargeHydraulics", coreDischargeHydraulics, args);
}

registerOperation("checkInletPressure", ["head","element","limit","limitLabel"], coreCheckInletPressure);

registerOperation("resolveDnConnection", ["settings","dn","secondary","saved"], coreResolveDnConnection);

registerOperation("suctionHydraulics", ["entity","input","settings","secondary","pump"], coreSuctionHydraulics);

registerOperation("dischargeHydraulics", ["entity","input","settings","secondary","pump"], coreDischargeHydraulics);

export function flowVelocity(...args: Parameters<typeof coreFlowVelocity>): ReturnType<typeof coreFlowVelocity> {
  return engineeringOperation("flowVelocity", coreFlowVelocity, args);
}

registerOperation("flowVelocity", ["flow","dn"], coreFlowVelocity);

export function recommendedDn(...args: Parameters<typeof coreRecommendedDn>): ReturnType<typeof coreRecommendedDn> {
  return engineeringOperation("recommendedDn", coreRecommendedDn, args);
}

registerOperation("recommendedDn", ["flow","rules"], coreRecommendedDn);

export function inletPressureBar(...args: Parameters<typeof coreInletPressureBar>): ReturnType<typeof coreInletPressureBar> {
  return engineeringOperation("inletPressureBar", coreInletPressureBar, args);
}

registerOperation("inletPressureBar", ["head"], coreInletPressureBar);
