import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { createProject, parseProjectConfig } = await loadTs(new URL("../app/project-config.ts", import.meta.url));
const { synchronizeCollectors } = await loadTs(new URL("../app/collector-project.ts", import.meta.url));
const { dischargeHydraulics } = await loadTs(new URL("../app/dn-defaults.ts", import.meta.url));
const { buildDischargeSpec, selectDischargeInsertion, commonDischargeHead } = await loadTs(new URL("../app/discharge-spec.ts", import.meta.url));
const { suctionCatalogItems } = await loadTs(new URL("../app/suction-catalog.ts", import.meta.url));
const { makeCollectorCatalog } = await loadTs(new URL("../app/collector-catalog.ts", import.meta.url));
const binding = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const catalog = makeCollectorCatalog(binding), database = { ...binding, collectorCatalog: catalog };
const pageUrl = new URL("../app/page.tsx", import.meta.url), page = await readFile(pageUrl, "utf8");
const source = [
  'import {recommendedDn,defaultCollectorMaterial,resolveDnConnection,suctionHydraulics,dischargeHydraulics} from "./dn-defaults";',
  'import {buildSuctionSpec,replaceSuctionSpec,checkSuctionSpecPressure} from "./suction-spec";',
  'import {buildDischargeSpec,replaceDischargeSpec,checkDischargeSpecPressure} from "./discharge-spec";',
  'import {normalizeSpecificationItems,specificationOption} from "./specification-items";',
  'import {synchronizeCollectors} from "./collector-project";',
  page.match(/^const isCalculated =.*$/m)[0], page.match(/^const isSecondaryEnabled =.*$/m)[0],
  page.match(/^const componentFieldLabel=.*$/m)[0],
  page.slice(page.indexOf("const isJockeyCircuit="), page.indexOf("function DnCalculator(")),
  page.slice(page.indexOf("const HYDRAULIC_SPEC_OPTIONS:"), page.indexOf("function PanelContent(")),
  "let loadedComponentsDatabase; export {refreshSuctionSpecification as refresh, buildValveSpecItems};",
].join("\n");
const { refresh, buildValveSpecItems } = await loadTs(pageUrl, { [pageUrl.href]: source });
function fixture({ pumpDn = 80, valveDn = 80, pumpConnection = "flanged", connection = "flanged", pn = 16, material = "st20", type = "utility", count = 3 } = {}) {
  const p = createProject();
  Object.assign(p.entities["station-settings"], { stationType: type, inletHead: 10 });
  Object.assign(p.entities["system-input"], { selectedPumpId: "manual-test", flowRate: 6, head: 40, staticHead: 0, workingPumpCount: count - 1, reservePumpCount: 1, calculated: true });
  Object.assign(p.entities["station-dn"], { collectorMaterial: material, suctionValveDn: 100, dischargeValveDn: valveDn, connectionType: connection, dischargeValveType: connection === "threaded" ? "ball" : "butterfly", pn,
    pumpDischargePort: { pumpId: "manual-test", dn: pumpDn, connection: pumpConnection, maxPressure: 16, source: "test" },
    pumpSuctionPort: { pumpId: "manual-test", dn: 100, connection: "flanged", source: "different inlet" },
  });
  p.entities["station-collectors"].discharge.overrides = { connection: "flanged", dn: 100 };
  return synchronizeCollectors(p);
}
const field = (name, value) => ({ column: name, headerPath: [name], value });
const rowsOf = p => p.entities["station-spec"].items;
const role = (rows, name) => rows.find(row => row.generatedBy === "discharge-line" && row.assemblyRole === name);
const fill = (p, db = database, force = true) => refresh(synchronizeCollectors(p), db, force);
function build(p, db = database) {
  const e = p.entities;
  const valves = buildValveSpecItems(db, e["station-dn"], e["system-input"], e["system-input-2"], e["station-settings"], e["station-collectors"].discharge.configuration.material);
  return buildDischargeSpec(p, db, db.collectorCatalog, valves);
}
function secondCircuit(p, { dn = 40, pn = 16, count = 2, connection = "threaded" } = {}) {
  Object.assign(p.entities["system-input-2"], { selectedPumpId: "secondary-test", flowRate: 4, head: 60, workingPumpCount: count - 1, reservePumpCount: 1, calculated: true });
  Object.assign(p.entities["station-dn"], { secondaryDischargeValveDn: dn, secondarySuctionValveDn: dn, secondaryPn: pn, secondaryConnectionType: connection, secondaryDischargeValveType: connection === "threaded" ? "ball" : "butterfly", secondaryPumpDischargePort: { pumpId: "secondary-test", dn, connection, source: "test 2" } });
  return synchronizeCollectors(p);
}

