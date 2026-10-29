globalThis.__PSC_RELEASE_PROFILE__ = "full";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { mergePipePainting, paintingPrice } from "../scripts/pipe-painting-supplement.mjs";
import { importPipePainting } from "../scripts/import-pipe-painting.mjs";
import { loadTs } from "./load-ts.mjs";

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const binding = await read("../public/binding-components.json"), reference = await read("../data/pipe-painting-prices.json");
const { readInsertPaintingRates } = await loadTs(new URL("../app/component-painting.ts", import.meta.url));
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const { generateInsertCalculations } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const input = { dnFrom: 100, dnTo: 100, materials: ["st20"], withSensorNipple: false, includeEccentric: false };

test("painting retains the workbook's actual prices, estimates missing diameters once with 15 percent reserve", () => {
  assert.equal(reference.rows.length, 27);
  for (const row of reference.rows) {
    const rate = paintingPrice(row.diameterMm, reference);
    assert.equal(rate.price, row.pricePerMeter); assert.equal(rate.reservePercent, 0);
  }
  // Source B15 is 800, not the pre-rounding 775 mentioned in the workbook's note.
  assert.equal(paintingPrice(108, reference).price, 800);
  for (const [diameter, price] of [[426, 7960], [530, 10820], [630, 13570], [720, 16045], [820, 18795]]) {
    const rate = paintingPrice(diameter, reference);
    assert.equal(rate.price, price); assert.equal(rate.reservePercent, 15); assert.equal(rate.method, "Экстраполяция");
    assert.deepEqual(rate.anchors.map(row => row.diameterMm), [377, 400]);
  }
  assert.equal(paintingPrice(200, reference).price, Math.round((1950 + 6 * 400 / 25) * 1.15 * 100) / 100);
  assert.equal(paintingPrice(200, reference).method, "Интерполяция");
  assert.throws(() => paintingPrice(426, { ...reference, rows: [...reference.rows, reference.rows[0]] }));
});

test("DN mapping covers every St20 pipe once across PN, records small-size aliases and preserves unrelated rows", async () => {
  const result = mergePipePainting(binding, reference), rates = readInsertPaintingRates(result);
  assert.equal(rates.length, 20); assert.ok(rates.every(row => row.pricePerMeter > 0 && !row.warnings.length));
  assert.equal(rates.find(row => row.dn === 20).pricePerMeter, 300);
  assert.match(rates.find(row => row.dn === 20).source, /26.9.*26.8/);
  assert.equal(rates.find(row => row.dn === 100).pricePerMeter, 800);
  assert.equal(rates.find(row => row.dn === 400).pricePerMeter, 7960);
  assert.deepEqual(result.items.filter(row => row.tableId !== reference.id), binding.items.filter(row => row.tableId !== reference.id));
  assert.deepEqual(mergePipePainting(result, reference), result);
  assert.deepEqual(readInsertPaintingRates(await read("../public/component-insert-source.json")), rates);
  const ambiguous = structuredClone(binding), pipe = structuredClone(binding.items.find(row => row.id === "трубы-001-r0005"));
  pipe.id = "ambiguous-pipe"; pipe.fields.find(field => field.headerPath.at(-1) === "Диаметр, мм").value = 22;
  ambiguous.items.push(pipe); assert.throws(() => mergePipePainting(ambiguous, reference), /Ambiguous.*DN15/);
});

test("actual DN100 St20 insert paints its base length, records the service in BOM and does not change geometry or welds", () => {
  const catalog = makeInsertCatalog(binding);
  const row = generateInsertCalculations(input, catalog).find(row => row.geometry === "straight" && row.pn === 16);
  assert.equal(row.complete, true, row.warnings.join("; "));
  const painting = row.bom.find(item => item.kind === "painting");
  assert.equal(row.baseLengthMm, 223.5); assert.equal(row.totalLengthMm, 233.5);
  assert.equal(painting.quantity, 0.2235); assert.equal(painting.unitPrice, 800); assert.equal(painting.cost, 178.8);
  assert.equal(row.price, row.bom.reduce((sum, item) => sum + item.cost, 0));
  const changed = structuredClone(catalog); changed.paintingRates.find(rate => rate.dn === 100).pricePerMeter += 100;
  const next = generateInsertCalculations(input, changed).find(next => next.identityKey === row.identityKey);
  assert.equal(next.identityKey, row.identityKey); assert.deepEqual(next.welds, row.welds);
  assert.ok(Math.abs(next.price - row.price - 22.35) < 1e-8);
  assert.ok(generateInsertCalculations({ ...input, materials: ["aisi304"] }, catalog).every(row => row.bom.every(item => item.kind !== "painting")));
});

test("absent, ambiguous, wrongly dimensioned or unpriced painting cannot produce an exportable price", () => {
  for (const mutate of [
    data => { data.items = data.items.filter(row => row.tableId !== reference.id); },
    data => { data.items.push({ ...data.items.find(row => row.id === `${reference.id}:dn100`), id: "duplicate-painting" }); },
    data => { data.items.find(row => row.id === `${reference.id}:dn100`).prices = []; },
    data => { data.items.find(row => row.id === `${reference.id}:dn100`).fields.find(field => field.column === "PRICE_UNIT").value = "шт."; },
  ]) {
    const data = structuredClone(binding); mutate(data);
    const row = generateInsertCalculations(input, makeInsertCatalog(data)).find(row => row.geometry === "straight" && row.pn === 16);
    assert.equal(row.complete, false); assert.equal(row.price, null); assert.ok(row.warnings.some(warning => /окраски/.test(warning)));
  }
});

