import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { importCollarDimensions } from "../scripts/import-collar-dimensions.mjs";

const { mergeCollarDimensions: merge, COLLAR_COLUMNS: columns, validateCollarReference } = await loadTs(new URL("../app/component-collar-dimensions.ts", import.meta.url));
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const { insertPartIdentity, generateInsertCalculations } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const reference = JSON.parse(await readFile(new URL("../data/collar-dimensions.json", import.meta.url), "utf8"));
const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const original = structuredClone(source);
for (const item of original.items) item.fields = item.fields.filter(field => !Object.values(columns).includes(field.column));
const field = (item, column) => item.fields.find(field => field.column === column)?.value;
const native = (label, value) => ({ column: `native-${label}`, headerPath: [label], value });

test("drawing transcription distinguishes lip thickness, wall and full height; DN200 inner diameter is not tube OD", async () => {
  const image = await readFile(new URL(`../${reference.image.path}`, import.meta.url));
  assert.equal(createHash("sha256").update(image).digest("hex"), reference.image.sha256);
  assert.equal(reference.rows.length, 13);
  assert.deepEqual(reference.rows.map(r => [r.dn, r.a, r.b, r.c, r.d, r.e]), [
    [10,2,2,9,17.2,40],[15,2,2,9,21.3,45],[20,2,2,12,26.9,58],[25,2,2,15,33.7,68],
    [32,2,2,15,42.4,78],[40,2,2,17,48.3,88],[50,2,2,23,60.3,102],[65,2,2,23,76.1,122],
    [80,3,3,23,88.9,138],[100,3,3,28,114.3,158],[125,3,3,30,139.7,188],[150,3,3,30,168.3,212],[200,null,null,18,null,270],
  ]);
  assert.equal(reference.rows.at(-1).innerDiameterMm, 219.1);
  validateCollarReference(reference);
  for (const patch of [{ c: 0 }, { b: NaN }, { a: 28 }, { e: 100 }]) {
    const bad = structuredClone(reference);
    Object.assign(bad.rows.find(row => row.dn === 100), patch);
    assert.throws(() => validateCollarReference(bad));
  }
});

test("exact eleven physical matches gain dimensions; other walls and DN200 stay pending; PN/prices are preserved", () => {
  const enriched = merge(original, reference), collars = enriched.items.filter(item => item.catalogId === "воротники");
  assert.equal(collars.filter(item => field(item, columns.length) !== undefined).length, 11);
  assert.equal(collars.filter(item => field(item, columns.review) !== undefined).length, 40);
  assert.ok(collars.every(item => field(item, columns.thickness) === 3));
  assert.deepEqual(merge(enriched, reference), enriched);
  for (let i = 0; i < enriched.items.length; i++) {
    assert.deepEqual(enriched.items[i].prices, original.items[i].prices);
    assert.deepEqual(enriched.items[i].fields.filter(f => !Object.values(columns).includes(f.column)), original.items[i].fields);
  }
  const parts = makeInsertCatalog(enriched).parts.filter(part => part.kind === "collar");
  const dn100 = parts.find(part => part.dn === 100 && part.pn === 16);
  assert.equal(dn100.lengthMm, 28); assert.equal(dn100.thicknessMm, 3); assert.equal(dn100.lipOuterDiameterMm, 158);
  assert.equal(dn100.outerDiameter, 114.3); assert.equal(dn100.wallThickness, 3);
  assert.match(dn100.dimensionSources.lengthMm, /NIOB 2079 ISO/);
  assert.equal(dn100.standard, null);
  assert.equal(parts.find(part => part.dn === 100 && part.pn === 10).lengthMm, null);
  for (const dn200 of parts.filter(part => part.dn === 200)) {
    assert.equal(dn200.lengthMm, null); assert.equal(dn200.thicknessMm, 3);
    assert.match(dn200.warnings.join(" "), /внутренний диаметр 219,1|внутренний диаметр 219.1/);
  }
  assert.notEqual(insertPartIdentity(dn100), insertPartIdentity({ ...dn100, lipOuterDiameterMm: 159 }));
});