test("each flanged pump has one separate valve spacer, two spacer flanges and distinct bolt stacks", () => {
  const rows = build(fixture());
  const spacer = role(rows, "primary-between-valves-insertion");
  assert.equal(rows.filter(row => row.assemblyRole === spacer.assemblyRole).length, 1);
  assert.equal(spacer.quantity, 3); assert.equal(spacer.price, 4140);
  assert.match(spacer.details, /обратный клапан → вставка → затвор/);
  assert.equal(role(rows, "primary-pump-insertion").quantity, 3);
  assert.equal(role(rows, "primary-between-valves-flanges-weldFlange").quantity, 6);
  assert.equal(rows.filter(row => /flange/.test(row.assemblyRole)).reduce((sum, row) => sum + row.quantity, 0), 12);
  assert.equal(role(rows, "primary-pump-gasket").quantity, 3);
  assert.equal(role(rows, "primary-check-gaskets").quantity, 6);
  assert.equal(role(rows, "primary-valve-gaskets").quantity, 6);
  assert.equal(role(rows, "primary-check-fasteners-studs").quantity, 24);
  for (const kind of ["nuts", "washers"]) assert.equal(role(rows, `primary-check-fasteners-${kind}`).quantity, 48);
  assert.match(role(rows, "primary-check-fasteners-studs").name, /Шпилька/);
  assert.ok(role(rows, "primary-check-fasteners-studs").price > 0);
  assert.match(role(rows, "primary-valve-fasteners-bolts").name, /М16х120/);
  assert.match(role(rows, "primary-check-fasteners-studs").details, /не менее 158 мм/);
  assert.equal(role(rows, "network-gaskets").quantity, 2);
  assert.ok(rows.every(row => row.section === "discharge" && /^04\./.test(row.position)));
});

test("insertion table respects DN, PN, material and never invents length or price", () => {
  for (const material of ["st20", "aisi304"]) {
    const row = role(build(fixture({ material })), "primary-between-valves-insertion");
    assert.equal(row.price, 4140); assert.equal(row.status, "clarify");
    assert.match(row.description, /Материал вставки в таблице не указан/);
    assert.doesNotMatch(row.details, /L\s*=|\d+ мм/);
  }
  for (const options of [{ pn: 25 }, { pumpDn: 50, valveDn: 50 }, { pumpDn: 300, valveDn: 300 }]) {
    const row = role(build(fixture(options)), "primary-between-valves-insertion");
    assert.equal(row.price, null); assert.equal(row.status, "clarify");
    assert.match(row.description, /нет исполнения/);
  }
  const exact = structuredClone(suctionCatalogItems.find(item => item.id === "suction-table:ff-80"));
  exact.fields.push(field("Материал", "AISI 304"));
  assert.equal(selectDischargeInsertion([exact], 80, 16, "aisi304").item.id, exact.id);
  assert.equal(selectDischargeInsertion([exact], 80, 16, "st20").item, undefined);
  assert.equal(selectDischargeInsertion([exact], 80, 25, "aisi304").item, undefined);
});

test("pump outlet and valve DN select the reducer independently of the inlet", () => {
  const p = fixture({ pumpDn: 65 }), rows = build(p);
  const reducer = role(rows, "primary-reducer");
  assert.match(reducer.name, /DN80–65/); assert.ok(reducer.price > 0);
  assert.match(role(rows, "primary-pump-flange-weldFlange").details, /DN65/);
  assert.match(role(rows, "primary-between-valves-insertion").name, /DN80/);
  assert.equal(role(rows, "primary-pump-insertion"), undefined);
  assert.match(role(build(fixture({ pumpDn: 100 })), "primary-error").details, /больше DN арматуры/);
});

