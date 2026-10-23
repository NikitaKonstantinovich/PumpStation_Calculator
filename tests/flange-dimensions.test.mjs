import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { importComponentDimensions } from "../scripts/import-collar-dimensions.mjs";

const { mergeFlangeDimensions: merge, readFlangeDimensions: read, catalogPressures, flangeManagedColumns: columns } = await loadTs(new URL("../app/flange-dimensions.ts", import.meta.url));
const { jointFlangeThickness } = await loadTs(new URL("../app/joint-flange-dimensions.ts", import.meta.url));
const { selectJointFasteners } = await loadTs(new URL("../app/line-spec-parts.ts", import.meta.url));
const { makeInsertCatalog, CONFIRMED_INSERT_ENGINEERING } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const { generateInsertCalculations } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const reference = JSON.parse(await readFile(new URL("../data/flange-dimensions.json", import.meta.url), "utf8"));
const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const original = structuredClone(source);
for (const item of original.items) item.fields = item.fields.filter(field => !columns.includes(field.column));
const native = item => ({ ...item, fields: item.fields.filter(field => !columns.includes(field.column)) });
const field = (item, label) => item.fields.find(field => field.headerPath.at(-1) === label)?.value;
const flange = (dn, pn, family) => reference.rows.find(row => row.dn === dn && row.pn === pn && family.test(row.family));

test("100 exact flange executions get separate sourced dimensions; ambiguous PN16/pressed variants remain pending", () => {
  const enriched = merge(original, reference), pressures = catalogPressures(enriched.items);
  assert.equal(reference.rows.length, 131);
  assert.equal(reference.rows.filter(row => row.dimensions.thicknessMm).length, 100);
  assert.equal(enriched.items.filter(item => field(item, "Толщина фланца, мм")).length, 100);
  assert.deepEqual(merge(enriched, reference), enriched);
  for (let i = 0; i < enriched.items.length; i++) assert.deepEqual(native(enriched.items[i]), original.items[i]);
  for (const row of reference.rows) {
    const item = enriched.items.find(item => item.id === row.componentId);
    const result = read(item, pressures.get(item.id), reference, enriched.source.sha256);
    assert.deepEqual(result.dimensions, row.dimensions);
    assert.equal(result.warnings.length > 0, !row.dimensions.thicknessMm);
  }
  // Type 01, row 1: do not replace this with the 20 mm of row 2.
  assert.equal(flange(50, 25, /AISI/).dimensions.thicknessMm, 24);
  assert.equal(flange(100, 10, /свободный/).dimensions.thicknessMm, 18);
  assert.deepEqual(flange(100, 16, /свободный/).dimensions, {});
  assert.match(flange(100, 16, /свободный/).reason, /PN10/);
});

test("changed DN, PN, name, workbook or stored thickness invalidates a managed dimension", () => {
  const enriched = merge(original, reference), row = flange(100, 16, /Сталь/);
  for (const patch of [
    data => { data.source.sha256 = "changed"; },
    data => { data.items.find(item => item.id === row.componentId).fields.find(field => field.headerPath.at(-1) === "DN").value = "DN125"; },
    data => { data.items.find(item => item.id === row.componentId).fields.find(field => field.headerPath.at(-1) === "Наименование").value += " other execution"; },
    data => { data.items.find(item => item.id === row.componentId).fields.find(field => field.column === "CALC_FLANGE_B").value = 999; },
  ]) {
    const changed = structuredClone(enriched); patch(changed);
    const part = makeInsertCatalog(changed).parts.find(part => part.id === row.componentId);
    assert.equal(part.thicknessMm, null);
    assert.ok(part.warnings.some(value => /не подтверждён/.test(value)));
  }
  const item = enriched.items.find(item => item.id === row.componentId);
  assert.equal(read(item, 25, reference, enriched.source.sha256).dimensions.thicknessMm, undefined);
  const manual = structuredClone(enriched), changed = manual.items.find(item => item.id === row.componentId);
  changed.fields.push({ column: "USER_B", headerPath: ["Толщина фланца, мм"], value: 99 });
  const result = merge(manual, reference).items.find(item => item.id === row.componentId);
  assert.equal(result.fields.find(field => field.column === "USER_B").value, 99);
  assert.equal(result.fields.find(field => field.column === "CALC_FLANGE_B"), undefined);
  assert.match(field(result, "Проверка размеров фланца"), /Конфликт/);
});

test("stainless bolt grip contains two DIN2642 PN10 flanges and two 3 mm lips, with no PN10 fallback for PN16", () => {
  const data = merge(original, reference), grip = jointFlangeThickness(data, "aisi304", 100, 10);
  assert.equal(grip.thicknessMm, 42); // 2 × (18 + 3)
  assert.deepEqual(grip.warnings, []);
  const selected = selectJointFasteners(data, "aisi304", 100, 10, true);
  assert.equal(selected.flangeThickness, 42);
  assert.equal(selected.length, 42 + selected.reference.wafer017WLength + 4 + selected.nutWidth + selected.washerWidth + 5);
  assert.ok(selected.standardLength >= selected.length);
  assert.ok(selected.flangeDimensions.some(row => row.name.includes("Борт воротника") && row.value === 3));
  const missing = selectJointFasteners(data, "aisi304", 100, 16, true);
  assert.equal(missing.length, null);
  assert.equal(missing.standardLength, null);
  assert.ok(missing.warnings.some(reason => /PN10/.test(reason)));
  const missingDimension = structuredClone(data);
  const id = flange(100, 10, /свободный/).componentId;
  missingDimension.items.find(item => item.id === id).fields = missingDimension.items.find(item => item.id === id).fields.filter(field => field.column !== "CALC_FLANGE_B");
  assert.equal(selectJointFasteners(missingDimension, "aisi304", 100, 10, true).length, null);
});

