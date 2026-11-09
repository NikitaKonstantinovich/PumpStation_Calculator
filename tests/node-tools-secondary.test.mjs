import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { addPumpProductFixture } from "./fixtures/pump-product.mjs";
import { resources as engineering } from "./fixtures/station-specification.mjs";
const base = new URL("../app/", import.meta.url);
const { initialTools } = await loadTs(new URL("node-tools/factory.ts", base));
const { prepareDocument } = await loadTs(new URL("node-tools/authoring.ts", base));
const { addStationTool } = await loadTs(new URL("node-tools/station-tools.ts", base));
const { addVisualizationTool } = await loadTs(new URL("node-tools/visualization-tools.ts", base));
const { selectedExports, contourInputView } = await loadTs(new URL("node-tools/visualization-tools.ts", base));
const { addSecondaryTools } = await loadTs(new URL("node-tools/secondary-tools.ts", base));
const { compileTools } = await loadTs(new URL("node-tools/compiler.ts", base));
const { evaluateProduct } = await loadTs(new URL("node-tools/runtime.ts", base));
const { applyParameterWrites } = await loadTs(new URL("node-tools/form-actions.ts", base));
const { invalidateInactiveContexts, migrateProduct, productContexts, invalidSelections } = await loadTs(new URL("node-tools/product-state.ts", base));
const { legacyBaseSnapshot } = await loadTs(new URL("base-values.ts", base));

function fixture() {
  const mainChart = addVisualizationTool(addPumpProductFixture(prepareDocument(initialTools())), "hydraulic", { selectionId: "pumpFixture", settingsId: "settings" });
  const mainCard = addVisualizationTool(mainChart.document, "card", { selectionId: "pumpFixture" });
  const dn = addStationTool(mainCard.document, "dn", { settingsId: "settings", selectionId: "pumpFixture" });
  const collectors = addStationTool(dn.document, "collectors", { dnId: dn.id });
  const spec = addStationTool(collectors.document, "specification", { collectorsId: collectors.id });
  const added = addSecondaryTools(spec.document, "settings");
  return { ...added, before: spec.document, mainChart: mainChart.id, mainCard: mainCard.id, dn: dn.id, collectors: collectors.id, spec: spec.id, program: compileTools(added.document, "two-circuits-v1") };
}
const basePump = { manufacturer: "Fixture", series: "F", group: "F", type: "vertical_multistage", power: 3, efficiency: null, nominalFlow: 10, minFlow: 0, maxFlow: 100, minHead: 10, maxHead: 50, price: 1000, priceCurrency: "RUB", priceKind: "net", priceSource: "fixture", source: "fixture", drawing: null, frequencyHz: 50, medium: "water", selectable: true, active: true, inletDn: 50, outletDn: 40, inlet: { dn: 50, connection_type: "flanged", pn_nominal_bar: 16 }, outlet: { dn: 40, connection_type: "flanged", pn_nominal_bar: 16 } };
const item = (id, curve, extra = {}) => ({ modelId: "model-" + id, variantId: id, curveSetId: "qh-" + id, frequencyHz: 50, pump: { ...basePump, id, model: id, execution: id, curve, ...extra }, issues: [], provenance: {} });
const snapshot = { sourceId: "pump_catalog_v2", id: "a".repeat(64), schemaVersion: "fixture/v1", sourceStatus: "test", status: "ready", created: "2026-11-09T00:00:00Z", items: [item("primary", [[0, 30], [60, 20], [100, 10]]), item("secondary", [[0, 50], [5, 40], [10, 20]]), item("inline", [[0, 50], [5, 40], [10, 20]], { type: "inline", series: "I" }), item("other", [[0, 50], [5, 40], [10, 20]], { type: "inline", manufacturer: "Other", series: "O" })], issues: [] };
const resources = { pump_catalog_v2: snapshot, station_catalog: { sourceId: "station_catalog", id: "b".repeat(64), components: engineering.components, cabinets: engineering.cabinets, smartCabinets: engineering.smartCabinets, collectorCatalog: engineering.components.collectorCatalog, baseSettings: legacyBaseSnapshot() } };
const defaults = { usdRate: 85, cnyRate: 13, discount_cnp: 0, discount_aquastrong: 0, discount_onis: 0, discount_vandjord: 0, discount_wellmix: 0 };
const settings = { stationType: "combined", "main.flowRate": 60, "main.head": 20, "main.workingPumpCount": 1, "main.reservePumpCount": 2, "secondary.flowRate": 5, "secondary.head": 40, "secondary.workingPumpCount": 1, "secondary.reservePumpCount": 1, inletHead: 10 };
const contexts = program => Object.fromEntries(program.tools.map(t => [t.id, { role: "admin", defaults, resources, values: t.id === "settings" ? structuredClone(settings) : {} }]));
const findView = (view, kind) => view?.kind === kind ? view : view?.children?.map(child => findView(child, kind)).find(Boolean);
function select(program, ctx, tool, variant, node = "selection") {
  const result = evaluateProduct(program, tool, ctx), state = result.trace[tool + "/" + node].outputs.selection;
  ctx[tool].values = { ...ctx[tool].values, selectedPump: { variantId: variant, snapshotId: state.snapshotId, requestKey: state.requestKey } };
  assert.equal(evaluateProduct(program, tool, ctx).trace[tool + "/" + node].outputs.selection.valid, true);
}
function confirmed(f) { const ctx = contexts(f.program); select(f.program, ctx, "pumpFixture", "primary", "checkSelection"); select(f.program, ctx, f.tools.selection, "secondary"); return ctx; }

