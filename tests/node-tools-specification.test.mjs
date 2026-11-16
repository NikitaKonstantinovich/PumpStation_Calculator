import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { loadTs } from "./load-ts.mjs";
import { fixture, resources, sync, role } from "./fixtures/station-specification.mjs";
import { calculations, catalog as insertionCatalog, component, insertionDesign } from "./fixtures/station-insertions.mjs";

const { specificationNodeTypes, SPECIFICATION_OPERATIONS, SPECIFICATION_GROUPS } = await loadTs(new URL("../app/node-tools/specification-nodes.ts", import.meta.url));
const { executeSpecificationOperation, normalizeSpecificationManualRows, manualSpecificationItems } = await loadTs(new URL("../app/node-tools/specification-runtime.ts", import.meta.url));
const { synchronizeCollectors } = await loadTs(new URL("../app/collector-project.ts", import.meta.url));
const { specificationExportRows } = await loadTs(new URL("../app/specification-export.ts", import.meta.url));
const { markLegacyNomenclature } = await loadTs(new URL("../app/component-nomenclature.ts", import.meta.url));
const { insertPartIdentity } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const types = specificationNodeTypes();
const insertionLocation = "discharge:primary-between-valves-insertion";
const insertionRow = data => data.items.find(row => row.insertionRequirement?.location === insertionLocation);
function matchingCalculation() {
  const calculation = calculations.find(row => row.complete && row.geometry === "straight" && row.material === "aisi304" && row.pn === 16 &&
    row.dnLarge === 65 && row.leftConnection === "collar" && row.rightConnection === "collar");
  assert.ok(calculation, "The fixture needs an AISI 304 PN16 DN65 insert with collars on both sides");
  return calculation;
}
const withInsertions = (...items) => ({ ...resources, components: { ...resources.components, items: [...resources.components.items, ...items] } });
function run(operation, values) {
  const type = types.find(t => t.operation === operation);
  return executeSpecificationOperation({ id: "spec/" + operation, operation, fields: type.fields, values: {}, links: [], expressions: {} }, values, { values: {}, defaults: {}, role: "pro" });
}
function pipeline(project, catalog = resources, manualRows = [], linesOperation = "spec.lines") {
  const pumps = catalog?.pumps ?? resources.pumps;
  const collectors = { project: synchronizeCollectors(project, catalog?.components?.collectorCatalog, pumps), pumps: pumps.filter(p => [project.entities["system-input"].selectedPumpId, project.entities["system-input-2"].selectedPumpId].includes(p.id)), issues: [] };
  const before = JSON.stringify(collectors);
  const batch = run("spec.pumps", { collectors, resources: catalog, manualRows }).batch;
  const cabinet = run("spec.cabinet", { batch }).value;
  const frame = run("spec.frame", { batch: cabinet }).work;
  const lines = run(linesOperation, { work: frame }).value;
  const options = run("spec.options", { work: lines }).value;
  const result = run("spec.finalize", { work: options }).result;
  const data = run("spec.readiness", { result }).data;
  assert.equal(JSON.stringify(collectors), before, "Upstream graph results must not mutate");
  return { result, data };
}
test("specification graph phases match the first workspace calculation and preserve its export rows", () => {
  assert.deepEqual(types.map(t => t.operation), [...SPECIFICATION_OPERATIONS]);
  for (const type of types) assert.equal(new Set(type.fields.map(f => f.key)).size, type.fields.length, "Unique ports: " + type.id);
  const project = fixture(), expected = sync(structuredClone(project)), { result, data } = pipeline(project);
  assert.deepEqual(result.project.entities["station-spec"], expected.entities["station-spec"]);
  assert.equal(data.status, "ready");
  const pump = role(result.project, "primaryPump");
  assert.equal(pump.quantity, 3); assert.equal(pump.price, role(expected, "primaryPump").price);
  assert.equal(data.readiness.knownTotal, data.items.reduce((sum, row) => sum + (row.technicalStatus !== "stale" && typeof row.price === "number" && row.quantity > 0 ? row.price * row.quantity : 0), 0));
  const exported = specificationExportRows(data.items, SPECIFICATION_GROUPS, data.readiness);
  assert(exported.some(row => row.cells.some(cell => typeof cell === "string" && cell.includes(pump.name))));
  assert(exported.some(row => row.kind === "status"));
});
test("automatic station lines exclude archived inserts and select a compatible calculation without a saved design", () => {
  const project = fixture(), calculation = matchingCalculation();
  const archived = markLegacyNomenclature(component(calculation, "archived", { pricedAt: "2026-11-10" }));
  const incomplete = component({ ...calculation, complete: false }, "incomplete", { pricedAt: "2026-11-09" });
  const available = component(calculation, "available");
  const automatic = (source, ...items) => insertionRow(pipeline(source, withInsertions(...items), [], "spec.linesAutomatic").data);

  assert.equal(insertionRow(pipeline(project).data).equipmentId, "suction-table:ff-65");
  const missing = automatic(project, archived, incomplete);
  assert.ok(missing);
  assert.equal(missing.equipmentId, undefined);
  assert.equal(missing.insertionAssembly, undefined);
  assert.equal(missing.price, null);
  assert.notEqual(missing.technicalStatus, "ready");

  const selected = automatic(project, archived, incomplete, available);
  assert.equal(selected.equipmentId, available.id);
  assert.equal(selected.technicalStatus, "ready");
  assert.equal(selected.price, calculation.price);
  assert.equal(selected.insertionAssembly.snapshot.id, "available");
  assert.equal(selected.quantity, 3);

  const saved = structuredClone(project);
  const design = insertionDesign(calculation);
  saved.entities["station-dn"].insertionDesigns = { [insertionLocation]: { ...design, totalLengthMm: design.totalLengthMm + 10 } };
  const recalculated = automatic(saved, available, archived, incomplete);
  assert.deepEqual(recalculated.insertionAssembly, selected.insertionAssembly);
  assert.equal(recalculated.price, selected.price);
});

