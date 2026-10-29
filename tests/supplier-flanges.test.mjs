import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mergeSupplierFlanges } from "../scripts/supplier-flanges.mjs";
import { loadTs } from "./load-ts.mjs";

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const source = await read("../public/binding-components.json"), offers = await read("../data/supplier-flanges.json");
const newkey = await read("../data/newkey-flanges.json");
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
// Inspect all candidates here; server choice/uniqueness is covered by insert-single-variants.test.mjs.
const { generateInsertCandidates: generateInsertCalculations } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const { supplierFlangeFor } = await loadTs(new URL("../app/component-supplier-flanges.ts", import.meta.url));
const { selectJointFasteners } = await loadTs(new URL("../app/line-spec-parts.ts", import.meta.url));
const request = { dnFrom: 32, dnTo: 150, materials: ["aisi304"], withSensorNipple: false, includeEccentric: true };
const rows = generateInsertCalculations(request, makeInsertCatalog(source));
const has = (row, id) => row.bom.some(item => item.componentId === id);

test("Newkey uses nominal DIN2503 geometry and exact sourced PN25 compatibility with posted RUB prices", () => {
  const merged = mergeSupplierFlanges(source, newkey);
  assert.deepEqual(mergeSupplierFlanges(merged, newkey), merged);
  assert.deepEqual(merged.items.filter(item => item.tableId !== newkey.id), source.items.filter(item => item.tableId !== newkey.id));
  const catalog = makeInsertCatalog(source);
  for (const [dn, price, od, thickness, bore] of [[32, 1847, 42.4, 18, 43.1], [50, 2710, 60.3, 20, 61.1], [40, 2173, 48.3, 18, 49], [125, 7365, 139.7, 26, 141.6], [150, 9487, 168.3, 28, 170.5]]) {
    const id = `newkey-din2503:NK-FDh${dn}-4`;
    const item = source.items.find(item => item.id === id), part = catalog.parts.find(part => part.id === id);
    assert.ok(part, id);
    assert.equal(item.prices[0].amount, price); assert.equal(item.prices[0].currency, "RUB");
    assert.deepEqual(supplierFlangeFor(item, source.source.sha256).compatiblePns, [25, 40]);
    assert.equal(part.pn, 40); assert.equal(part.price, price); // A displayed retail price must reach the calculator.
    assert.equal(part.thicknessMm, thickness); assert.equal(part.boreDiameterMm, bore);
    assert.match(part.dimensionSources.thicknessMm, /Номинальная расчётная геометрия/);
    assert.match(part.dimensionSources.thicknessMm, /Отдельного паспорта NK-FDh не найдено/);
    assert.equal(item.fields.find(field => field.column === "CALC_FLANGE_PIPE_OD").value, od);
    assert.equal(item.fields.find(field => field.column === "CALC_FLANGE_B").value, thickness);
    assert.equal(item.fields.find(field => field.column === "CALC_FLANGE_BORE").value, bore);
    assert.deepEqual(part.warnings, []);
    assert.ok(rows.some(row => row.pn === 25 && row.complete && has(row, id)));
    assert.ok(rows.every(row => !has(row, id) || row.pn === 25)); // No blanket compatibility with PN10/16.
    const changed = structuredClone(item);
    changed.fields.find(field => field.column === "compatiblePns").value = "16/25/40";
    assert.equal(supplierFlangeFor(changed, source.source.sha256), null);
    for (const column of ["geometryBasis", "pressureSource"]) {
      const missing = structuredClone(item); missing.fields = missing.fields.filter(field => field.column !== column);
      assert.equal(supplierFlangeFor(missing, source.source.sha256), null);
    }
  }
});

test("Newkey straight PN25 inserts use the longest real fastener, actual flange seating and priced BOM", () => {
  for (const [dn, b, length, od, flangePrice] of [[32, 18, 169, 42.4, 1847], [50, 20, 173, 60.3, 2710]]) {
    const id = `newkey-din2503:NK-FDh${dn}-4`;
    const row = rows.find(row => row.geometry === "straight" && row.pn === 25 && row.bom.filter(item => item.componentId === id).length === 2);
    assert.ok(row?.complete, row?.warnings.join("; "));
    assert.equal(row.baseLengthMm, length); assert.equal(row.totalLengthMm, length + 10);
    assert.equal(row.totalLengthMm - 2 * b, 143); // 1.1 × standard 010C stud 130, longer than the 017W bolt.
    assert.equal(row.machining, undefined);
    const base = row.bom.find(item => item.role === "base");
    assert.equal(base.quantity, length / 1000);
    const seamMm = row.welds.reduce((sum, weld) => sum + weld.lengthMm, 0);
    assert.ok(Math.abs(seamMm - 4 * Math.PI * od) < 1e-8);
    assert.ok(Math.abs(row.price - (base.cost + 2 * flangePrice + seamMm / 1000 * 5000)) < 1e-8);
    assert.equal(row.bom.filter(item => item.componentId === id).reduce((sum, item) => sum + item.cost, 0), 2 * flangePrice);
  }
});