test("threaded branches use union, nipple and five sealed joints, with no FF spacer", () => {
  const p = fixture({ pumpDn: 25, valveDn: 50, connection: "threaded", pumpConnection: "threaded" });
  const rows = build(p), h = dischargeHydraulics(p.entities["station-dn"], p.entities["system-input"], p.entities["station-settings"]);
  assert.equal(h.dn, 25); assert.equal(h.locked, true);
  assert.equal(p.entities["station-collectors"].discharge.configuration.primary.dn, 25);
  assert.equal(role(rows, "primary-union").equipmentId, "suction-table:union-25");
  assert.equal(role(rows, "primary-between-valves-nipple").price, 145.18);
  assert.equal(role(rows, "primary-between-valves-nipple").quantity, 3);
  assert.equal(role(rows, "primary-flax").quantity, 1.5); assert.equal(role(rows, "primary-flax").price, 51.5);
  assert.ok(!rows.some(row => /insertion|primary.*flange|primary.*gasket/.test(row.assemblyRole)));
  const filled = rowsOf(fill(p));
  assert.match(filled.find(row => row.option === "primaryCheckValve").details, /DN25/);
  assert.match(filled.find(row => row.option === "primaryDischargeValve").details, /DN25/);
});

test("mixed connections orient RF correctly and account for actual threaded joints", () => {
  const threaded = build(fixture({ pumpDn: 40, valveDn: 40, connection: "threaded" }));
  assert.equal(role(threaded, "primary-adapter").equipmentId, "suction-table:rf-40");
  assert.equal(role(threaded, "primary-flax").quantity, 1.2);
  assert.equal(role(threaded, "primary-pump-gasket").quantity, 3);
  assert.equal(role(threaded, "primary-between-valves-insertion"), undefined);
  const flanged = build(fixture({ pumpDn: 40, valveDn: 40, pumpConnection: "threaded", type: "fire" }));
  assert.match(role(flanged, "primary-adapter").details, /резьбой к насосу/);
  assert.equal(role(flanged, "primary-flax").quantity, .3);
  assert.equal(role(flanged, "primary-between-valves-insertion").quantity, 3);
  assert.equal(role(flanged, "primary-limit-switches").quantity, 3);
});

test("each wafer thickness independently controls its bolt length", () => {
  const withLength = length => ({ ...database, items: database.items.map(item => /межфланц/i.test(item.family) ? { ...item, family: "Клапан межфланцевый тестовый PN16", fields: [...item.fields, field("Строительная длина, мм", length)] } : item) });
  const short = build(fixture(), withLength(30)), long = build(fixture(), withLength(50));
  const boltLength = rows => { const row=role(rows, "primary-check-fasteners-bolts"); assert.ok(row.equipmentId, JSON.stringify(row)); return Number(row.name.match(/[хx](\d+)/)[1]); };
  assert.ok(boltLength(long) > boltLength(short));
  assert.equal(role(long, "primary-valve-fasteners-bolts").equipmentId, role(short, "primary-valve-fasteners-bolts").equipmentId);
  const row = role(long, "primary-check-fasteners-bolts");
  assert.ok(boltLength(long) >= Number(row.details.match(/не менее ([\d.]+)/)[1]));
  assert.ok(row.price < 1000, "piece price, not kilogram price");
  assert.equal(role(build(fixture(), withLength(100)), "primary-check-fasteners-bolts").price, null, "unavailable long bolt remains unresolved");
});

test("integral flanged check uses two joints; its flange thickness controls bolts", () => {
  const db = { ...database, items: database.items.filter(item => !/межфланц/i.test(item.family)).map(item => /012F/.test(item.family) ? { ...item, fields: [...item.fields, field("Толщина фланца, мм", 30)] } : item) };
  const rows = build(fixture(), db);
  assert.equal(role(rows, "primary-check-fasteners-bolts").quantity, 48);
  assert.equal(role(rows, "primary-check-gaskets").quantity, 6);
  assert.ok(role(rows, "primary-check-fasteners-bolts").price > 0);
  const unknown = { ...db, items: db.items.map(item => ({ ...item, family: item.family.replace("012F", "XYZ"), fields: item.fields.filter(f => f.headerPath.at(-1) !== "Толщина фланца, мм") })) };
  assert.equal(role(build(fixture(), unknown), "primary-check-fasteners-bolts").price, null);
});

