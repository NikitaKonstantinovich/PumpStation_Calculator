import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { importComponentDimensions } from "../scripts/import-collar-dimensions.mjs";
const { mergeSensorNipples: merge, sensorManagedColumns: columns } = await loadTs(new URL("../app/component-sensor-nipples.ts", import.meta.url));
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const { generateInsertCalculations } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const reference = JSON.parse(await readFile(new URL("../data/sensor-nipple-reference.json", import.meta.url), "utf8"));
const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const original = structuredClone(source);
for (const item of original.items) item.fields = item.fields.filter(field => !columns.includes(field.column));
const id = "сгоны-резьба-002-r0017";
const read = data => makeInsertCatalog(data).parts.find(part => part.id === id);
test("exact supplier row gives 21.3×2.6 and male 1/2 thread; a standard pressure limit is not confirmed PN", () => {
  const merged = merge(original, reference);
  assert.deepEqual(merge(merged, reference), merged);
  const nipple = read(merged);
  assert.equal(nipple.outerDiameter, 21.3); assert.equal(nipple.wallThickness, 2.6);
  assert.equal(nipple.threadGender, "male"); assert.equal(nipple.thread, '1/2"');
  assert.equal(nipple.lengthMm, null); assert.equal(nipple.pn, null);
  assert.equal(nipple.price, 286.7);
  assert.match(nipple.dimensionSources.wallThickness, /Ц0000012555/);
  assert.ok(nipple.warnings.some(reason => /под резьбой/.test(reason)));
  const steel = makeInsertCatalog(merged).parts.find(part => part.id === "сгоны-резьба-001-r0005");
  assert.equal(steel.wallThickness, null); assert.equal(steel.pn, null); assert.equal(steel.threadGender, "male");
  assert.ok(steel.warnings.some(reason => /DN20/.test(reason)));
  for (let i = 0; i < merged.items.length; i++) {
    assert.deepEqual(merged.items[i].prices, original.items[i].prices);
    assert.deepEqual(merged.items[i].fields.filter(field => !columns.includes(field.column)), original.items[i].fields);
  }
});
test("known thread and optional length expose wall/pressure issues without losing nipple cost and weld audit", () => {
  const catalog = makeInsertCatalog(merge(original, reference));
  const rows = generateInsertCalculations({ dnFrom: 50, dnTo: 50, materials: ["aisi304", "st20"], withSensorNipple: true, includeEccentric: false }, catalog);
  for (const row of rows) {
    assert.equal(row.complete, false); assert.equal(row.price, null);
    const nipple = row.bom.find(item => item.role === "sensor-nipple");
    assert.equal(nipple.quantity, 1);
    assert.equal(nipple.cost, row.material === "aisi304" ? 286.7 : 44);
    const weld = row.welds.find(item => item.role === "sensor-weld");
    assert.equal(weld.diameterMm, 21.3);
    assert.ok(Math.abs(weld.lengthMm - Math.PI * 21.3) < 1e-8);
    assert.ok(row.warnings.every(reason => !/длины исполнения сгона/.test(reason)));
    assert.ok(row.warnings.some(reason => /Сгон DN15.*PN/.test(reason)));
    if (row.material === "aisi304") assert.ok(row.warnings.every(reason => !reason.includes("Нет подтверждённых резьбы и толщины стенки сгона")));
  }
});
test("edited source identity or managed dimensions cannot inherit a reviewed nipple geometry", () => {
  for (const edit of [
    (data, item) => { item.family = "Other AISI304"; },
    (data, item) => { item.fields.find(field => field.headerPath.at(-1) === "Ссылка").value = "different"; },
    data => { data.source.sha256 = "different"; },
    (data, item) => { item.fields.find(field => field.column === "CALC_SENSOR_WALL").value = 1; },
  ]) {
    const data = merge(original, reference); edit(data, data.items.find(item => item.id === id));
    const part = read(data);
    assert.equal(part.wallThickness, null); assert.equal(part.pn, null);
    assert.ok(part.warnings.some(reason => /устарели/.test(reason)));
  }
  const manual = merge(original, reference), item = manual.items.find(item => item.id === id);
  item.fields.push({ column: "USER_WALL", headerPath: ["Толщина, мм"], value: 3 });
  const updated = merge(manual, reference).items.find(item => item.id === id);
  assert.equal(updated.fields.find(field => field.column === "USER_WALL").value, 3);
  assert.ok(updated.fields.every(field => field.column !== "CALC_SENSOR_WALL"));
});

