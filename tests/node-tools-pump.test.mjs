import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { addPumpProductFixture } from "./fixtures/pump-product.mjs";

const { pumpNodeTypes } = await loadTs(new URL("../app/node-tools/pump-nodes.ts", import.meta.url));
const { executePumpOperation, validatePumpSelection } = await loadTs(new URL("../app/node-tools/pump-runtime.ts", import.meta.url));
const { withEvaluationProgram } = await loadTs(new URL("../app/engineering/runtime.ts", import.meta.url));
const { evaluatePlan } = await loadTs(new URL("../app/node-tools/runtime.ts", import.meta.url));
const types = pumpNodeTypes(), byOperation = new Map(types.filter(t => t.operation !== "parameter").map(type => [type.operation, type]));
const item = (id, extra = {}) => ({
  modelId: "model-" + id, variantId: id, curveSetId: "qh-" + id, frequencyHz: 50, issues: [], provenance: { source: "fixture" },
  pump: { id, manufacturer: "Fixture", series: "F", group: "F", model: "F " + id, execution: "F " + id + " 380V", type: "vertical_multistage", power: 3, efficiency: null, nominalFlow: 10, minFlow: 0, maxFlow: 20, minHead: 10, maxHead: 30,
    price: 1000, priceCurrency: "RUB", priceKind: "net", priceSource: "fixture", source: "fixture", drawing: null, curve: [[0, 30], [10, 20], [20, 10]], medium: "water", selectable: true, active: true, inletDn: null, outletDn: null, ...extra }
});
const snapshot = { sourceId: "pump_catalog_v2", id: "a".repeat(64), schemaVersion: "fixture-v1", sourceStatus: "test", status: "ready", created: "2026-11-07T00:00:00Z", items: [item("a"), item("b", { price: null, priceCurrency: null }), item("inactive", { active: false })], issues: [] };
const context = { values: {}, defaults: {}, role: "admin", algorithmVersion: "product-v1", resources: { pump_catalog_v2: snapshot } };
const request = { flowRate: 10, head: 20, staticHead: 0, workingPumpCount: 1, medium: "water" };
function run(operation, inputs = {}, ctx = context) {
  const type = byOperation.get(operation); assert(type, "Registered operation " + operation);
  return executePumpOperation({ id: "selection/" + operation, fields: type.fields, values: {}, links: [], expressions: {}, operation }, Object.fromEntries([...type.fields.map(f => [f.key, f.initial]), ...Object.entries(inputs)]), ctx);
}
function pipeline(ctx = context, input = request, filters = {}, pricing = { usdRate: 85, cnyRate: 13 }) {
  const catalog = run("pump.catalog", {}, ctx).value;
  const filtered = run("pump.filter", { catalog, request: input, ...filters }, ctx).value;
  const reserved = run("pump.reserve", { candidates: filtered }, ctx).value;
  const measured = run("pump.measure", { candidates: reserved, pricing }, ctx).value;
  return run("pump.rank", { candidates: measured }, ctx).value;
}
function binding(value = null) {
  return { key: "selectedPump", node: "selection/selected", field: types.find(t => t.id === "pump.selectionParameter").parameter.field, value, permission: "input", editable: true, active: true, mode: "user", origin: "Введено пользователем" };
}

test("pump stages preserve identities, unknown fields and immutable source data without automatically selecting", () => {
  const before = JSON.stringify(snapshot), result = pipeline();
  assert.equal(result.rows.length, 2); assert.equal(result.total, 2);
  assert.deepEqual(result.rows.map(r => r.variantId), ["a", "b"]);
  assert.equal(result.rows[0].modelId, "model-a"); assert.equal(result.rows[0].curveSetId, "qh-a");
  assert.equal(result.rows[0].headAtRequestedFlow, 20); assert.equal(result.rows[0].headReservePercent, 0);
  assert.equal(result.rows[0].candidate.point.flow, 10); assert.equal(result.rows[0].candidate.point.head, 20);
  assert.equal(result.rows[1].purchasePriceRub, null); assert.equal(result.rows[0].inletDn, null);
  const selected = run("pump.select", { candidates: result, binding: binding() });
  assert.equal(selected.value, null); assert.equal(selected.selection.valid, false); assert.equal(selected.selection.stale, false);
  assert.equal(JSON.stringify(snapshot), before);
});