test("automatic insertion fasteners use confirmed current dimensions across catalogue revisions", () => {
  const calculation = matchingCalculation();
  const current = component(calculation, "current");
  const published = component(calculation, "published", { currentCatalogVersion: "updated-station-catalogue" });
  const roles = ["primary-check-fasteners-studs", "primary-valve-fasteners-bolts"];
  function fasteners(item, catalog = withInsertions(item)) {
    const { data } = pipeline(fixture(), catalog, [], "spec.linesAutomatic");
    assert.equal(insertionRow(data).equipmentId, item.id);
    return roles.map(role => {
      const row = data.items.find(row => row.section === "discharge" && row.assemblyRole === role);
      assert.ok(row, role);
      return { equipmentId: row.equipmentId, price: row.price, details: row.details };
    });
  }
  function assertUnconfirmed(row) {
    assert.equal(row.equipmentId, undefined);
    assert.equal(row.price, null);
    assert.doesNotMatch(row.details, /длина не менее/);
  }

  assert.notEqual(published.calculatedInsertion.catalogVersion, published.calculatedInsertion.currentCatalogVersion);
  const expected = fasteners(current);
  for (const row of expected) {
    assert.ok(row.equipmentId);
    assert.ok(row.price > 0);
    assert.match(row.details, /длина не менее \d+ мм/);
  }
  assert.deepEqual(fasteners(published), expected);
  fasteners(component(calculation, "unverified-catalogue", { currentCatalogVersion: null })).forEach(assertUnconfirmed);

  const withoutExactCollar = structuredClone(published);
  const leftCollar = withoutExactCollar.calculatedInsertion.calculation.bom.find(part => part.role === "left-collar");
  const collarId = leftCollar.componentId;
  assert.ok(resources.components.items.some(item => item.id === collarId));
  leftCollar.componentId = "missing-published-collar";
  const [unverifiedStuds, verifiedBolts] = fasteners(withoutExactCollar);
  assertUnconfirmed(unverifiedStuds);
  assert.deepEqual(verifiedBolts, expected[1]);

  const publishedCollar = insertionCatalog.parts.find(part => part.id === collarId && insertPartIdentity(part) === calculation.configuration.left.part);
  assert.ok(publishedCollar?.thicknessMm > 0);
  const differentThickness = structuredClone(published);
  differentThickness.calculatedInsertion.calculation.configuration.left.part = insertPartIdentity({ ...publishedCollar, thicknessMm: publishedCollar.thicknessMm + 1 });
  const [mismatchedStuds, unchangedBolts] = fasteners(differentThickness);
  assertUnconfirmed(mismatchedStuds);
  assert.deepEqual(unchangedBolts, expected[1]);

  const withoutCollarThickness = withInsertions(published);
  withoutCollarThickness.components.items = withoutCollarThickness.components.items.map(item => item.id === collarId
    ? { ...item, fields: item.fields.filter(field => field.headerPath.at(-1) !== "Толщина борта, мм") }
    : item);
  fasteners(published, withoutCollarThickness).forEach(assertUnconfirmed);
});

