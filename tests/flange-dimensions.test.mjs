import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { importComponentDimensions } from "../scripts/import-collar-dimensions.mjs";

const { mergeFlangeDimensions: merge, readFlangeDimensions: read, catalogPressures, flangeManagedColumns: columns, acceptedFlangeMaterials, FLANGE_MATERIAL_FIELDS } = await loadTs(new URL("../app/flange-dimensions.ts", import.meta.url));
const { jointFlangeThickness } = await loadTs(new URL("../app/joint-flange-dimensions.ts", import.meta.url));
const { selectJointFasteners } = await loadTs(new URL("../app/line-spec-parts.ts", import.meta.url));
const { makeInsertCatalog, CONFIRMED_INSERT_ENGINEERING } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const { generateInsertCalculations, generateInsertCandidates } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const reference = JSON.parse(await readFile(new URL("../data/flange-dimensions.json", import.meta.url), "utf8"));
const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const original = structuredClone(source);
for (const item of original.items) item.fields = item.fields.filter(field => !columns.includes(field.column));
const native = item => ({ ...item, fields: item.fields.filter(field => !columns.includes(field.column)) });
const field = (item, label) => item.fields.find(field => field.headerPath.at(-1) === label)?.value;
const flange = (dn, pn, family) => reference.rows.find(row => row.dn === dn && row.pn === pn && family.test(row.family));

test("material substitution is scoped to the 17 approved PN25 flanges and preserves source marks, sizes and prices", () => {
  const data = merge(original, reference), pressures = catalogPressures(data.items), catalog = makeInsertCatalog(data);
  const accepted = data.items.filter(item => acceptedFlangeMaterials(item, pressures.get(item.id), reference, data.source.sha256));
  const pn25 = accepted.filter(item => item.tableId === "фланцы-007");
  assert.deepEqual(pn25.map(item => item.id).sort(), Array.from({ length: 17 }, (_, i) => `фланцы-007-r${String(i + 136).padStart(4, "0")}`));
  assert.equal(accepted.length, 27); // 17 historical PN25 + 10 individually approved PN16 supplier items.
  assert.ok(accepted.filter(item => item.tableId !== "фланцы-007").every(item => item.tableId === "standard-stainless-pn16-20261030"));
  for (const item of pn25) {
    assert.match(field(item, "Наименование"), /12Х18Н10Т/);
    assert.deepEqual(native(item), original.items.find(row => row.id === item.id));
    const part = catalog.parts.find(part => part.id === item.id), grip = jointFlangeThickness(data, "aisi304", part.dn, 25);
    assert.ok(part.warnings.every(reason => !/противореч/.test(reason)));
    assert.ok(grip.warnings.every(reason => !/противореч/.test(reason)));
    assert.match(part.source, /Проектная взаимозаменяемость/);
    assert.match(grip.source, /Проектная взаимозаменяемость/);
  }
  // The excluded small flange IDs never acquire a blanket material alias.
  assert.equal(acceptedFlangeMaterials(data.items.find(item => item.id === "фланцы-007-r0133"), 25, reference, data.source.sha256), null);
  assert.ok(jointFlangeThickness(data, "aisi304", 15, 25).warnings.some(reason => /противореч/.test(reason)));
});

test("missing, altered or transplanted substitution attributes cannot suppress a material conflict", () => {
  const id = "фланцы-007-r0138";
  for (const edit of [
    data => { data.source.sha256 = "other"; },
    (data, item) => { item.id += "-other"; },
    (data, item) => { item.tableId = "other"; },
    (data, item) => { item.family += " other"; },
    (data, item) => { item.fields.find(f => f.headerPath.at(-1) === "Наименование").value += " other"; },
    ...Object.values(FLANGE_MATERIAL_FIELDS).flatMap(([column]) => [
      (data, item) => { item.fields = item.fields.filter(f => f.column !== column); },
      (data, item) => { item.fields.find(f => f.column === column).value = "unapproved"; },
      (data, item) => { item.fields.push({ ...item.fields.find(f => f.column === column), column: "USER_COPY" }); },
    ]),
  ]) {
    const data = merge(original, reference), item = data.items.find(item => item.id === id); edit(data, item);
    assert.equal(acceptedFlangeMaterials(item, 25, reference, data.source.sha256), null);
    const part = makeInsertCatalog(data).parts.find(part => part.id === item.id);
    assert.ok(part.warnings.some(reason => /противореч/.test(reason)));
    assert.ok(jointFlangeThickness(data, "aisi304", 50, 25).warnings.some(reason => /противореч|Нет фланца/.test(reason)));
  }
  const data = merge(original, reference), item = data.items.find(item => item.id === id);
  assert.equal(acceptedFlangeMaterials(item, 16, reference, data.source.sha256), null);
});

