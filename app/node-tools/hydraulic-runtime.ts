import type { Step } from "../engineering/engine";
import { withEvaluationProgram } from "../engineering/runtime";
import { coreInterpolateCurve, coreOperatingPoint, coreUsablePump } from "../pump-catalog";
import { curveMaxHead, curveSegments, type CurveMethod } from "../curve-methods";
import { coreFrequencyAdjustedPump, defaultPumpFrequencySettings, pumpFrequencyState, type PumpFrequencySettings } from "../pump-frequency";
import { chartAxisScale, defaultChartGridSettings, type ChartGridSettings } from "../pump-chart-grid";
import { MAX_WORKING_PUMPS } from "../pump-counts";
import type { PumpSelectionInput } from "../pump-selection";
import type { CatalogItem } from "./catalog-schema";
import type { SelectionState } from "./pump-nodes";
import type { Diagnostic, ParameterBinding, ToolContext, Values, View } from "./schema";
import type { HydraulicChartAxes, HydraulicChartData, HydraulicChartModel, HydraulicChartSegments } from "./hydraulic-nodes";
import { samePumpRequest, type PumpOperatingPoint } from "./pump-operating-point";

const primitiveProgram = { version: "node-hydraulic-primitives", plans: {}, args: {} };
const pure = <T,>(run: () => T): T => withEvaluationProgram(primitiveProgram, run);
const object = (value: unknown): Values => value && typeof value === "object" && !Array.isArray(value) ? value as Values : {};
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const knownMethod = (value: unknown): CurveMethod => ["pchip", "linear", "polynomial"].includes(String(value)) ? value as CurveMethod : "pchip";
const diagnostic = (step: Step, message: string): Diagnostic => ({ key: "", node: step.id, message, severity: "warning" });
const empty = (message: string, method: CurveMethod = "pchip"): HydraulicChartModel => ({ status: "empty", message, count: 0, method, requestedMethod: method, polynomialAvailable: false, frequencySettings: defaultPumpFrequencySettings(), warnings: [] });
function frequencySettings(value: unknown, pumpId: string): PumpFrequencySettings & { pumpId?: string } {
  const v = object(value);
  if (typeof v.pumpId === "string" && v.pumpId !== pumpId) return defaultPumpFrequencySettings();
  for (const key of ["nominalHz", "frequencyHz"]) if (v[key] != null && (!finite(v[key]) || (v[key] as number) <= 0 || (v[key] as number) > 10000)) throw Error("Частота должна быть положительным конечным числом не более 10000 Гц");
  return { enabled: v.enabled === true, nominalHz: v.nominalHz == null ? null : v.nominalHz as number, frequencyHz: v.frequencyHz == null ? null : v.frequencyHz as number, showNominal: v.showNominal !== false, ...(typeof v.pumpId === "string" ? { pumpId: v.pumpId } : {}) };
}
function gridSettings(value: unknown): ChartGridSettings {
  const defaults = defaultChartGridSettings(), v = object(value);
  const axis = (key: "flow" | "head") => {
    const values = object(v[key]);
    return { min: values.min == null ? defaults[key].min : values.min as number, max: values.max == null ? null : values.max as number, step: values.step == null ? null : values.step as number };
  };
  if (v.color != null && (typeof v.color !== "string" || !/^#[0-9a-f]{6}$/i.test(v.color))) throw Error("Цвет сетки должен быть в формате #RRGGBB");
  if (v.width != null && (!finite(v.width) || v.width < 0.1 || v.width > 10)) throw Error("Толщина сетки должна быть от 0,1 до 10");
  if (v.pattern != null && !["solid", "dashed", "dotted"].includes(String(v.pattern))) throw Error("Неизвестный тип линий сетки");
  return { flow: axis("flow"), head: axis("head"), vertical: v.vertical !== false, horizontal: v.horizontal !== false, labels: v.labels !== false, color: v.color == null ? null : v.color as string, width: v.width == null ? 1 : v.width as number, pattern: v.pattern == null ? "solid" : v.pattern as ChartGridSettings["pattern"] };
}
function model(value: unknown): HydraulicChartModel | null {
  const v = value as HydraulicChartModel | null;
  return v?.status === "ready" && v.pump && v.request && finite(v.count) ? v : null;
}
function chartModel(v: Values, context: ToolContext): HydraulicChartModel {
  const method = knownMethod(v.method), item = v.item as CatalogItem | null, state = object(v.selection) as unknown as SelectionState, request = object(v.request);
  if (!item?.pump || state.valid !== true || state.stale === true) return empty(state.message || "Выберите и подтвердите насос в инструменте «Подбор насосов»", method);
  const resource = context.resources?.pump_catalog_v2, actual = resource?.items.find(row => row.variantId === item.variantId);
  if (item.variantId !== item.pump.id || state.variantId !== item.variantId || state.modelId !== item.modelId || state.curveSetId !== item.curveSetId || resource && (resource.id !== state.snapshotId || !actual || actual.modelId !== item.modelId || actual.curveSetId !== item.curveSetId || actual.frequencyHz !== item.frequencyHz || JSON.stringify(actual.pump) !== JSON.stringify(item.pump))) return empty("Исполнение или снимок каталога не соответствует подтверждённому выбору. Выберите насос заново.", method);
  if (!finite(request.flowRate) || request.flowRate <= 0 || !finite(request.head) || request.head <= 0 || !finite(request.staticHead) || request.staticHead < 0 || request.staticHead > request.head || !finite(request.workingPumpCount) || !Number.isInteger(request.workingPumpCount) || request.workingPumpCount < 1 || request.workingPumpCount > MAX_WORKING_PUMPS || !["water", "wastewater"].includes(String(request.medium))) return empty("Подключите корректные условия расчёта из подбора насосов", method);
  if (!pure(() => coreUsablePump(item.pump, request.medium as "water" | "wastewater"))) return empty("Для выбранного исполнения нет подтверждённой рабочей характеристики", method);
  if (state.request && !samePumpRequest(state.request, request as PumpSelectionInput)) return empty("Условия графика отличаются от подтверждённого подбора", method);
  const settings = frequencySettings(v.frequency, item.variantId), frequency = pumpFrequencyState(item.pump, settings);
  const effective = settings.enabled ? coreFrequencyAdjustedPump(item.pump, frequency.frequencyHz, frequency.nominalHz) : item.pump;
  const polynomialAvailable = curveSegments(effective.curve, "polynomial").length > 0, resolvedMethod = method === "polynomial" && !polynomialAvailable ? "pchip" : method;
  const warnings: string[] = [];
  if (method !== resolvedMethod) warnings.push("Полиномиальное сглаживание недоступно для этой характеристики; показан PCHIP.");
  if (frequency.assumedNominal) warnings.push("Частота в каталоге не указана: принято 50 Гц. Укажите подтверждённую номинальную частоту при необходимости.");
  const pointContext = { variantId: item.variantId, modelId: item.modelId, curveSetId: item.curveSetId, snapshotId: state.snapshotId, requestKey: state.requestKey, selectionNode: state.node ?? "", sourceFrequencyHz: item.frequencyHz, request: request as PumpSelectionInput, method: resolvedMethod, frequencyHz: settings.enabled ? frequency.frequencyHz : frequency.nominalHz, nominalHz: frequency.nominalHz, frequencyAdjusted: settings.enabled, assumedFrequency: frequency.assumedNominal };
  return { status: "ready", message: "", selectedPump: item.pump, pump: effective, ...(settings.enabled && settings.showNominal && frequency.ratio !== 1 ? { referencePump: item.pump } : {}), request: request as PumpSelectionInput, count: request.workingPumpCount, method: resolvedMethod, requestedMethod: method, polynomialAvailable, frequencySettings: settings, frequency, warnings, pointContext };
}
function chartAxes(v: Values): HydraulicChartAxes | null {
  const m = model(v.model); if (!m) return null;
  const grid = gridSettings(v.grid), pump = m.pump!, request = m.request!;
  const flow = chartAxisScale(Math.max(request.flowRate * 1.2, ...pump.curve.map(p => p[0] * m.count), ...(m.referencePump?.curve.map(p => p[0] * m.count) ?? [])), grid.flow, "Q");
  const head = chartAxisScale(Math.max(curveMaxHead(pump.curve, m.method), m.referencePump ? curveMaxHead(m.referencePump.curve, m.method) : 0, request.head, 1) * 1.1, grid.head, "H");
  return { flow, head, grid, issues: [flow.issue, head.issue].filter((issue): issue is string => !!issue) };
}
function chartSystem(v: Values): HydraulicChartSegments | null {
  const m = model(v.model), axes = v.axes as HydraulicChartAxes | null; if (!m || !axes) return null;
  const request = m.request!, k = (request.head - request.staticHead) / request.flowRate ** 2;
  const samples = Array.from({ length: 121 }, (_, i) => { const q = axes.flow.min + (axes.flow.max - axes.flow.min) * i / 120, h = request.staticHead + k * q * q, pumpH = coreInterpolateCurve(m.pump!.curve, q / m.count, m.method); return { q, h, above: pumpH == null || h > pumpH }; });
  const xy = (point: { q: number; h: number }) => `${45 + (point.q - axes.flow.min) / (axes.flow.max - axes.flow.min) * 435} ${210 - (point.h - axes.head.min) / (axes.head.max - axes.head.min) * 190}`;
  let solid = "", dashed = "", previousAbove = samples[0].above;
  for (let i = 0; i < samples.length; i++) {
    const point = samples[i], piece = `${i === 0 || point.above !== previousAbove ? "M" : "L"}${xy(point)}`;
    if (point.above) dashed += piece; else solid += piece;
    if (i > 0 && point.above !== previousAbove) { const bridge = `M${xy(samples[i - 1])} L${xy(point)}`; if (point.above) dashed = bridge + dashed; else solid = bridge + solid; }
    previousAbove = point.above;
  }
  return { solid, dashed };
}
function pointBindings(value: unknown): { flowBinding: ParameterBinding | null; headBinding: ParameterBinding | null } {
  const candidates: ParameterBinding[] = []; let count = 0;
  function visit(view: View | undefined, depth = 0) { if (!view || depth > 20 || ++count > 2000) return; if (view.binding) candidates.push(view.binding); view.children?.forEach(child => visit(child, depth + 1)); }
  visit(value as View);
  const find = (meaning: string, unit: string) => {
    const matches = candidates.filter(binding => binding.field.meaning === meaning && binding.field.unit === unit && ["number", "float"].includes(binding.field.kind));
    const unique = matches.filter((binding, i) => matches.findIndex(other => other.node === binding.node && other.key === binding.key && other.toolId === binding.toolId) === i);
    return unique.length === 1 ? unique[0] : null;
  };
  const flowBinding = find("flow", "м³/ч"), headBinding = find("head", "м");
  return flowBinding && headBinding && flowBinding.toolId === headBinding.toolId ? { flowBinding, headBinding } : { flowBinding: null, headBinding: null };
}
export function executeHydraulicOperation(step: Step, v: Values, context: ToolContext): Values | undefined {
  switch (step.operation) {
    case "pump.chartModel": { const value = pure(() => chartModel(v, context)); return { model: value, issues: value.warnings.map(message => diagnostic(step, message)) }; }
    case "pump.chartAxes": return { axes: pure(() => chartAxes(v)) };
    case "pump.chartSystem": return { segments: pure(() => chartSystem(v)) };
    case "pump.chartPoint": {
      const m = model(v.model), point = m ? pure(() => coreOperatingPoint(m.pump!, m.count, m.request!, m.method)) : null;
      const at = (curve: [number, number][] | undefined) => point && m && curve && curve.length >= 2 && curve.every((p, i) => p.every(Number.isFinite) && (!i || p[0] > curve[i - 1][0])) && point.flow / m.count >= curve[0][0] && point.flow / m.count <= curve.at(-1)![0] ? pure(() => coreInterpolateCurve(curve, point.flow / m.count, m.method)) : null;
      const details: PumpOperatingPoint = { status: point ? "ready" : "unavailable", message: point ? "" : m ? "Пересечение характеристик в расчётном диапазоне не найдено." : "Выбранный насос или условия расчёта не подтверждены.", ...(m?.pointContext ? { context: m.pointContext } : {}), point, ...(m && point ? { metrics: { efficiency: at(m.pump!.efficiencyCurve), power: at(m.pump!.powerCurve), npshr: at(m.pump!.npshCurve) } } : {}) };
      return { point, details };
    }
    case "ui.chartPointBindings": return pointBindings(v.ui);
    case "ui.hydraulicChart": {
      const m = v.model as HydraulicChartModel | undefined;
      const chart: HydraulicChartData = { model: m ?? empty("Подключите характеристику выбранного насоса"), axes: v.axes as HydraulicChartAxes | null ?? null, system: v.segments as HydraulicChartSegments | null ?? null, point: v.point as HydraulicChartData["point"] ?? null };
      const bindings = Object.fromEntries(["method", "frequency", "grid"].flatMap(key => v[key + "Binding"] ? [[key, v[key + "Binding"]]] : []));
      return { value: { kind: "hydraulic-chart", node: step.id, label: "Гидравлическая кривая", chart, chartBindings: bindings, ...(v.flowBinding && v.headBinding ? { pointBindings: { flow: v.flowBinding, head: v.headBinding } } : {}) } };
    }
    default: return undefined;
  }
}