test("confirmed sensor choice is DN15 with a cap; production missing execution stays incomplete", () => {
  assert.equal(CONFIRMED_INSERT_ENGINEERING.sensorNipple.dn, 15);
  assert.equal(CONFIRMED_INSERT_ENGINEERING.sensorNipple.withPlug, true);
  const rows = generateInsertCalculations({ dnFrom: 100, dnTo: 100, materials: ["st20"], withSensorNipple: true, includeEccentric: false }, makeInsertCatalog(source));
  assert.ok(rows.length);
  for (const row of rows) {
    assert.equal(row.configuration.sensor.dn, 15);
    assert.match(row.name, / t$/);
    assert.ok(row.bom.some(part => part.role === "sensor-plug"));
    assert.equal(row.price, null);
    assert.ok(row.warnings.some(reason => /Сгон DN15/.test(reason)));
    assert.ok(row.warnings.every(reason => !reason.includes("Не подтверждены DN и исполнение приварного сгона")));
  }
});

const schema = await readFile(new URL("../drizzle/0000_burly_jackpot.sql", import.meta.url), "utf8");
const revisionSchema = await readFile(new URL("../drizzle/0009_component_source_revision.sql", import.meta.url), "utf8");
const options = { catalogId: "фланцы", columns, confirmedColumn: "CALC_FLANGE_B", reviewColumn: "CALC_FLANGE_REVIEW" };
function fixtureDb() {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys=ON"); db.exec(schema); db.exec(revisionSchema);
  db.prepare("INSERT INTO catalog_imports(id,source_file,source_sha256,source_size_bytes,source_modified_at) VALUES(1,'fixture',?,1,'fixture')").run(reference.sourceSha256);
  db.exec("INSERT INTO component_catalogs(id,import_id,source_id,name,source_sheet) VALUES(1,1,'фланцы','Фланцы','Фланцы')");
  const selected = [flange(100, 16, /Сталь/), flange(100, 10, /свободный/), flange(100, 16, /свободный/)];
  for (const [index, row] of selected.entries()) {
    const id = index + 1, item = original.items.find(item => item.id === row.componentId);
    db.prepare("INSERT INTO component_families(id,catalog_id,source_id,title,source_range) VALUES(?,1,?,?,'B1:J3')").run(id, row.tableId, row.family);
    db.prepare("INSERT INTO components(id,family_id,source_id,source_row) VALUES(?,?,?,?)").run(id, id, item.id, item.sourceRow);
    db.prepare("INSERT INTO component_prices(component_id,label,amount_microunits,source_column) VALUES(?,'Цена',123456000,'E')").run(id);
    for (const [column, label, value] of [["B", "DN", row.dn], ["C", "Наименование", row.name], ["D", "PN", row.pn]]) {
      const attr = db.prepare("INSERT INTO attribute_definitions(family_id,source_column,key,label,header_path_json,data_type) VALUES(?,?,?,?,?,'text')").run(id, column, column, label, JSON.stringify([label])).lastInsertRowid;
      db.prepare("INSERT INTO component_attribute_values(component_id,attribute_definition_id,value_type,text_value) VALUES(?,?,'text',?)").run(id, attr, String(value));
    }
  }
  return db;
}
const snapshot = db => JSON.stringify(["component_attribute_values", "attribute_definitions", "component_prices", "component_calculator_source_revision"].map(table => db.prepare(`SELECT * FROM ${table}`).all()));
test("database writes sourced attributes atomically, preserves prices and PN, repeated import makes zero changes", () => {
  const db = fixtureDb();
  try {
    const prices = db.prepare("SELECT * FROM component_prices").all();
    const native = db.prepare("SELECT * FROM component_attribute_values").all();
    const first = importComponentDimensions(db, reference, merge, options);
    assert.equal(first.updated, 3); assert.equal(first.confirmed, 2); assert.equal(first.pending.length, 1);
    const saved = snapshot(db);
    assert.equal(importComponentDimensions(db, reference, merge, options).updated, 0);
    assert.equal(snapshot(db), saved);
    assert.deepEqual(db.prepare("SELECT * FROM component_prices").all(), prices);
    assert.deepEqual(db.prepare("SELECT * FROM component_attribute_values WHERE attribute_definition_id<=9").all(), native);
    assert.equal(db.prepare("SELECT numeric_value AS b FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE v.component_id=2 AND a.source_column='CALC_FLANGE_B'").get().b, 18);
    assert.throws(() => importComponentDimensions(db, { ...reference, sourceSha256: "other" }, merge, options), /workbook/);
    assert.equal(snapshot(db), saved);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
});
test("a failed flange write rolls back all attribute values, definitions and source revision", () => {
  const db = fixtureDb();
  try {
    const before = snapshot(db);
    db.exec("CREATE TRIGGER test_failure BEFORE INSERT ON component_attribute_values WHEN NEW.component_id=2 BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
    assert.throws(() => importComponentDimensions(db, reference, merge, options), /fixture failure/);
    assert.equal(snapshot(db), before);
  } finally { db.close(); }
});