test("Newkey DN50-32 PN25 pump reducers use approved direct seating without extension", () => {
  const bothNewkey = row => row.dnLarge === 50 && row.dnSmall === 32
    && row.bom.filter(item => item.componentId?.startsWith("newkey-din2503:")).length === 2;
  const reducers = generateInsertCalculations(request, makeInsertCatalog(source)).filter(row => row.geometry !== "straight" && bothNewkey(row));
  assert.equal(reducers.length, 2);
  for (const row of reducers) {
    assert.equal(row.baseLengthMm, 76); assert.equal(row.totalLengthMm, 86);
    assert.equal(row.extension, undefined); assert.equal(row.assumptions, undefined);
    assert.ok(row.bom.every(item => item.kind !== "pipe")); assert.equal(row.welds.length, 2);
    assert.ok(Math.abs(row.weldLengthMm - 2 * Math.PI * (60.3 + 42.4)) < 1e-8);
    assert.equal(row.complete, true); assert.equal(row.machining, undefined);
    assert.deepEqual(row.warnings, []);
    assert.deepEqual(row.assemblyDecisions.map(decision => decision.depthMm), [15, 13]);
    assert.ok(Math.abs(row.price - ((row.geometry === "concentric" ? 730 : 779) + 2710 + 1847 + row.weldLengthMm / 1000 * 5000)) < 1e-8);
  }
  const sensor = generateInsertCalculations({ ...request, withSensorNipple: true }, makeInsertCatalog(source)).filter(bothNewkey);
  assert.ok(sensor.length > 0);
  assert.ok(sensor.every(row => row.complete && row.price > 0 && row.assumptions?.some(item => item.code === "sensor-pn25-pressure")));
});

test("changed Newkey thickness/bore blocks a previously complete result", () => {
  for (const column of ["CALC_FLANGE_B", "CALC_FLANGE_BORE"]) {
    const changed = structuredClone(source), id = "newkey-din2503:NK-FDh32-4";
    changed.items.find(item => item.id === id).fields.find(field => field.column === column).value += 1;
    const row = generateInsertCalculations(request, makeInsertCatalog(changed)).find(row => row.geometry === "straight" && row.bom.filter(item => item.componentId === id).length === 2);
    assert.ok(row && !row.complete && row.price === null);
    assert.ok(row.warnings.some(reason => /не подтверждён/.test(reason)));
  }
});

test("seven supplier SKUs have exact posted prices, independent sources and idempotent supplement IDs", () => {
  const merged = mergeSupplierFlanges(source, offers);
  assert.deepEqual(mergeSupplierFlanges(merged, offers), merged);
  assert.deepEqual(merged.items.filter(item => item.tableId !== offers.id), source.items.filter(item => item.tableId !== offers.id));
  assert.equal(merged.items.filter(item => item.tableId === offers.id).length, 7);
  assert.deepEqual(offers.rows.map(row => row.price), [1085, 1900, 1600, 2700, 3000, 3500, 8730]);
  assert.equal(offers.rows.find(row => row.id === "ifitting-en01:1154").dimensions.thicknessMm, 29); // C1=26 plus B1 face=3
});

test("dual pressures require exact SKU, material and source; PN16 flanges never become PN25", () => {
  for (const offer of offers.rows) {
    const original = source.items.find(item => item.id === offer.id);
    assert.deepEqual(supplierFlangeFor(original, source.source.sha256).compatiblePns, offer.compatiblePns);
    for (const label of ["PN", "Материал", "Подтверждённые PN исполнения", "ID товара поставщика"]) {
      const altered = structuredClone(original); altered.fields.find(field => field.headerPath.at(-1) === label).value = "invalid";
      assert.equal(supplierFlangeFor(altered, source.source.sha256), null);
    }
    assert.equal(supplierFlangeFor(original, "changed workbook"), null);
  }
  for (const offer of offers.rows.filter(row => row.supplier === "Grossner")) {
    const matches = rows.filter(row => has(row, offer.id));
    assert.deepEqual(matches, [], "PN10/16 weld flanges remain catalogued but the insert rule selects collars here");
  }
});

