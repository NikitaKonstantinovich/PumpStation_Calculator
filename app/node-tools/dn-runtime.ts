import type { Step } from "../engineering/engine";
import { withEvaluationProgram } from "../engineering/runtime";
import type { AppliedBaseValues } from "../base-values";
import { coreFlowVelocity, coreRecommendedDn, defaultCollectorMaterial, dnVelocityLimit } from "../dn-defaults";
import { coreGetCircuitDnConfig } from "../station-hydraulic-calculation";
import { isCalculated } from "../calculated-input";
import { normalizeHydraulicOptions } from "../hydraulic-option-config";
import type { DnEntity, InputEntity, ProjectConfig, SettingsEntity } from "../project-config";
import type { Pump } from "../pump-catalog";
import { pumpPortField, type PumpPortData, type PumpPortOverride } from "../pump-ports";
import type { CatalogItem } from "./catalog-schema";
import type { ParameterBinding, ToolContext, Values, View } from "./schema";
import type { DnCircuit, DnContext, DnResult } from "./dn-nodes";

const primitiveProgram = { version: "node-dn-primitives", plans: {}, args: {} };
export const withDnPrimitives = <T,>(run: () => T): T => withEvaluationProgram(primitiveProgram, run);
const record = (value: unknown): Values => value && typeof value === "object" && !Array.isArray(value) ? value as Values : {};
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const positive = (value: unknown): value is number => finite(value) && value > 0;
export const dnSecondaryEnabled = (settings: SettingsEntity) => settings.stationType === "combined" || settings.stationType === "fire" && settings.jockeyPump;
export function defaultDnOverrides(): DnEntity {
  return { kind: "dn", suctionCollectorDn: null, dischargeCollectorDn: null, suctionValveDn: null, dischargeValveDn: null, collectorMaterial: null, connectionType: null, pn: null, suctionValveType: null, dischargeValveType: null, secondarySuctionCollectorDn: null, secondaryDischargeCollectorDn: null, secondarySuctionValveDn: null, secondaryDischargeValveDn: null, secondaryConnectionType: null, secondaryPn: null, secondarySuctionValveType: null, secondaryDischargeValveType: null };
}
export function normalizeDnOverrides(value: unknown): DnEntity {
  const raw = record(value), result = defaultDnOverrides();
  for (const key of ["suctionCollectorDn", "dischargeCollectorDn", "suctionValveDn", "dischargeValveDn", "secondarySuctionCollectorDn", "secondaryDischargeCollectorDn", "secondarySuctionValveDn", "secondaryDischargeValveDn"] as const) {
    if (raw[key] != null && (!positive(raw[key]) || !Number.isInteger(raw[key]) || raw[key] > 1200)) throw Error("Укажите корректный DN от 1 до 1200 · " + key);
    result[key] = raw[key] == null ? null : raw[key] as number;
  }
  for (const [keys, allowed] of [[ ["collectorMaterial"], ["st20", "aisi304"] ], [ ["connectionType", "secondaryConnectionType"], ["threaded", "flanged"] ], [ ["suctionValveType", "dischargeValveType", "secondarySuctionValveType", "secondaryDischargeValveType"], ["ball", "butterfly"] ], [ ["pn", "secondaryPn"], [10, 16, 25] ]] as const) for (const key of keys) {
    if (raw[key] != null && !(allowed as readonly unknown[]).includes(raw[key])) throw Error("Недопустимое значение настройки DN · " + key);
    Object.assign(result, { [key]: raw[key] ?? null });
  }
  for (const key of ["pumpSuctionPort", "pumpDischargePort", "secondaryPumpSuctionPort", "secondaryPumpDischargePort"] as const) {
    if (raw[key] == null) continue;
    const port = record(raw[key]);
    if (typeof port.pumpId !== "string" || !port.pumpId || port.dn != null && (!positive(port.dn) || !Number.isInteger(port.dn) || port.dn > 1200) || port.connection != null && !["threaded", "flanged"].includes(String(port.connection))) throw Error("Некорректные ручные данные патрубка · " + key);
    result[key] = { pumpId: port.pumpId, dn: port.dn as number | null ?? null, connection: port.connection as PumpPortOverride["connection"] ?? null, source: "Указано пользователем", maxPressure: positive(port.maxPressure) ? port.maxPressure : null, maxInletPressure: positive(port.maxInletPressure) ? port.maxInletPressure : null };
  }
  if (raw.insertionDesigns && typeof raw.insertionDesigns === "object" && !Array.isArray(raw.insertionDesigns)) result.insertionDesigns = raw.insertionDesigns as DnEntity["insertionDesigns"];
  return result;
}
export function dnSelectedPump(value: unknown, selection: unknown, context: ToolContext): { pump?: Pump; message?: string } {
  const item = record(value) as unknown as CatalogItem, state = record(selection);
  if (state.valid !== true || state.stale === true) return { message: typeof state.message === "string" && state.message || "Выберите и подтвердите насос в подборе насосов." };
  const snapshot = context.resources?.pump_catalog_v2, canonical = snapshot?.items.find(row => row.variantId === item.variantId);
  if (!snapshot || !canonical || snapshot.id !== state.snapshotId || !state.requestKey || item.variantId !== item.pump?.id || state.variantId !== item.variantId || state.modelId !== item.modelId || state.curveSetId !== item.curveSetId || canonical.modelId !== item.modelId || canonical.curveSetId !== item.curveSetId || canonical.frequencyHz !== item.frequencyHz || JSON.stringify(canonical.pump) !== JSON.stringify(item.pump)) return { message: "Исполнение или снимок каталога не соответствует подтверждённому выбору. Подтвердите насос заново." };
  return { pump: canonical.pump };
}
/** Source data only. Unknown connections remain unknown; no legacy nozzle index is read. */
export function dnSourcePort(pump: Pump | undefined, side: "inlet" | "outlet"): PumpPortData | null {
  if (!pump) return null;
  const p = record(pump[side]), connectionType = String(p.type ?? p.connection_type ?? p.connection ?? "").toLowerCase();
  const pressure = positive(p.maxPressure) ? p.maxPressure : positive(p.pn_nominal_bar) ? p.pn_nominal_bar : Number(String(p.pressure_class ?? "").replace(/^PN\s*/i, ""));
  const inletPressure = p.maxInletPressure ?? p.max_inlet_pressure_bar;
  return { dn: positive(p.dn) ? p.dn : positive(pump[side === "inlet" ? "inletDn" : "outletDn"]) ? pump[side === "inlet" ? "inletDn" : "outletDn"]! : null, connection: ["flange", "flanged"].includes(connectionType) ? "flanged" : ["thread", "threaded"].includes(connectionType) ? "threaded" : null, maxPressure: positive(pressure) ? pressure : null, maxInletPressure: positive(inletPressure) ? inletPressure : null, source: typeof p.source === "string" ? p.source : pump.source || "Закреплённый каталог насосов" };
}
function settingsFrom(value: unknown, base: unknown, warnings: string[]): SettingsEntity {
  const s = record(value), applied = record(base), baseValues = applied.values && applied.versions ? applied as unknown as AppliedBaseValues : undefined;
  const manufacturerDiscounts: SettingsEntity["manufacturerDiscounts"] = { cnp: 0, aquastrong: 0 };
  for (const [key, value] of Object.entries({ ...record(s.manufacturerDiscounts), ...Object.fromEntries(Object.entries(s).filter(([key]) => key.startsWith("discount_")).map(([key, value]) => [key.slice(9), value])) })) if (finite(value) && value >= 0 && value <= 100) manufacturerDiscounts[key] = value;
  for (const key of ["usdRate", "cnyRate"] as const) if (!positive(s[key])) warnings.push("Не задан действующий курс валюты · " + key);
  if (!baseValues) warnings.push("Базовые значения не подключены: используется стандартное правило скорости DN; правила комплектующих и стоимости требуют источника.");
  return { kind: "settings", stationType: ["utility", "fire", "combined", "smart"].includes(String(s.stationType)) ? s.stationType as SettingsEntity["stationType"] : "utility", inletHead: finite(s.inletHead) ? s.inletHead : null, pressureChecksEnabled: s.pressureChecksEnabled !== false, geometryEnabled: s.geometryEnabled === true, combinedCircuitsSimultaneous: s.combinedCircuitsSimultaneous === true, membraneTank: s.membraneTank === true, membraneTankVolume: [8, 50, 80, 100].includes(Number(s.membraneTankVolume)) ? Number(s.membraneTankVolume) as SettingsEntity["membraneTankVolume"] : 8, vibrationCompensators: s.vibrationCompensators === true, collectorPlugs: s.collectorPlugs === true, isolatingValves: s.isolatingValves === true, jockeyPump: s.jockeyPump === true, usdRate: positive(s.usdRate) ? s.usdRate : 0, cnyRate: positive(s.cnyRate) ? s.cnyRate : 0, manufacturerDiscounts, ...(s.hydraulicOptions ? { hydraulicOptions: s.hydraulicOptions as SettingsEntity["hydraulicOptions"] } : {}), ...(baseValues ? { baseValues } : {}) };
}
function inputFrom(source: unknown, request: unknown, pump: Pump | undefined, warnings: string[], label: string, enabled: boolean): InputEntity {
  const s = record(source), r = record(request), hasRequest = Object.keys(r).length > 0;
  const input: InputEntity = { kind: "input", flowRate: finite(s.flowRate) ? s.flowRate : null, head: finite(s.head) ? s.head : null, staticHead: finite(r.staticHead) ? r.staticHead : finite(s.staticHead) ? s.staticHead : 0, workingPumpCount: finite(s.workingPumpCount) ? s.workingPumpCount : null, reservePumpCount: finite(s.reservePumpCount) ? s.reservePumpCount : null, medium: s.medium === "wastewater" ? "wastewater" : "water", calculated: enabled, ...(pump ? { selectedPumpId: pump.id, selectedPumpModel: pump.model } : {}) };
  if (enabled && !["water", "wastewater"].includes(String(s.medium))) { input.calculated = false; warnings.push(label + ": подключите подтверждённую перекачиваемую среду."); }
  if (enabled && pump && (!hasRequest || !finite(r.staticHead))) { input.calculated = false; warnings.push(label + ": подключите действующие условия подтверждённого подбора, включая статический напор."); }
  if (enabled && hasRequest && ["flowRate", "head", "workingPumpCount", "medium"].some(key => r[key] !== s[key])) { input.calculated = false; warnings.push(label + ": условия подтверждённого подбора отличаются от настроек проекта."); }
  if (enabled && !isCalculated(input)) { input.calculated = false; warnings.push(label + ": задайте корректные расход, напор и количества рабочих и резервных насосов в настройках проекта."); }
  return input;
}
export function buildDnContext(values: Values, context: ToolContext): DnContext {
  const warnings: string[] = [], rawSettings = record(values.settings), settings = settingsFrom(values.settings, values.baseSettings, warnings), entity = normalizeDnOverrides(values.overrides);
  if (values.hydraulicOptions != null) settings.hydraulicOptions = normalizeHydraulicOptions(values.hydraulicOptions);
  const main = dnSelectedPump(values.item, values.selection, context), secondActive = dnSecondaryEnabled(settings), second = secondActive ? dnSelectedPump(values.secondaryItem, values.secondarySelection, context) : {};
  if (main.message) warnings.push("Основной контур: " + main.message);
  if (secondActive && second.message) warnings.push("Второй контур: " + second.message);
  const input = inputFrom(rawSettings.main, values.request, main.pump, warnings, "Основной контур", true), secondaryInput = inputFrom(rawSettings.secondary, values.secondaryRequest, second.pump, warnings, "Второй контур", secondActive);
  const ports = { primary: { inlet: dnSourcePort(main.pump, "inlet"), outlet: dnSourcePort(main.pump, "outlet") }, secondary: { inlet: dnSourcePort(second.pump, "inlet"), outlet: dnSourcePort(second.pump, "outlet") } };
  const effectiveEntity = { ...entity };
  for (const secondary of [false, true]) for (const side of ["inlet", "outlet"] as const) {
    const pump = secondary ? second.pump : main.pump, key = pumpPortField(secondary, side), manual = entity[key];
    effectiveEntity[key] = pump ? manual?.pumpId === pump.id ? manual : { pumpId: pump.id, ...ports[secondary ? "secondary" : "primary"][side]! } : null;
  }
  const validSettings = ["utility", "fire", "combined", "smart"].includes(String(rawSettings.stationType));
  if (!validSettings) warnings.push("Подключите действующие настройки типа насосной установки.");
  const ready = validSettings && isCalculated(input);
  return { status: ready ? "ready" : "empty", message: ready ? "" : "Сначала задайте рабочую точку и подключите настройки проекта.", settings, input, secondaryInput, entity, effectiveEntity, ports, pumps: [main.pump, second.pump].filter((pump): pump is Pump => !!pump), warnings: [...new Set(warnings)] };
}
export function calculateDnCircuit(context: DnContext, secondary = false): DnCircuit | null {
  if (context.status !== "ready" || secondary && !dnSecondaryEnabled(context.settings)) return null;
  return withDnPrimitives(() => {
    const input = secondary ? context.secondaryInput : context.input, pump = context.pumps.find(pump => pump.id === input.selectedPumpId);
    const result = coreGetCircuitDnConfig(context.effectiveEntity, input, context.settings, secondary, pump);
    if (!result) return null;
    return { ...result, speeds: Object.fromEntries(result.rows.map(row => { const dn = result.values[row.field], velocity = coreFlowVelocity(row.flow, dn), limit = dnVelocityLimit(dn, context.settings.baseValues?.values.velocity); return [row.field, { velocity, limit, valid: velocity <= limit + 1e-9 }]; })) };
  });
}
export function dnProject(context: DnContext): ProjectConfig {
  const input = context.input, second = context.secondaryInput;
  return { schemaVersion: 1, project: { id: "node-station", name: "Насосная установка из графа", createdAt: "", updatedAt: "" }, workspace: { zoom: 100, mode: "grid", gridHeightScreens: 1, grid: { columns: 1, rows: 1, columnSizes: [1], rowSizes: [1], cells: [null] }, windows: [] }, station: { ...(input.selectedPumpId ? { selectedPumpId: input.selectedPumpId, selectedPumpModel: input.selectedPumpModel } : {}), ...(isCalculated(input) ? { workingPumpCount: input.workingPumpCount, reservePumpCount: input.reservePumpCount, totalPumpCount: input.workingPumpCount + input.reservePumpCount } : {}), ...(second.selectedPumpId ? { secondaryPumpId: second.selectedPumpId, secondaryPumpModel: second.selectedPumpModel } : {}), ...(isCalculated(second) ? { secondaryWorkingPumpCount: second.workingPumpCount, secondaryReservePumpCount: second.reservePumpCount, secondaryTotalPumpCount: second.workingPumpCount + second.reservePumpCount } : {}) }, entities: { "station-settings": context.settings, "system-input": input, "system-input-2": second, "station-dn": context.effectiveEntity, "station-spec": { kind: "spec", identityVersion: 1, items: [] } } };
}
export function buildDnResult(context: DnContext, primary: DnCircuit | null, secondary: DnCircuit | null, node = "dn"): DnResult {
  const resetOverrides = { ...context.entity, collectorMaterial: defaultCollectorMaterial(context.settings) }, messages = [...context.warnings];
  withDnPrimitives(() => { for (const circuit of [primary, secondary]) if (circuit) {
    for (const row of circuit.rows) resetOverrides[row.field] = row.subtitle === "Расход контура" ? coreRecommendedDn(circuit.stationFlow, context.settings.baseValues?.values.velocity) : null;
    resetOverrides[circuit.connectionField] = null; resetOverrides[circuit.pnField] = 16; resetOverrides[circuit.suctionTypeField] = null; resetOverrides[circuit.dischargeTypeField] = null;
    messages.push(...circuit.suction.errors, ...circuit.discharge.errors);
    if (circuit.suction.inletPressureCheck && ["missing-head", "unknown-limit", "exceeded"].includes(circuit.suction.inletPressureCheck.status)) messages.push(circuit.suction.inletPressureCheck.message);
    for (const row of circuit.rows) if (!circuit.speeds[row.field].valid) messages.push(circuit.title + ": " + row.title + " — скорость выше допустимой.");
  } });
  return { context, primary, secondary, project: dnProject(context), pumps: context.pumps, resetOverrides, issues: [...new Set(messages)].map(message => ({ key: "", node, message, severity: "warning" })) };
}
export function executeDnOperation(step: Step, values: Values, context: ToolContext): Values | undefined {
  if (step.operation === "station.dnContext") { const result = buildDnContext(values, context); return { context: result, issues: result.warnings.map(message => ({ key: "", node: step.id, message, severity: "warning" })) }; }
  if (step.operation === "station.dnCircuit") return { circuit: values.context ? calculateDnCircuit(values.context as DnContext, values.secondary === true) : null };
  if (step.operation === "station.dnResult") { if (!values.context) return { value: null, issues: [{ key: "context", node: step.id, message: "Подключите исходные данные DN.", severity: "error" }] }; const result = buildDnResult(values.context as DnContext, values.primary as DnCircuit | null ?? null, values.secondary as DnCircuit | null ?? null, step.id); return { value: result, issues: result.issues }; }
  if (step.operation === "ui.dnCalculator") return { value: { kind: "dn-calculator", node: step.id, label: "Расчёт DN", dn: values.data as DnResult | undefined, binding: values.binding as ParameterBinding | undefined } as View };
  return undefined;
}
