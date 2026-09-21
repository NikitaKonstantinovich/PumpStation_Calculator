import type { CollectorMaterial, DnEntity, InputEntity, SettingsEntity, ValveConnection } from "./project-config";
import { resolvePumpPort } from "./pump-ports";

export const STANDARD_DN = [25,32,40,50,65,80,100,125,150,200,250,300,350,400,450,500,600,700,800,900,1000,1200] as const;
export const dnVelocityLimit = (dn: number) => dn <= 250 ? 2 : 3;
// Existing nominal-DN recommendation used by the DN tool. Collector velocities
// themselves are calculated from catalogue internal diameters.
export const flowVelocity = (flow: number, dn: number) => flow / 3600 / (Math.PI * (dn / 1000) ** 2 / 4);
export const recommendedDn = (flow: number) => STANDARD_DN.find(dn => flowVelocity(flow, dn) <= dnVelocityLimit(dn)) ?? STANDARD_DN.at(-1)!;
export const defaultCollectorMaterial = (settings: SettingsEntity): CollectorMaterial => settings.stationType === "fire" ? "st20" : "aisi304";

export const circuitSupportsThread = (settings: Pick<SettingsEntity, "stationType">, secondary = false) =>
  secondary || settings.stationType === "utility" || settings.stationType === "smart";

export function resolveDnConnection(settings: Pick<SettingsEntity, "stationType">, dn: number | null, secondary = false, saved?: ValveConnection | null) {
  const forcedFlanged = !circuitSupportsThread(settings, secondary);
  const threadedAllowed = !forcedFlanged && dn !== null && dn > 0 && dn <= 50;
  const connection: ValveConnection = threadedAllowed ? saved ?? "threaded" : "flanged";
  return { connection, threadedAllowed, forcedFlanged };
}

export function suctionHydraulics(entity: DnEntity, input: InputEntity, settings: SettingsEntity, secondary = false) {
  const port = resolvePumpPort(entity, input, secondary);
  const saved = secondary ? entity.secondaryConnectionType : entity.connectionType;
  const savedType = secondary ? entity.secondarySuctionValveType : entity.suctionValveType;
  const rawDn = (secondary ? entity.secondarySuctionValveDn : entity.suctionValveDn) ?? recommendedDn((input.flowRate ?? 0) / Math.max(1, input.workingPumpCount ?? 1));
  const defaultDn = port?.connection === "threaded" && saved !== "flanged" && circuitSupportsThread(settings, secondary) ? port.dn : rawDn;
  const pairDn = secondary ? entity.secondaryDischargeValveDn : entity.dischargeValveDn;
  const commonDn = port ? defaultDn : Math.max(rawDn, pairDn ?? recommendedDn((input.flowRate ?? 0) / Math.max(1, input.workingPumpCount ?? 1)));
  const resolved = resolveDnConnection(settings, commonDn, secondary, saved);
  const valveType = resolved.connection === "threaded" ? "ball" : savedType ?? "butterfly";
  const connection: ValveConnection = valveType === "ball" ? "threaded" : "flanged";
  const locked = port?.connection === "threaded" && connection === "threaded";
  const dn = locked ? port.dn : rawDn;
  const pn = (secondary ? entity.secondaryPn : entity.pn) ?? 16;
  const errors: string[] = [];
  if (!port) errors.push("Укажите DN и соединение всасывающего патрубка выбранного насоса.");
  if (port?.maxPressure && pn > port.maxPressure) errors.push(`PN${pn} превышает допустимое давление подключения насоса ${port.maxPressure} бар.`);
  if (connection === "threaded" && dn > 50) errors.push(`Шаровой кран DN${dn}: резьбовое исполнение доступно только до DN50.`);
  if (port?.connection === "flanged" && connection === "flanged" && port.dn > dn) errors.push(`DN патрубка насоса (${port.dn}) больше DN арматуры (${dn}). Увеличьте DN арматуры.`);
  return { port, dn, connection, valveType, locked, errors, pn };
}