test("accepted PN25 material does not widen bores or waive direct reducer profiles", () => {
  const data = merge(original, reference);
  const rows = generateInsertCandidates({ dnFrom: 50, dnTo: 50, materials: ["aisi304"], withSensorNipple: false, includeEccentric: false }, makeInsertCatalog(data));
  const row = rows.find(row => row.dnSmall === 32 && row.pn === 25
    && row.bom.some(item => item.role === "left-flanged" && item.componentId === "фланцы-007-r0138")
    && row.bom.some(item => item.role === "right-flanged" && item.componentId === "фланцы-007-r0136"));
  assert.equal(row.baseLengthMm, 76); assert.equal(row.extension, undefined); assert.equal(row.totalLengthMm, 86);
  assert.equal(row.complete, false); assert.equal(row.price, null);
  assert.ok(row.warnings.every(reason => !/противореч|Не подтверждена полная длина/.test(reason)));
  assert.equal(row.machining.find(operation => operation.side === "left").originalBoreMm, 59);
  assert.equal(row.machining.find(operation => operation.side === "left").baseOuterDiameterMm, 60.3);
  assert.equal(row.machining.find(operation => operation.side === "right").originalBoreMm, 39);
  assert.equal(row.machining.find(operation => operation.side === "right").baseOuterDiameterMm, 42.4);
  assert.ok(row.warnings.some(reason => /нет подтверждённой длины цилиндрического/.test(reason)));
  assert.ok(row.warnings.every(reason => !/Недостаточный внутренний зазор/.test(reason)));
  assert.equal(row.dimensions.find(d => d.name === "Фактический внутренний зазор между фланцами"), undefined);
  assert.equal(row.dimensions.find(d => d.name === "Минимальный внутренний зазор между фланцами"), undefined);
  assert.equal(selectJointFasteners(data, "aisi304", 50, 25, true).standardLength, 115);
  assert.match(row.bom.find(item => item.role === "left-flanged").source, /Проектная взаимозаменяемость/);
});

test("137 flange executions get sourced thickness; unapproved large loose PN16/pressed variants remain pending", () => {
  const enriched = merge(original, reference), pressures = catalogPressures(enriched.items);
  assert.equal(reference.rows.length, 156);
  assert.equal(reference.rows.filter(row => row.dimensions.thicknessMm).length, 137);
  assert.equal(enriched.items.filter(item => field(item, "Толщина фланца, мм")).length, 137);
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
  assert.equal(flange(100, 16, /свободный/).dimensions.thicknessMm, 22);
  assert.deepEqual(flange(250, 16, /свободный/).dimensions, {});
  assert.match(flange(250, 16, /свободный/).reason, /PN10/);
});

test("the 12 approved EN type 02 PN16 executions keep stock material/prices and distinguish bore from pipe diameter", () => {
  const enriched=merge(original,reference), catalog=makeInsertCatalog(enriched);
  const expected=[[15,14,25],[20,16,31],[25,16,38],[32,18,47],[40,18,53],[50,20,65],[65,20,81],[80,20,94],[100,22,120],[125,22,145],[150,24,174],[200,26,226]];
  for (const [index,[dn,b,bore]] of expected.entries()) {
    const id=`фланцы-006-r${String(110+index).padStart(4,"0")}`, item=enriched.items.find(i=>i.id===id);
    const part=catalog.parts.find(p=>p.id===id);
    assert.equal(field(item,"Принятое исполнение фланца"),"EN 1092-1:2018, тип 02, PN16");
    assert.match(field(item,"Наименование"),/DIN2642/); // Original import trace, not the adopted engineering execution.
    assert.deepEqual([part.dn,part.pn,part.material,part.thicknessMm,part.boreDiameterMm],[dn,16,"aisi304",b,bore]);
    assert.equal(part.standard,"EN 1092-1:2018, тип 02, PN16");
    assert.deepEqual(item.prices,original.items.find(i=>i.id===id).prices);
    const grip=jointFlangeThickness(enriched,"aisi304",dn,16);
    assert.equal(grip.thicknessMm,2*(b+3)); assert.deepEqual(grip.warnings,[]);
    const dims=read(item,16,reference,enriched.source.sha256);
    assert.equal(dims.dimensions.holes,dn===200?12:dn>=65?8:4);
    assert.equal(selectJointFasteners(enriched,"aisi304",dn,16,true).reference.holes,dims.dimensions.holes);
  }
  assert.equal(selectJointFasteners(enriched,"aisi304",65,10,true).reference.holes,4);
  assert.equal(selectJointFasteners(enriched,"st20",65,16,true).reference.holes,4);
});

