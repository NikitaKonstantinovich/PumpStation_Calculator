globalThis.__PSC_RELEASE_PROFILE__ = "full";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const binding = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const { makeCollectorCatalog } = await loadTs(new URL("../app/collector-catalog.ts", import.meta.url));
const { calculateCollector, collectorCode } = await loadTs(new URL("../app/collector-calculations.ts", import.meta.url));
const configuration = { type: "discharge", dn: 100, pn: 16, material: "st20", connection: "flanged", eccentric: false, stationType: "utility", simultaneous: false, jockey: false,
  primary: { flow: 60, working: 2, reserve: 1, dn: 80, connection: "flanged", spacing: 500, pn: 16 }, secondary: null };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test("collector catalogue shares painting tariffs with inserts, including the single 15 percent reserve", () => {
  const catalog = makeCollectorCatalog(binding);
  assert.equal(catalog.paintingRates.length, 20);
  const result = calculateCollector(configuration, catalog);
  assert.equal(result.complete, true, result.warnings.join("; "));
  near(result.bom.find(item => item.role === "painting-collector").cost, 1200);
  near(result.bom.find(item => item.role === "painting-branch1").cost, 3 * 0.186 * 650);
  const large = calculateCollector({ ...configuration, dn: 400 }, catalog);
  const painting = large.bom.find(item => item.role === "painting-collector");
  assert.equal(painting.unitPrice, 7960); near(painting.cost, 1.5 * 7960);
  assert.match(painting.source, /Экстраполяция/);
  assert.match(painting.source, /15\/100/);
});

