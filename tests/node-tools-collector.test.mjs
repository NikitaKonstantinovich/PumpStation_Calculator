import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

globalThis.__PSC_RELEASE_PROFILE__ = "full";
const { collectorNodeTypes } = await loadTs(new URL("../app/node-tools/collector-nodes.ts", import.meta.url));
const { executeCollectorOperation } = await loadTs(new URL("../app/node-tools/collector-runtime.ts", import.meta.url));
const { createProject } = await loadTs(new URL("../app/project-config.ts", import.meta.url));
const legacy = await loadTs(new URL("../app/collector-calculations.ts", import.meta.url));
const { coreCollectorRecommendation, createCollectors } = await loadTs(new URL("../app/collector-project.ts", import.meta.url));
const { collectorSpacingConfirmation } = await loadTs(new URL("../app/collector-spacing.ts", import.meta.url));
const { validateCollectorStateEdit } = await loadTs(new URL("../app/node-tools/collector-validation.ts", import.meta.url));
const { verifyCollectorStateRecords } = await loadTs(new URL("../app/node-tools/collector-state-server.ts", import.meta.url), {
  [new URL("../app/auth-server.ts", import.meta.url).href]: "export function db(){return {prepare(){return {bind(id){return {async first(){return globalThis.__nodeCollectorRecord?.id===id?globalThis.__nodeCollectorRecord:null;}};}};}};}"
});
const types = new Map(collectorNodeTypes().map(type => [type.operation, type]));
const context = { values: {}, defaults: {}, role: "admin" };
function run(operation, values = {}, ctx = context) {
  const type = types.get(operation); assert(type);
  return executeCollectorOperation({ id: "collector/" + operation, operation, fields: type.fields, values: {}, expressions: {}, links: [] }, { ...Object.fromEntries(type.fields.map(field => [field.key, field.initial])), ...values }, ctx);
}
function catalog() {
  const components = [], sizes = { 15: [21.3, 17.3], 20: [26.9, 22.9], 50: [60.3, 56.3], 80: [88.9, 83.9], 100: [114.3, 108.3], 150: [159, 153] };
  for (const material of ["aisi304", "st20"]) for (const [size, [outerDiameter, innerDiameter]] of Object.entries(sizes)) for (const pn of [10, 16, 25]) for (const kind of ["pipe", "weldFlange", "looseFlange", "collar", "nipple", "plug"]) components.push({ id: `${material}-${kind}-${size}-${pn}`, kind, name: `${kind} DN${size}`, dn: Number(size), pn, material, threadGender: kind === "plug" ? "female" : undefined, outerDiameter, innerDiameter, price: kind === "pipe" ? 1000 : 100, source: "TEST FIXTURE ONLY" });
  return { version: "collector-fixture-v1", components, bolts: [], valveBolts: Object.keys(sizes).flatMap(dn => [10, 16, 25].flatMap(pn => ["st20", "aisi304"].map(material => ({ dn: Number(dn), pn, material, model: "017W", length: 50, minimumLengthMm: 49, componentId: "fixture-bolt", diameter: 16, source: "TEST FIXTURE ONLY", warnings: [] })))), paintingRates: Object.keys(sizes).map(dn => ({ id: "paint-" + dn, dn: Number(dn), material: "st20", pricePerMeter: 250, source: "TEST FIXTURE ONLY", warnings: [] })) };
}
function fixture() {
  const project = createProject("Node collector fixture", { id: "fixture", timestamp: "2026-01-01T00:00:00Z" });
  project.entities["system-input"] = { kind: "input", flowRate: 60, head: 20, staticHead: 0, workingPumpCount: 2, reservePumpCount: 1, medium: "water", calculated: true, selectedPumpId: "fixture-variant", selectedPumpModel: "Fixture pump" };
  Object.assign(project.entities["station-dn"], { suctionCollectorDn: 100, dischargeCollectorDn: 100, suctionValveDn: 80, dischargeValveDn: 80, pn: 16, collectorMaterial: "aisi304", connectionType: "flanged" });
  project.entities["station-settings"].inletHead = 0;
  const pumps = [], dn = { project, pumps, issues: [] };
  const recommendations = run("collector.recommend", { dn }).recommendations;
  return { dn, recommendations, catalog: catalog() };
}
function resolve(f, state = createCollectors(), cat = f.catalog) { return run("collector.resolve", { recommendations: f.recommendations, state, catalog: cat }).resolved; }
function calculate(resolved) { return run("collector.calculate", { resolved }).calculations; }
function cached(f, type = "suction") {
  const resolved = resolve(f), calculations = calculate(resolved), state = structuredClone(resolved.entity), card = state[type];
  card.calculation = calculations[type]; card.calculationSourceFingerprint = card.sourceFingerprint; card.status = "complete";
  card.databaseStatus = "found"; card.database = { id: "saved-fixture", code: card.code, configuration: card.configuration, price: calculations[type].price, priceUpdatedAt: "2026-01-01T00:00:00Z", source: "TEST FIXTURE ONLY", calculation: calculations[type] };
  return state;
}