test("second circuit has independent counts, DN, PN and connection; network parts remain per collector", () => {
  for (const type of ["combined", "fire"]) {
    const p = fixture({ type }); p.entities["station-settings"].jockeyPump = true;
    let rows = build(secondCircuit(p));
    assert.equal(role(rows, "primary-between-valves-insertion").quantity, 3);
    assert.equal(role(rows, "secondary-between-valves-insertion"), undefined);
    assert.equal(role(rows, "secondary-between-valves-nipple").quantity, 2);
    assert.equal(role(rows, "secondary-flax").quantity, 1);
    rows = build(secondCircuit(p, { dn: 100, count: 4, pn: 25, connection: "flanged" }));
    const second = role(rows, "secondary-between-valves-insertion");
    assert.equal(second.quantity, 4); assert.equal(second.price, null); assert.match(second.details, /DN|PN25/);
    assert.equal(role(rows, "secondary-between-valves-flanges-weldFlange").quantity, 8);
    assert.equal(role(rows, "network-gaskets").quantity, 2);
    assert.equal(role(rows, "secondary-limit-switches"), undefined);
  }
});

test("missing components keep visible unresolved rows, including washers", () => {
  const db = { items: [], collectorCatalog: { ...catalog, components: [] } };
  const rows = build(fixture(), db);
  for (const key of ["primary-between-valves-flanges-weldFlange", "primary-check-fasteners-bolts", "primary-check-fasteners-nuts", "primary-check-fasteners-washers", "primary-pump-fasteners-washers", "primary-valve-gaskets"]) {
    assert.equal(role(rows, key).status, "clarify"); assert.equal(role(rows, key).price, null);
  }
  const p = fixture({ material: "aisi304" }), stainless = build(p);
  assert.equal(role(stainless, "primary-between-valves-flanges-collar").quantity, 6);
  assert.equal(role(stainless, "primary-between-valves-flanges-looseFlange").quantity, 6);
  assert.equal(role(stainless, "primary-valve-fasteners-bolts").price, null);
});

test("repeat fill, parameter changes and reload replace generated rows and preserve manual positions", () => {
  let p = fixture();
  const manual = { position: "04.99", name: "Вставка ФФ DN80 ручная", details: "Особое исполнение", quantity: 7, unit: "шт.", price: 123, description: "Добавлено вручную", section: "discharge", status: "selected" };
  p.entities["station-spec"].items.push(manual);
  for (const options of [{ count: 3, dn: 80, pn: 16, material: "st20" }, { count: 5, dn: 100, pn: 25, material: "aisi304" }, { count: 2, dn: 65, pn: 16, material: "st20" }]) {
    Object.assign(p.entities["system-input"], { reservePumpCount: 1, workingPumpCount: options.count - 1 });
    Object.assign(p.entities["station-dn"], { dischargeValveDn: options.dn, pn: options.pn, collectorMaterial: options.material });
    p.entities["station-dn"].pumpDischargePort.dn = options.dn;
    for (let i = 0; i < 3; i++) {
      p = fill(p); const rows = rowsOf(p), generated = rows.filter(row => row.generatedBy === "discharge-line");
      assert.equal(new Set(generated.map(row => row.assemblyRole)).size, generated.length);
      assert.equal(role(rows, "primary-between-valves-insertion").quantity, options.count);
      assert.equal(rows.filter(row => row.option === "dischargeCollector").length, 1);
      assert.equal(rows.filter(row => row.option === "primaryCheckValve").length, 1);
      assert.equal(rows.find(row => row.option === "primaryDischargeValve").quantity, options.count);
      assert.equal(rows.find(row => row.name === manual.name).price, manual.price);
      assert.equal(rows.find(row => row.name === manual.name).quantity, manual.quantity);
      assert.equal(refresh(p, database), p, "unchanged refresh returns the original project");
      assert.deepEqual(fill(p), p);
      p = parseProjectConfig(JSON.parse(JSON.stringify(p)));
    }
  }
  p.entities["system-input"].selectedPumpId = "new-pump-without-port";
  p = fill(p); assert.ok(role(rowsOf(p), "primary-error"));
  assert.equal(role(rowsOf(p), "primary-between-valves-insertion"), undefined);
});