test("an altered or absent adopted EN execution cannot silently reuse its dimensions", () => {
  const data=merge(original,reference), id=flange(100,16,/свободный/).componentId;
  for (const alter of [
    item=>{item.fields=item.fields.filter(f=>f.column!=="CALC_FLANGE_STANDARD");},
    item=>{item.fields.find(f=>f.column==="CALC_FLANGE_STANDARD").value="DIN2642 PN10";},
    item=>{item.fields.find(f=>f.headerPath.at(-1)==="Наименование").value+=" another execution";},
  ]) {
    const changed=structuredClone(data); alter(changed.items.find(i=>i.id===id));
    const part=makeInsertCatalog(changed).parts.find(p=>p.id===id);
    assert.equal(part.thicknessMm,null); assert.equal(part.boreDiameterMm,null);
    assert.equal(selectJointFasteners(changed,"aisi304",100,16,true).standardLength,null);
  }
  const changed=structuredClone(data); changed.source.sha256="another-workbook";
  assert.equal(makeInsertCatalog(changed).parts.find(p=>p.id===id).thicknessMm,null);
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

test("stainless bolt grip distinguishes DIN PN10 from adopted EN PN16 and includes both 3 mm lips", () => {
  const data = merge(original, reference), grip = jointFlangeThickness(data, "aisi304", 100, 10);
  assert.equal(grip.thicknessMm, 42); // 2 × (18 + 3)
  assert.deepEqual(grip.warnings, []);
  const selected = selectJointFasteners(data, "aisi304", 100, 10, true);
  assert.equal(selected.flangeThickness, 42);
  assert.equal(selected.length, 42 + selected.reference.wafer017WLength + 4 + selected.nutWidth + selected.washerWidth + 5);
  assert.ok(selected.standardLength >= selected.length);
  assert.ok(selected.flangeDimensions.some(row => row.name.includes("Борт воротника") && row.value === 3));
  const pn16 = selectJointFasteners(data, "aisi304", 100, 16, true);
  assert.equal(pn16.flangeThickness,50); // 2 × (22 + 3), not the PN10 thickness.
  assert.equal(pn16.length,50+pn16.reference.wafer017WLength+4+pn16.nutWidth+pn16.washerWidth+5);
  assert.ok(pn16.standardLength>=pn16.length);
  assert.deepEqual(pn16.warnings,[]);
  const missingDimension = structuredClone(data);
  const id = flange(100, 10, /свободный/).componentId;
  missingDimension.items.find(item => item.id === id).fields = missingDimension.items.find(item => item.id === id).fields.filter(field => field.column !== "CALC_FLANGE_B");
  assert.equal(selectJointFasteners(missingDimension, "aisi304", 100, 10, true).length, null);
});

test("DN15 sensor preserves its real pressure and PN25 warning independently of flange material acceptance", () => {
  assert.equal(CONFIRMED_INSERT_ENGINEERING.sensorNipple.dn, 15);
  assert.equal(CONFIRMED_INSERT_ENGINEERING.sensorNipple.withPlug, true);
  const rows = generateInsertCalculations({ dnFrom: 100, dnTo: 100, materials: ["st20"], withSensorNipple: true, includeEccentric: false }, makeInsertCatalog(source));
  assert.ok(rows.length);
  for (const row of rows) {
    assert.equal(row.configuration.sensor.dn, 15);
    assert.match(row.name, / t$/);
    assert.ok(row.bom.some(part => part.role === "sensor-plug"));
    if (row.pn === 25) assert.ok(row.assumptions?.some(item => item.code === "sensor-pn25-pressure"));
    else assert.equal(row.assumptions, undefined);
    assert.equal(row.dimensions.find(d => d.unit === "бар").value, 16);
    assert.ok(row.warnings.every(reason => !/Сгон DN15/.test(reason)));
    if (row.geometry === "straight") assert.ok(row.complete && row.price > 0);
    assert.ok(row.warnings.every(reason => !reason.includes("Не подтверждены DN и исполнение приварного сгона")));
  }
});

const schema = await readFile(new URL("../drizzle/0000_burly_jackpot.sql", import.meta.url), "utf8");
const revisionSchema = await readFile(new URL("../drizzle/0009_component_source_revision.sql", import.meta.url), "utf8");
const options = { catalogId: "фланцы", columns, confirmedColumn: "CALC_FLANGE_B", reviewColumn: "CALC_FLANGE_REVIEW" };
function fixtureDb(selectedRows) {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys=ON"); db.exec(schema); db.exec(revisionSchema);
  db.prepare("INSERT INTO catalog_imports(id,source_file,source_sha256,source_size_bytes,source_modified_at) VALUES(1,'fixture',?,1,'fixture')").run(reference.sourceSha256);
  db.exec("INSERT INTO component_catalogs(id,import_id,source_id,name,source_sheet) VALUES(1,1,'фланцы','Фланцы','Фланцы')");
  const selected = selectedRows ?? [flange(100, 16, /Сталь/), flange(100, 10, /свободный/), flange(100, 16, /свободный/), flange(50, 25, /AISI/)];
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

test("Grossner project dimensions persist idempotently without changing catalogue prices", () => {
  for (const id of ["grossner-en01:35547", "grossner-en01:35551"]) {
    const row = reference.rows.find(row => row.componentId === id);
    const db = fixtureDb([row]);
    try {
      const prices = db.prepare("SELECT * FROM component_prices").all();
      assert.equal(importComponentDimensions(db, reference, merge, options).updated, 1);
      const stored = db.prepare("SELECT a.source_column,v.numeric_value,v.text_value FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE v.component_id=1").all();
      assert.equal(stored.find(f => f.source_column === "CALC_FLANGE_B").numeric_value, row.dimensions.thicknessMm);
      assert.equal(stored.find(f => f.source_column === "CALC_FLANGE_BORE").numeric_value, row.dimensions.boreDiameterMm);
      assert.equal(stored.find(f => f.source_column === "CALC_FLANGE_STANDARD").text_value, row.standard);
      assert.match(stored.find(f => f.source_column === "CALC_FLANGE_SOURCE").text_value, /Решение пользователя/);
      const revision = db.prepare("SELECT revision FROM component_calculator_source_revision WHERE id=1").get().revision;
      assert.equal(importComponentDimensions(db, reference, merge, options).updated, 0);
      assert.equal(db.prepare("SELECT revision FROM component_calculator_source_revision WHERE id=1").get().revision, revision);
      assert.deepEqual(db.prepare("SELECT * FROM component_prices").all(), prices);
    } finally { db.close(); }
  }
});
const snapshot = db => JSON.stringify(["component_attribute_values", "attribute_definitions", "component_prices", "component_calculator_source_revision"].map(table => db.prepare(`SELECT * FROM ${table}`).all()));
test("database writes sourced attributes atomically, preserves prices and PN, repeated import makes zero changes", () => {
  const db = fixtureDb();
  try {
    const prices = db.prepare("SELECT * FROM component_prices").all();
    const native = db.prepare("SELECT * FROM component_attribute_values").all();
    const first = importComponentDimensions(db, reference, merge, options);
    assert.equal(first.updated, 4); assert.equal(first.confirmed, 4); assert.equal(first.pending.length, 0);
    const saved = snapshot(db);
    assert.equal(importComponentDimensions(db, reference, merge, options).updated, 0);
    assert.equal(snapshot(db), saved);
    assert.deepEqual(db.prepare("SELECT * FROM component_prices").all(), prices);
    assert.deepEqual(db.prepare("SELECT * FROM component_attribute_values WHERE attribute_definition_id<=12").all(), native);
    assert.equal(db.prepare("SELECT numeric_value AS b FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE v.component_id=2 AND a.source_column='CALC_FLANGE_B'").get().b, 18);
    const savedPn16=Object.fromEntries(db.prepare("SELECT a.source_column,v.numeric_value,v.text_value FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE v.component_id=3").all().map(r=>[r.source_column,r.numeric_value??r.text_value]));
    assert.equal(savedPn16.CALC_FLANGE_B,22); assert.equal(savedPn16.CALC_FLANGE_BORE,120);
    assert.equal(savedPn16.CALC_FLANGE_STANDARD,"EN 1092-1:2018, тип 02, PN16");
    const approval = Object.fromEntries(db.prepare("SELECT a.source_column,v.text_value FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE v.component_id=4 AND a.source_column IN ('CALC_FLANGE_MATERIAL_EQUIVALENCE','CALC_FLANGE_MATERIAL_ACCEPTANCE')").all().map(r=>[r.source_column,r.text_value]));
    assert.equal(approval.CALC_FLANGE_MATERIAL_EQUIVALENCE, "AISI304 ↔ 12Х18Н10Т");
    assert.match(approval.CALC_FLANGE_MATERIAL_ACCEPTANCE, /Решение пользователя/);
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