test("server persists painting, refreshes from D1 prices, rejects missing tariffs and rolls back failed composition updates", async t => {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => { delete globalThis.__collectorPaintingTest; sqlite.close(); });
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const file of ["0000_burly_jackpot.sql", "0001_organic_lady_bullseye.sql", "0002_control_cabinet_configurator.sql", "0003_control_cabinet_item_groups.sql", "0004_smart_power_ranges.sql", "0005_collectors.sql"]) sqlite.exec(await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
  sqlite.exec("INSERT INTO users (id,email,name,password_hash) VALUES ('test','painting@example.invalid','Test','unused')");
  sqlite.prepare("INSERT INTO catalog_imports(id,source_file,source_sha256,source_size_bytes,source_modified_at) VALUES(1,'fixture',?,1,'fixture')").run(binding.source.sha256);
  // Real source rows for the required DN; supplied bolt/sgon references retain their workbook SHA.
  for (const row of binding.items.filter(item => ["трубы", "фланцы", "сгоны-резьба", "заглушки", "работы"].includes(item.catalogId)
    && [15, 20, 80, 100].includes(Number(String(item.fields.find(field => field.headerPath.at(-1) === "DN")?.value).replace(/^DN/, ""))) || item.catalogId === "метизы")) {
    sqlite.prepare("INSERT OR IGNORE INTO component_catalogs(import_id,source_id,name,source_sheet) VALUES(1,?,?,?)").run(row.catalogId, row.catalogId, row.sourceSheet);
    const catalogId = sqlite.prepare("SELECT id FROM component_catalogs WHERE source_id=?").get(row.catalogId).id;
    sqlite.prepare("INSERT OR IGNORE INTO component_families(catalog_id,source_id,title,source_range) VALUES(?,?,?,'fixture')").run(catalogId, row.tableId, row.family);
    const familyId = sqlite.prepare("SELECT id FROM component_families WHERE catalog_id=? AND source_id=?").get(catalogId, row.tableId).id;
    const componentId = Number(sqlite.prepare("INSERT INTO components(family_id,source_id,source_row) VALUES(?,?,?)").run(familyId, row.id, row.sourceRow).lastInsertRowid);
    for (const field of row.fields) {
      const numeric = typeof field.value === "number", type = numeric ? "number" : "text";
      sqlite.prepare("INSERT OR IGNORE INTO attribute_definitions(family_id,source_column,key,label,header_path_json,data_type) VALUES(?,?,?,?,?,?)").run(familyId, field.column, field.column, field.headerPath.at(-1) ?? field.column, JSON.stringify(field.headerPath), type);
      const definitionId = sqlite.prepare("SELECT id FROM attribute_definitions WHERE family_id=? AND source_column=?").get(familyId, field.column).id;
      sqlite.prepare("INSERT INTO component_attribute_values(component_id,attribute_definition_id,value_type,numeric_value,text_value) VALUES(?,?,?,?,?)").run(componentId, definitionId, type, numeric ? field.value : null, numeric || field.value == null ? null : String(field.value));
    }
    for (const price of row.prices) sqlite.prepare("INSERT INTO component_prices(component_id,label,amount_microunits,currency,source_column) VALUES(?,?,?,?,?)").run(componentId, price.label, Math.round(price.amount * 1e6), price.currency, price.sourceColumn);
  }
  class Statement {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...args) { return new Statement(this.sql, args); }
    async first() { return sqlite.prepare(this.sql).get(...this.args) ?? null; }
    async all() { return { success: true, results: sqlite.prepare(this.sql).all(...this.args) }; }
    async run() { sqlite.prepare(this.sql).run(...this.args); return { success: true }; }
  }
  const database = { prepare: sql => new Statement(sql), async batch(statements) {
    sqlite.exec("BEGIN");
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("COMMIT"); return results; }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  } };
  globalThis.__collectorPaintingTest = { database };
  const api = await loadTs(new URL("../app/api/collectors/route.ts", import.meta.url), {
    [new URL("../app/auth-server.ts", import.meta.url).href]: 'export const db=()=>globalThis.__collectorPaintingTest.database; export const currentUser=async()=>({id:"test",role:"pro"}); export const json=(body,status=200,headers)=>Response.json(body,{status,headers});',
  });
  const code = collectorCode(configuration);
  const send = (action, extra = {}) => api.POST(new Request("http://local/api/collectors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, configuration, code, ...extra }) }));
  const live = async () => (await (await api.GET(new Request("http://local/api/collectors?catalog=1"))).json()).catalog;
  const initial = await live();
  assert.equal(initial.paintingRates.find(rate => rate.dn === 80).pricePerMeter, 650);
  const created = await send("create", { price: 1, bom: [], paintingRates: [] });
  assert.equal(created.status, 201, JSON.stringify(await created.clone().json()));
  const saved = (await created.json()).collector;
  assert.equal(saved.calculation.branchLengthsMm[0], 186);
  assert.equal(saved.calculation.branchBoltReferences[0].length, 120);
  assert.equal(saved.calculation.branchBoltReferences[0].model, "017W");
  const painted = () => sqlite.prepare("SELECT * FROM collector_items WHERE collector_id=? AND kind='painting' ORDER BY role").all(saved.id);
  assert.equal(painted().length, 2);
  near(painted().reduce((sum, row) => sum + row.cost_microunits / 1e6, 0), 1562.7);
  const paintId = sqlite.prepare("SELECT id FROM components WHERE source_id='pipe-painting-st20-v1:dn80'").get().id;
  sqlite.prepare("UPDATE component_prices SET amount_microunits=900000000 WHERE component_id=?").run(paintId);
  const changed = await live(); assert.notEqual(changed.version, initial.version);
  assert.equal(changed.paintingRates.find(rate => rate.dn === 80).pricePerMeter, 900);
  const refresh = await send("refresh"); assert.equal(refresh.status, 200);
  const updated = (await refresh.json()).collector;
  assert.equal(updated.id, saved.id); near(updated.price - saved.price, 0.558 * (900 - 650));
  assert.equal(painted().length, 2); assert.equal(painted().find(row => row.role === "painting-branch1").unit_price_microunits, 900e6);
  const reloaded = (await (await api.GET(new Request(`http://local/api/collectors?code=${encodeURIComponent(code)}`))).json()).collector;
  assert.deepEqual(reloaded.calculation.bom, updated.calculation.bom);
  assert.equal((await send("refresh")).status, 200);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM collectors").get().n, 1); assert.equal(painted().length, 2);
  // Changing live hardware must change length, pipe and painting on the same saved collector.
  const shortBolts = binding.items.filter(item => item.catalogId === "метизы" && item.fields.some(field => field.headerPath.at(-1) === "Наименование" && /^Болт М16х/.test(String(field.value))) && item.fields.some(field => field.headerPath.at(-1) === "Длина болта, мм" && Number(field.value) < 130));
  for (const bolt of shortBolts) sqlite.prepare("UPDATE components SET is_active=0 WHERE source_id=?").run(bolt.id);
  assert.notEqual((await live()).version, changed.version);
  const lengthRefresh = await send("refresh"); assert.equal(lengthRefresh.status, 200);
  const longer = (await lengthRefresh.json()).collector;
  assert.equal(longer.id, saved.id); assert.equal(longer.calculation.branchLengthsMm[0], 197);
  assert.equal(longer.calculation.branchBoltReferences[0].length, 130);
  near(longer.calculation.bom.find(row => row.role === "painting-branch1").quantity, .591);
  assert.ok(longer.price > updated.price);
  const before = sqlite.prepare("SELECT * FROM collectors").all(), beforeItems = sqlite.prepare("SELECT * FROM collector_items").all();
  sqlite.prepare("UPDATE component_prices SET amount_microunits=1000000000 WHERE component_id=?").run(paintId);
  sqlite.exec("CREATE TRIGGER fail_paint BEFORE INSERT ON collector_items WHEN NEW.kind='painting' BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  const error = t.mock.method(console, "error", () => {});
  assert.equal((await send("refresh")).status, 503); error.mock.restore();
  assert.deepEqual(sqlite.prepare("SELECT * FROM collectors").all(), before); assert.deepEqual(sqlite.prepare("SELECT * FROM collector_items").all(), beforeItems);
  sqlite.exec("DROP TRIGGER fail_paint");
  sqlite.prepare("DELETE FROM component_prices WHERE component_id=?").run(paintId);
  assert.equal((await live()).paintingRates.find(rate => rate.dn === 80).pricePerMeter, null);
  const incomplete = (await (await send("calculate")).json()).calculation;
  assert.equal(incomplete.complete, false); assert.equal(incomplete.price, null);
  assert.ok(incomplete.warnings.some(warning => /окраски.*80/.test(warning)));
  assert.equal((await send("refresh")).status, 422);
  assert.deepEqual(sqlite.prepare("SELECT * FROM collectors").all(), before);
});