test("disabling or invalidating the second circuit removes its generated rows", () => {
  let p = fill(secondCircuit(fixture({ type: "combined" }), { dn: 100, connection: "flanged" }));
  assert.equal(role(rowsOf(p), "secondary-between-valves-insertion").quantity, 2);
  p.entities["system-input-2"].calculated = false;
  p = fill(p); assert.ok(!rowsOf(p).some(row => row.generatedBy === "discharge-line" && row.assemblyRole.startsWith("secondary")));
  p.entities["station-settings"].stationType = "utility";
  p = fill(p); assert.ok(!rowsOf(p).some(row => row.option === "secondaryCheckValve"));
});

test("outlet pressure and instruments use inlet plus pump head, independently for each circuit", () => {
  let p = secondCircuit(fixture({ type: "combined" }), { dn: 80, connection: "flanged" });
  p.entities["system-input"].head = 200; p.entities["system-input-2"].head = 30;
  p = fill(p); let rows = rowsOf(p);
  assert.equal(commonDischargeHead(p), 210);
  assert.equal(role(rows, "primary-between-valves-insertion").dischargePressureCheck.checks[0].status, "exceeded");
  assert.equal(role(rows, "primary-between-valves-insertion").status, "clarify", "material warning remains unresolved");
  assert.equal(role(rows, "secondary-between-valves-insertion").dischargePressureCheck.checks[0].status, "within-limit");
  assert.equal(rows.find(row => row.option === "dischargeCollector").dischargePressureCheck.checks[0].status, "exceeded");
  assert.match(role(rows, "gauge").details, /Напор на выходе 210 м/);
  assert.equal(role(rows, "gauge").quantity, 2);
  p.entities["system-input"].head = 30;
  p = fill(p); rows = rowsOf(p);
  assert.equal(role(rows, "primary-between-valves-insertion").dischargePressureCheck.checks[0].status, "within-limit");
  assert.match(role(rows, "gauge").details, /Напор на выходе 40 м/);
  assert.doesNotMatch(role(rows, "gauge").details, /учтено разрежение/);
  p.entities["station-settings"].inletHead = null;
  p = fill(p);
  assert.equal(role(rowsOf(p), "gauge").price, null);
  assert.equal(role(rowsOf(p), "gauge").dischargePressureCheck.checks[0].status, "missing-head");
});

test("partial outlet data and conflicting collector overrides fail visibly", () => {
  let p = fixture(); p.entities["station-dn"].pumpDischargePort.dn = null;
  p = parseProjectConfig(JSON.parse(JSON.stringify(p)));
  assert.match(role(build(p), "primary-error").details, /напорного патрубка/);
  p = fixture(); p.entities["station-collectors"].discharge.overrides.primaryDn = 100;
  assert.match(role(build(synchronizeCollectors(p)), "primary-error").details, /переопределения/);
});

test("actual collector material overrides update check selection and matching spacer flanges", () => {
  const p = fixture(); p.entities["station-collectors"].discharge.overrides.material = "aisi304";
  const rows = rowsOf(fill(p)), check = rows.find(row => row.option === "primaryCheckValve");
  assert.match(check.details, /Нержавеющая сталь/); assert.equal(check.price, 5219);
  assert.equal(role(rows, "primary-between-valves-flanges-collar").quantity, 6);
});

test("network thread sealing and stale catalogue prices refresh without duplicating manual rows", () => {
  let p = fixture(); p.entities["station-collectors"].discharge.overrides = { dn: 50, connection: "threaded" };
  p = fill(p); assert.equal(role(rowsOf(p), "network-flax").quantity, .2);
  role(rowsOf(p), "network-flax").price = null;
  p = refresh(p, database); assert.equal(role(rowsOf(p), "network-flax").price, 51.5);
  assert.equal(refresh(p, database), p);
});

