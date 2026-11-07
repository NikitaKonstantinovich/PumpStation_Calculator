import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { addPumpProductFixture } from "./fixtures/pump-product.mjs";

const base = new URL("../app/", import.meta.url);
const { initialTools } = await loadTs(new URL("node-tools/factory.ts", base));
const { prepareDocument } = await loadTs(new URL("node-tools/authoring.ts", base));
const { addVisualizationTool, visualizationSources } = await loadTs(new URL("node-tools/visualization-tools.ts", base));
const { compileTools } = await loadTs(new URL("node-tools/compiler.ts", base));
const { evaluateProduct } = await loadTs(new URL("node-tools/runtime.ts", base));
const { deriveTools } = await loadTs(new URL("node-tools/product.ts", base));

function fixture() {
  const doc = addPumpProductFixture(prepareDocument(initialTools()));
  const root = doc.diagrams.find(graph => graph.id === doc.product.root);
  root.nodes.find(node => node.id === "settings").name = "Исходные данные объекта";
  root.nodes.find(node => node.id === "pumpFixture").name = "Таблица оборудования";
  const selection = doc.diagrams.find(graph => graph.id === "pumpFixture.graph");
  selection.nodes.find(node => node.id === "request").values.staticHead = 4;
  return doc;
}

const pump = { id: "v", manufacturer: "Fixture", series: "F", group: "F", model: "Модель F", execution: "Исполнение F", type: "vertical_multistage", power: 3, efficiency: null, nominalFlow: 10, minFlow: 0, maxFlow: 20, minHead: 10, maxHead: 30, price: 1000, priceCurrency: "RUB", priceKind: "net", priceSource: "fixture", source: "fixture", drawing: null, curve: [[0, 30], [10, 20], [20, 10]], frequencyHz: 50, medium: "water", selectable: true, active: true, inletDn: null, outletDn: null };
const snapshot = { sourceId: "pump_catalog_v2", id: "a".repeat(64), schemaVersion: "fixture-v1", sourceStatus: "test", status: "ready", created: "2026-11-07T00:00:00Z", items: [{ modelId: "m", variantId: "v", curveSetId: "qh-v", frequencyHz: 50, pump, issues: [], provenance: {} }], issues: [] };
const settings = { stationType: "utility", "main.flowRate": 10, "main.head": 20, "main.workingPumpCount": 1, "main.reservePumpCount": 0 };
function contexts(program, values = {}) {
  return Object.fromEntries(program.tools.map(tool => [tool.id, { role: "admin", defaults: { usdRate: 85, cnyRate: 13, discount_cnp: 0, discount_aquastrong: 0, discount_onis: 0, discount_vandjord: 0, discount_wellmix: 0 }, values: tool.id === "settings" ? settings : values[tool.id] ?? {}, resources: { pump_catalog_v2: snapshot } }]));
}
function selectedContexts(program) {
  const ctx = contexts(program), result = evaluateProduct(program, "pumpFixture", ctx);
  const state = Object.entries(result.trace).find(([id]) => id.endsWith("/checkSelection"))[1].outputs.selection;
  ctx.pumpFixture.values = { selectedPump: { variantId: "v", snapshotId: state.snapshotId, requestKey: state.requestKey } };
  return ctx;
}

test("visualization sources follow structural operations and contracts after instruments are renamed", () => {
  const doc = fixture(), before = JSON.stringify(doc);
  assert.deepEqual(visualizationSources(doc), { selections: [{ id: "pumpFixture", name: "Таблица оборудования" }], settings: [{ id: "settings", name: "Исходные данные объекта" }] });
  assert.equal(JSON.stringify(doc), before);
  const selectionGraph = doc.diagrams.find(graph => graph.id === "pumpFixture.graph");
  selectionGraph.nodes.push({ ...structuredClone(selectionGraph.nodes.find(node => node.id === "checkSelection")), id: "unusedSelectionCheck" });
  assert.equal(visualizationSources(doc).selections[0].id, "pumpFixture");
  doc.diagrams.find(graph => graph.id === doc.product.root).nodes.find(node => node.id === "pumpFixture").tool.enabled = false;
  assert.deepEqual(visualizationSources(doc).selections, []);
});

