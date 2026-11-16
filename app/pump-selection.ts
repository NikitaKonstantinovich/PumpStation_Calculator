import { engineeringOperation, registerOperation } from "./engineering/runtime";
import { cataloguePurchasePriceRub, operatingPoint, selectionHeadAtFlow, usablePump, type Pump } from "./pump-catalog";
import { matchesPumpFilters, type PumpFilters } from "./pump-filters";
import { MAX_WORKING_PUMPS } from "./pump-counts";

export type PumpSortMode = "distance" | "price";
export type PumpSelectionInput = {
  /** Explicit node request scope; legacy station callers may omit it. */
  contour?: "main" | "secondary";
  flowRate: number;
  head: number;
  staticHead: number;
  workingPumpCount: number;
  medium: "water" | "wastewater";
};
export type PumpSelectionFilters = PumpFilters;
type PriceSettings = Parameters<typeof cataloguePurchasePriceRub>[1];

export const OPERATING_POINT_PERCENT_EPSILON = 1e-7;
export const MINIMUM_HEAD_RESERVE_PERCENT = -5;
export const PUMP_RESULT_LIMIT = 100;
export const HEAD_RESERVE_WARNING_PERCENT = 15;

export function headReserveClass(reserve: number) {
  return reserve < 0 ? "danger" : reserve > HEAD_RESERVE_WARNING_PERCENT ? "warning" : "good";
}

export type OperatingPointMetrics = {
  flow: number;
  head: number;
  deltaQPercent: number;
  deltaHPercent: number;
  pointDistance: number;
};
export type PumpSelectionCandidate = {
  pump: Pump;
  headAtRequestedFlow: number;
  headReservePercent: number;
  purchasePriceRub: number | null;
  point: OperatingPointMetrics | null;
  pointIssue: string | null;
  preferredByOperatingPoint: boolean;
};

export function corePreferredOperatingPoint(deltaQPercent: number, deltaHPercent: number) {
  // Tolerance is in percentage points and is only used for these inclusive bounds.
  return [deltaQPercent, deltaHPercent].every(value => Number.isFinite(value) &&
    value >= -2 - OPERATING_POINT_PERCENT_EPSILON && value <= 15 + OPERATING_POINT_PERCENT_EPSILON);
}

export function coreFilterSelectionCatalog(catalogue: readonly Pump[], input: PumpSelectionInput, filters: PumpSelectionFilters = {}) {
  if (![input.flowRate, input.head, input.staticHead, input.workingPumpCount].every(Number.isFinite) ||
    input.flowRate <= 0 || input.head <= 0 || input.staticHead < 0 || input.staticHead > input.head ||
    !Number.isInteger(input.workingPumpCount) || input.workingPumpCount < 1 || input.workingPumpCount > MAX_WORKING_PUMPS) return [];

  return catalogue.filter(pump=>usablePump(pump,input.medium)&&matchesPumpFilters(pump,filters));
}
export function coreReserveCandidates(catalogue:readonly Pump[],input:PumpSelectionInput,minimum:number) {
  const candidates: Array<Pick<PumpSelectionCandidate,"pump"|"headAtRequestedFlow"|"headReservePercent">>=[];
  for(const pump of catalogue){
    const headAtRequestedFlow = selectionHeadAtFlow(pump, input.flowRate / input.workingPumpCount);
    if (headAtRequestedFlow === null) continue;
    const headReservePercent = (headAtRequestedFlow - input.head) / input.head * 100;
    if (!Number.isFinite(headReservePercent) || headReservePercent < minimum) continue;
    candidates.push({pump,headAtRequestedFlow,headReservePercent});
  }
  return candidates;
}
export function coreMeasureCandidates(rows:ReturnType<typeof coreReserveCandidates>,input:PumpSelectionInput,settings:PriceSettings) {
  const candidates:PumpSelectionCandidate[]=[];
  for(const {pump,headAtRequestedFlow,headReservePercent} of rows){
    const actual = operatingPoint(pump, input.workingPumpCount, input, "pchip");
    let point: OperatingPointMetrics | null = null;
    let pointIssue: string | null = null;
    if (!actual) pointIssue = "Пересечение характеристики насоса и системы не найдено";
    else {
      const deltaQPercent = 100 * (actual.flow - input.flowRate) / input.flowRate;
      const deltaHPercent = 100 * (actual.head - input.head) / input.head;
      const pointDistance = Math.hypot(deltaQPercent, deltaHPercent);
      const pumpFlow = actual.flow / input.workingPumpCount;
      const range = pump.selectionFlowRange;
      if (![actual.flow, actual.head, deltaQPercent, deltaHPercent, pointDistance].every(Number.isFinite)) {
        pointIssue = "Не удалось получить числовую оценку рабочей точки";
      } else if (range && (pumpFlow < range[0] || pumpFlow > range[1])) {
        pointIssue = "Фактический расход одного насоса вне рабочего диапазона";
      } else point = { ...actual, deltaQPercent, deltaHPercent, pointDistance };
    }
    const price = cataloguePurchasePriceRub(pump, settings);
    candidates.push({ pump, headAtRequestedFlow, headReservePercent,
      purchasePriceRub: price !== null && Number.isFinite(price) ? price : null,
      point, pointIssue,
      preferredByOperatingPoint: point !== null && preferredOperatingPoint(point.deltaQPercent, point.deltaHPercent) });
  }
  return candidates;
}