test("second-contour command preserves every existing node and edge and is idempotent after roundtrip", () => {
  const f = fixture();
  for (const g of f.before.diagrams) {
    const next = f.document.diagrams.find(n => n.id === g.id);
    for (const n of g.nodes) assert.deepEqual(next.nodes.find(x => x.id === n.id), n);
    for (const e of g.edges) assert(next.edges.some(x => JSON.stringify(x) === JSON.stringify(e)));
  }
  const again = addSecondaryTools(JSON.parse(JSON.stringify(f.document)), "settings");
  assert.deepEqual(JSON.parse(JSON.stringify(again.document)), JSON.parse(JSON.stringify(f.document))); assert.deepEqual(again.tools, f.tools);
  assert.equal(f.program.tools.length, 10);
  assert(f.program.product.dependencies[f.dn].includes(f.tools.selection));
  assert(f.program.product.dependencies[f.tools.card].includes(f.tools.chart));
  assert(f.program.product.dependencies[f.tools.card].includes(f.collectors));
});

test("Q60/H20 and Q5/H40 select different pumps, exact request and static head reach their cards and charts", () => {
  const f = fixture(), ctx = confirmed(f);
  const primary = evaluateProduct(f.program, f.mainCard, ctx), secondary = evaluateProduct(f.program, f.tools.card, ctx);
  assert.equal(primary.value.identity.variantId, "primary"); assert.equal(secondary.value.identity.variantId, "secondary");
  const chart = evaluateProduct(f.program, f.tools.chart, ctx), model = chart.trace[f.tools.chart + "/model"].outputs.model;
  assert.equal(model.request.flowRate, 5); assert.equal(model.request.head, 40); assert.equal(model.request.contour, "secondary");
  assert.equal(model.request.staticHead, 0); assert.equal(model.count, 1);
  assert.equal(chart.trace[f.tools.chart + "/point"].outputs.details.context.request.contour, "secondary");
  const selection = evaluateProduct(f.program, f.tools.selection, ctx);
  assert.deepEqual(chart.trace[f.tools.selection + "/selectedRequest"].outputs.value, chart.trace[f.tools.selection + "/selection"].inputs.candidates.request);
  assert.deepEqual(findView(selection.view, "table").columnsSpec.map(c => c.key), ["model", "manufacturer", "series", "power", "purchasePriceRub", "flow", "head"]);
  assert.equal(selection.view.children[0].enabled, false); assert.equal(selection.view.children[0].collapsible, false);
  assert(!selection.issues.some(i => i.severity === "error"), JSON.stringify(selection.issues));
});

