import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { loadTs } from "./load-ts.mjs";
import { importComponentDimensions } from "../scripts/import-collar-dimensions.mjs";
import { cadImportOptions, verifyCadModelSources } from "../scripts/import-cad-dimensions.mjs";

const reference = JSON.parse(await readFile(new URL("../data/component-cad-dimensions.json", import.meta.url), "utf8"));
const source = JSON.parse(await readFile(new URL("../public/component-insert-source.json", import.meta.url), "utf8"));
const { mergeCadDimensions, readCadDimensions, CAD_COLUMNS } = await loadTs(new URL("../app/component-cad-dimensions.ts", import.meta.url));
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const { generateInsertCalculations } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const sourceItem = id => source.items.find(item => item.id === id);

test("exact concentric executions receive sourced CAD neck lengths; native values and prices are preserved", () => {
  const data = mergeCadDimensions(source, reference), catalog = makeInsertCatalog(data);
  assert.deepEqual(mergeCadDimensions(data, reference), data);
  assert.equal(reference.rows.length, 8);
  for (const row of reference.rows) {
    const original = sourceItem(row.componentId), enriched = data.items.find(item => item.id === row.componentId);
    assert.deepEqual(enriched.prices, original.prices);
    assert.deepEqual(enriched.fields.filter(f => !f.column.startsWith("CALC_CAD_")), original.fields.filter(f => !f.column.startsWith("CALC_CAD_")));
    const part = catalog.parts.find(part => part.id === row.componentId);
    for (const key of Object.keys(row.dimensions)) {
      assert.equal(part[key], row.dimensions[key]);
      assert.ok(part.dimensionSources[key].includes(row.modelSha256));
    }
    assert.equal(part.geometry, "concentric");
  }
  assert.ok(catalog.parts.filter(part => part.kind === "reducer" && part.geometry === "eccentric").every(part => part.cylindricalLengthLargeMm === null));
});

test("changed workbook, material, geometry, PN or physical dimensions invalidate saved CAD instead of reusing nominal DN", () => {
  for (const mutate of [
    data => { data.source.sha256 = "different"; },
    data => { data.items[0].family = "Переходы эксцентрические нержавеющие, AISI304"; },
    data => { data.items[0].family = "Переходы концентрические Сталь 20"; },
    ...["B", "C", "D", "E", "F", "G", "H"].map(column => data => { data.items[0].fields.find(f => f.column === column).value = 999; }),
  ]) {
    const data = mergeCadDimensions({ ...source, items: [sourceItem(reference.rows[0].componentId)] }, reference);
    mutate(data);
    const result = readCadDimensions(data.items[0], data.source.sha256, reference);
    assert.deepEqual(result.dimensions, {});
    assert.match(result.warnings.join(), /устарела/);
    const part = makeInsertCatalog(data).parts.find(part => part.kind === "reducer");
    if (part) { assert.equal(part.cylindricalLengthLargeMm, null); assert.equal(part.cylindricalLengthSmallMm, null); }
  }
});

test("tampered saved neck or conflicting native length remains incomplete; source dimensions are not overwritten", () => {
  const id = reference.rows[0].componentId;
  const changed = mergeCadDimensions({ ...source, items: [sourceItem(id)] }, reference);
  changed.items[0].fields.find(f => f.column === CAD_COLUMNS.cylindricalLengthLargeMm).value = 999;
  const part = makeInsertCatalog(changed).parts.find(part => part.id === id);
  assert.equal(part.cylindricalLengthLargeMm, null);
  assert.match(part.warnings.join(), /отсутствует или изменён/);
  const conflicting = structuredClone(changed);
  conflicting.items[0].fields.push({ column: "TEST_LENGTH", headerPath: ["Длина перехода, мм"], value: 999 });
  const enriched = mergeCadDimensions(conflicting, reference);
  assert.equal(enriched.items[0].fields.find(f => f.column === "TEST_LENGTH").value, 999);
  assert.ok(!enriched.items[0].fields.some(f => f.column === CAD_COLUMNS.cylindricalLengthLargeMm));
  assert.match(readCadDimensions(enriched.items[0], source.source.sha256, reference).warnings.join(), /противоречит/);
});

test("without the adopted assembly policy real CAD necks enforce flange insertion depth and never add a pipe", () => {
  const catalog = makeInsertCatalog(mergeCadDimensions(source, reference));
  delete catalog.engineering.reducerReadyBoreSeating;
  // Hypothetical test-only mating flanges isolate the geometric seating rule
  // from supplier data and individually approved production assemblies.
  const template = catalog.parts.find(part => part.kind === "weldFlange" && part.material === "st20");
  catalog.parts = catalog.parts.filter(part => part.kind !== "weldFlange");
  for (const dn of [32, 40, 50, 65, 100, 125]) catalog.parts.push({ ...template, id: `test-flange-${dn}`, name: `TEST ONLY DN${dn}`, dn, pn: 10, thicknessMm: 30, boreDiameterMm: 200, warnings: [], dimensionSources: { thicknessMm: "TEST FIXTURE ONLY", boreDiameterMm: "TEST FIXTURE ONLY" } });
  const rows = generateInsertCalculations({ dnFrom: 50, dnTo: 125, materials: ["st20"], includeEccentric: false, withSensorNipple: false }, catalog);
  const measured = rows.filter(row => reference.rows.some(ref => row.bom.some(item => item.kind === "reducer" && item.componentId === ref.componentId)) && (row.leftConnection === "flanged" || row.rightConnection === "flanged"));
  assert.ok(measured.length);
  assert.ok(measured.some(row => row.warnings.some(w => /превышает подтверждённую длину цилиндрического участка/.test(w))));
  for (const row of measured) {
    const ref = reference.rows.find(ref => row.bom.some(item => item.kind === "reducer" && item.componentId === ref.componentId));
    assert.equal(row.baseLengthMm, ref.dimensions.lengthMm);
    assert.ok(!row.bom.some(item => item.kind === "pipe"));
    assert.ok(row.dimensions.some(d => d.name.includes("цилиндрического участка") && d.source.includes(ref.modelSha256)));
    if (row.warnings.some(w => w.includes("превышает подтверждённую длину"))) { assert.equal(row.complete, false); assert.equal(row.price, null); }
  }
});