const schema = await readFile(new URL("../drizzle/0000_burly_jackpot.sql", import.meta.url), "utf8");
const revisions = await readFile(new URL("../drizzle/0009_component_source_revision.sql", import.meta.url), "utf8");
const options = { catalogId: "сгоны-резьба", columns, confirmedColumn: "CALC_SENSOR_WALL", reviewColumn: "CALC_SENSOR_REVIEW" };
function fixtureDb() {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys=ON"); db.exec(schema); db.exec(revisions);
  db.prepare("INSERT INTO catalog_imports(id,source_file,source_sha256,source_size_bytes,source_modified_at) VALUES(1,'fixture',?,1,'fixture')").run(reference.sourceSha256);
  db.exec("INSERT INTO component_catalogs(id,import_id,source_id,name,source_sheet) VALUES(1,1,'сгоны-резьба','Сгоны','Сгоны')");
  for (const [index, row] of reference.rows.entries()) {
    const number = index + 1;
    db.prepare("INSERT INTO component_families(id,catalog_id,source_id,title,source_range) VALUES(?,1,?,?,'B1:F3')").run(number, row.tableId, row.family);
    db.prepare("INSERT INTO components(id,family_id,source_id,source_row) VALUES(?,?,?,?)").run(number, number, row.componentId, number);
    db.prepare("INSERT INTO component_prices(component_id,label,amount_microunits,source_column) VALUES(?,'Цена',44000000,'E')").run(number);
    for (const [column, label, value] of [["B", "DN", "DN15"], ["C", "Резьба, дюйм", row.thread], ["F", "Ссылка", row.originalLink]]) {
      const attr = db.prepare("INSERT INTO attribute_definitions(family_id,source_column,key,label,header_path_json,data_type) VALUES(?,?,?,?,?,'text')").run(number, column, column, label, JSON.stringify([label])).lastInsertRowid;
      db.prepare("INSERT INTO component_attribute_values(component_id,attribute_definition_id,value_type,text_value) VALUES(?,?,'text',?)").run(number, attr, value);
    }
  }
  return db;
}
const snapshot = db => JSON.stringify(["component_attribute_values", "attribute_definitions", "component_prices", "component_calculator_source_revision"].map(table => db.prepare(`SELECT * FROM ${table}`).all()));
test("source attributes persist without changing prices; repeat import is idle and failure rolls back", () => {
  const db = fixtureDb();
  try {
    const prices = db.prepare("SELECT * FROM component_prices").all(), before = snapshot(db);
    db.exec("CREATE TRIGGER test_failure BEFORE INSERT ON component_attribute_values WHEN NEW.component_id=2 BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
    assert.throws(() => importComponentDimensions(db, reference, merge, options), /fixture failure/);
    assert.equal(snapshot(db), before);
    db.exec("DROP TRIGGER test_failure");
    const result = importComponentDimensions(db, reference, merge, options);
    assert.equal(result.updated, 2); assert.equal(result.confirmed, 1);
    const after = snapshot(db);
    assert.equal(importComponentDimensions(db, reference, merge, options).updated, 0);
    assert.equal(snapshot(db), after);
    assert.deepEqual(db.prepare("SELECT * FROM component_prices").all(), prices);
    assert.equal(db.prepare("SELECT v.numeric_value AS wall FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE v.component_id=2 AND a.source_column='CALC_SENSOR_WALL'").get().wall, 2.6);
    assert.equal(db.prepare("SELECT count(*) AS total FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE a.label='PN'").get().total, 0);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
});