test("selection proof is scoped to effective conditions, catalogue and algorithm, with no silent replacement", () => {
  const data = pipeline(), proof = { variantId: "a", snapshotId: data.snapshotId, requestKey: data.requestKey };
  const selected = run("pump.select", { candidates: data, binding: binding(proof) });
  assert.equal(selected.value.variantId, "a"); assert.equal(selected.selection.valid, true); assert.equal(selected.selection.bindingKey, "selectedPump");
  for (const changed of [pipeline(context, { ...request, head: 21 }), pipeline({ ...context, algorithmVersion: "product-v2" }), pipeline({ ...context, resources: { pump_catalog_v2: { ...snapshot, id: "b".repeat(64) } } })]) {
    const result = run("pump.select", { candidates: changed, binding: binding(proof) });
    assert.equal(result.value, null); assert.equal(result.selection.stale, true); assert.equal(result.selection.variantId, "a"); assert(result.issues.every(i => i.severity === "warning"));
  }
  assert.equal(validatePumpSelection(data, { ...proof, variantId: "forged" }).valid, false);
  assert.equal(validatePumpSelection(data, proof).valid, true);
});

test("request extraction respects chosen contour and explicit static head; invalid conditions stay diagnostic", () => {
  const settings = { main: request, secondary: { ...request, flowRate: 5 }, inletHead: 17 };
  assert.equal(run("pump.request", { settings }).value.staticHead, 0);
  assert.equal(run("pump.request", { settings, contour: "secondary", staticHead: 2 }).value.flowRate, 5);
  const invalid = run("pump.request", { settings, staticHead: 21 }); assert.equal(invalid.valid, false); assert.equal(invalid.value, null); assert(invalid.issues.length);
  const filtered = run("pump.filter", { catalog: run("pump.catalog").value, request: null });
  assert.equal(filtered.value.rows.length, 0); assert(filtered.issues.some(i => i.severity === "error"));
});

test("confirmation follows applied currency and discount changes, ignoring irrelevant pricing and UI state", () => {
  const commercial = { ...context, resources: { pump_catalog_v2: { ...snapshot, id: "c".repeat(64), items: [item("usd", { manufacturer: "CNP", price: 100, priceCurrency: "USD", priceKind: "list" })] } } };
  const pricing = { usdRate: 85, cnyRate: 13, discount_cnp: 10 };
  const baseline = pipeline(commercial, request, {}, pricing);
  assert.equal(baseline.rows[0].purchasePriceRub, 7650);
  const proof = { variantId: "usd", snapshotId: baseline.snapshotId, requestKey: baseline.requestKey };
  for (const changedPricing of [{ ...pricing, usdRate: 86 }, { ...pricing, discount_cnp: 11 }]) {
    const changed = pipeline(commercial, request, {}, changedPricing);
    assert.notEqual(changed.rows[0].purchasePriceRub, baseline.rows[0].purchasePriceRub);
    assert.notEqual(changed.requestKey, baseline.requestKey);
    assert.equal(validatePumpSelection(changed, proof).stale, true);
  }
  const irrelevant = pipeline(commercial, request, {}, { ...pricing, cnyRate: 14, discount_other: 40, previewWidth: 700 });
  assert.equal(irrelevant.requestKey, baseline.requestKey);
  assert.equal(validatePumpSelection(irrelevant, proof).valid, true);
  const net = { ...commercial, resources: { pump_catalog_v2: { ...commercial.resources.pump_catalog_v2, items: [item("net", { manufacturer: "CNP", price: 100, priceCurrency: "RUB", priceKind: "net" })] } } };
  assert.equal(pipeline(net, request, {}, pricing).requestKey, pipeline(net, request, {}, { ...pricing, usdRate: 100, cnyRate: 20, discount_cnp: 80 }).requestKey);
});

test("registered catalogue missing, empty and unmatched are distinguishable", () => {
  assert.throws(() => run("pump.catalog", {}, { ...context, resources: {} }), /ещё не загружен/);
  const empty = run("pump.catalog", {}, { ...context, resources: { pump_catalog_v2: { ...snapshot, status: "empty", items: [] } } });
  assert.equal(empty.value.stage, "catalog"); assert.equal(empty.value.total, 0);
  const unmatched = pipeline(context, request, { manufacturer: "Not in catalogue" }); assert.equal(unmatched.stage, "ranked"); assert.equal(unmatched.rows.length, 0); assert(unmatched.request);
});

