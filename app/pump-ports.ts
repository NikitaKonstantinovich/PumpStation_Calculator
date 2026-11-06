import { engineeringOperation, registerOperation } from "./engineering/runtime";
import evidence from "./pump-connections.json";
import importedPorts from "./imported-pump-ports.json";
import catalogNozzles from "./pump-nozzles.json";
import type { DnEntity, InputEntity, ValveConnection } from "./project-config";
import type { Pump, PumpType } from "./pump-catalog";

export function isMultistagePump(pumpId?: string, pump?: Pump) {
  const type = pump && pump.id === pumpId ? pump.type : (catalogNozzles as Record<string, { type?: PumpType }>)[pumpId ?? ""]?.type;
  return type === "vertical_multistage" || type === "horizontal_multistage";
}

// maxInletPressure is an explicit inlet rating in bar, never inferred from maxPressure.
export type PumpPort = { dn: number; connection: ValveConnection; maxPressure?: number | null; maxInletPressure?: number | null; source: string; shape?: "oval" | "round" };
export type PumpPortOverride = { pumpId: string; dn: number | null; connection: ValveConnection | null; maxPressure?: number | null; maxInletPressure?: number | null; source: string };
export type PumpPortData = Omit<PumpPortOverride, "pumpId">;
export type PumpPortSide = "inlet" | "outlet";
export const completePumpPort = (port: PumpPortData | null | undefined): port is PumpPort => Boolean(port && typeof port.dn === "number" && Number.isFinite(port.dn) && port.dn > 0 && (port.connection === "threaded" || port.connection === "flanged"));
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

// Manual records are stored in D1 after the build-time nozzle index is generated.
// Read their current data explicitly; a DN alone does not specify a connection.
function manualPumpPort(pump: Pump, side: PumpPortSide): PumpPortData | null {
  const nested = pump[side];
  const dn = [nested?.dn, pump[side === "inlet" ? "inletDn" : "outletDn"]].find(positive) ?? null;
  const type = String(nested?.type ?? "").toLowerCase();
  const connection = ["flange", "flanged"].includes(type) ? "flanged" : ["thread", "threaded"].includes(type) ? "threaded" : null;
  if (dn === null && connection === null) return null;
  const pressure = Number(String(nested?.pressure_class ?? "").replace(/^PN\s*/i, ""));
  return { dn, connection, maxPressure: positive(pressure) ? pressure : null, source: pump.source || "Ручное заполнение" };
}

export function pumpPortField(secondary = false, side: PumpPortSide = "inlet") {
  return side === "inlet" ? (secondary ? "secondaryPumpSuctionPort" : "pumpSuctionPort")
    : (secondary ? "secondaryPumpDischargePort" : "pumpDischargePort");
}

export function pumpPortChoices(pumpId?: string, side: PumpPortSide = "inlet"): PumpPort[] {
  const catalog = (catalogNozzles as Record<string, Partial<Record<PumpPortSide, PumpPortData | null>>>)[pumpId ?? ""]?.[side];
  if (completePumpPort(catalog)) return [catalog];
  // Legacy imported evidence describes the inlet only.
  if (side === "outlet") return [];
  const imported = (importedPorts as Record<string, PumpPort[]>)[pumpId ?? ""];
  if (imported) return imported;
  const rows = (evidence as Record<string, Array<{ kind: string; value: string; maxPressure: number | null; source: string }>>)[pumpId ?? ""] ?? [];
  return rows.flatMap(row => {
    const dn = Number(row.value.match(/^DN(\d+)$/i)?.[1]);
    // G on an oval CDM flange describes its mating thread, not a threaded pump nozzle.
    if (!dn || row.kind !== "cdm_round_flange") return [];
    return [{ dn, connection: "flanged" as const, maxPressure: row.maxPressure, source: `${row.source}: ${row.value}`, shape: "round" as const }];
  });
}
export function coreCatalogPumpPort(pumpId?: string, side: PumpPortSide = "inlet", pump?: Pump): PumpPortData | null {
  if (pump && pump.id === pumpId && pump.manualEntry) return manualPumpPort(pump, side);
  const catalog = (catalogNozzles as Record<string, Partial<Record<PumpPortSide, PumpPortData | null>>>)[pumpId ?? ""]?.[side];
  if (catalog) return catalog;
  const choices = pumpPortChoices(pumpId, side);
  return choices.length === 1 ? choices[0] : null;
}

export function coreResolvePumpPortData(entity: DnEntity, input: InputEntity, secondary = false, side: PumpPortSide = "inlet", pump?: Pump): PumpPortData | null {
  const override = entity[pumpPortField(secondary, side)];
  const selected = input.selectedPumpId && override?.pumpId === input.selectedPumpId ? override : null;
  return resolvePort(catalogPumpPort(input.selectedPumpId, side, pump), selected);
}

export function resolvePumpPort(entity: DnEntity, input: InputEntity, secondary = false, side: PumpPortSide = "inlet", pump?: Pump): PumpPort | null {
  const port = resolvePumpPortData(entity, input, secondary, side, pump);
  return completePumpPort(port) ? port : null;
}

export function coreResolvePort(catalog: PumpPortData | null, override: PumpPortData | null): PumpPortData | null {
  return override ?? catalog;
}

export function resolvePort(...args: Parameters<typeof coreResolvePort>): ReturnType<typeof coreResolvePort> {
  return engineeringOperation("resolvePort", coreResolvePort, args);
}

registerOperation("resolvePort", ["catalog","override"], coreResolvePort);

export function resolvePumpPortData(...args: Parameters<typeof coreResolvePumpPortData>): ReturnType<typeof coreResolvePumpPortData> {
  return engineeringOperation("resolvePumpPortData", coreResolvePumpPortData, args);
}
registerOperation("resolvePumpPortData", ["entity","input","secondary","side","pump"], coreResolvePumpPortData);

export function catalogPumpPort(...args: Parameters<typeof coreCatalogPumpPort>): ReturnType<typeof coreCatalogPumpPort> {
  return engineeringOperation("catalogPumpPort", coreCatalogPumpPort, args);
}
registerOperation("catalogPumpPort", ["pumpId","side","pump"], coreCatalogPumpPort);
