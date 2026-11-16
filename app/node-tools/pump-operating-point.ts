import type { PumpSelectionInput } from "../pump-selection";
import type { CurveMethod } from "../curve-methods";
import type { SelectionState } from "./pump-nodes";
import type { CatalogItem } from "./catalog-schema";
import { pumpDetailValue, type PumpDetailSection, type PumpDetailRow } from "./pump-card-presentation";

export type OperatingPointContext = {
  variantId: string; modelId: string; curveSetId: string | null; snapshotId: string;
  requestKey: string; selectionNode: string; sourceFrequencyHz: number | null;
  request: PumpSelectionInput; method: CurveMethod; frequencyHz: number;
  nominalHz: number; frequencyAdjusted: boolean; assumedFrequency: boolean;
};
export type PumpOperatingPoint = {
  status: "ready" | "unavailable"; message: string;
  context?: OperatingPointContext; point: { flow: number; head: number } | null;
  metrics?: { efficiency: number | null; power: number | null; npshr: number | null };
};
export function samePumpRequest(a: PumpSelectionInput, b: PumpSelectionInput): boolean {
  return !!a && !!b && (["flowRate", "head", "staticHead", "workingPumpCount", "medium", "contour"] as const).every(key => a[key] === b[key]);
}
/** Consumes a chart result; never recalculates an intersection in the card. */
export function operatingPointSection(value: unknown, item: CatalogItem, state: SelectionState): PumpDetailSection {
  const data = value as PumpOperatingPoint | null, c = data?.context;
  const section: PumpDetailSection = { id: "point", title: "Рабочая точка по расчёту", rows: [], note: "Подключите результат инструмента «Гидравлическая кривая» этого контура." };
  if (!data) return section;
  if (!c || !state.request || !state.node || c.selectionNode !== state.node || c.variantId !== item.variantId || c.modelId !== item.modelId || c.curveSetId !== item.curveSetId || c.sourceFrequencyHz !== item.frequencyHz || c.snapshotId !== state.snapshotId || c.requestKey !== state.requestKey || !samePumpRequest(c.request, state.request)) return { ...section, note: "Рабочая точка относится к другому выбору, контуру или устаревшим условиям. Проверьте связь с гидравлической кривой." };
  if (data.status !== "ready" || !data.point) return { ...section, note: data.message || "Пересечение характеристик в расчётном диапазоне не найдено." };
  const count = c.request.workingPumpCount;
  if (![data.point.flow, data.point.head, c.frequencyHz, c.nominalHz, count].every(Number.isFinite) || count < 1 || !Number.isInteger(count) || c.frequencyHz <= 0 || c.nominalHz <= 0 || data.point.flow < 0 || data.point.head < 0) return { ...section, note: "Результат рабочей точки некорректен." };
  const row = (key: string, label: string, v: number, unit: string): PumpDetailRow => ({ key, label, value: pumpDetailValue(v) + " " + unit, origin: "Расчёт гидравлической кривой" });
  section.rows = [row("requiredFlow", "Требуемый расход группы", c.request.flowRate, "м³/ч"), row("requiredHead", "Требуемый напор", c.request.head, "м"), row("actualFlow", "Рабочий расход группы", data.point.flow, "м³/ч"), row("pumpFlow", "Рабочий расход одного насоса", data.point.flow / count, "м³/ч"), row("actualHead", "Рабочий напор", data.point.head, "м"), row("workingCount", "Работающих насосов", count, "шт."), row("workingFrequency", "Частота расчёта", c.frequencyHz, "Гц")];
  for (const [key, label, unit] of [["efficiency", "КПД в рабочей точке", "%"], ["power", "Мощность по исходной кривой в рабочей точке (назначение P1/P2 не подтверждено)", "кВт"], ["npshr", "NPSHr насоса в рабочей точке", "м"]] as const) {
    const v = data.metrics?.[key]; if (typeof v === "number" && Number.isFinite(v)) section.rows.push(row("point_" + key, label, v, unit));
  }
  section.note = "Рассчитанное пересечение характеристики работающих насосов и системы; это не измерение на установке. " + (c.frequencyAdjusted ? "Режим частотного регулирования. " : "Исходная характеристика. ") + (c.assumedFrequency ? "Номинальная частота принята расчётом: " + pumpDetailValue(c.nominalHz) + " Гц; в каталоге не подтверждена." : "");
  return section;
}
