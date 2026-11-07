import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { hydraulicNodeTypes } = await loadTs(new URL("../app/node-tools/hydraulic-nodes.ts", import.meta.url));
const { executeHydraulicOperation } = await loadTs(new URL("../app/node-tools/hydraulic-runtime.ts", import.meta.url));
const { defaultChartGridSettings } = await loadTs(new URL("../app/pump-chart-grid.ts", import.meta.url));
const types = new Map(hydraulicNodeTypes().map(type => [type.operation, type]));
const item = {
  variantId: "exact-50Hz", modelId: "model", curveSetId: "qh-50", frequencyHz: 50, issues: [], provenance: {},
  pump: { id: "exact-50Hz", manufacturer: "Fixture", series: "S", group: "S", model: "M", type: "vertical_multistage", power: 3, efficiency: null, nominalFlow: 10, minFlow: 0, maxFlow: 20, minHead: 10, maxHead: 30, price: null, priceCurrency: null, priceSource: null, source: "fixture", drawing: null, curve: [[0, 30], [10, 20], [20, 10]], medium: "water", selectable: true, active: true, frequencyHz: 50 }
};
const snapshot = { id: "a".repeat(64), sourceId: "pump_catalog_v2", schemaVersion: "fixture/v1", status: "ready", sourceStatus: "draft", created: "2026-11-07T00:00:00Z", items: [item], issues: [] };
const context = { role: "admin", values: {}, defaults: {}, resources: { pump_catalog_v2: snapshot } };
const state = { valid: true, stale: false, variantId: item.variantId, modelId: item.modelId, curveSetId: item.curveSetId, snapshotId: snapshot.id, requestKey: "request", message: "Подтверждено" };
const request = { flowRate: 10, head: 20, staticHead: 0, workingPumpCount: 1, medium: "water" };
function run(operation, v = {}, ctx = context) {
  const type = types.get(operation); assert(type);
  return executeHydraulicOperation({ id: "chart/" + operation, operation, fields: type.fields, expressions: {}, links: [], values: {} }, { ...Object.fromEntries(type.fields.map(f => [f.key, f.initial])), ...v }, ctx);
}
function model(extra = {}, ctx = context) { return run("pump.chartModel", { item, selection: state, request, ...extra }, ctx).model; }

test("chart stages reuse the exact source characteristic and expose serializable calculations", () => {
  const before = JSON.stringify(snapshot), m = model(), axes = run("pump.chartAxes", { model: m }).axes;
  const point = run("pump.chartPoint", { model: m }).point, segments = run("pump.chartSystem", { model: m, axes }).segments;
  assert.equal(m.status, "ready"); assert.equal(m.selectedPump.id, item.variantId); assert.equal(m.method, "pchip");
  assert.deepEqual(point, { flow: 10, head: 20 }); assert(segments.solid.includes("M")); assert(segments.dashed.includes("M"));
  const view = run("ui.hydraulicChart", { model: m, axes, segments, point }).value;
  assert.equal(view.kind, "hydraulic-chart"); assert.equal(view.chart.point.flow, 10); assert.equal(view.chart.model.selectedPump.efficiency, null);
  assert.deepEqual(JSON.parse(JSON.stringify(view)), view); assert.equal(JSON.stringify(snapshot), before);
});

test("parallel pump count scales station flow while retaining the same head", () => {
  const m = model({ request: { ...request, flowRate: 20, workingPumpCount: 2 } });
  assert.deepEqual(run("pump.chartPoint", { model: m }).point, { flow: 20, head: 20 });
  const axes = run("pump.chartAxes", { model: m }).axes;
  assert(axes.flow.max >= 40); assert.equal(m.count, 2);
  for (const workingPumpCount of [0, 1.5, 1000]) assert.equal(model({ request: { ...request, workingPumpCount } }).status, "empty");
});