const schema = await readFile(new URL("../drizzle/0000_burly_jackpot.sql", import.meta.url), "utf8");
const revisions = await readFile(new URL("../drizzle/0009_component_source_revision.sql", import.meta.url), "utf8");
function fixtureDb() {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys=ON"); db.exec(schema); db.exec(revisions);
  db.prepare("INSERT INTO catalog_imports(id,source_file,source_sha256,source_size_bytes,source_modified_at) VALUES(1,'fixture',?,1,'fixture')").run(reference.sourceSha256);
  db.exec("INSERT INTO component_catalogs(id,import_id,source_id,name,source_sheet) VALUES(1,1,'переходы','Переходы','Переходы')");
  const families = new Map();
  for (const [index, ref] of reference.rows.entries()) {
    const id = index + 1;
    if (!families.has(ref.tableId)) {
      const result = db.prepare("INSERT INTO component_families(catalog_id,source_id,title,source_range) VALUES(1,?,?,'B1:J3')").run(ref.tableId, ref.family);
      families.set(ref.tableId, result.lastInsertRowid);
    }
    const familyId = families.get(ref.tableId);
    db.prepare("INSERT INTO components(id,family_id,source_id,source_row) VALUES(?,?,?,?)").run(id, familyId, ref.componentId, sourceItem(ref.componentId).sourceRow);
    db.prepare("INSERT INTO component_prices(component_id,label,amount_microunits,source_column) VALUES(?,'Цена',123456000,'I')").run(id);
    for (const field of ref.matchFields) {
      let attr = db.prepare("SELECT id FROM attribute_definitions WHERE family_id=? AND source_column=?").get(familyId, field.column);
      if (!attr) {
        const result = db.prepare("INSERT INTO attribute_definitions(family_id,source_column,key,label,header_path_json,data_type) VALUES(?,?,?,?,?,?)").run(familyId, field.column, field.column, field.label, JSON.stringify([field.label]), typeof field.value === "number" ? "number" : "text");
        attr = { id: result.lastInsertRowid };
      }
      db.prepare("INSERT INTO component_attribute_values(component_id,attribute_definition_id,value_type,numeric_value,text_value) VALUES(?,?,?,?,?)").run(id, attr.id, typeof field.value === "number" ? "number" : "text", typeof field.value === "number" ? field.value : null, typeof field.value === "string" ? field.value : null);
    }
  }
  return db;
}
const snapshot = db => JSON.stringify(["component_attribute_values", "attribute_definitions", "component_prices", "component_calculator_source_revision"].map(table => db.prepare(`SELECT * FROM ${table}`).all()));
test("CAD import updates both material families atomically, preserves native data/prices and is idempotent", () => {
  const db = fixtureDb();
  try {
    const prices = db.prepare("SELECT * FROM component_prices").all();
    const native = db.prepare("SELECT * FROM component_attribute_values ORDER BY id").all();
    const first = importComponentDimensions(db, reference, mergeCadDimensions, cadImportOptions);
    assert.equal(first.updated, 8); assert.equal(first.confirmed, 8); assert.deepEqual(first.pending, []);
    const saved = snapshot(db);
    assert.equal(importComponentDimensions(db, reference, mergeCadDimensions, cadImportOptions).updated, 0);
    assert.equal(snapshot(db), saved);
    assert.deepEqual(db.prepare("SELECT * FROM component_prices").all(), prices);
    assert.deepEqual(db.prepare("SELECT * FROM component_attribute_values ORDER BY id").all().filter(v => native.some(n => n.id === v.id)), native);
    assert.throws(() => importComponentDimensions(db, { ...reference, sourceSha256: "changed" }, mergeCadDimensions, cadImportOptions), /workbook/);
    assert.equal(snapshot(db), saved);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
});
test("CAD transaction rolls back all dimensions and revision after a failed write", () => {
  const db = fixtureDb();
  try {
    const before = snapshot(db);
    db.exec("CREATE TRIGGER fail_test BEFORE INSERT ON component_attribute_values WHEN NEW.component_id=2 BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
    assert.throws(() => importComponentDimensions(db, reference, mergeCadDimensions, cadImportOptions), /fixture failure/);
    assert.equal(snapshot(db), before);
  } finally { db.close(); }
});
test("a changed source model is refused before database writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "insert-cad-test-"));
  try {
    await mkdir(join(root, "Equipment"));
    await writeFile(join(root, "Equipment", "fixture.step"), "original");
    const fixture = { rows: [{ modelPath: "Equipment/fixture.step", modelSha256: createHash("sha256").update("original").digest("hex") }] };
    await verifyCadModelSources(fixture, root);
    await writeFile(join(root, "Equipment", "fixture.step"), "modified");
    await assert.rejects(verifyCadModelSources(fixture, root), /CAD model changed/);
  } finally { await rm(root, { recursive: true }); }
});
