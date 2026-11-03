import type { Pump } from "./pump-catalog";

export function mergePumpCatalog(bundled: readonly Pump[], manual: readonly Pump[]): Pump[] {
  const ids = new Set(bundled.map(pump => pump.id));
  return [...bundled, ...manual.filter(pump => !ids.has(pump.id))];
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