test("changed workbook, explicit dimensions, name or material cannot inherit drawing dimensions; native values survive", () => {
  const enriched = merge(original, reference);
  const id = enriched.items.find(item => field(item, columns.length) === 28).id;
  for (const modify of [
    data => { data.source.sha256 = "changed"; },
    data => { data.items.find(item => item.id === id).fields.push(native("Диаметр, мм", 108)); },
    data => { data.items.find(item => item.id === id).fields.push(native("Толщина, мм", 2)); },
    data => { data.items.find(item => item.id === id).fields.find(f => f.headerPath.at(-1) === "Наименование").value = "Воротник DN100 (114,3 x 2,0 мм)"; },
  ]) {
    const tampered = structuredClone(enriched); modify(tampered);
    const part = makeInsertCatalog(tampered).parts.find(part => part.id === id);
    assert.equal(part.lengthMm, null); assert.equal(part.thicknessMm, tampered.source.sha256 === reference.sourceSha256 ? 3 : null); assert.equal(part.lipOuterDiameterMm, null);
    assert.match(part.warnings.join(" "), /устарели/);
  }
  const material = structuredClone(original); material.items.find(item => item.id === id).family = "Воротник Сталь 20";
  assert.equal(field(merge(material, reference).items.find(item => item.id === id), columns.length), undefined);
  const manual = structuredClone(enriched), item = manual.items.find(item => item.id === id);
  item.fields.push(native("Длина, мм", 42));
  const result = merge(manual, reference).items.find(item => item.id === id);
  assert.equal(field(result, columns.length), undefined);
  assert.equal(field(result, "native-Длина, мм"), 42);
  assert.match(field(result, columns.review), /другого источника/);
});

test("collar height c enters chosen zero-insertion geometry separately from lip thickness and stays auditable", () => {
  const catalog = makeInsertCatalog(merge(original, reference));
  const collar = catalog.parts.find(part => part.kind === "collar" && part.dn === 100 && part.pn === 16);
  // Explicit fixture bolt/pipe isolates geometry from missing production stainless bolt-stack data.
  catalog.parts = [collar, { ...collar, id: "fixture-pipe", kind: "pipe", name: "fixture pipe", dnSmall: 100, outerDiameterSmall: 114.3, wallThicknessSmall: 3, lengthMm: null, thicknessMm: null, lipOuterDiameterMm: null, price: 1000 }];
  catalog.engineering.straightLength = { model: "fixture", basis: "standard-bolt", source: "test fixture only" };
  catalog.engineering.boltReferences = [{ model: "fixture", material: "aisi304", dn: 100, pn: 16, threadDiameterMm: 16, minimumLengthMm: 120, standardLengthMm: 130, componentId: "fixture-bolt", source: "test fixture" }];
  catalog.standardBolts = [{ id: "fixture-bolt", diameterMm: 16, lengthMm: 130, source: "test fixture" }];
  catalog.engineering.connectionPairs = [{ left: "collar", right: "collar", source: "test fixture" }];
  const [row] = generateInsertCalculations({ dnFrom: 100, dnTo: 100, materials: ["aisi304"], withSensorNipple: false, includeEccentric: false, seating: { collar: { mode: "insertion-depth", valueMm: 0 } } }, catalog);
  assert.equal(row.baseLengthMm, 130); assert.equal(row.totalLengthMm, 186);
  assert.equal(row.configuration.axialLeftMm, 28); assert.equal(row.configuration.axialRightMm, 28);
  assert.ok(row.dimensions.some(dimension => dimension.name.includes("(c)") && dimension.value === 28 && dimension.source.includes("NIOB")));
  assert.ok(row.dimensions.some(dimension => dimension.name.includes("(e)") && dimension.value === 158));
  assert.ok(!row.bom.some(item => item.kind === "looseFlange"));
});