test("table, dynamic options and selected card retain real bindings and source proof", () => {
  const data = pipeline(), b = binding({ variantId: "a", snapshotId: data.snapshotId, requestKey: data.requestKey });
  const table = run("pump.table", { candidates: data, binding: b });
  assert.equal(table.value.kind, "table"); assert.equal(table.value.binding, b); assert.equal(table.value.selection.valid, true);
  assert.equal(table.value.rows[0].item, undefined); assert.equal(table.value.rows[0].candidate, undefined);
  assert(table.value.columnsSpec.some(c => c.key === "model"));
  const options = run("pump.options", { catalog: run("pump.catalog").value, attribute: "manufacturer" });
  assert.deepEqual(options.options, [{ value: "Fixture", label: "Fixture" }]);
  const filter = run("ui.select", { options: options.options, binding: { ...b, key: "manufacturer", field: { kind: "string", name: "Производитель" }, value: "Fixture" } });
  assert.equal(filter.value.kind, "select"); assert.equal(filter.issues.length, 0);
  const selection = run("pump.select", { candidates: data, binding: b });
  const card = run("pump.card", { item: selection.value, selection: selection.selection }).value;
  assert.equal(card.rows[0].variantId, "a");
  assert.equal(card.rows[0].curveSetId, "qh-a");
  assert.equal(card.rows[0].frequencyHz, 50);
  assert.equal(card.rows[0].snapshotId, snapshot.id);
  assert.deepEqual(card.rows[0].curvePoints, [{ flow: 0, head: 30 }, { flow: 10, head: 20 }, { flow: 20, head: 10 }]);
});

test("catalogue option cascade uses type and manufacturer while retaining records outside hydraulic eligibility", () => {
  const catalogContext = { ...context, resources: { pump_catalog_v2: { ...snapshot, items: [
    item("vertical-a", { manufacturer: "Alpha", series: "S1" }),
    item("vertical-a-incomplete", { manufacturer: "Alpha", series: "S2", curve: [], selectable: false }),
    item("vertical-b", { manufacturer: "Beta", series: "S3" }),
    item("horizontal-a", { type: "end_suction", manufacturer: "Alpha", series: "S4" }),
    item("horizontal-c", { type: "end_suction", manufacturer: "Gamma", series: "S5" })
  ] } } };
  const catalog = run("pump.catalog", {}, catalogContext).value;
  const values = inputs => run("pump.options", { catalog, ...inputs }, catalogContext).options.map(option => option.value);
  assert.deepEqual(values({ attribute: "manufacturer", type: "vertical_multistage" }), ["Alpha", "Beta"]);
  assert.deepEqual(values({ attribute: "manufacturer", type: "end_suction" }), ["Alpha", "Gamma"]);
  assert.deepEqual(values({ attribute: "series", type: "vertical_multistage", manufacturer: "Alpha" }), ["S1", "S2"]);
  assert.deepEqual(values({ attribute: "series", type: "", manufacturer: "Alpha" }), ["S1", "S2", "S4"]);
  assert.deepEqual(values({ attribute: "series", type: "vertical_multistage", manufacturer: null }), ["S1", "S2", "S3"]);
  assert.deepEqual(values({ attribute: "manufacturer", type: null }), ["Alpha", "Beta", "Gamma"]);
  assert.deepEqual(values({ attribute: "series", type: "missing" }), []);
  const legacy = executePumpOperation({ id: "legacy/options", fields: [], values: {}, links: [], expressions: {}, operation: "pump.options" }, { catalog, attribute: "manufacturer" }, catalogContext);
  assert.deepEqual(legacy.options.map(option => option.value), ["Alpha", "Beta", "Gamma"]);
});

function filterBinding(key, patch = {}) {
  return { ...binding(), key, node: "selection/" + key, field: { key, name: key, kind: "string", meaning: "text", unit: "", direction: "input", required: false }, ...patch };
}

