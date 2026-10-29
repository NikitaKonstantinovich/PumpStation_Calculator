import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { importComponentDimensions } from "../scripts/import-collar-dimensions.mjs";
const { mergeSensorNipples: merge, sensorManagedColumns: columns, SENSOR_FIELDS } = await loadTs(new URL("../app/component-sensor-nipples.ts", import.meta.url));
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const { generateInsertCalculations } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const reference = JSON.parse(await readFile(new URL("../data/sensor-nipple-reference.json", import.meta.url), "utf8"));
const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const original = structuredClone(source);
for (const item of original.items) item.fields = item.fields.filter(field => !columns.includes(field.column));
const id = "сгоны-резьба-002-r0017";
const read = data => makeInsertCatalog(data).parts.find(part => part.id === id);
test("explicit project adoption enables exact DN15 rows, preserving prices, dimensions and native fields", () => {
  const merged = merge(original, reference);
  assert.deepEqual(merge(merged, reference), merged);
  const nipple = read(merged);
  assert.equal(nipple.outerDiameter, 21.3); assert.equal(nipple.wallThickness, 2.6);
  assert.equal(nipple.threadGender, "male"); assert.equal(nipple.thread, '1/2"');
  assert.equal(nipple.lengthMm, null); assert.equal(nipple.pn, 20);
  assert.equal(nipple.pressureAcceptance.maxTemperatureC, 40);
  assert.match(nipple.pressureAcceptance.source, /Решение пользователя/);
  assert.equal(nipple.price, 286.7); assert.deepEqual(nipple.warnings, []);
  const steel = makeInsertCatalog(merged).parts.find(part => part.id === "сгоны-резьба-001-r0005");
  assert.equal(steel.wallThickness, null); assert.equal(steel.pn, 16);
  assert.equal(steel.pressureAcceptance.maxTemperatureC, 40); assert.equal(steel.price, 44);
  assert.deepEqual(steel.warnings, []);
  for (let i = 0; i < merged.items.length; i++) {
    assert.deepEqual(merged.items[i].prices, original.items[i].prices);
    assert.deepEqual(merged.items[i].fields.filter(field => !columns.includes(field.column)), original.items[i].fields);
  }
});

test("PN10/16/25 nipples retain geometry and exact cost; PN25 carries the explicit pressure warning", () => {
  const catalog = makeInsertCatalog(merge(original, reference));
  const input = { dnFrom: 50, dnTo: 50, materials: ["aisi304", "st20"], withSensorNipple: true, includeEccentric: false };
  const rows = generateInsertCalculations(input, catalog);
  const bare = generateInsertCalculations({ ...input, withSensorNipple: false }, catalog);
  for (const material of input.materials) for (const pn of [10, 16, 25]) assert.ok(rows.some(row => row.material === material && row.pn === pn));
  for (const row of rows) {
    const nipple = row.bom.find(item => item.role === "sensor-nipple"), plug = row.bom.find(item => item.role === "sensor-plug");
    assert.equal(nipple.quantity, 1); assert.equal(plug.quantity, 1);
    assert.equal(nipple.cost, row.material === "aisi304" ? 286.7 : 44);
    const weld = row.welds.find(item => item.role === "sensor-weld");
    assert.equal(weld.diameterMm, 21.3);
    assert.ok(Math.abs(weld.lengthMm - Math.PI * 21.3) < 1e-8);
    assert.match(row.description, /до \+40 °C/); assert.match(row.name, / t$/);
    assert.equal(row.dimensions.find(d => d.unit === "бар").value, row.material === "aisi304" ? 20 : 16);
    assert.equal(row.dimensions.find(d => d.unit === "°C").value, 40);
    const base = bare.find(base => base.material === row.material && base.pn === row.pn && base.configuration.base === row.configuration.base
      && JSON.stringify(base.configuration.left) === JSON.stringify(row.configuration.left) && JSON.stringify(base.configuration.right) === JSON.stringify(row.configuration.right));
    assert.ok(base);
    assert.equal(row.complete, base.complete);
    assert.deepEqual(row.warnings, base.warnings);
    assert.equal(row.baseLengthMm, base.baseLengthMm); assert.equal(row.totalLengthMm, base.totalLengthMm);
    if (base.complete) assert.ok(Math.abs(row.price - base.price - nipple.cost - plug.cost - weld.cost) < 1e-8);
    else assert.equal(row.price, null);
    if (row.pn === 25) {
      assert.equal(row.assumptions.length, 1);
      assert.equal(row.assumptions[0].code, "sensor-pn25-pressure");
      assert.match(row.assumptions[0].message, /при 25 бар не подтверждена/);
      assert.match(row.assumptions[0].source, /Решение пользователя/);
      assert.ok(row.description.includes(row.assumptions[0].message));
      assert.ok(nipple.source.includes(row.assumptions[0].message));
    } else assert.equal(row.assumptions, undefined);
  }
  for (const material of input.materials) for (const pn of [10,16,25]) assert.ok(rows.some(row => row.material === material && row.pn === pn && row.complete));
});