test("manual valves and instruments survive filling and reload even with catalogue-like names", () => {
  let p = fixture();
  const manual = [
    { name: "Клапан обратный DN80", section: "discharge" },
    { name: "Затвор дисковый", section: "discharge" },
    { name: "Манометр", section: "suction" },
    { name: "Манометр", section: "discharge" },
  ].map((item, index) => ({ ...item, position: `04.${90 + index}`, details: "Особое исполнение", description: `Ручная позиция ${index}`, quantity: 9, unit: "шт.", price: 100 + index, status: "selected" }));
  p.entities["station-spec"].items.push(...manual);
  for (let i = 0; i < 3; i++) {
    p = fill(parseProjectConfig(JSON.parse(JSON.stringify(fill(p)))));
    for (const expected of manual) {
      const rows = rowsOf(p).filter(item => item.description === expected.description);
      assert.equal(rows.length, 1); assert.equal(rows[0].quantity, 9);
      assert.equal(rows[0].price, expected.price); assert.equal(rows[0].option, undefined);
    }
  }
});

test("missing stud sizes remain unresolved with two nuts and washers per required stud", () => {
  const db = { ...database, items: database.items.filter(item => !item.fields.some(f => /^Шпилька /.test(String(f.value)))) };
  const rows = build(fixture(), db);
  assert.equal(role(rows, "primary-check-fasteners-studs").quantity, 24);
  assert.equal(role(rows, "primary-check-fasteners-studs").price, null);
  assert.equal(role(rows, "primary-check-fasteners-nuts").quantity, 48);
  assert.equal(role(rows, "primary-check-fasteners-washers").quantity, 48);
});

test("gasket fallback warnings and prices survive discharge pressure changes and reload", () => {
  let p = fixture({ pumpDn: 300, valveDn: 300 });
  p.entities["system-input"].head = 200;
  p = fill(p);
  let gasket = role(rowsOf(p), "primary-check-gaskets");
  assert.equal(gasket.status, "confirmation"); assert.equal(gasket.price, 350);
  assert.match(gasket.description, /PN прокладки ниже требуемого/);
  p.entities["system-input"].head = 30;
  p = fill(parseProjectConfig(JSON.parse(JSON.stringify(p))));
  gasket = role(rowsOf(p), "primary-check-gaskets");
  assert.equal(gasket.status, "confirmation"); assert.equal(gasket.price, 350);
  assert.match(gasket.description, /PN прокладки ниже требуемого/);
  assert.equal(gasket.dischargePressureCheck.checks[0].status, "within-limit");
});

test("automatic filling survives a temporarily uncalculated primary circuit and reload", () => {
  let p = fill(fixture());
  p.entities["system-input"].calculated = false;
  p = fill(p, database, false);
  assert.equal(role(rowsOf(p), "primary-between-valves-insertion"), undefined);
  p = parseProjectConfig(JSON.parse(JSON.stringify(p)));
  p.entities["system-input"].calculated = true;
  p = fill(p, database, false);
  assert.equal(role(rowsOf(p), "primary-between-valves-insertion").quantity, 3);
});

test("collector status follows saved catalogue price and clears only the pressure warning", () => {
  let p = fill(fixture());
  const state = p.entities["station-collectors"].discharge;
  state.database = { id: "saved-discharge", code: state.code, price: 12345 };
  state.databaseStatus = "found";
  p.entities["station-settings"].inletHead = 200;
  p = fill(p);
  let row = rowsOf(p).find(item => item.option === "dischargeCollector");
  assert.equal(row.price, 12345);
  assert.equal(row.dischargePressureCheck.baseStatus, "selected");
  assert.equal(row.dischargePressureCheck.checks[0].status, "exceeded");
  p.entities["station-settings"].inletHead = 10;
  p = fill(p);
  row = rowsOf(p).find(item => item.option === "dischargeCollector");
  assert.equal(row.price, 12345);
  assert.equal(row.dischargePressureCheck.baseStatus, "selected");
  assert.equal(row.dischargePressureCheck.checks[0].status, "within-limit");
});
