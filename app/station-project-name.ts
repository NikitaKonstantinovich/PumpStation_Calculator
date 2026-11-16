import type { Pump } from "./pump-catalog";
import { validRequestNumber } from "./request-number";

type Circuit = { workingPumpCount?: unknown; reservePumpCount?: unknown };
export type StationNameSettings = {
  stationType?: unknown; requestNumber?: unknown; main?: Circuit | null; secondary?: Circuit | null;
  membraneTank?: unknown; cabinetSeparate?: unknown; vibrationCompensators?: unknown;
  collectorPlugs?: unknown; isolatingValves?: unknown;
};
type NamePump = Pick<Pump, "series" | "model">;
const designations = {
  utility: ["повышения давления", "PS"], smart: ["повышения давления", "PS SMART"],
  fire: ["пожаротушения", "FS"], combined: ["совмещенная", "FS"]
} as const;

export function pumpNameDesignation(pump?: NamePump): string {
  if (!pump) return "";
  const series = pump.series.trim(), model = pump.model.trim().replace(/[–—−]/g, "-");
  const rest = series && model.toUpperCase().startsWith(series.toUpperCase()) ? model.slice(series.length).trim() : model;
  const number = rest.match(/[0-9]+(?:[.,][0-9]+)?(?:[-/][0-9]+(?:[.,][0-9]+)?)*/)?.[0];
  return [series, number].filter(Boolean).join(" ") || model;
}
function pumpCount(circuit?: Circuit | null): number | undefined {
  const working = circuit?.workingPumpCount, reserve = circuit?.reservePumpCount;
  return typeof working === "number" && Number.isSafeInteger(working) && working > 0 && typeof reserve === "number" && Number.isSafeInteger(reserve) && reserve >= 0 ? working + reserve : undefined;
}
export function stationProjectName(settings: StationNameSettings, primary?: NamePump, secondary?: NamePump): string | undefined {
  if (!Object.hasOwn(designations, String(settings.stationType))) return;
  const type = settings.stationType as keyof typeof designations, [purpose, code] = designations[type];
  const mainCount = pumpCount(settings.main), secondCount = pumpCount(settings.secondary);
  const count = type === "combined" ? mainCount && secondCount ? `${mainCount}/${secondCount}` : "" : mainCount;
  const mainModel = pumpNameDesignation(primary), secondModel = pumpNameDesignation(secondary);
  // A fire station's second circuit is its jockey: neither its count nor model belongs in the name.
  const models = type === "combined" ? mainModel && secondModel ? `${mainModel}/${secondModel}` : "" : mainModel;
  let name = ["Насосная установка", purpose, "WENARD", code, count, models].filter(Boolean).join(" ");
  const optional = [settings.membraneTank, settings.cabinetSeparate, settings.vibrationCompensators, settings.collectorPlugs,
    (type === "fire" || type === "combined") && settings.isolatingValves].some(value => value === true);
  if (optional) name += " - opt";
  if (validRequestNumber(settings.requestNumber) && settings.requestNumber) name += " - " + settings.requestNumber;
  return name;
}