test("select reset descriptors are explicit, optional, user-owned and compatible with readonly roles", () => {
  const main = filterBinding("type", { toolId: "selection" }), manufacturer = filterBinding("manufacturer", { toolId: "selection" }), series = filterBinding("series", { toolId: "selection" });
  const value = run("ui.select", { binding: main, options: [], clear0: manufacturer, clear1: series }).value;
  assert.deepEqual(value.clearBindings, [manufacturer, series]);
  assert.deepEqual(JSON.parse(JSON.stringify(value)).clearBindings.map(target => target.key), ["manufacturer", "series"]);
  assert.equal(run("ui.select", { binding: main, options: [] }).value.clearBindings, undefined);
  assert.throws(() => run("ui.select", { binding: main, options: [], clear0: main }), /собственное значение/);
  assert.throws(() => run("ui.select", { binding: main, options: [], clear0: { key: "fake" } }), /действительную привязку/);
  assert.throws(() => run("ui.select", { binding: main, options: [], clear0: { ...series, toolId: "settings" } }), /тому же инструменту/);
  for (const mode of ["fixed", "computed", "source"]) assert.throws(() => run("ui.select", { binding: main, options: [], clear0: { ...series, mode } }), /необязательный параметр пользовательского ввода/);
  assert.throws(() => run("ui.select", { binding: main, options: [], clear0: { ...series, field: { ...series.field, required: true } } }), /необязательный параметр пользовательского ввода/);
  assert.throws(() => run("ui.select", { binding: main, options: [], clear0: { ...series, editable: false } }), /текущей роли/);
  assert.throws(() => run("ui.select", { binding: main, options: [], clear0: series, clear1: series }), /повторно/);
  assert.equal(run("ui.select", { binding: { ...main, editable: false }, options: [], clear0: { ...series, editable: false } }).value.clearBindings.length, 1);
});

test("view reset actions reference evaluated bindings and observe actual user permissions", async () => {
  const { parameterType } = await loadTs(new URL("../app/node-tools/compiler.ts", import.meta.url));
  const selectType = byOperation.get("ui.select");
  function parameter(id, permission = "input") {
    const type = parameterType("cascade." + id, id, { key: id, name: id, kind: "string", meaning: "text", unit: "", direction: "input" }, permission);
    return { id, fields: type.fields, values: {}, links: [], expressions: {}, operation: "parameter", parameter: type.parameter };
  }
  function plan(mainPermission = "input", dependentPermission = "input", fake) {
    const main = parameter("type", mainPermission), dependent = parameter("series", dependentPermission);
    return { id: "cascade", steps: [main, dependent, { id: "select", fields: selectType.fields, values: { options: [], ...(fake ? { clear0: fake } : {}) }, links: [{ from: "type", out: "binding", to: "select", input: "binding" }, ...(!fake ? [{ from: "series", out: "binding", to: "select", input: "clear0" }] : [])], expressions: {}, operation: "ui.select" }, { id: "result", fields: [{ key: "ui", name: "Форма", kind: "object", meaning: "view", unit: "", direction: "input" }], values: {}, links: [{ from: "select", out: "value", to: "result", input: "ui" }], expressions: {} }] };
  }
  const result = evaluatePlan(plan(), { ...context, role: "base" });
  assert.equal(result.view.clearBindings[0], result.bindings.find(binding => binding.key === "series"));
  assert.throws(() => evaluatePlan(plan("input", "all"), { ...context, role: "base" }), /текущей роли/);
  const readonly = evaluatePlan(plan("all", "all"), { ...context, role: "base" });
  assert.equal(readonly.view.binding.editable, false); assert.equal(readonly.view.clearBindings[0].editable, false);
  assert.throws(() => evaluatePlan(plan("input", "input", filterBinding("forged")), context), /действительную привязку зависимого параметра/);
  const primitiveView = { kind: "message", node: "forged", label: "Некорректное действие", clearBindings: [] };
  const bad = { id: "bad-actions", steps: [{ id: "view", fields: [{ key: "value", kind: "object", meaning: "view", unit: "", direction: "output" }], values: { value: primitiveView }, links: [], expressions: {} }, { id: "result", fields: [{ key: "ui", kind: "object", meaning: "view", unit: "", direction: "input" }], values: {}, links: [{ from: "view", out: "value", to: "result", input: "ui" }], expressions: {} }] };
  assert.throws(() => evaluatePlan(bad, context), /неверное действие сброса/);
});

