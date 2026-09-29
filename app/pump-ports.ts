import evidence from "./pump-connections.json";
import importedPorts from "./imported-pump-ports.json";
import catalogNozzles from "./pump-nozzles.json";
import type { DnEntity, InputEntity, ValveConnection } from "./project-config";

// maxInletPressure is an explicit inlet rating in bar, never inferred from maxPressure.
export type PumpPort = { dn: number; connection: ValveConnection; maxPressure?: number | null; maxInletPressure?: number | null; source: string; shape?: "oval" | "round" };
export type PumpPortOverride = { pumpId: string; dn: number | null; connection: ValveConnection | null; maxPressure?: number | null; maxInletPressure?: number | null; source: string };
export type PumpPortData = Omit<PumpPortOverride, "pumpId">;
export type PumpPortSide = "inlet" | "outlet";
const complete = (port: PumpPortData | null | undefined): port is PumpPort => Boolean(port && typeof port.dn === "number" && Number.isFinite(port.dn) && port.dn > 0 && (port.connection === "threaded" || port.connection === "flanged"));

export function pumpPortField(secondary = false, side: PumpPortSide = "inlet") {
  return side === "inlet" ? (secondary ? "secondaryPumpSuctionPort" : "pumpSuctionPort")
    : (secondary ? "secondaryPumpDischargePort" : "pumpDischargePort");
}

export function pumpPortChoices(pumpId?: string, side: PumpPortSide = "inlet"): PumpPort[] {
  const catalog = (catalogNozzles as Record<string, Partial<Record<PumpPortSide, PumpPortData | null>>>)[pumpId ?? ""]?.[side];
  if (complete(catalog)) return [catalog];
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
export function catalogPumpPort(pumpId?: string, side: PumpPortSide = "inlet"): PumpPortData | null {
  const catalog = (catalogNozzles as Record<string, Partial<Record<PumpPortSide, PumpPortData | null>>>)[pumpId ?? ""]?.[side];
  if (catalog) return catalog;
  const choices = pumpPortChoices(pumpId, side);
  return choices.length === 1 ? choices[0] : null;
}

export function resolvePumpPortData(entity: DnEntity, input: InputEntity, secondary = false, side: PumpPortSide = "inlet"): PumpPortData | null {
  const override = entity[pumpPortField(secondary, side)];
  if (input.selectedPumpId && override?.pumpId === input.selectedPumpId) {
    return override;
  }
  return catalogPumpPort(input.selectedPumpId, side);
}

export function resolvePumpPort(entity: DnEntity, input: InputEntity, secondary = false, side: PumpPortSide = "inlet"): PumpPort | null {
  const port = resolvePumpPortData(entity, input, secondary, side);
  return complete(port) ? port : null;
}