test("normative limit without adoption does not supply PN; missing or modified acceptance fields invalidate it", () => {
  const normative = structuredClone(reference);
  for (const row of normative.rows) delete row.adoptedPressure;
  assert.equal(read(merge(original, normative)).pn, null);
  for (const key of ["adoptedPressure", "maxTemperature", "acceptance", "diameter", "wall", "gender", "standard", "pressure"]) {
    for (const remove of [false, true]) {
      const data = merge(original, reference), item = data.items.find(item => item.id === id);
      const column = SENSOR_FIELDS[key][0];
      if (remove) item.fields = item.fields.filter(field => field.column !== column);
      else item.fields.find(field => field.column === column).value = key === "adoptedPressure" ? 25 : "edited";
      const part = read(data);
      assert.equal(part.pn, null, `${key}, remove=${remove}`); assert.equal(part.pressureAcceptance, undefined);
      assert.ok(part.warnings.length > 0);
    }
  }
  const data = merge(original, reference);
  for (const item of data.items.filter(item => reference.rows.some(row => row.componentId === item.id))) item.fields.push({ column: "USER_PN", headerPath: ["PN"], value: 25 });
  const rows = generateInsertCalculations({ dnFrom: 50, dnTo: 50, materials: ["aisi304", "st20"], withSensorNipple: true, includeEccentric: false }, makeInsertCatalog(data));
  assert.ok(rows.every(row => !row.complete && row.price === null && row.warnings.some(reason => /Принятое давление сгона не применено/.test(reason))));
});

test("PN25 exception requires the exact reviewed parts and source; PN40 and unknown pressure remain blocked", () => {
  const input = { dnFrom: 50, dnTo: 50, materials: ["aisi304", "st20"], withSensorNipple: true, includeEccentric: false };
  for (const mutate of [
    c => { delete c.engineering.sensorNipplePn25Allowance; },
    c => { c.engineering.sensorNipplePn25Allowance.source = ""; },
    c => { c.engineering.sensorNipplePn25Allowance.pn = 40; },
    c => { for (const p of c.parts.filter(p => p.kind === "nipple")) p.id += "-other-part"; },
    c => { for (const p of c.parts.filter(p => p.kind === "nipple")) delete p.pressureAcceptance; },
    c => { for (const p of c.parts.filter(p => p.kind === "nipple")) p.pn = null; },
    c => { for (const p of c.parts.filter(p => p.pressureAcceptance)) p.pressureAcceptance.maxTemperatureC = 100; },
  ]) {
    const catalog = structuredClone(makeInsertCatalog(source)); mutate(catalog);
    const rows = generateInsertCalculations(input, catalog).filter(row => row.pn === 25);
    assert.ok(rows.length);
    assert.ok(rows.every(row => !row.complete && row.price === null && !row.assumptions && row.warnings.some(w => /Сгон DN15 PN25/.test(w))));
  }
  const catalog = structuredClone(makeInsertCatalog(source));
  for (const p of catalog.parts.filter(p => ["pipe", "reducer"].includes(p.kind) && p.pn === 25)) p.pn = 40;
  const rows = generateInsertCalculations(input, catalog).filter(row => row.pn === 40);
  assert.ok(rows.length);
  assert.ok(rows.every(row => !row.complete && !row.assumptions && row.warnings.some(w => /Сгон DN15 PN40/.test(w))));
});