test("painting import persists and updates atomically without duplicates or changes to existing component prices", async () => {
  const directory = await mkdtemp(join(tmpdir(), "painting-db-")), path = join(directory, "test.sqlite");
  let db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA foreign_keys=ON");
    const migrations = new URL("../drizzle/", import.meta.url);
    for (const filename of (await readdir(migrations)).filter(name => name.endsWith(".sql")).sort()) db.exec(await readFile(new URL(filename, migrations), "utf8"));
    db.prepare("INSERT INTO catalog_imports(id,source_file,source_sha256,source_size_bytes,source_modified_at) VALUES (1,'fixture',?,1,'fixture')").run("a".repeat(64));
    db.exec(`INSERT INTO component_catalogs(id,import_id,source_id,name,source_sheet) VALUES (1,1,'трубы','Трубы','Трубы');
      INSERT INTO component_families(id,catalog_id,source_id,title,source_range) VALUES (1,1,'pipes','Трубы Сталь 20','A1:B3');`);
    for (const [index, [dn, diameter]] of [[100, 108], [400, 426], [500, 530]].entries()) {
      const id = index + 1;
      db.prepare("INSERT INTO components(id,family_id,source_id,source_row,display_name) VALUES (?,1,?,?,'fixture-pipe')").run(id, `pipe-${dn}`, id);
      for (const [column, label, value] of [["DN", "DN", dn], ["OD", "Диаметр, мм", diameter]]) {
        db.prepare("INSERT OR IGNORE INTO attribute_definitions(family_id,source_column,key,label,header_path_json,data_type) VALUES (1,?,?,?,?, 'number')").run(column, column, label, JSON.stringify([label]));
        const definition = db.prepare("SELECT id FROM attribute_definitions WHERE source_column=?").get(column).id;
        db.prepare("INSERT INTO component_attribute_values(component_id,attribute_definition_id,value_type,numeric_value) VALUES (?,?,'number',?)").run(id, definition, value);
      }
      db.prepare("INSERT INTO component_prices(component_id,label,amount_microunits,source_column) VALUES (?,'Цена, ₽/м',123000000,'PRICE')").run(id);
    }
    const existingPrices = db.prepare("SELECT * FROM component_prices WHERE component_id<=3").all();
    assert.deepEqual(importPipePainting(db, binding, reference), { created: 3, updated: 0, unchanged: 0, deactivated: 0 });
    const revision = () => db.prepare("SELECT revision FROM component_calculator_source_revision WHERE id=1").get().revision;
    const before = revision();
    assert.deepEqual(importPipePainting(db, binding, reference), { created: 0, updated: 0, unchanged: 3, deactivated: 0 });
    assert.equal(revision(), before);
    db.close(); db = new DatabaseSync(path); db.exec("PRAGMA foreign_keys=ON");
    const rates = () => db.prepare("SELECT c.source_id,p.amount_microunits FROM component_prices p JOIN components c ON c.id=p.component_id WHERE c.source_id LIKE 'pipe-painting-%' ORDER BY c.source_id").all();
    assert.deepEqual(rates().map(row => row.amount_microunits / 1e6), [800, 7960, 10820]);
    class Statement {
      constructor(sql, values = []) { this.sql = sql; this.values = values; }
      bind(...values) { return new Statement(this.sql, values); }
      async first() { return db.prepare(this.sql).get(...this.values) ?? null; }
      async all() { return { success: true, results: db.prepare(this.sql).all(...this.values) }; }
    }
    globalThis.__paintingSourceDb = { prepare: sql => new Statement(sql) };
    const loader = await loadTs(new URL("../app/component-insert-catalog-server.ts", import.meta.url), {
      [new URL("../app/auth-server.ts", import.meta.url).href]: 'import { createHash } from "node:crypto"; export const db=()=>globalThis.__paintingSourceDb; export const sha256=async value=>createHash("sha256").update(value).digest("hex");',
    });
    const initialCatalog = await loader.currentInsertCatalog();
    assert.equal(initialCatalog.paintingRates.find(rate => rate.dn === 100).pricePerMeter, 800);
    const changed = structuredClone(reference); changed.rows.find(row => row.diameterMm === 108).pricePerMeter = 900;
    assert.equal(importPipePainting(db, binding, changed).updated, 1); assert.ok(revision() > before);
    assert.equal(rates()[0].amount_microunits, 900e6);
    const currentCatalog = await loader.currentInsertCatalog();
    assert.notEqual(currentCatalog.version, initialCatalog.version);
    assert.equal(currentCatalog.paintingRates.find(rate => rate.dn === 100).pricePerMeter, 900);
    assert.deepEqual(db.prepare("SELECT * FROM component_prices WHERE component_id<=3").all(), existingPrices);
    const previous = rates(), previousRevision = revision();
    db.exec("CREATE TRIGGER fail_painting BEFORE INSERT ON component_prices WHEN NEW.amount_microunits>10000000000 BEGIN SELECT RAISE(ABORT,'painting fixture failure'); END");
    changed.rows.find(row => row.diameterMm === 108).pricePerMeter = 1000;
    changed.rows.find(row => row.diameterMm === 400).pricePerMeter = 6400;
    assert.throws(() => importPipePainting(db, binding, changed), /painting fixture failure/);
    assert.deepEqual(rates(), previous); assert.equal(revision(), previousRevision);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); assert.equal(dirname(resolve(directory)), resolve(tmpdir())); await rm(directory, { recursive: true, force: true }); }
});
