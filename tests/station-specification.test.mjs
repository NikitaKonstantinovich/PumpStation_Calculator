import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { loadTs } from "./load-ts.mjs";
import { load, createProject, parseProjectConfig, fixture, choose, sync, rows, role, resources, assessSpecification, specificationSourceFingerprint, cabinetSourceFingerprint, specificationTechnicalStatus } from "./fixtures/station-specification.mjs";

test("model and count changes update pumps, cabinet, collectors and both hydraulic lines together", () => {
  let p = sync(fixture());
  assert.equal(role(p, "primaryPump").equipmentId, "318");
  const firstCabinet = role(p, "controlCabinet");
  p = sync(choose(p, "217", 3, 1));
  assert.equal(role(p, "primaryPump").equipmentId, "217");
  assert.equal(role(p, "primaryPump").quantity, 4);
  assert.equal(p.station.selectedPumpId, "217");
  assert.equal(p.station.totalPumpCount, 4);
  for (const option of ["primarySuctionValve", "primaryDischargeValve", "primaryCheckValve"]) assert.equal(role(p, option).quantity, 4);
  for (const side of ["suction", "discharge"]) {
    assert.equal(p.entities["station-collectors"][side].configuration.primary.pumpId, "217");
    assert.equal(p.entities["station-collectors"][side].configuration.primary.working, 3);
  }
  assert.notDeepEqual(role(p, "controlCabinet"), firstCabinet);
  assert.equal(rows(p).filter(r => r.option === "primaryPump").length, 1);
  assert.equal(p.entities["station-spec"].synchronization.fingerprint, specificationSourceFingerprint(p));
  assert.ok(role(p, "controlCabinet").equipmentId, "selected cabinet retains its catalog identity");
});

test("combined/jockey circuits update independently and disabling them removes only managed secondary parts", () => {
  for (const stationType of ["combined", "fire"]) {
    const original = fixture();
    Object.assign(original.entities["station-settings"], { stationType, jockeyPump: stationType === "fire" });
    let p = sync(choose(original, "217", 1, 0, true));
    assert.equal(role(p, "secondaryPump").equipmentId, "217");
    p = sync(choose(p, "318", 2, 1, true));
    assert.equal(role(p, "primaryPump").quantity, 3);
    assert.equal(role(p, "secondaryPump").quantity, 3);
    assert.equal(p.station.secondaryPumpId, "318");
    assert.equal(role(p, "secondarySuctionValve").quantity, 3);
    p.entities["station-settings"].stationType = "utility";
    p = sync(p);
    assert.equal(role(p, "secondaryPump"), undefined);
    assert.equal(p.station.secondaryPumpId, undefined);
    assert.ok(!rows(p).some(r => r.assemblyRole?.startsWith("secondary-")));
    assert.equal(p.entities["system-input-2"].selectedPumpId, "318", "inactive circuit inputs remain available");
  }
});

test("cabinet replacement preserves stands, manual cabinets, extra pumps and renamed manual positions", async () => {
  const { visibleSpecificationItems } = await load("specification-presentation");
  let p = fixture();
  const stand = role(p, "cabinetStand");
  stand.name = "Переименованная стойка шкафа";
  const manual = { position: "09", name: "Ручной шкаф и стойка", section: "frame", quantity: 2, details: "Сохранить", price: 123, status: "selected" };
  const extraPump = { ...manual, position: "09.01", name: "Дополнительный насос заказчика", section: "pump" };
  const manualCabinet = { ...manual, position: "09.02", section: "control", name: "Шкаф дополнительный" };
  rows(p).push(manual, extraPump, manualCabinet);
  const modelBefore = structuredClone(p.entities["station-model"]), workspaceBefore = structuredClone(p.workspace);
  p = sync(choose(sync(p), "217", 3, 1));
  assert.deepEqual(role(p, "cabinetStand"), stand);
  for (const item of [manual, extraPump, manualCabinet]) {
    const saved = rows(p).find(r => r.name === item.name);
    const { inletPressureCheck, dischargePressureCheck, ...data } = saved;
    data.status = inletPressureCheck?.baseStatus ?? dischargePressureCheck?.baseStatus ?? data.status;
    assert.deepEqual(data, { ...item, option: undefined });
    assert.ok(visibleSpecificationItems(p.entities["station-spec"], p.entities["station-settings"]).some(r => r.name === item.name));
  }
  assert.deepEqual(p.entities["station-model"], modelBefore);
  assert.deepEqual(p.workspace, workspaceBefore);
});