test("collection operations do not mutate data and preserve zero, false and unknown values", () => {
  const source = [{ id: "a", n: 0, flag: false }, { id: "b", n: 10, flag: true }, { id: "c", n: null }], before = JSON.stringify(source);
  assert.deepEqual(run("collection.sort", { items: source, attribute: "n", direction: "desc" }).items.map(r => r.id), ["b", "a", "c"]);
  assert.equal(run("collection.filter", { items: source, attribute: "n", operator: "eq", valueType: "number", number: 0 }).count, 1);
  assert.equal(run("collection.boolean", { record: source[0], attribute: "flag" }).value, false);
  assert.equal(run("collection.number", { record: source[2], attribute: "n" }).value, null);
  assert.equal(run("collection.lookup", { items: source, attribute: "id", id: "b" }).value, source[1]);
  assert.equal(run("collection.limit", { items: source, limit: 1 }).total, 3);
  assert.throws(() => run("collection.string", { record: source[0], attribute: "n" }), /ожидаемому типу/);
  assert.throws(() => run("collection.lookup", { items: source, attribute: "__proto__", id: "b" }), /допустимый атрибут/);
  assert.equal(JSON.stringify(source), before);
});

test("pump arithmetic is independent of legacy station graph overrides", () => {
  const baseline = pipeline();
  const result = withEvaluationProgram({ version: "other", args: { usablePump: ["pump", "medium"] }, plans: { usablePump: { id: "usablePump", steps: [{ id: "source", fields: [], links: [], values: {}, expressions: {} }, { id: "result", fields: [{ key: "value", direction: "input" }], links: [], values: { value: false }, expressions: {} }] } } }, () => pipeline());
  assert.equal(result.rows.length, baseline.rows.length);
});

test("ordinary evaluation compiles the registered pump library without native escape hatches", () => {
  assert(types.every(type => !type.native));
  const type = byOperation.get("pump.catalog"), fields = type.fields;
  const plan = { id: "catalog", steps: [{ id: "catalog", fields, links: [], values: { source: "pump_catalog_v2" }, expressions: {}, operation: "pump.catalog" }, { id: "result", fields: [{ key: "value", name: "Каталог", kind: "object", meaning: "pumpDataset", unit: "", direction: "input" }], links: [{ from: "catalog", out: "value", to: "result", input: "value" }], values: {}, expressions: {} }] };
  assert.equal(evaluatePlan(plan, context).value.rows.length, snapshot.items.length);
});

test("the complete library compiles in a product and its staged tool reads upstream effective values", async () => {
  const { initialTools } = await loadTs(new URL("../app/node-tools/factory.ts", import.meta.url));
  const { upgradeDocument } = await loadTs(new URL("../app/node-tools/product.ts", import.meta.url));
  const { compileTools } = await loadTs(new URL("../app/node-tools/compiler.ts", import.meta.url));
  const { evaluateProduct } = await loadTs(new URL("../app/node-tools/runtime.ts", import.meta.url));
  const doc = upgradeDocument(initialTools());
  for (const type of types) if (!doc.types.some(existing => existing.id === type.id)) doc.types.push(type);
  const assembled = addPumpProductFixture(doc), program = compileTools(assembled, "product-v1");
  const settings = { ...context, values: { stationType: "utility", "main.flowRate": 10, "main.head": 20, "main.workingPumpCount": 1, "main.reservePumpCount": 0 } };
  const result = evaluateProduct(program, "pumpFixture", { settings, pumpFixture: context });
  assert.equal(result.view.kind, "form"); assert.equal(result.view.children[0].rows.length, 2);
  assert.equal(result.view.children[0].selection.valid, false); assert.equal(result.value, null);
  const proof = { variantId: "a", snapshotId: snapshot.id, requestKey: result.view.children[0].selection.requestKey };
  const selected = evaluateProduct(program, "pumpFixture", { settings, pumpFixture: { ...context, values: { selectedPump: proof } } });
  assert.equal(selected.value.variantId, "a"); assert.equal(selected.view.children[0].selection.valid, true);
  assert(selected.bindings.some(binding => binding.toolId === "pumpFixture" && binding.key === "selectedPump"));
});