test("collector graph preserves the original recommendation, quantities, geometry, BOM and welding calculations", () => {
  const f = fixture(), before = JSON.stringify(f);
  for (const type of ["suction", "discharge"]) assert.deepEqual(f.recommendations.recommendations[type], coreCollectorRecommendation(f.dn.project, type, []));
  const resolved = resolve(f), calculations = calculate(resolved);
  for (const type of ["suction", "discharge"]) {
    const c = calculations[type];
    assert.deepEqual(c, legacy.coreCalculateCollector(resolved.entity[type].configuration, f.catalog));
    assert.equal(c.complete, true, c.warnings.join("; "));
    assert.equal(c.lengthMm, 1500); assert.equal(c.flow, 60);
    assert.equal(c.bom.find(row => row.role === "branch1-pipe").quantity, 3 * c.branchLengthsMm[0] / 1000);
  }
  assert.equal(JSON.stringify(f), before);
});

test("manual spacing is a graph parameter, requires confirmation and invalidates when the pump changes", () => {
  const f = fixture(), state = createCollectors();
  state.suction.spacing1 = 650; state.suction.spacing1Manual = true;
  let result = resolve(f, state);
  assert.equal(result.entity.suction.code, null);
  assert(result.issues.some(issue => issue.message.includes("подтвердите ручное")));
  state.suction.spacing1Confirmation = collectorSpacingConfirmation(result.entity.suction.configuration, 0);
  result = resolve(f, state); assert.equal(result.entity.suction.configuration.primary.spacing, 650); assert(result.entity.suction.code);
  const changed = structuredClone(f); changed.recommendations.recommendations.suction.primary.pumpId = "other-variant";
  assert.equal(resolve(changed, state).entity.suction.code, null);
});

test("manual branches larger than collector and missing painting rates never yield a complete final price", () => {
  const f = fixture(), state = createCollectors(); state.suction.overrides.dn = 50;
  const invalid = resolve(f, state); assert.equal(invalid.entity.suction.code, null); assert.equal(calculate(invalid).suction.price, null);
  state.suction.overrides = { material: "st20" };
  const missing = { ...f.catalog, paintingRates: [] }, result = calculate(resolve(f, state, missing)).suction;
  assert.equal(result.complete, false); assert.equal(result.price, null); assert(result.warnings.some(message => /окраск/i.test(message)));
});

test("a changed DN source invalidates cached calculation and database identity", () => {
  const f = fixture(), state = cached(f), unchanged = resolve(f, state);
  assert.equal(unchanged.entity.suction.status, "complete"); assert.equal(unchanged.entity.suction.databaseStatus, "found");
  const changed = structuredClone(f); changed.recommendations.recommendations.suction.primary.flow = 70;
  const next = resolve(changed, state); assert.equal(next.entity.suction.status, "stale"); assert.equal(next.entity.suction.database, null);
});

test("catalog refresh retains the old price only for comparison and blocks its readiness in specification", () => {
  const f = fixture(), state = cached(f), nextCatalog = { ...f.catalog, version: "collector-fixture-v2" }, resolved = resolve(f, state, nextCatalog);
  assert.equal(resolved.entity.suction.status, "stale"); assert.equal(resolved.entity.suction.databaseStatus, "found");
  const output = run("collector.result", { resolved, calculations: calculate(resolved) }).result;
  assert.equal(output.entity.suction.database, null);
  assert.notEqual(output.project.entities["station-spec"].items.find(item => item.option === "suctionCollector").status, "selected");
  const changed = structuredClone(state); changed.suction.database.configuration.primary.spacing = 777;
  assert.equal(resolve(f, changed).entity.suction.database, null);
});

test("a physical saved assembly remains refreshable when only source pump metadata differs", () => {
  const f = fixture(), state = cached(f);
  state.suction.database.configuration = structuredClone(state.suction.database.configuration);
  state.suction.database.configuration.primary.pumpModel = "Previous metadata";
  const resolved = resolve(f, state);
  assert.equal(resolved.entity.suction.databaseStatus, "found"); assert.equal(resolved.entity.suction.status, "stale");
  assert.equal(run("collector.result", { resolved, calculations: calculate(resolved) }).result.entity.suction.database, null);
});