test("new and repeatedly reopened projects contain no demo pump or selected cabinet", () => {
  let p = createProject();
  for (let i = 0; i < 3; i++) {
    assert.ok(!rows(p).some(r => r.section === "pump"));
    assert.equal(role(p, "controlCabinet").status, "clarify");
    assert.equal(role(p, "controlCabinet").price, null);
    p = parseProjectConfig(JSON.parse(JSON.stringify(p)));
  }
});

test("legacy import assigns stable roles once, preserves manual data and does not restore template rows", () => {
  let p = fixture();
  delete p.entities["station-spec"].identityVersion;
  p.entities["station-spec"].items = [
    { position: "01", section: "pump", name: "Насос CNP CDM32-4", equipmentId: "318", quantity: 3, details: "7.5 кВт", price: 100, status: "selected" },
    { position: "03", section: "control", name: "Шкаф управления", quantity: 1, details: "ПЧ · IP54", price: null, status: "selected" },
    { position: "05.02", name: "Стойка шкафа управления", quantity: 2, details: "Ручная комплектация", price: 50, status: "selected" },
    { position: "09", name: "Шкаф сервисный заказчика", section: "control", quantity: 1, price: 200, details: "Вручную", status: "selected" },
  ];
  p = parseProjectConfig(p);
  assert.equal(role(p, "cabinetStand").section, "frame");
  assert.equal(role(p, "primaryPump").equipmentId, "318");
  assert.equal(role(p, "controlCabinet").status, "clarify");
  const before = rows(p);
  for (let i = 0; i < 3; i++) p = parseProjectConfig(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(rows(p), before);
  assert.equal(rows(p).filter(r => r.section === "pump").length, 1);
  assert.equal(rows(p).filter(r => r.name === "Шкаф сервисный заказчика").length, 1);
});

test("manual cabinet applicability becomes stale after a motor change without deleting its selection", () => {
  let p = sync(fixture());
  const cabinet = role(p, "controlCabinet");
  delete cabinet.generatedBy;
  cabinet.sourceFingerprint = cabinetSourceFingerprint(p);
  const before = structuredClone(cabinet);
  p = sync(p);
  assert.deepEqual(role(p, "controlCabinet"), before);
  p = sync(choose(p, "217", 2, 1));
  assert.equal(role(p, "controlCabinet").name, before.name);
  assert.equal(role(p, "controlCabinet").technicalStatus, "stale");
  assert.equal(role(p, "controlCabinet").price, before.price, "historical manual price is preserved");
  assert.ok(assessSpecification(p).findings.some(f => f.category === "price" && f.message.startsWith(before.name)));
});

test("invalid input and missing catalogs never retain current-looking computed prices", () => {
  for (const change of [
    p => { p.entities["system-input"].workingPumpCount = null; },
    p => { p.entities["system-input"].head = -1; },
  ]) {
    const p = sync(fixture()); change(p);
    const changed = sync(p), assessment = assessSpecification(changed);
    assert.equal(role(changed, "primaryPump").technicalStatus, "stale");
    assert.equal(role(changed, "primaryPump").price, null);
    assert.equal(assessment.ready, false);
    assert.ok(changed.entities["station-spec"].synchronization.reasons.length);
  }
  const p = sync(fixture());
  for (const unavailable of [{ ...resources, pumps: null }, { ...resources, cabinets: null }, { ...resources, components: undefined }]) {
    const changed = sync(p, unavailable);
    assert.equal(assessSpecification(changed).ready, false);
    assert.ok(changed.entities["station-spec"].synchronization.reasons.length);
    if (!unavailable.components) assert.ok(rows(changed).filter(r => r.generatedBy?.endsWith("-line")).every(r => r.price === null && r.technicalStatus === "stale"));
  }
});

test("repeated recalculation and save/load are stable with no duplicate rows", () => {
  let p = sync(fixture());
  assert.strictEqual(sync(p), p);
  const expected = rows(p);
  for (let i = 0; i < 3; i++) {
    p = sync(parseProjectConfig(JSON.parse(JSON.stringify(p))));
    assert.deepEqual(rows(p), expected);
  }
});

test("empty mandatory sections and enabled options are detected even when all present rows have prices", () => {
  const p = sync(fixture());
  p.entities["station-spec"].items = rows(p).filter(r => !["frame", "electrical"].includes(r.section));
  for (const row of rows(p)) {
    row.price = 1;
    if (row.hydraulicAssembly) { for (const part of row.hydraulicAssembly.parts) part.price = 1; row.price = row.hydraulicAssembly.parts.reduce((sum, part) => sum + part.quantity, 0); }
  }
  let result = assessSpecification(p);
  assert.equal(result.pricesComplete, true);
  assert.equal(result.costComplete, false);
  for (const id of ["frame", "mountingKit", "externalElectrical"]) assert.ok(result.findings.some(f => f.id === `spec/readiness/${id}`));
  Object.assign(p.entities["station-settings"], { stationType: "fire", membraneTank: true, collectorPlugs: true, isolatingValves: true, vibrationCompensators: true });
  p.entities["station-spec"].items = rows(p).filter(r => !["membraneTank", "collectorPlugs", "isolatingValves", "vibrationCompensators"].includes(r.option));
  result = assessSpecification(p);
  for (const id of ["membraneTank", "collectorPlugs", "isolatingValves", "primary-suction-vibration", "primary-discharge-vibration"]) assert.ok(result.findings.some(f => f.id === `spec/readiness/${id}`));
});

test("technical status is independent of price and old status remains conservative", () => {
  const row = { name: "Изделие", details: "", quantity: 1, status: "selected", technicalStatus: "ready", price: null };
  assert.equal(specificationTechnicalStatus(row), "ready");
  assert.equal(specificationTechnicalStatus({ ...row, price: 100, technicalStatus: "unverified" }), "unverified");
  assert.equal(specificationTechnicalStatus({ ...row, technicalStatus: undefined, status: "clarify", price: 100 }), "unverified");
  assert.equal(specificationTechnicalStatus({ ...row, quantity: 0 }), "incomplete");
  const p = sync(fixture());
  p.entities["station-settings"].pressureChecksEnabled = false;
  const assessment = assessSpecification(sync(p));
  assert.equal(assessment.technicalReady, false);
  assert.ok(assessment.findings.some(f => f.id === "spec/readiness/pressure-disabled"));
});

test("existing engineering and currency diagnostics affect readiness and exported reasons", async () => {
  const { collectProjectIssues } = await load("diagnostics");
  const p = sync(fixture());
  p.entities["system-input"].head = 10000;
  const current = sync(p);
  const issues = collectProjectIssues(current, resources.pumps, resources.components.collectorCatalog, resources.smartCabinets);
  const result = assessSpecification(current, undefined, issues);
  assert.equal(result.technicalReady, false);
  assert.ok(result.findings.some(f => f.id.endsWith("condition/input/selection/reserve") && f.severity === "error"));
  const badCurrency = assessSpecification(current, undefined, [{ id: "settings/rates/usdRate", tool: "settings", severity: "error", message: "Invalid exchange rate" }]);
  assert.equal(badCurrency.pricesComplete, false);
  assert.ok(badCurrency.findings.some(f => f.category === "price" && f.message === "Invalid exchange rate"));
});

test("removing catalog prices changes cost completeness without invalidating pump and assembly identities", () => {
  const data = structuredClone(resources);
  data.pumps = data.pumps.map(pump => ({ ...pump, price: null }));
  data.components.items = data.components.items.map(item => ({ ...item, prices: [] }));
  const p = sync(choose(fixture(), "217"), data);
  assert.equal(role(p, "primaryPump").technicalStatus, "ready");
  assert.equal(role(p, "primaryPump").price, null);
  const hardware = rows(p).find(row => row.assemblyRole?.endsWith("-nuts") && row.equipmentId);
  assert.equal(hardware.technicalStatus, "ready");
  assert.equal(hardware.price, null);
  assert.equal(assessSpecification(p).pricesComplete, false);
});

test("pump prices retain the existing currency and manufacturer discount calculation", async () => {
  const { cataloguePurchasePriceRub } = await load("pump-catalog");
  const p = fixture();
  Object.assign(p.entities["station-settings"], { usdRate: 99, cnyRate: 14, manufacturerDiscounts: { ...p.entities["station-settings"].manufacturerDiscounts, cnp: 12 } });
  const expected = cataloguePurchasePriceRub(resources.pumps.find(pump => pump.id === "318"), p.entities["station-settings"]);
  assert.equal(role(sync(p), "primaryPump").price, expected);
});

test("a partial NS Smart BOM total is not presented as a complete cabinet price", () => {
  const p = choose(fixture(), "217"); p.entities["station-settings"].stationType = "smart";
  const before = role(sync(p), "controlCabinet");
  assert.ok(before.price > 0);
  const data = structuredClone(resources);
  const cabinet = data.smartCabinets.find(item => item.id === before.equipmentId);
  cabinet.items[0].currentCost = null;
  const next = role(sync(p, data), "controlCabinet");
  assert.equal(next.equipmentId, before.equipmentId);
  assert.equal(next.technicalStatus, "ready");
  assert.equal(next.price, null);
});

test("identity-aware imports preserve manual rows with names matching old templates", () => {
  let p = sync(fixture());
  const manual = { position: "03.99", section: "suction", name: "Манометр", details: "С комплектом подключения", quantity: 7, price: null, status: "clarify" };
  rows(p).push(manual, { ...manual, position: "03.98", name: "Коллектор подводящий" });
  p = sync(parseProjectConfig(JSON.parse(JSON.stringify(p))));
  for (const name of ["Манометр", "Коллектор подводящий"]) assert.ok(rows(p).some(row => row.name === name && row.quantity === 7 && !row.option && !row.generatedBy));
});

test("deactivating the second circuit also clears its managed parts during catalog failure", () => {
  const p = fixture(); p.entities["station-settings"].stationType = "combined";
  const calculated = sync(choose(p, "217", 1, 0, true));
  calculated.entities["station-settings"].stationType = "utility";
  const next = sync(calculated, { ...resources, components: undefined });
  assert.ok(!rows(next).some(row => row.assemblyRole?.startsWith("secondary-") || row.option?.startsWith("secondary")));
});

test("a stale raw model/count mismatch is diagnosed before any recalculation", () => {
  const p = sync(fixture()); choose(p, "217", 3, 1);
  const result = assessSpecification(p);
  assert.ok(result.findings.some(f => f.id.endsWith("primaryPump/selection")));
  assert.ok(result.findings.some(f => f.id.endsWith("primaryPump/count")));
  assert.ok(result.findings.some(f => f.id.endsWith("synchronization")));
});

test("draft status, absent nodes and disabled checks survive both CSV and readable XLSX export", async () => {
  const url = new URL("../app/specification-export.ts", import.meta.url);
  const source = (await readFile(url, "utf8")).replace('import("exceljs")', `import(${JSON.stringify(import.meta.resolve("exceljs"))})`);
  const { specificationExportRows, specificationCsv, specificationExportBlob } = await loadTs(url, { [url.href]: source });
  const p = fixture(); p.entities["station-settings"].pressureChecksEnabled = false;
  const current = sync(p), assessment = assessSpecification(current);
  const groups = [{ title: "Состав", sections: ["pump", "control", "frame", "suction", "discharge", "electrical"].map(id => ({ id })) }];
  const exported = specificationExportRows(rows(current), groups, assessment), csv = specificationCsv(exported);
  assert.match(csv, /Черновик — спецификация не завершена/);
  assert.match(csv, /Внешняя электрика станции/);
  assert.match(csv, /Проверки давления отключены/);
  assert.match(csv, /Известная часть стоимости/);
  const blob = await specificationExportBlob(exported, "xlsx"), book = new ExcelJS.Workbook();
  await book.xlsx.load(await blob.arrayBuffer());
  const text = JSON.stringify(book.getWorksheet("Спецификация").getSheetValues());
  assert.match(text, /Черновик — спецификация не завершена/);
  assert.match(text, /Внешняя электрика станции/);
  assert.match(text, /Проверки давления отключены/);
});