const schema = await readFile(new URL("../drizzle/0000_burly_jackpot.sql", import.meta.url), "utf8");
const revisions = await readFile(new URL("../drizzle/0009_component_source_revision.sql", import.meta.url), "utf8");
function fixtureDb() {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys=ON"); db.exec(schema); db.exec(revisions);
  db.prepare("INSERT INTO catalog_imports(id,source_file,source_sha256,source_size_bytes,source_modified_at) VALUES(1,'fixture',?,1,'fixture')").run(reference.sourceSha256);
  db.exec("INSERT INTO component_catalogs(id,import_id,source_id,name,source_sheet) VALUES(1,1,'воротники','Воротники','Воротники')");
  db.exec("INSERT INTO component_families(id,catalog_id,source_id,title,source_range) VALUES(1,1,'fixture-family','Воротник AISI304','B1:J3')");
  let attrId = 0;
  for (const [componentId, wall] of [[1, 3], [2, 2]]) {
    db.prepare("INSERT INTO components(id,family_id,source_id,source_row) VALUES(?,1,?,?)").run(componentId, `fixture-${componentId}`, componentId);
    db.prepare("INSERT INTO component_prices(component_id,label,amount_microunits,source_column) VALUES(?,'Цена',123456000,'E')").run(componentId);
    for (const [column, label, value] of [["B", "DN", "DN100"], ["C", "Наименование", `Воротник DN100 (114,3 x ${wall},0 мм)`], ["D", "Давление", "PN16"]]) {
      let attr = db.prepare("SELECT id FROM attribute_definitions WHERE family_id=1 AND source_column=?").get(column);
      if (!attr) {
        db.prepare("INSERT INTO attribute_definitions(id,family_id,source_column,key,label,header_path_json,data_type) VALUES(?,1,?,?,?,?,'text')").run(++attrId, column, column, label, JSON.stringify([label]));
        attr = { id: attrId };
      }
      db.prepare("INSERT INTO component_attribute_values(component_id,attribute_definition_id,value_type,text_value) VALUES(?,?,'text',?)").run(componentId, attr.id, value);
    }
  }
  return db;
}
const revision = db => db.prepare("SELECT revision FROM component_calculator_source_revision WHERE id=1").get().revision;
const fields = db => db.prepare("SELECT * FROM component_attribute_values ORDER BY component_id,attribute_definition_id").all();
test("D1 import is atomic, idempotent and preserves prices/PN; refreshed reads retain the exact confirmed dimensions", () => {
  const db = fixtureDb();
  try {
    const beforePrices = db.prepare("SELECT * FROM component_prices").all(), before = fields(db), firstRevision = revision(db);
    const result = importCollarDimensions(db, reference, merge);
    assert.equal(result.confirmed, 1); assert.equal(result.updated, 2); assert.equal(result.pending.length, 1);
    assert.ok(revision(db) > firstRevision);
    const saved = fields(db), savedRevision = revision(db);
    assert.equal(importCollarDimensions(db, reference, merge).updated, 0);
    assert.deepEqual(fields(db), saved); assert.equal(revision(db), savedRevision);
    assert.deepEqual(db.prepare("SELECT * FROM component_prices").all(), beforePrices);
    assert.deepEqual(fields(db).filter(row => row.attribute_definition_id <= 3), before);
    const dims = db.prepare("SELECT a.source_column AS col,v.numeric_value AS value FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE v.component_id=1 AND a.source_column IN ('CALC_COLLAR_C','CALC_COLLAR_A','CALC_COLLAR_E')").all();
    assert.deepEqual(Object.fromEntries(dims.map(row => [row.col, row.value])), { CALC_COLLAR_C: 28, CALC_COLLAR_A: 3, CALC_COLLAR_E: 158 });
    assert.throws(() => importCollarDimensions(db, { ...reference, sourceSha256: "different" }, merge), /workbook/);
    assert.deepEqual(fields(db), saved);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally { db.close(); }
});

test("failure during a later collar write rolls back dimensions, definitions and revision", () => {
  const db = fixtureDb();
  try {
    const before = fields(db), oldRevision = revision(db), definitions = db.prepare("SELECT * FROM attribute_definitions").all();
    db.exec("CREATE TRIGGER test_failure BEFORE INSERT ON component_attribute_values WHEN NEW.component_id=2 BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
    assert.throws(() => importCollarDimensions(db, reference, merge), /fixture failure/);
    assert.deepEqual(fields(db), before); assert.equal(revision(db), oldRevision);
    assert.deepEqual(db.prepare("SELECT * FROM attribute_definitions").all(), definitions);
  } finally { db.close(); }
});
