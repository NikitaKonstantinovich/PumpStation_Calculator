import { makeField, type Field, type NodeType } from "../engineering/schema";
import type { Pump } from "../pump-catalog";
import type { PumpSelectionInput } from "../pump-selection";
import type { CurveMethod } from "../curve-methods";
import type { PumpFrequencySettings } from "../pump-frequency";
import type { ChartAxisScale, ChartGridSettings } from "../pump-chart-grid";

export type HydraulicChartModel = {
  status: "ready" | "empty";
  message: string;
  selectedPump?: Pump;
  pump?: Pump;
  referencePump?: Pump;
  request?: PumpSelectionInput;
  count: number;
  method: CurveMethod;
  requestedMethod: CurveMethod;
  polynomialAvailable: boolean;
  frequencySettings: PumpFrequencySettings & { pumpId?: string };
  frequency?: { nominalHz: number; frequencyHz: number; minimumHz: number; ratio: number; assumedNominal: boolean };
  warnings: string[];
};
export type HydraulicChartAxes = { flow: ChartAxisScale; head: ChartAxisScale; grid: ChartGridSettings; issues: string[] };
export type HydraulicChartSegments = { solid: string; dashed: string };
export type HydraulicChartPoint = { flow: number; head: number };
export type HydraulicChartData = { model: HydraulicChartModel; axes: HydraulicChartAxes | null; system: HydraulicChartSegments | null; point: HydraulicChartPoint | null };
export const HYDRAULIC_OPERATIONS = ["pump.chartModel", "pump.chartAxes", "pump.chartSystem", "pump.chartPoint", "ui.hydraulicChart", "ui.chartPointBindings"] as const;
const field = (key: string, name: string, meaning: string, kind: Field["kind"] = "object", initial?: unknown): Field => ({ ...makeField(key, name, kind, meaning, "", "input"), ...(initial === undefined ? {} : { initial }) });
const out = (f: Field): Field => ({ ...f, direction: "output" });
const model = () => field("model", "Подготовленная характеристика", "pumpChartModel");
const axes = () => field("axes", "Оси и сетка", "pumpChartAxes");
const binding = (key: string, name: string) => field(key, name, "parameterBinding");
export function hydraulicNodeTypes(): NodeType[] {
  const types: NodeType[] = [];
  const add = (id: string, name: string, description: string, fields: Field[]) => types.push({ id, name, description, category: id.startsWith("ui.") ? "Интерфейс графика" : "Гидравлическая кривая", operation: id, fields, formulas: {} });
  add("pump.chartModel", "Характеристика выбранного насоса", "Проверяет подтверждённое исполнение и подготавливает исходную или частотно изменённую характеристику. Исходный каталог и подбор не изменяются.", [field("item", "Выбранное исполнение", "pumpCatalogItem"), field("selection", "Статус подтверждения", "pumpSelectionState"), field("request", "Условия подбора", "pumpRequest"), { ...field("method", "Способ построения", "curveMethod", "enum", "pchip"), options: ["pchip", "linear", "polynomial"], optionNames: { pchip: "PCHIP — через точки", linear: "Ломаная — по точкам", polynomial: "Полиномиальное сглаживание" } }, field("frequency", "Частотное регулирование", "pumpFrequencySettings"), out(model()), out(field("issues", "Проверки", "diagnostics", "array"))]);
  add("pump.chartAxes", "Масштаб и сетка графика", "Рассчитывает оси Q/H с учётом всей характеристики и рабочих насосов. Некорректная ручная сетка явно возвращает автоматический масштаб и замечания.", [model(), field("grid", "Настройки сетки и осей", "pumpChartGrid"), out(axes())]);
  add("pump.chartSystem", "Кривая системы", "H(Q) = Hст + (Hзад − Hст) × (Q/Qзад)². Разделяет доступную и недоступную части относительно характеристики насосов.", [model(), axes(), out(field("segments", "Участки кривой системы", "pumpChartSegments"))]);
  add("pump.chartPoint", "Фактическая рабочая точка", "Находит пересечение характеристики насоса и системы тем же методом, который выбран для отображения.", [model(), out(field("point", "Фактическая рабочая точка", "pumpChartPoint"))]);
  add("ui.chartPointBindings", "Редактирование точки проекта", "Получает привязки расхода и напора из явно подключённого интерфейса контура. При неоднозначности изменение точки недоступно.", [field("ui", "Поля контура проекта", "view"), out(binding("flowBinding", "Параметр расхода")), out(binding("headBinding", "Параметр напора"))]);
  add("ui.hydraulicChart", "График гидравлической характеристики", "Отображает результаты вычислительных нод, настройки, фактическую точку и экспорт. Двойной щелчок изменяет только явно подключённые доступные параметры проекта.", [model(), axes(), field("segments", "Участки кривой системы", "pumpChartSegments"), field("point", "Фактическая рабочая точка", "pumpChartPoint"), binding("methodBinding", "Параметр способа построения"), binding("frequencyBinding", "Параметр частотного регулирования"), binding("gridBinding", "Параметр сетки"), binding("flowBinding", "Параметр расхода"), binding("headBinding", "Параметр напора"), out(field("value", "Интерфейс", "view"))]);
  return types;
}