test("adopted Grossner 01/A dimensions and prices remain available without creating forbidden insert executions", () => {
  const catalog = makeInsertCatalog(source);
  for (const [id, dn, b, bore, price] of [["grossner-en01:35547", 32, 18, 43.1, 1085], ["grossner-en01:35549", 40, 18, 49, 1900], ["grossner-en01:35551", 50, 20, 61.1, 1600], ["grossner-en01:35553", 65, 20, 77.1, 2700], ["grossner-en01:35555", 80, 20, 90.3, 3000], ["grossner-en01:35557", 100, 22, 115.9, 3500]]) {
    const part = catalog.parts.find(part => part.id === id);
    assert.deepEqual([part.dn, part.pn, part.thicknessMm, part.boreDiameterMm, part.price], [dn, 16, b, bore, price]);
    assert.deepEqual(part.compatiblePns, [10,16]);
    assert.match(part.standard, /01:A:PN10\/16/);
    assert.match(part.dimensionSources.thicknessMm, /Решение пользователя 26.10.2026/);
    assert.deepEqual(part.warnings, []);
    for (const pn of [10,16]) {
      const direct = rows.find(row => row.geometry === "straight" && row.dnLarge === dn && row.pn === pn);
      assert.ok(direct?.complete, direct?.warnings.join("; "));
      assert.deepEqual([direct.leftConnection, direct.rightConnection], ["collar", "collar"]);
      assert.ok(direct.bom.every(item => item.componentId !== id));
    }
  }
  const both = rows.filter(row => row.geometry === "concentric" && row.dnLarge === 50 && row.dnSmall === 32 && row.bom.filter(item => ["grossner-en01:35547", "grossner-en01:35551"].includes(item.componentId)).length === 2);
  assert.deepEqual(both, []);
});

test("DN100 PN25 uses the ready 116 mm bore, actual flange thickness and shared hardware selection", () => {
  const id = "ifitting-en01:1154";
  const row = rows.find(row => row.geometry === "straight" && row.pn === 25 && row.bom.filter(item => item.componentId === id).length === 2);
  assert.ok(row?.complete, row?.warnings.join("; "));
  assert.equal(row.machining, undefined);
  const bolt = selectJointFasteners(source, "aisi304", 100, 25, true, undefined, id);
  const stud = selectJointFasteners(source, "aisi304", 100, 25, { gaskets: 2, thickness: bolt.reference.wafer010CLength, fastener: "stud" }, undefined, id);
  assert.equal(bolt.flangeThickness, 58); assert.equal(stud.flangeThickness, 58);
  const gap = 1.1 * Math.max(bolt.standardLength, stud.standardLength);
  assert.ok(Math.abs(row.baseLengthMm - gap - 48) < 1e-8);
  assert.equal(row.totalLengthMm, row.baseLengthMm + 10);
  assert.equal(row.bom.filter(item => item.componentId === id).reduce((sum, item) => sum + item.cost, 0), 17460);
  assert.equal(new Set(rows.map(row => row.identityKey)).size, rows.length);
  assert.ok(rows.filter(row => row.geometry !== "straight" && has(row, id)).some(row => row.assemblyDecisions?.some(decision => decision.ruleId.startsWith("ready-bore:"))));
});

test("same-DN ends check each selected flange; a changed supplier price invalidates price but not physical identity", () => {
  const id = "ifitting-en01:1154", catalog = makeInsertCatalog(source);
  const select = list => list.find(row => row.geometry === "straight" && row.pn === 25 && row.bom.filter(item => item.componentId === id).length === 2);
  const before = select(generateInsertCalculations(request, catalog));
  catalog.parts.find(part => part.id === id).price += 100;
  const after = select(generateInsertCalculations(request, catalog));
  assert.equal(after.identityKey, before.identityKey); assert.equal(after.price, before.price + 200);
  const ref = catalog.engineering.boltReferences.find(ref => ref.endPartId === id && ref.pn === 25 && ref.model === "010C-line-spec");
  catalog.standardBolts.push({ id: "TEST-only-400", diameterMm: ref.threadDiameterMm, lengthMm: 400, source: "test" });
  Object.assign(ref, { componentId: "TEST-only-400", standardLengthMm: 400 });
  const changed = select(generateInsertCalculations(request, catalog));
  assert.equal(changed.baseLengthMm, 488); assert.notEqual(changed.identityKey, before.identityKey);
});
