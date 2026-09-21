import evidence from "./pump-connections.json";
import type { DnEntity, InputEntity, ValveConnection } from "./project-config";

export type PumpPort = { dn: number; connection: ValveConnection; maxPressure?: number | null; source: string; shape?: "oval" | "round" };
export type PumpPortOverride = { pumpId: string; dn: number | null; connection: ValveConnection | null; maxPressure?: number | null; source: string };
export function pumpPortChoices(pumpId?: string): PumpPort[] {
  const rows = (evidence as Record<string, Array<{ kind: string; value: string; maxPressure: number | null; source: string }>>)[pumpId ?? ""] ?? [];
  return rows.flatMap(row => {
    const dn = Number(row.value.match(/^DN(\d+)$/i)?.[1]);
    // G on an oval CDM flange describes its mating thread, not a threaded pump nozzle.
    if (!dn || row.kind !== "cdm_round_flange") return [];
    return [{ dn, connection: "flanged" as const, maxPressure: row.maxPressure, source: `${row.source}: ${row.value}`, shape: "round" as const }];
  });
}
export function resolvePumpPort(entity: DnEntity, input: InputEntity, secondary = false): PumpPort | null {
  const override = secondary ? entity.secondaryPumpSuctionPort : entity.pumpSuctionPort;
  if (input.selectedPumpId && override?.pumpId === input.selectedPumpId) {
    return typeof override.dn === "number" && Number.isFinite(override.dn) && override.dn > 0 && (override.connection === "threaded" || override.connection === "flanged")
      ? { ...override, dn: override.dn, connection: override.connection } : null;
  }
  const choices = pumpPortChoices(input.selectedPumpId);
  return choices.length === 1 ? choices[0] : null;
}