export function coreEvaluatePumpCandidates(catalogue:readonly Pump[],input:PumpSelectionInput,settings:PriceSettings,filters:PumpSelectionFilters={}) {
  return measureCandidates(reserveCandidates(filterSelectionCatalog(catalogue,input,filters),input,MINIMUM_HEAD_RESERVE_PERCENT),input,settings);
}
function compareOptionalNumber(a: number | null, b: number | null) {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function comparePumpCandidates(a: PumpSelectionCandidate, b: PumpSelectionCandidate, mode: PumpSortMode) {
  const unavailable = Number(a.point === null) - Number(b.point === null);
  if (unavailable) return unavailable;
  const price = () => compareOptionalNumber(a.purchasePriceRub, b.purchasePriceRub);
  const distance = () => compareOptionalNumber(a.point?.pointDistance ?? null, b.point?.pointDistance ?? null);
  const difference = mode === "price"
    ? Number(b.preferredByOperatingPoint) - Number(a.preferredByOperatingPoint) || price() || distance()
    : distance() || price();
  return difference || (a.pump.id < b.pump.id ? -1 : a.pump.id > b.pump.id ? 1 : 0);
}

export function buildPumpSelection(catalogue: readonly Pump[], input: PumpSelectionInput, settings: PriceSettings, filters: PumpSelectionFilters = {}, mode: PumpSortMode = "distance") {
  // Calculate each point and price once, before the comparator and the display limit.
  const ranked = evaluatePumpCandidates(catalogue, input, settings, filters).sort((a, b) => comparePumpCandidates(a, b, mode));
  return {
    candidates: ranked.slice(0, PUMP_RESULT_LIMIT),
    selectedPumpId: ranked.find(candidate => candidate.point !== null)?.pump.id,
  };
}

export function evaluatePumpCandidates(...args: Parameters<typeof coreEvaluatePumpCandidates>): ReturnType<typeof coreEvaluatePumpCandidates> {
  return engineeringOperation("evaluatePumpCandidates", coreEvaluatePumpCandidates, args);
}

registerOperation("evaluatePumpCandidates", ["catalogue","input","settings","filters"], coreEvaluatePumpCandidates);

export function preferredOperatingPoint(...args: Parameters<typeof corePreferredOperatingPoint>): ReturnType<typeof corePreferredOperatingPoint> {
  return engineeringOperation("preferredOperatingPoint", corePreferredOperatingPoint, args);
}

registerOperation("preferredOperatingPoint", ["deltaQPercent","deltaHPercent"], corePreferredOperatingPoint);

export function filterSelectionCatalog(...args: Parameters<typeof coreFilterSelectionCatalog>): ReturnType<typeof coreFilterSelectionCatalog> {
  return engineeringOperation("filterSelectionCatalog", coreFilterSelectionCatalog, args);
}
registerOperation("filterSelectionCatalog", ["catalogue","input","filters"], coreFilterSelectionCatalog);

export function reserveCandidates(...args: Parameters<typeof coreReserveCandidates>): ReturnType<typeof coreReserveCandidates> {
  return engineeringOperation("reserveCandidates", coreReserveCandidates, args);
}
registerOperation("reserveCandidates", ["catalogue","input","minimum"], coreReserveCandidates);

export function measureCandidates(...args: Parameters<typeof coreMeasureCandidates>): ReturnType<typeof coreMeasureCandidates> {
  return engineeringOperation("measureCandidates", coreMeasureCandidates, args);
}
registerOperation("measureCandidates", ["rows","input","settings"], coreMeasureCandidates);