test("second-chart writes only secondary Q/H; own frequency, method, sort and filters never change main state", () => {
  const f = fixture(), ctx = confirmed(f), before = JSON.stringify(ctx.pumpFixture);
  ctx[f.tools.chart].values = { method: "linear", frequency: { enabled: true, frequencyHz: 45, nominalHz: 50, showNominal: true, pumpId: "secondary" } };
  ctx[f.tools.selection].values.sort = "distance";
  const chart = evaluateProduct(f.program, f.tools.chart, ctx), view = findView(chart.view, "hydraulic-chart");
  assert.equal(view.pointBindings.flow.key, "secondary.flowRate"); assert.equal(view.pointBindings.head.key, "secondary.head");
  assert.equal(view.chart.model.method, "linear"); assert(view.chart.model.referencePump);
  const state = Object.fromEntries(Object.entries(ctx).map(([id, c]) => [id, c.values]));
  const next = applyParameterWrites(state, chart.bindings, [{ binding: view.pointBindings.flow, value: 6 }, { binding: view.pointBindings.head, value: 42 }], f.tools.chart);
  assert.equal(next.settings["secondary.flowRate"], 6); assert.equal(next.settings["main.flowRate"], 60); assert.equal(next.settings["main.head"], 20);
  assert.equal(JSON.stringify(ctx.pumpFixture), before);
  assert.equal(evaluateProduct(f.program, f.mainChart, ctx).trace[f.mainChart + "/model"].outputs.model.method, "pchip");
});

test("dependent filters retain compatible manufacturer and clear only incompatible series", () => {
  const f = fixture(), ctx = contexts(f.program);
  ctx[f.tools.selection].values = { type: "vertical_multistage", manufacturer: "Fixture", series: "F" };
  const result = evaluateProduct(f.program, f.tools.selection, ctx), type = result.trace[f.tools.selection + "/typeField"].outputs.value;
  assert(type.compatibleClearValues.inline.manufacturer.includes("Fixture"));
  assert(!type.compatibleClearValues.inline.series.includes("F")); assert(type.compatibleClearValues.inline.series.includes("I"));
  const manufacturer = result.trace[f.tools.selection + "/manufacturerField"].outputs.value;
  assert.deepEqual(manufacturer.options.map(o => o.value), ["Fixture"]);
  assert(type.clearBindings.every(b => b.toolId === f.tools.selection));
});

test("deactivation skips catalog and all second-contour calculations, retains state and permanently revokes proof", () => {
  const f = fixture(); let ctx = confirmed(f);
  ctx[f.tools.selection].values.manufacturer = "Fixture";
  ctx[f.tools.chart].values.method = "linear";
  const proof = ctx[f.tools.selection].values.selectedPump;
  ctx.settings.values.stationType = "utility";
  for (const id of Object.values(f.tools)) {
    const result = evaluateProduct(f.program, id, ctx);
    assert.equal(result.view.label, "Второй контур не используется"); assert.equal(result.value, null);
    assert.equal(result.view.kind, "form", "Inactive tools must satisfy the publication form contract");
    assert(!result.trace[f.tools.selection + "/catalog"]); assert(!result.trace[f.tools.chart + "/model"]);
    assert(!result.issues.some(i => i.severity === "error"), JSON.stringify(result.issues));
  }
  ctx = invalidateInactiveContexts(f.program, ctx);
  assert.equal(ctx[f.tools.selection].values.manufacturer, "Fixture"); assert.equal(ctx[f.tools.chart].values.method, "linear");
  assert.equal(ctx[f.tools.selection].values.selectedPump.requestKey, "inactive:" + proof.requestKey);
  const off = evaluateProduct(f.program, f.tools.selection, ctx);
  assert.deepEqual(invalidSelections(off, f.tools.selection, ctx[f.tools.selection].values, { selectedPump: proof }, f.program.plans[f.tools.selection]), []);
  ctx.settings.values.stationType = "combined";
  assert.equal(evaluateProduct(f.program, f.tools.selection, ctx).trace[f.tools.selection + "/selection"].outputs.selection.stale, true);
  select(f.program, ctx, f.tools.selection, "secondary");
});

