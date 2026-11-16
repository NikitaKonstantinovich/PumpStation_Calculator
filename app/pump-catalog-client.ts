import type { Pump } from "./pump-catalog";
import pumpMasses from "../data/component-mass-pumps.json";

type PumpMass = {
  value: number; source: string; model: string; manufacturer: string; series: string; power: number | null;
  alternatives?: Array<{ value: number; source: string }>;
};
const documentedMasses: Record<string, PumpMass> = pumpMasses;
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

export function mergePumpCatalog(bundled: readonly Pump[], manual: readonly Pump[]): Pump[] {
  const ids = new Set(bundled.map(pump => pump.id));
  return [...bundled.map(pump => {
    const entry = Object.hasOwn(documentedMasses, pump.id) ? documentedMasses[pump.id] : undefined;
    if (!entry || entry.model !== pump.model || entry.manufacturer !== pump.manufacturer || entry.series !== pump.series || entry.power !== pump.power) return pump;
    const known = [pump.weightKg, pump.dimensions?.["Нетто, кг"], pump.dimensions?.["Масса, кг"], pump.dimensions?.weight_kg].filter(positive);
    const value = Math.max(entry.value, ...known);
    const existingSource = pump.physicalDataSources?.["Масса"] ?? "действующий каталог насосов";
    const observations = [{ value: entry.value, source: entry.source },
      ...[...new Set(known)].filter(mass => mass !== entry.value).map(mass => ({ value: mass, source: existingSource })),
      ...(entry.alternatives ?? [])].sort((a, b) => b.value - a.value);
    const sources = observations.length === 1 ? entry.source : observations.map(other => `${other.value} кг (${other.source})`).join(" | ");
    return { ...pump, weightKg: value, physicalDataSources: { ...pump.physicalDataSources, "Масса": sources } };
  }), ...manual.filter(pump => !ids.has(pump.id))];
}
export async function loadPumpCatalog(signal?: AbortSignal): Promise<Pump[]> {
  const [bundledResponse, manualResponse] = await Promise.all([
    fetch("/pumps.json", { cache: "no-store", signal }), fetch("/api/pumps", { cache: "no-store", signal }),
  ]);
  if (!bundledResponse.ok || !manualResponse.ok) throw new Error("Не удалось загрузить каталог насосов.");
  const [bundled, manual] = await Promise.all([bundledResponse.json(), manualResponse.json()]);
  if (!Array.isArray(bundled) || !manual || typeof manual !== "object" || !("pumps" in manual) || !Array.isArray(manual.pumps)) throw new Error("Некорректный каталог насосов.");
  return mergePumpCatalog(bundled, manual.pumps);
}