test("station instruments use minimum suction ranges and the configured discharge pressure basis", () => {
  const project = fixture(), settings = project.entities["station-settings"];
  Object.assign(settings, { stationType: "fire", inletHead: 80 });
  project.entities["system-input"].head = 85;
  const selected = resources.pumps.find(pump => pump.id === project.entities["system-input"].selectedPumpId);
  const catalog = { ...resources, pumps: [{ ...selected, maxHead: 190, curve: [[0, 50], [20, 65], [40, 15]] }] };
  const evaluate = (source = catalog) => pipeline(project, source, [], "spec.linesAutomatic").data;
  const row = (data, section, role) => {
    const selected = data.items.find(item => item.section === section && item.assemblyRole === role);
    assert.ok(selected, `${section} ${role}`);
    return selected;
  };
  const suction = data => [row(data, "suction", "gauge"), row(data, "suction", "pressure-switch")];
  const discharge = data => [row(data, "discharge", "gauge"), row(data, "discharge", "primary-sensor-relay"), row(data, "discharge", "discharge:transducer")];
  const ids = items => items.map(item => item.equipmentId);

  const enabled = evaluate();
  assert.deepEqual(ids(suction(enabled)), ["кипиа-001-r0005", "кипиа-002-r0013"]);
  const running = discharge(enabled);
  assert.deepEqual(ids(running), ["кипиа-001-r0008", "кипиа-002-r0016", "station-v11-oni-ppt10-25"]);
  assert.equal(running[2].hydraulicAssembly.requirement.pressureBar, 165 * .0980665);

  settings.pressureChecksEnabled = false;
  const disabled = evaluate();
  assert.deepEqual(ids(suction(disabled)), ids(suction(enabled)));
  const peak = discharge(disabled);
  assert.deepEqual(ids(peak), ["кипиа-001-r0006", "кипиа-002-r0015", "station-v11-oni-ppt10-16"]);
  assert.equal(peak[2].hydraulicAssembly.requirement.pressureBar, 65 * .0980665);
  assert.match(peak[2].hydraulicAssembly.requirement.pressureBasis, /Hпик=65/);
  assert(disabled.items.every(item => !item.inletPressureCheck && !item.dischargePressureCheck));
  assert(!disabled.readiness.findings.some(finding => /pressure-(?:disabled|input)/.test(finding.id)));
  for (const instrument of [...suction(disabled), ...peak]) {
    assert.equal(instrument.status, "selected");
    assert.doesNotMatch(`${instrument.details} ${instrument.description}`, /Предупреждение|давление вне шкалы|требуется проверка применимости|PN.*не подтвержд/i);
  }

  const noZero = evaluate({ ...catalog, pumps: [{ ...catalog.pumps[0], curve: [[1, 90], [20, 65], [40, 15]] }] });
  assert.deepEqual(ids(suction(noZero)), ids(suction(enabled)));
  const noZeroInstruments = discharge(noZero);
  assert.equal(noZeroInstruments[2].hydraulicAssembly.requirement.pressureBar, 90 * .0980665);
  for (const instrument of noZeroInstruments) {
    assert.ok(instrument.equipmentId);
    assert.ok(instrument.price > 0);
  }

  const noCurve = evaluate({ ...catalog, pumps: [{ ...catalog.pumps[0], curve: [] }] });
  for (const instrument of discharge(noCurve)) {
    assert.equal(instrument.equipmentId, undefined);
    assert.equal(instrument.price, null);
    assert.match(`${instrument.details} ${instrument.description}`, /пиковый напор/i);
  }
});