test("PN25 warning does not waive missing price, weld diameter, plug rating or other calculation failures", () => {
  const input = { dnFrom: 50, dnTo: 50, materials: ["aisi304"], withSensorNipple: true, includeEccentric: false };
  for (const mutate of [
    c => { c.parts.find(p => p.id === id).price = null; },
    c => { c.parts.find(p => p.id === id).outerDiameter = null; },
    c => { c.parts.find(p => p.id === id).wallThickness = 99; },
    c => { c.sensorPlugs.forEach(p => { p.pn = 16; }); },
  ]) {
    const catalog = structuredClone(makeInsertCatalog(source)); mutate(catalog);
    const rows = generateInsertCalculations(input, catalog).filter(row => row.pn === 25);
    assert.ok(rows.length);
    assert.ok(rows.every(row => !row.complete && row.price === null && row.warnings.length));
  }
});

test("a confirmed higher-rated nipple takes priority over the PN25 project exception", () => {
  const catalog = structuredClone(makeInsertCatalog(source));
  const rated = { ...catalog.parts.find(p => p.id === id), id: "TEST-rated-nipple", pn: 25, pressureAcceptance: undefined };
  catalog.parts.push(rated);
  const rows = generateInsertCalculations({ dnFrom: 50, dnTo: 50, materials: ["aisi304"], withSensorNipple: true, includeEccentric: false }, catalog).filter(row => row.pn === 25);
  assert.ok(rows.length);
  assert.ok(rows.every(row => row.complete && !row.assumptions && row.bom.some(item => item.role === "sensor-nipple" && item.componentId === rated.id)));
});

test("edited source identity or managed dimensions cannot inherit accepted pressure; native edits are preserved", () => {
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
  const merged = merge(manual, reference), updated = merged.items.find(item => item.id === id);
  assert.equal(updated.fields.find(field => field.column === "USER_WALL").value, 3);
  assert.ok(updated.fields.every(field => field.column !== "CALC_SENSOR_WALL"));
  assert.equal(read(merged).pn, null);
});

const schema = await readFile(new URL("../drizzle/0000_burly_jackpot.sql", import.meta.url), "utf8");
const revisions = await readFile(new URL("../drizzle/0009_component_source_revision.sql", import.meta.url), "utf8");
const options = { catalogId: "сгоны-резьба", columns, confirmedColumn: "CALC_SENSOR_ADOPTED_PRESSURE", reviewColumn: "CALC_SENSOR_REVIEW" };
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
    assert.equal(result.updated, 2); assert.equal(result.confirmed, 2);
    const after = snapshot(db);
    assert.equal(importComponentDimensions(db, reference, merge, options).updated, 0);
    assert.equal(snapshot(db), after);
    assert.deepEqual(db.prepare("SELECT * FROM component_prices").all(), prices);
    assert.equal(db.prepare("SELECT v.numeric_value AS wall FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE v.component_id=2 AND a.source_column='CALC_SENSOR_WALL'").get().wall, 2.6);
    assert.equal(db.prepare("SELECT count(*) AS total FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE a.label='PN'").get().total, 0);
    const pressure = db.prepare("SELECT a.source_column AS key,v.text_value AS value FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE v.component_id=2 AND a.source_column IN ('CALC_SENSOR_PRESSURE_TEMPERATURE','CALC_SENSOR_PRESSURE_STATUS') ORDER BY a.source_column").all();
    assert.equal(pressure.length, 2);
    assert.match(pressure.find(field => field.key === "CALC_SENSOR_PRESSURE_TEMPERATURE").value, /100 °C — 16,5 бар/);
    assert.match(pressure.find(field => field.key === "CALC_SENSOR_PRESSURE_STATUS").value, /Принято пользователем/);
    const adopted = db.prepare("SELECT v.component_id,a.source_column,v.numeric_value,v.text_value FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE a.source_column IN ('CALC_SENSOR_ADOPTED_PRESSURE','CALC_SENSOR_MAX_TEMPERATURE','CALC_SENSOR_PRESSURE_ACCEPTANCE')").all();
    assert.equal(adopted.length, 6);
    for (const component of [1, 2]) {
      assert.equal(adopted.find(v => v.component_id === component && v.source_column === "CALC_SENSOR_ADOPTED_PRESSURE").numeric_value, component === 1 ? 16 : 20);
      assert.equal(adopted.find(v => v.component_id === component && v.source_column === "CALC_SENSOR_MAX_TEMPERATURE").numeric_value, 40);
      assert.match(adopted.find(v => v.component_id === component && v.source_column === "CALC_SENSOR_PRESSURE_ACCEPTANCE").text_value, /Решение пользователя/);
    }
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
});