test("frequency transformations are plot-only, retain nominal reference, and reset on a different pump", () => {
  const before = JSON.stringify(snapshot), frequency = { enabled: true, nominalHz: 50, frequencyHz: 25, showNominal: true, pumpId: item.variantId };
  const m = model({ frequency });
  assert.equal(m.frequency.ratio, .5); assert.equal(m.pump.power, 3 / 8); assert.deepEqual(m.pump.curve[1], [5, 5]); assert.deepEqual(m.referencePump, item.pump);
  assert.equal(m.pump.npshCurve, undefined); assert.equal(model({ frequency: { ...frequency, pumpId: "previous-pump" } }).frequencySettings.enabled, false);
  assert.equal(JSON.stringify(snapshot), before); assert.deepEqual(frequency, { enabled: true, nominalHz: 50, frequencyHz: 25, showNominal: true, pumpId: item.variantId });
  assert.throws(() => model({ frequency: { ...frequency, nominalHz: -1 } }), /Частота/);
});

test("unknown nominal frequency is explicit and does not become catalogue data", () => {
  const unknown = structuredClone(item); unknown.frequencyHz = null; unknown.pump.frequencyHz = null;
  const ctx = { ...context, resources: { pump_catalog_v2: { ...snapshot, items: [unknown] } } };
  const m = model({ item: unknown }, ctx);
  assert.equal(m.frequency.assumedNominal, true); assert.equal(m.frequency.nominalHz, 50); assert(m.warnings.some(message => message.includes("принято 50")));
  assert.equal(m.selectedPump.frequencyHz, null);
});

test("stale or mismatched selection never draws another pump or synthetic characteristic", () => {
  for (const extra of [
    { selection: { ...state, valid: false, stale: true } }, { item: null },
    { selection: { ...state, variantId: "other" } }, { selection: { ...state, modelId: "other" } },
    { selection: { ...state, curveSetId: "other" } }, { selection: { ...state, curveSetId: null } }, { selection: { ...state, modelId: undefined } }, { selection: { ...state, snapshotId: "b".repeat(64) } },
    { item: { ...item, frequencyHz: 60 } }, { item: { ...item, pump: { ...item.pump, curve: [[0, 500], [10, 400]] } } },
    { request: null }, { request: { ...request, staticHead: 21 } }
  ]) {
    const m = model(extra); assert.equal(m.status, "empty"); assert.equal(run("pump.chartAxes", { model: m }).axes, null); assert.equal(run("pump.chartPoint", { model: m }).point, null);
  }
});

test("all interpolation methods feed the same visible curve and operating-point algorithm", () => {
  for (const method of ["pchip", "linear", "polynomial"]) {
    const m = model({ method }); assert.equal(m.method, method); assert.equal(m.requestedMethod, method);
    const point = run("pump.chartPoint", { model: m }).point;
    assert(Math.abs(point.flow - 10) < 1e-7); assert(Math.abs(point.head - 20) < 1e-7);
  }
  const m = model({ method: "linear" }), grid = defaultChartGridSettings(); grid.flow.max = -1;
  const axes = run("pump.chartAxes", { model: m, grid }).axes;
  assert(axes.issues.some(message => message.startsWith("Q:"))); assert(axes.flow.max > 0);
  grid.flow.max = 20; grid.flow.step = .00001; assert(run("pump.chartAxes", { model: m, grid }).axes.issues.length > 0);
  assert.throws(() => run("pump.chartAxes", { model: m, grid: { ...grid, color: "url(javascript:bad)" } }), /Цвет/);
});

test("point editing is based on explicit unambiguous source bindings with the correct meaning and units", () => {
  const binding = (key, meaning, unit) => ({ key, node: "settings/" + key, toolId: "settings", mode: "user", editable: true, active: true, permission: "input", origin: "Введено", value: 10, field: { key, name: key, kind: "float", meaning, unit, direction: "input" } });
  const flow = binding("main.flowRate", "flow", "м³/ч"), head = binding("main.head", "head", "м");
  const ui = { kind: "section", node: "main", label: "", children: [{ kind: "field", node: "flow", binding: flow }, { kind: "field", node: "head", binding: head }] };
  assert.deepEqual(run("ui.chartPointBindings", { ui }), { flowBinding: flow, headBinding: head });
  assert.deepEqual(run("ui.chartPointBindings", { ui: { ...ui, children: [...ui.children, { kind: "field", binding: { ...flow, key: "secondary.flowRate", node: "other" } }] } }), { flowBinding: null, headBinding: null });
  assert.deepEqual(run("ui.chartPointBindings", { ui: { ...ui, children: [{ kind: "field", binding: { ...flow, field: { ...flow.field, unit: "л/с" } } }, ui.children[1]] } }), { flowBinding: null, headBinding: null });
});