test("DN, collectors and specification receive two independent selections and reserve counts, then remove inactive equipment", () => {
  const f = fixture(), ctx = confirmed(f);
  const dn = evaluateProduct(f.program, f.dn, ctx), spec = evaluateProduct(f.program, f.spec, ctx);
  assert.equal(dn.value.project.station.selectedPumpId, "primary");
  assert.equal(dn.value.project.station.secondaryPumpId, "secondary");
  const items = spec.value.project.entities["station-spec"].items;
  assert(items.some(i => i.option === "primaryPump" && i.quantity === 3));
  assert(items.some(i => i.option === "secondaryPump" && i.quantity === 2));
  ctx.settings.values.stationType = "utility";
  const off = evaluateProduct(f.program, f.spec, ctx).value.project.entities["station-spec"].items;
  assert(!off.some(i => i.option === "secondaryPump")); assert(off.some(i => i.option === "primaryPump" && i.quantity === 3));
});

test("fire jockey scenario is separate; saved inactive settings survive migration and source refresh makes proof stale", () => {
  const f = fixture(), ctx = confirmed(f);
  ctx.settings.values.stationType = "fire"; ctx.settings.values.jockeyPump = true;
  assert.equal(evaluateProduct(f.program, f.tools.selection, ctx).trace[f.tools.selection + "/request"].outputs.value.contour, "secondary");
  ctx.settings.values.jockeyPump = false;
  const data = { schema: 1, product: { version: f.program.version, baseVersions: {} }, tools: Object.fromEntries(Object.entries(ctx).map(([id, c]) => [id, { version: f.program.version, values: c.values, baseVersions: {} }])) };
  const migrated = migrateProduct(f.program, JSON.parse(JSON.stringify(data)), defaults, {}, "admin", resources);
  assert.equal(migrated.data.tools[f.tools.selection].values.selectedPump.requestKey, "inactive:" + data.tools[f.tools.selection].values.selectedPump.requestKey);
  ctx.settings.values.stationType = "combined";
  for (const c of Object.values(ctx)) c.resources = { ...resources, pump_catalog_v2: { ...snapshot, id: "c".repeat(64) } };
  assert.equal(evaluateProduct(f.program, f.tools.selection, ctx).trace[f.tools.selection + "/selection"].outputs.selection.stale, true);
  const reopened = productContexts(f.program, JSON.parse(JSON.stringify(data)), defaults, "admin", resources);
  assert.deepEqual(reopened.pumpFixture.values, data.tools.pumpFixture.values);
});

test("inactive tools run without a catalog, retain own parameters and reject a fabricated disabled choice", () => {
  const f = fixture(), ctx = contexts(f.program);
  ctx.settings.values.stationType = "utility";
  for (const c of Object.values(ctx)) delete c.resources;
  ctx[f.tools.selection].values = { manufacturer: "Fixture", selectedPump: { variantId: "secondary", snapshotId: snapshot.id, requestKey: "inactive:forged" } };
  const result = evaluateProduct(f.program, f.tools.selection, ctx);
  assert.equal(result.view.label, "Второй контур не используется");
  assert(result.bindings.some(b => b.toolId === f.tools.selection && b.key === "manufacturer" && b.active === false));
  assert(invalidSelections(result, f.tools.selection, ctx[f.tools.selection].values, {}, f.program.plans[f.tools.selection]).length > 0);
  assert(!result.issues.some(i => i.severity === "error"));
});

test("later output exposure reuses the guard and missing secondary view never falls back to main", () => {
  const f = fixture(), doc = structuredClone(f.document), root = doc.diagrams.find(g => g.id === doc.product.root);
  const before = JSON.stringify(doc);
  selectedExports(doc, root, f.tools.selection);
  assert.equal(JSON.stringify(doc), before);
  const settingsGraph = doc.diagrams.find(g => g.id === doc.types.find(t => t.id === root.nodes.find(n => n.id === "settings").type).instrument);
  settingsGraph.nodes.find(n => n.values.scope === "secondary").values.scope = "other";
  assert.equal(contourInputView(doc, root, "settings", "secondary"), null);
  assert(contourInputView(doc, root, "settings", "main"));
});