test("missing catalog and changed pump selection keep unverified costs out of confirmed totals", () => {
  const project = fixture(), { result, data } = pipeline(project, null);
  assert.equal(role(result.project, "primaryPump").quantity, 3);
  assert.equal(role(result.project, "controlCabinet").technicalStatus, "stale");
  assert.equal(data.readiness.ready, false);
  assert(data.readiness.findings.some(item => item.message.includes("Каталог комплектующих")));
  project.entities["system-input"].selectedPumpId = undefined;
  const invalid = pipeline(project);
  assert.equal(role(invalid.result.project, "primaryPump"), undefined);
  assert.equal(invalid.data.readiness.ready, false);
  assert(invalid.data.readiness.findings.some(finding => /насос.*не подтвержден|насос не выбран|исходные данные/i.test(finding.message)));
});
test("manual rows survive recalculation without impersonating managed equipment or stale rows", () => {
  const raw = [{ id: "manual-1", name: "Кабель", details: "3 × 1,5", quantity: 5, unit: "м", price: 100, section: "electrical", description: "Дополнительно", confirmed: true, option: "primaryPump", generatedBy: "station", technicalStatus: "ready", equipmentId: "forged" }];
  const normalized = normalizeSpecificationManualRows(raw), row = manualSpecificationItems(normalized)[0];
  assert.equal(row.option, undefined); assert.equal(row.generatedBy, undefined); assert.equal(row.equipmentId, undefined);
  const first = pipeline(fixture(), resources, raw), second = pipeline(first.result.project, resources, raw);
  for (const data of [first.data, second.data]) {
    assert.equal(data.items.filter(item => item.assemblyRole === "node-manual:manual-1").length, 1);
    assert.equal(data.items.find(item => item.assemblyRole === "node-manual:manual-1").price, 100);
    assert.equal(data.items.find(item => item.option === "primaryPump").quantity, 3);
  }
  const unconfirmed = manualSpecificationItems(normalizeSpecificationManualRows([{ ...raw[0], confirmed: false }]));
  assert.equal(unconfirmed[0].technicalStatus, "unverified");
  const cleared = pipeline(first.result.project, resources, []);
  assert(!cleared.data.items.some(item => item.assemblyRole?.startsWith("node-manual:")));
  for (const changed of [{ quantity: -1 }, { price: Infinity }, { section: "invented" }, { id: "" }]) assert.throws(() => normalizeSpecificationManualRows([{ ...raw[0], ...changed }]));
  assert.throws(() => normalizeSpecificationManualRows([raw[0], raw[0]]));
});
test("unknown exchange rates never become a free pump and net source prices are not discounted twice", () => {
  const project = fixture(), selected = resources.pumps.find(pump => pump.id === project.entities["system-input"].selectedPumpId);
  const collectors = { project, pumps: [{ ...selected, price: 100, priceCurrency: "USD", priceKind: "list" }], issues: [] };
  project.entities["station-settings"].usdRate = 0;
  const unknown = run("spec.pumps", { collectors, resources }).batch;
  assert.equal(unknown.items.find(item => item.option === "primaryPump").price, null);
  assert(unknown.nodeIssues.some(issue => issue.key.endsWith("/price")));
  project.entities["station-settings"].usdRate = 90;
  project.entities["station-settings"].manufacturerDiscounts[selected.manufacturer.toLowerCase()] = 50;
  collectors.pumps[0].priceKind = "net";
  const net = run("spec.pumps", { collectors, resources }).batch;
  assert.equal(net.items.find(item => item.option === "primaryPump").price, 9000);
});
test("null upstream results propagate as empty view and no cached station rows", () => {
  const batch = run("spec.pumps", { collectors: null }).batch;
  assert.equal(batch, null);
  const cabinet = run("spec.cabinet", { batch }).value;
  const frame = run("spec.frame", { batch: cabinet }).work;
  const lines = run("spec.lines", { work: frame }).value;
  const options = run("spec.options", { work: lines }).value;
  const result = run("spec.finalize", { work: options }).result;
  const data = run("spec.readiness", { result }).data;
  assert.equal(data.status, "empty"); assert.deepEqual(data.items, []);
  assert.equal(run("ui.specification", { data }).value.specification, data);
});
test("specification keeps the table, assembly editors and export UI; unavailable or restricted bindings stay disabled", async () => {
  const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL("../app/node-tools/specification-view.tsx", import.meta.url))], bundle: true, write: false, format: "esm", platform: "node", loader: { ".css": "empty" }, plugins: [{ name: "runtime-libraries", setup(builder) { builder.onResolve({ filter: /^(react(?:\/.*)?|exceljs)$/ }, args => ({ path: import.meta.resolve(args.path), external: true })); } }] });
  const { NodeSpecificationView } = await import("data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64"));
  const { data } = pipeline(fixture());
  const binding = { key: "manual", node: "spec/manual", toolId: "spec", mode: "user", editable: true, active: true, value: [], field: { name: "Ручные позиции", kind: "array" } };
  const render = (changed = {}, extra = {}, specification = data, dn) => renderToStaticMarkup(createElement(NodeSpecificationView, { view: { kind: "specification", node: "spec/table", label: "Спецификация", specification, specificationBindings: { manual: { ...binding, ...changed }, dn } }, change() {}, writes() {}, ...extra }));
  const html = render();
  for (const label of ["Спецификация насосной установки", "Всасывающая линия", "Напорная линия", "Сборочный комплект электрики", "CSV", "XLSX", "Причины незавершённости", "Добавить ручную позицию", "Состав:", "Техническая проверка:"]) assert(html.includes(label), label);
  assert(!html.includes('disabled="" aria-label="Редактирование ручных позиций"'));
  for (const changed of [{ editable: false }, { active: false }, { mode: "fixed" }]) assert(render(changed).includes('disabled="" aria-label="Редактирование ручных позиций"'));
  assert(render({}, { disabled: true }).includes('disabled="" aria-label="Редактирование ручных позиций"'));
  assert(render({}, { writes: undefined }).includes('disabled="" aria-label="Редактирование ручных позиций"'), "Cross-owner edits require the atomic write callback");
  const legacy = render({}, {}, data, { ...binding, key: "dnOverrides", value: {} });
  assert.match(legacy, /aria-label="Исполнение вставки:/);

  const calculation = matchingCalculation(), available = component(calculation, "available");
  const automatic = pipeline(fixture(), withInsertions(available), [], "spec.linesAutomatic").data;
  const readOnly = render({}, {}, automatic);
  assert.match(readOnly, /Исполнение и состав вставки/);
  assert.match(readOnly, /Источник: available/);
  assert.doesNotMatch(readOnly, /aria-label="Исполнение вставки:|Подтвердите монтажную длину/);
  const exported = specificationExportRows(automatic.items, SPECIFICATION_GROUPS, automatic.readiness);
  assert(exported.some(row => row.kind === "item" && row.cells.includes(calculation.name)));
});