test("explicit templates append root instruments and preserve existing nodes, filters, wires and stable identities", () => {
  const before = fixture(), original = structuredClone(before);
  const chart = addVisualizationTool(before, "hydraulic", { selectionId: "pumpFixture", settingsId: "settings" });
  const card = addVisualizationTool(chart.document, "card", { selectionId: "pumpFixture" });
  assert.deepEqual(before, original);
  assert.equal(deriveTools(card.document).length, deriveTools(before).length + 2);
  assert.equal(deriveTools(card.document).find(tool => tool.id === chart.id).category, "Обработка и отображение");
  assert.equal(deriveTools(card.document).find(tool => tool.id === card.id).category, "Вывод");
  for (const graph of before.diagrams) {
    const after = card.document.diagrams.find(after => after.id === graph.id);
    for (const node of graph.nodes) assert.deepEqual(after.nodes.find(after => after.id === node.id), node);
    for (const edge of graph.edges) assert(after.edges.some(after => JSON.stringify(after) === JSON.stringify(edge)));
  }
  const sourceGraph = card.document.diagrams.find(graph => graph.id === "pumpFixture.graph");
  assert.equal(sourceGraph.nodes.filter(node => node.name === "Условия подтверждённого подбора").length, 1);
  const program = compileTools(card.document, "visualization-v1");
  assert.deepEqual(new Set(program.product.dependencies[chart.id]), new Set(["settings", "pumpFixture"]));
  assert.deepEqual(new Set(program.product.dependencies[card.id]), new Set(["settings", "pumpFixture"]));
  assert.equal(deriveTools(card.document).find(tool => tool.id === chart.id).tests.length, 0);
  assert.throws(() => addVisualizationTool(before, "hydraulic", { selectionId: "settings" }), /подбора/);
});

test("chart and detail evaluate the confirmed variant and exact selected dataset request without upstream table UI", () => {
  const chart = addVisualizationTool(fixture(), "hydraulic", { selectionId: "pumpFixture", settingsId: "settings" });
  const card = addVisualizationTool(chart.document, "card", { selectionId: "pumpFixture" });
  const program = compileTools(card.document, "visualization-v1"), ctx = selectedContexts(program);
  const hydraulic = evaluateProduct(program, chart.id, ctx), details = evaluateProduct(program, card.id, ctx);
  assert.equal(hydraulic.trace[chart.id + "/model"].inputs.item.variantId, "v");
  assert.equal(hydraulic.trace[chart.id + "/model"].inputs.request.staticHead, 4);
  assert.equal(hydraulic.trace[chart.id + "/model"].inputs.request.workingPumpCount, 1);
  assert.equal(details.value.status, "ready");
  assert.equal(details.value.identity.variantId, "v");
  assert.equal(details.value.identity.snapshotId, snapshot.id);
  assert(!hydraulic.trace["pumpFixture/table"]);
  assert(!hydraulic.trace["pumpFixture/form"]);
  assert(!hydraulic.trace["settings/form"]);
  assert(!details.trace["pumpFixture/table"]);
  for (const key of ["method", "frequency", "grid"]) assert(hydraulic.bindings.some(binding => binding.key === key && binding.toolId === chart.id));
  assert.equal(hydraulic.trace[chart.id + "/chart"].inputs.flowBinding.key, "main.flowRate");
  assert.equal(hydraulic.trace[chart.id + "/chart"].inputs.headBinding.key, "main.head");
  ctx[chart.id].values = { method: "polynomial" };
  assert.equal(evaluateProduct(program, chart.id, ctx).trace[chart.id + "/model"].inputs.method, "polynomial");
  ctx.settings.values = { ...settings, "main.head": 21 };
  const staleChart = evaluateProduct(program, chart.id, ctx), staleCard = evaluateProduct(program, card.id, ctx);
  assert.equal(staleChart.trace[chart.id + "/model"].inputs.item, null);
  assert.equal(staleCard.value.status, "stale");
  assert.equal(staleCard.value.identity, undefined);
});