test("pump-line insertion edits do not invalidate the collector calculation", () => {
  const f = fixture(), state = cached(f);
  f.recommendations.project.entities["station-dn"].insertionDesigns = { separatePumpLine: { design: "changed" } };
  const resolved = resolve(f, state);
  assert.equal(resolved.entity.suction.status, "complete"); assert.equal(resolved.entity.suction.databaseStatus, "found");
});

test("disconnected source/calculation nodes do not substitute Workspace 1 or fabricate final results", () => {
  assert.equal(run("collector.recommend").recommendations.project, null);
  const f = fixture(), state = cached(f), noCatalog = resolve(f, state, null);
  assert.deepEqual(calculate(noCatalog), { suction: null, discharge: null });
  const resolved = resolve(f, state), output = run("collector.result", { resolved }).result;
  assert.equal(output.entity.suction.database, null); assert.equal(output.entity.suction.status, "stale");
  assert(output.issues.some(issue => issue.message.includes("Подключите актуальный расчёт")));
});

test("database commands and manual customization permissions are explicit in graph view", () => {
  const commands = run("collector.databaseActions", { create: false, refresh: false }).commands;
  assert.deepEqual(commands.actions, ["calculate", "lookup"]);
  const f = fixture(), resolved = resolve(f), calculations = calculate(resolved), binding = { key: "collectors", editable: true, active: true, mode: "user" };
  const view = run("ui.collectorConstructor", { resolved, calculations, commands, stateBinding: binding }, { ...context, role: "base" }).value;
  assert.equal(view.kind, "collector-constructor"); assert.equal(view.collector.canCustomize, false); assert.equal(view.collector.stateBinding, binding);
  assert.deepEqual(view.collector.calculations, calculations);
  assert.deepEqual(run("ui.collectorConstructor", { resolved }).value.collector.commands.actions, []);
});

test("basic roles may save server receipts but cannot smuggle manual collector settings through the object parameter", () => {
  const initial = createCollectors(), after = structuredClone(initial);
  after.suction.calculation = { fingerprint: "receipt", price: 25 };
  assert.equal(validateCollectorStateEdit(after, initial, "base"), null);
  after.suction.overrides.dn = 200;
  assert.match(validateCollectorStateEdit(after, initial, "base"), /pro/);
  assert.equal(validateCollectorStateEdit(after, initial, "pro"), null);
  after.suction.overrides = {}; after.suction.spacing1Manual = true; after.suction.spacing1 = 700;
  assert.match(validateCollectorStateEdit(after, initial, "plus"), /pro/);
  after.suction.spacing1Manual = false; after.suction.spacing1Confirmation = "forged";
  assert.match(validateCollectorStateEdit(after, initial, "base"), /pro/);
});

test("cached calculation prices are replaced with arithmetic from the connected calculation node", () => {
  const f = fixture(), state = cached(f); state.suction.database = null; state.suction.databaseStatus = "missing";
  state.suction.calculation.price = 1; state.suction.calculation.subtotal = 1;
  const resolved = resolve(f, state), calculations = calculate(resolved), output = run("collector.result", { resolved, calculations }).result;
  assert.equal(output.entity.suction.calculation.price, calculations.suction.price);
  assert.notEqual(output.entity.suction.calculation.price, 1);
  f.dn.context = { status: "empty" };
  assert.equal(run("collector.recommend", { dn: f.dn }).recommendations.project, null);
});

test("saved collector receipts are checked against the authoritative row including price and full calculation", async () => {
  const f = fixture(), state = cached(f), saved = state.suction.database;
  globalThis.__nodeCollectorRecord = { id: saved.id, code: saved.code, configuration_json: JSON.stringify(saved.configuration), calculation_json: JSON.stringify(saved.calculation), cached_price_microunits: Math.round(saved.price * 1e6), price_updated_at: saved.priceUpdatedAt, source: saved.source };
  // Stored database prices use microunits, just like the API response.
  state.suction.database.price = globalThis.__nodeCollectorRecord.cached_price_microunits / 1e6;
  assert.deepEqual(await verifyCollectorStateRecords(state), []);
  const tampered = structuredClone(state); tampered.suction.database.price += 1000;
  assert.match((await verifyCollectorStateRecords(tampered))[0], /отличается/);
  tampered.suction.database = structuredClone(state.suction.database); tampered.suction.database.calculation.bom[0].cost = 1;
  assert.match((await verifyCollectorStateRecords(tampered))[0], /отличается/);
  tampered.suction.database.id = "other";
  assert.match((await verifyCollectorStateRecords(tampered))[0], /не найден/);
  delete globalThis.__nodeCollectorRecord;
});