test("authoritative workspace validation saves an unfinished specification draft while retaining readiness errors and permissions", async () => {
  const { engineeringStore } = await import("./fixtures/engineering-store.mjs"), store = await engineeringStore();
  try {
    const storage = await store.load("node-tools/storage-server"), initial = await storage.toolState(), defaults = await storage.toolDefaults();
    const { addProductTool } = await store.load("node-tools/authoring"), { parameterType } = await store.load("node-tools/compiler"), { makeField } = await store.load("engineering/schema");
    const added = addProductTool(initial.draft, "Проверка черновой спецификации"), document = added.document;
    const graph = document.diagrams.find(g => g.id === added.diagram);
    graph.nodes = graph.nodes.filter(n => n.id !== "record"); graph.edges = graph.edges.filter(e => e.from !== "record");
    const param = parameterType(added.diagram + ".manual", "Ручные позиции", { ...makeField("manualRows", "Ручные позиции", "array", "specManualRows"), initial: [] }, "all");
    param.parameter.source = { mode: "user" }; document.types.push(param);
    const add = (id, type, values = {}) => graph.nodes.push({ id, type, name: id, x: 0, y: 0, values });
    const wire = (from, out, to, input, kind) => graph.edges.push({ from, out, to, input, ...(kind ? { kind } : {}) });
    add("manual", param.id); wire("project", "value", "manual", "values"); wire("project", "role", "manual", "role");
    const project = fixture(), selected = resources.pumps.find(p => p.id === project.entities["system-input"].selectedPumpId);
    add("pumps", "spec.pumps", { collectors: { project, pumps: [selected], issues: [{ node: "collector", key: "length", severity: "error", message: "Монтажная длина вставки не подтверждена." }] } });
    add("cabinet", "spec.cabinet"); add("frame", "spec.frame"); add("lines", "spec.lines"); add("options", "spec.options"); add("finalize", "spec.finalize"); add("readiness", "spec.readiness"); add("panel", "ui.specification");
    wire("manual", "value", "pumps", "manualRows"); wire("pumps", "batch", "cabinet", "batch"); wire("cabinet", "value", "frame", "batch"); wire("frame", "work", "lines", "work"); wire("lines", "value", "options", "work"); wire("options", "value", "finalize", "work"); wire("finalize", "result", "readiness", "result"); wire("readiness", "data", "panel", "data"); wire("manual", "binding", "panel", "manualBinding", "binding"); wire("panel", "value", "form", "child0");
    const settings = { stationType: "utility", "main.flowRate": 10, "main.head": 20, "main.workingPumpCount": 1, "main.reservePumpCount": 0 };
    const published = await storage.toolCommand({ action: "publish", revision: initial.revision, document, contexts: { settings, [added.id]: {} } }, "Тест черновика спецификации");
    const program = await storage.toolProgram(published.active), state = await store.load("node-tools/product-state"), runtime = await store.load("node-tools/runtime");
    const prior = { schema: 1, tools: { settings: { version: "node-tools-v1", values: settings, baseVersions: defaults.baseVersions } } };
    const migrated = state.migrateProduct(program, prior, defaults.defaults, defaults.baseVersions, "pro").data;
    await storage.verifyWorkspace(migrated, prior, "pro");
    const changed = structuredClone(migrated);
    changed.tools[added.id].values.manualRows = [{ id: "manual-draft", name: "Кабель", details: "", quantity: 2, unit: "м", price: null, section: "electrical", description: "Подбор продолжается", confirmed: false }];
    await storage.verifyWorkspace(changed, migrated, "pro");
    const evaluated = runtime.evaluateProduct(program, added.id, state.productContexts(program, changed, defaults.defaults, "pro"));
    assert(evaluated.issues.length > 0); assert(evaluated.issues.every(issue => issue.severity === "warning"));
    const table = evaluated.view.children.find(view => view.kind === "specification"), readiness = table.specification.readiness;
    assert.equal(readiness.ready, false); assert.equal(readiness.technicalReady, false);
    assert(readiness.findings.some(finding => finding.severity === "error" && finding.message.includes("Монтажная длина")), "Original release-blocking severity remains in readiness data");
    assert(table.specification.items.some(item => item.assemblyRole === "node-manual:manual-draft"));
    const exported = specificationExportRows(table.specification.items, SPECIFICATION_GROUPS, readiness);
    assert(exported.some(row => row.kind === "status" && row.cells.some(cell => typeof cell === "string" && cell.includes("Монтажная длина"))));
    await assert.rejects(() => storage.verifyWorkspace(changed, migrated, "base"), error => error.status === 403 && /Редактирование параметра недоступно/.test(error.message));
    const invalid = structuredClone(changed); invalid.tools[added.id].values.manualRows[0].quantity = -1;
    await assert.rejects(() => storage.verifyWorkspace(invalid, changed, "pro"), /количество должно быть/);
  } finally { store.close(); }
});