test("unconfirmed selection stays empty and unavailable project bindings are not guessed", () => {
  const doc = fixture();
  const chart = addVisualizationTool(doc, "hydraulic", { selectionId: "pumpFixture" });
  const card = addVisualizationTool(chart.document, "card", { selectionId: "pumpFixture" });
  const program = compileTools(card.document, "visualization-empty"), ctx = contexts(program);
  const hydraulic = evaluateProduct(program, chart.id, ctx), details = evaluateProduct(program, card.id, ctx);
  assert.equal(hydraulic.trace[chart.id + "/model"].inputs.item, null);
  assert.equal(details.value.status, "empty");
  assert.equal(hydraulic.trace[chart.id + "/chart"].inputs.flowBinding, null);
  assert.equal(hydraulic.trace[chart.id + "/chart"].inputs.headBinding, null);
});

test("exports preserve occupied user ports and pass confirmation through nested Instrument boundaries", () => {
  const doc = fixture(), rootType = doc.types.find(type => type.id === "pumpFixture"), oldGraph = rootType.instrument;
  const userPorts = ["selection", "request"].map(key => ({ key, name: "Пользовательский " + key, kind: "object", meaning: "record", direction: "output", unit: "" }));
  rootType.fields.push(...userPorts);
  const oldBoundary = doc.types.find(type => type.id === "pumpFixture.out");
  oldBoundary.fields.push(...userPorts.map(field => ({ ...field, direction: "input" })));
  doc.diagrams.find(graph => graph.id === oldGraph).nodes.find(node => node.id === "result").values = { selection: { keep: "selection" }, request: { keep: "request" } };
  const wrapper = "nestedFixture.graph", inner = { ...structuredClone(rootType), id: "nestedFixture.inner", instrument: oldGraph };
  doc.types.push(inner,
    { id: "nestedFixture.in", name: "Входы", category: "Границы", description: "", formulas: {}, fields: rootType.fields.filter(field => field.direction === "input").map(field => ({ ...field, direction: "output" })) },
    { id: "nestedFixture.out", name: "Выходы", category: "Границы", description: "", formulas: {}, fields: rootType.fields.filter(field => field.direction === "output").map(field => ({ ...field, direction: "input" })) });
  rootType.instrument = wrapper;
  doc.diagrams.push({ id: wrapper, name: "Обёртка подбора", groups: {}, nodes: [
    { id: "source", type: "nestedFixture.in", name: "Входы", x: 0, y: 0, values: {} },
    { id: "inner", type: inner.id, name: "Внутренний подбор", x: 300, y: 0, values: {} },
    { id: "result", type: "nestedFixture.out", name: "Выходы", x: 600, y: 0, values: {} }
  ], edges: rootType.fields.map(field => field.direction === "input" ? { from: "source", out: field.key, to: "inner", input: field.key } : { from: "inner", out: field.key, to: "result", input: field.key }) });
  const card = addVisualizationTool(doc, "card", { selectionId: "pumpFixture" });
  const newRoot = card.document.diagrams.find(graph => graph.id === card.document.product.root);
  assert.equal(newRoot.edges.find(edge => edge.to === card.id && edge.input === "selection").out, "selection_2");
  assert.equal(card.document.types.find(type => type.id === "pumpFixture").fields.find(field => field.key === "selection").meaning, "record");
  assert.equal(card.document.types.find(type => type.id === "pumpFixture").fields.find(field => field.key === "request").meaning, "record");
  const program = compileTools(card.document, "nested-visualization"), ctx = selectedContexts(program);
  const details = evaluateProduct(program, card.id, ctx);
  assert.equal(details.value.status, "ready");
  assert.equal(details.value.identity.variantId, "v");
});
