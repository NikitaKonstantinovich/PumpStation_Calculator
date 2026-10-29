globalThis.__PSC_RELEASE_PROFILE__ = "full";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { extensionCatalog, extensionInput } from "./fixtures/insert-extension.mjs";

// Explicit fixture dimensions/engineering decisions are confined to tests.
const part = (kind, dn, pn, extra = {}) => ({
  id: `${kind}-${dn}-${pn}`, kind, name: `${kind} DN${dn} PN${pn}`, material: "st20", dn, dnSmall: null, pn,
  geometry: "straight", outerDiameter: dn === 50 ? 60.3 : dn === 80 ? 88.9 : 114.3, outerDiameterSmall: null,
  wallThickness: 3, wallThicknessSmall: null, lengthMm: null, thicknessMm: 10, thread: null, threadGender: null,
  standard: "fixture-only", price: kind === "pipe" ? 1000 : 200, source: "TEST FIXTURE, not production data",
  dimensionSources: { outerDiameter: "fixture:diameter", outerDiameterSmall: "fixture:small-diameter", wallThickness: "fixture:wall", wallThicknessSmall: "fixture:small-wall", lengthMm: "fixture:length", thicknessMm: "fixture:flange axial thickness" }, warnings: [], ...extra,
});
const makeCatalog = () => ({
  version: "fixture", nominalDns: [50, 80, 100], materials: ["st20"], issues: [],
  paintingRates: [50, 80, 100].map(dn => ({ id: `paint-${dn}`, dn, material: "st20", pricePerMeter: dn === 50 ? 450 : 800, source: "fixture:painting", warnings: [] })),
  standardBolts: [{ id: "fixture-bolt", diameterMm: 16, lengthMm: 140, source: "fixture:bolts" }],
  parts: [16, 25].flatMap(pn => [part("pipe", 50, pn), part("weldFlange", 50, pn)]).concat([
    part("pipe", 100, 16), part("weldFlange", 100, 16), part("weldFlange", 80, 16),
    part("reducer", 100, 16, { dnSmall: 80, outerDiameterSmall: 88.9, wallThicknessSmall: 3, lengthMm: 80, geometry: "concentric" }),
  ]),
  engineering: {
    connectionPairs: [{ left: "flanged", right: "flanged", source: "fixture:approved pair" }],
    straightLength: { model: "fixture valve", basis: "standard-bolt", source: "fixture:approved policy" },
    endRules: [50, 80, 100].flatMap(dn => [16, 25].map(pn => ({ connection: "flanged", material: "st20", dn, pn, axialAdditionMm: 10, source: "fixture:seating" }))),
    looseFlangeInBom: { include: true, source: "fixture:assembly" }, sensorNipple: null,
    boltReferences: [50, 100].flatMap(dn => [16, 25].map(pn => ({ dn, pn, material: "st20", model: "fixture valve", threadDiameterMm: 16, minimumLengthMm: 129, standardLengthMm: 140, componentId: "fixture-bolt", source: "fixture:bolts" }))),
  },
});

const sqlite = new DatabaseSync(":memory:");
sqlite.exec("PRAGMA foreign_keys=ON");
const migrationDirectory = new URL("../drizzle/", import.meta.url);
for (const filename of (await readdir(migrationDirectory)).filter(name => name.endsWith(".sql")).sort()) sqlite.exec(await readFile(new URL(filename, migrationDirectory), "utf8"));
class Statement {
  constructor(sql, values = []) { this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.sql, values); }
  async first() { return sqlite.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return { success: true, results: sqlite.prepare(this.sql).all(...this.values) }; }
  async run() { return this.all(); }
}
const DB = {
  prepare: sql => new Statement(sql),
  async batch(statements) {
    if (statements.some(statement => statement.sql.startsWith("INSERT INTO component_calculator_source_revision"))) globalThis.__insertionsTest.beforeInsertionBatch?.();
    sqlite.exec("BEGIN");
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("COMMIT"); return results; }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  },
};
globalThis.__insertionsTest = { DB, catalog: makeCatalog(), source: { items: [] } };
const authUrl = new URL("../app/auth-server.ts", import.meta.url);
const catalogUrl = new URL("../app/component-insert-catalog-server.ts", import.meta.url);
const replacements = {
  [authUrl.href]: (await readFile(authUrl, "utf8")).replace('import { env } from "cloudflare:workers";', "const env = globalThis.__insertionsTest;"),
  [catalogUrl.href]: `import { sha256 } from "./auth-server";
    export async function currentInsertSource(){const row=await globalThis.__insertionsTest.DB.prepare("SELECT revision FROM component_calculator_source_revision WHERE id=1").first();return {...globalThis.__insertionsTest.source,databaseRevision:row.revision};}
    export async function currentInsertCatalog(){const catalog=structuredClone(globalThis.__insertionsTest.catalog);const source=await currentInsertSource();catalog.version=await sha256(JSON.stringify({catalog,revision:source.databaseRevision}));return catalog;}`,
};
const auth = await loadTs(authUrl, replacements);
const api = await loadTs(new URL("../app/api/component-calculator/route.ts", import.meta.url), replacements);
const components = await loadTs(new URL("../app/api/components/route.ts", import.meta.url), replacements);
const store = await loadTs(new URL("../app/component-insert-store-server.ts", import.meta.url), replacements);
const insert3d = await loadTs(new URL("../app/api/component-insertions-3d/route.ts", import.meta.url), replacements);
const { suctionCatalogItems } = await loadTs(new URL("../app/suction-catalog.ts", import.meta.url));
const { isLegacyNomenclature, NOMENCLATURE_STATUS_COLUMN } = await loadTs(new URL("../app/component-nomenclature.ts", import.meta.url));
await auth.ensureAuthSchema();
for (const [id, role] of [["insert-admin", "admin"], ["insert-user", "user"]]) sqlite.prepare("INSERT INTO users(id,email,name,password_hash,email_verified_at,role) VALUES(?,?,?,?,CURRENT_TIMESTAMP,?)").run(id, `${id}@example.test`, id, "not-used", role);
const admin = await auth.createSession("insert-admin"), ordinary = await auth.createSession("insert-user");
const request = (method, token, body, headers = {}) => new Request("http://localhost/api/component-calculator", {
  method, headers: { ...(token ? { Cookie: `ps_session=${token}` } : {}), "Content-Type": "application/json", ...headers },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const input = { dnFrom: 50, dnTo: 100, materials: ["st20"], withSensorNipple: false, includeEccentric: false };
const calculate = async (overrides = {}) => {
  const response = await api.POST(request("POST", admin, { action: "calculate", input: { ...input, ...overrides } }));
  assert.equal(response.status, 200);
  return response.json();
};
const exportRows = (result, keys, extra = {}) => api.POST(request("POST", admin, { action: "export", input, catalogVersion: result.catalogVersion, keys, ...extra }));

test("component calculator requires admin on GET, calculation and export; shared catalogue requires sign-in", async () => {
  for (const token of [null, ordinary]) {
    const status = token ? 403 : 401;
    assert.equal((await api.GET(request("GET", token))).status, status);
    for (const action of ["calculate", "export"]) assert.equal((await api.POST(request("POST", token, { action, input }))).status, status);
  }
  assert.equal((await components.GET(request("GET", null))).status, 401);
  assert.equal((await components.GET(request("GET", ordinary))).status, 200);
  const meta = await api.GET(request("GET", admin));
  assert.equal(meta.status, 200);
  assert.equal(meta.headers.get("cache-control"), "no-store");
  assert.deepEqual((await meta.json()).meta.dns, [50, 80, 100]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM component_insertions").get().n, 0);
});

test("validation and cross-origin protection precede all calculator writes", async () => {
  for (const headers of [{ Origin: "https://evil.test" }, { "Sec-Fetch-Site": "cross-site" }]) {
    assert.equal((await api.POST(request("POST", admin, { action: "calculate", input }, headers))).status, 403);
  }
  for (const patch of [{ dnFrom: 200 }, { materials: [] }, { materials: ["brass"] }, { withSensorNipple: "yes" }]) {
    assert.equal((await api.POST(request("POST", admin, { action: "calculate", input: { ...input, ...patch } }))).status, 400);
  }
  assert.equal((await api.POST(request("POST", admin, { action: "export", input, catalogVersion: "x", keys: [] }))).status, 400);
});

let first;
test("server creates only selected complete rows, ignores client prices/BOM and distinguishes equal names by PN", async () => {
  first = await calculate();
  const selected = first.rows.filter(row => row.dnLarge === 50);
  assert.equal(selected.length, 2); assert.equal(selected[0].name, selected[1].name);
  assert.ok(selected.every(row => row.complete && row.exportable && row.isNew));
  const result = await (await exportRows(first, selected.map(row => row.identityKey), { price: 1, bom: [], rows: selected.map(row => ({ ...row, price: 1 })) })).json();
  assert.equal(result.created, 2); assert.equal(result.updated, 0); assert.deepEqual(result.failed, []);
  assert.ok(result.rows.filter(row => row.dnLarge === 50).every(row => !row.isNew && row.existingId));
  const stored = sqlite.prepare("SELECT * FROM component_insertions").all();
  assert.equal(stored.length, 2);
  for (const saved of stored) {
    const original = selected.find(row => row.identityKey === saved.identity_key);
    assert.equal(saved.cached_price_microunits, Math.round(original.price * 1e6));
    assert.deepEqual(JSON.parse(saved.configuration_json), original.configuration);
    assert.deepEqual(sqlite.prepare("SELECT item_json FROM component_insertion_items WHERE insertion_id=? ORDER BY sort_order").all(saved.id).map(item => JSON.parse(item.item_json)), original.bom);
    assert.equal(JSON.parse(saved.calculation_json).dimensions.length, original.dimensions.length);
    assert.equal(JSON.parse(saved.calculation_json).welds.length, 2);
  }
});

test("idempotent upsert updates current prices and composition without duplicating physical products", async () => {
  const selected = first.rows.filter(row => row.dnLarge === 50), before = sqlite.prepare("SELECT id,identity_key FROM component_insertions ORDER BY id").all();
  let result = await (await exportRows(first, [...selected.map(row => row.identityKey), selected[0].identityKey])).json();
  assert.equal(result.created, 0); assert.equal(result.updated, 2);
  globalThis.__insertionsTest.catalog.parts.find(row => row.id === "pipe-50-16").price = 2000;
  const stale = await exportRows(first, [selected[0].identityKey]);
  assert.equal(stale.status, 409); assert.equal((await stale.json()).stale, true);
  const fresh = await calculate();
  assert.notEqual(fresh.catalogVersion, first.catalogVersion);
  const updated = fresh.rows.find(row => row.identityKey === selected[0].identityKey);
  assert.ok(updated.price > selected[0].price);
  result = await (await exportRows(fresh, [updated.identityKey])).json();
  assert.equal(result.updated, 1);
  assert.deepEqual(sqlite.prepare("SELECT id,identity_key FROM component_insertions ORDER BY id").all(), before);
  const row = sqlite.prepare("SELECT * FROM component_insertions WHERE identity_key=?").get(updated.identityKey);
  assert.equal(row.cached_price_microunits, Math.round(updated.price * 1e6));
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM component_insertion_items WHERE insertion_id=?").get(row.id).n, updated.bom.length);
});

test("unclassified old rows still conflict; client marks, incomplete and forged identities cannot authorize export", async t => {
  const previousSource = globalThis.__insertionsTest.source;
  t.after(() => { globalThis.__insertionsTest.source = previousSource; });
  const unclassified = structuredClone(suctionCatalogItems.find(item => item.id === "suction-table:ff-100"));
  unclassified.id = "unclassified-old-insert";
  unclassified.catalogId = "ответные-части";
  unclassified.fields = unclassified.fields.filter(field => field.column !== NOMENCLATURE_STATUS_COLUMN);
  globalThis.__insertionsTest.source = { items: [unclassified] };
  const result = await calculate(), legacy = result.rows.find(row => row.dnLarge === 100 && row.geometry === "straight");
  assert.ok(legacy.complete); assert.equal(legacy.exportable, false); assert.equal(legacy.isNew, false);
  assert.match(legacy.conflict, /unclassified-old-insert/);
  let exported = await (await exportRows(result, [legacy.identityKey, "forged-key"], { legacyNomenclature: true, ignoredLegacyIds: [unclassified.id] })).json();
  assert.equal(exported.created, 0); assert.equal(exported.updated, 0); assert.equal(exported.failed.length, 2);
  globalThis.__insertionsTest.catalog.parts.find(row => row.id === "reducer-100-16").lengthMm = null;
  const incomplete = await calculate(), reducer = incomplete.rows.find(row => row.geometry === "concentric");
  assert.equal(reducer.complete, false); assert.equal(reducer.exportable, false);
  exported = await (await exportRows(incomplete, [reducer.identityKey], { complete: true, price: 100 })).json();
  assert.equal(exported.failed.length, 1); assert.match(exported.failed[0].reason, /длины перехода/i);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM component_insertions").get().n, 2);
  globalThis.__insertionsTest.catalog.parts.find(row => row.id === "reducer-100-16").lengthMm = 80;
});

test("failed BOM write rolls back product characteristics, cached price and previous composition", async t => {
  t.mock.method(console, "error", () => {});
  const old = sqlite.prepare("SELECT * FROM component_insertions WHERE identity_key=?").get(first.rows.find(row => row.dnLarge === 50 && row.pn === 16).identityKey);
  const oldBom = sqlite.prepare("SELECT * FROM component_insertion_items WHERE insertion_id=? ORDER BY sort_order").all(old.id);
  globalThis.__insertionsTest.catalog.parts.find(row => row.id === "pipe-50-16").price = 3000;
  const fresh = await calculate();
  sqlite.exec("CREATE TRIGGER fail_insertion_item BEFORE INSERT ON component_insertion_items BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  const exported = await (await exportRows(fresh, [old.identity_key])).json();
  assert.equal(exported.updated, 0); assert.equal(exported.failed.length, 1);
  assert.deepEqual(sqlite.prepare("SELECT * FROM component_insertions WHERE id=?").get(old.id), old);
  assert.deepEqual(sqlite.prepare("SELECT * FROM component_insertion_items WHERE insertion_id=? ORDER BY sort_order").all(old.id), oldBom);
  sqlite.exec("DROP TRIGGER fail_insertion_item");
});

test("saved insertions reappear in shared catalogue from SQL, and repeated migration preserves them", async () => {
  sqlite.exec(await readFile(new URL("../drizzle/0008_component_insertions.sql", import.meta.url), "utf8"));
  const reloaded = await loadTs(new URL("../app/api/components/route.ts", import.meta.url), replacements);
  const response = await reloaded.GET(request("GET", ordinary)), result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.items.length, 2);
  assert.ok(result.items.every(item => item.catalogId === "ответные-части" && item.id.startsWith("calculated-insertion:")));
  for (const item of result.items) {
    assert.ok(item.fields.find(value => value.column === "Длина основы, мм").value > 0);
    assert.ok(item.fields.find(value => value.column === "Идентичность изделия").value);
    const snapshot=item.calculatedInsertion;
    assert.ok(snapshot.calculation.bom.length); assert.ok(snapshot.revision>0);
    if(snapshot.catalogVersion===result.catalogVersion) assert.ok(item.prices[0].amount > 1);
    else assert.deepEqual(item.prices,[],"stale saved products retain their BOM but cannot expose a current price");
  }
  const saved = await store.readSavedInsertions();
  const planned = sqlite.prepare("EXPLAIN QUERY PLAN SELECT id FROM component_insertions WHERE identity_key=?").all(saved[0].identity_key);
  assert.ok(planned.some(row => row.detail.includes("uq_component_insertions_identity")));
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
});

test("D1 input rows and changed tariffs invalidate catalogue versions; missing prices never fall back to shipped prices", async () => {
  const shipped = { source: { sha256: "a".repeat(64), importedAt: "fixture" }, collectorReference: { bolts: [], nippleDiameters: [] }, items: [{
    id: "shipped-pipe", catalogId: "трубы", tableId: "fixture-pipes", family: "Трубы Сталь 20", sourceSheet: "Трубы", sourceRow: 2,
    fields: [["B", "DN", 50], ["C", "PN", 16], ["D", "Диаметр, мм", 60.3], ["E", "Толщина, мм", 3]].map(([column, label, value]) => ({ column, headerPath: [label], value })),
    prices: [{ amount: 100, currency: "RUB", sourceColumn: "I", label: "Цена, ₽/м.п." }],
  }] };
  const realReplacements = { ...replacements };
  delete realReplacements[catalogUrl.href];
  realReplacements[new URL("../public/component-insert-source.json", import.meta.url).href] = JSON.stringify(shipped);
  const loader = await loadTs(catalogUrl, realReplacements);
  assert.equal((await loader.currentInsertSource()).items[0].id, "shipped-pipe");
  sqlite.exec(`INSERT INTO catalog_imports(id,source_file,source_sha256,source_size_bytes,source_modified_at) VALUES(1,'fixture','${"a".repeat(64)}',1,'fixture');
    INSERT INTO component_catalogs(id,import_id,source_id,name,source_sheet) VALUES(1,1,'трубы','Трубы','Трубы');
    INSERT INTO component_families(id,catalog_id,source_id,title,source_range) VALUES(1,1,'fixture-pipes','Трубы Сталь 20','B1:I2');
    INSERT INTO components(id,family_id,source_id,source_row) VALUES(1,1,'live-pipe',2);`);
  for (const [index, field] of shipped.items[0].fields.entries()) {
    const id = index + 1;
    sqlite.prepare("INSERT INTO attribute_definitions(id,family_id,source_column,key,label,header_path_json,data_type) VALUES(?,1,?,?,?,?, 'number')").run(id, field.column, field.column, field.headerPath[0], JSON.stringify(field.headerPath));
    sqlite.prepare("INSERT INTO component_attribute_values(component_id,attribute_definition_id,value_type,numeric_value) VALUES(1,?,'number',?)").run(id, field.value);
  }
  sqlite.exec("INSERT INTO component_prices(component_id,label,amount_microunits,source_column) VALUES(1,'Цена, ₽/м.п.',500000000,'I')");
  const before = await loader.currentInsertCatalog();
  assert.equal(before.parts[0].id, "live-pipe"); assert.equal(before.parts[0].price, 500);
  sqlite.exec("UPDATE component_prices SET amount_microunits=700000000");
  const repriced = await loader.currentInsertCatalog();
  assert.notEqual(repriced.version, before.version); assert.equal(repriced.parts[0].price, 700);
  const calculation = await loadTs(new URL("../app/collector-calculations.ts", import.meta.url));
  const oldRate = calculation.WELD_RATES.st20;
  try {
    calculation.WELD_RATES.st20 += 1;
    assert.notEqual((await loader.currentInsertCatalog()).version, repriced.version);
  } finally { calculation.WELD_RATES.st20 = oldRate; }
  sqlite.exec("DELETE FROM component_prices");
  const missing = await loader.currentInsertCatalog();
  assert.equal(missing.parts[0].price, null); assert.notEqual(missing.version, repriced.version);
  sqlite.exec("UPDATE catalog_imports SET source_sha256='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'");
  assert.equal((await loader.currentInsertSource()).collectorReference, undefined);
});

test("source change after recomputation but before write aborts atomically and reports all unsaved selections", async () => {
  const fresh = await calculate(), selected = fresh.rows.filter(row => row.dnLarge === 50);
  const before = sqlite.prepare("SELECT * FROM component_insertions ORDER BY id").all();
  const beforeItems = sqlite.prepare("SELECT * FROM component_insertion_items ORDER BY id").all();
  let calls = 0;
  globalThis.__insertionsTest.beforeInsertionBatch = () => {
    calls++;
    sqlite.exec("UPDATE component_attribute_values SET numeric_value=61 WHERE component_id=1 AND attribute_definition_id=3");
  };
  try {
    const response = await exportRows(fresh, selected.map(row => row.identityKey)), result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.stale, true); assert.equal(result.created, 0); assert.equal(result.updated, 0);
    assert.equal(result.failed.length, selected.length); assert.equal(calls, 1);
    assert.ok(result.failed.every(row => /расчёт заново/.test(row.reason)));
    assert.deepEqual(sqlite.prepare("SELECT * FROM component_insertions ORDER BY id").all(), before);
    assert.deepEqual(sqlite.prepare("SELECT * FROM component_insertion_items ORDER BY id").all(), beforeItems);
  } finally { delete globalThis.__insertionsTest.beforeInsertionBatch; }
});

test("source change midway through export reports committed rows and stops further writes", async () => {
  const fresh = await calculate(), selected = fresh.rows.filter(row => row.dnLarge === 50);
  const before = sqlite.prepare("SELECT * FROM component_insertions ORDER BY id").all();
  let calls = 0;
  globalThis.__insertionsTest.beforeInsertionBatch = () => {
    calls++;
    if (calls === 2) sqlite.exec("UPDATE component_attribute_values SET numeric_value=62 WHERE component_id=1 AND attribute_definition_id=3");
  };
  try {
    const response = await exportRows(fresh, selected.map(row => row.identityKey)), result = await response.json();
    assert.equal(response.status, 200); assert.equal(result.stale, true);
    assert.equal(result.created, 0); assert.equal(result.updated, 1); assert.equal(result.failed.length, 1);
    const after = sqlite.prepare("SELECT * FROM component_insertions ORDER BY id").all();
    assert.equal(after.filter(row => row.revision === before.find(previous => previous.id === row.id).revision + 1).length, 1);
  } finally { delete globalThis.__insertionsTest.beforeInsertionBatch; }
});

test("admin seating selection is recomputed, stored with provenance, and changed geometry cannot export an old physical key", async () => {
  const baseline = await calculate();
  const original = baseline.rows.find(row => row.dnLarge === 50 && row.pn === 16);
  const flushInput = { ...input, seating: { flanged: { mode: "flush" } } };
  const flush = await calculate(flushInput), selected = flush.rows.find(row => row.dnLarge === 50 && row.pn === 16);
  assert.equal(flush.catalogVersion, baseline.catalogVersion, "assembly choices do not mutate source catalogue revision");
  assert.equal(selected.complete, true); assert.equal(selected.totalLengthMm, selected.baseLengthMm);
  assert.notEqual(selected.identityKey, original.identityKey);
  assert.equal(selected.price, original.price, "unchanged material and weld quantities retain their server price");
  const before = sqlite.prepare("SELECT * FROM component_insertions WHERE identity_key=?").get(original.identityKey);
  let exported = await (await exportRows(flush, [original.identityKey], { input: flushInput })).json();
  assert.equal(exported.created, 0); assert.equal(exported.updated, 0); assert.equal(exported.failed.length, 1);
  assert.deepEqual(sqlite.prepare("SELECT * FROM component_insertions WHERE identity_key=?").get(original.identityKey), before);

  exported = await (await exportRows(flush, [selected.identityKey], { input: { ...flushInput, endRules: [{ axialAdditionMm: 999 }], price: 1 }, price: 1, totalLengthMm: 999 })).json();
  assert.equal(exported.created, 1); assert.equal(exported.failed.length, 0);
  const stored = sqlite.prepare("SELECT * FROM component_insertions WHERE identity_key=?").get(selected.identityKey);
  const configuration = JSON.parse(stored.configuration_json), calculation = JSON.parse(stored.calculation_json);
  assert.deepEqual(configuration.seating.flanged, { mode: "flush" });
  assert.deepEqual(configuration.seating.collar, { mode: "source" });
  assert.equal(configuration.axialLeftMm, 0); assert.equal(configuration.axialRightMm, 0);
  assert.equal(stored.total_length_mm, selected.baseLengthMm);
  assert.equal(stored.cached_price_microunits, Math.round(selected.price * 1e6));
  assert.ok(calculation.dimensions.some(dimension => dimension.value === 0 && /пользоват|user/i.test(dimension.source ?? "")));

  const changedInput = { ...input, seating: { flanged: { mode: "face-offset", valueMm: 2 } } };
  const changed = await calculate(changedInput), changedRow = changed.rows.find(row => row.dnLarge === 50 && row.pn === 16);
  assert.equal(changedRow.totalLengthMm, changedRow.baseLengthMm + 4);
  exported = await (await exportRows(changed, [selected.identityKey], { input: changedInput })).json();
  assert.equal(exported.created, 0); assert.equal(exported.updated, 0); assert.equal(exported.failed.length, 1);
  assert.equal(sqlite.prepare("SELECT revision FROM component_insertions WHERE identity_key=?").get(selected.identityKey).revision, 0);
});

test("equivalent seating methods update one physical product; invalid seating fails server validation", async () => {
  const flush = await calculate({ seating: { flanged: { mode: "flush" } } });
  const selected = flush.rows.find(row => row.dnLarge === 50 && row.pn === 16);
  const equivalentInput = { ...input, seating: { flanged: { mode: "face-offset", valueMm: 0 } } };
  const equivalent = await calculate(equivalentInput), row = equivalent.rows.find(row => row.dnLarge === 50 && row.pn === 16);
  assert.equal(row.identityKey, selected.identityKey);
  const count = sqlite.prepare("SELECT COUNT(*) n FROM component_insertions").get().n;
  const exported = await (await exportRows(equivalent, [row.identityKey], { input: equivalentInput })).json();
  assert.equal(exported.created, 0); assert.equal(exported.updated, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM component_insertions").get().n, count);
  const saved = JSON.parse(sqlite.prepare("SELECT configuration_json FROM component_insertions WHERE identity_key=?").get(row.identityKey).configuration_json);
  assert.deepEqual(saved.seating.flanged, { mode: "face-offset", valueMm: 0 });
  for (const seating of [null, [], { flanged: { mode: "arbitrary", valueMm: 2 } }, { flanged: { mode: "face-offset", valueMm: -1 } }, { flanged: { mode: "insertion-depth", valueMm: "2" } }]) {
    const response = await api.POST(request("POST", admin, { action: "calculate", input: { ...input, seating } }));
    assert.equal(response.status, 400, JSON.stringify(seating));
  }
});

test("server enforces fixed recess and clearance, invalidates old previews, persists audit and updates idempotently", async () => {
  const previous = globalThis.__insertionsTest.catalog;
  try {
    globalThis.__insertionsTest.catalog = makeCatalog();
    const oldPreview = await calculate();
    const catalog = globalThis.__insertionsTest.catalog;
    catalog.engineering.flangeAssembly = { faceOffsetMm: 5, clearanceFactor: 1.1, fastenerModels: ["fixture valve", "fixture check"], source: "TEST approved flange clearance" };
    catalog.standardBolts.push({ id: "fixture-stud", diameterMm: 16, lengthMm: 165, source: "TEST full stud length" });
    catalog.engineering.boltReferences.push(...catalog.engineering.boltReferences.map(ref => ({ ...ref, model: "fixture check", componentId: "fixture-stud", standardLengthMm: 165, minimumLengthMm: 162 })));
    const stale = await exportRows(oldPreview, [oldPreview.rows.find(row => row.dnLarge === 50 && row.pn === 16).identityKey]);
    assert.equal(stale.status, 409);
    const forgedInput = { ...input, seating: { flanged: { mode: "flush" } }, flangeAssembly: { faceOffsetMm: 0, clearanceFactor: 0 } };
    const preview = await calculate(forgedInput);
    const row = preview.rows.find(row => row.dnLarge === 50 && row.pn === 16);
    assert.equal(row.complete, true, row.warnings.join("; "));
    assert.equal(row.baseLengthMm, 191.5); // 181.5 clear + two (10 - 5) overlaps
    assert.equal(row.totalLengthMm, 201.5);
    const exported = await (await exportRows(preview, [row.identityKey], { input: forgedInput, baseLengthMm: 1, price: 1 })).json();
    assert.equal(exported.created, 1); assert.deepEqual(exported.failed, []);
    const saved = sqlite.prepare("SELECT * FROM component_insertions WHERE identity_key=?").get(row.identityKey);
    const audit = JSON.parse(saved.calculation_json), configuration = JSON.parse(saved.configuration_json);
    assert.equal(saved.total_length_mm, 201.5);
    assert.deepEqual(configuration.seating.flanged, { mode: "face-offset", valueMm: 5 });
    assert.equal(audit.bom.find(item => item.kind === "pipe").quantity, 0.1915);
    assert.equal(audit.dimensions.find(item => item.name === "Фактический внутренний зазор между фланцами").value, 181.5);
    assert.equal(saved.cached_price_microunits, Math.round(row.price * 1e6));
    const repeated = await (await exportRows(preview, [row.identityKey], { input: forgedInput })).json();
    assert.equal(repeated.created, 0); assert.equal(repeated.updated, 1);
    const response = await components.GET(request("GET", admin));
    const shared = await response.json();
    assert.ok(JSON.stringify(shared).includes("201.5"));
  } finally { globalThis.__insertionsTest.catalog = previous; }
});

test("small-DN end exclusions invalidate old previews and prevent direct export of an excluded reducer", async () => {
  const previous = globalThis.__insertionsTest.catalog;
  try {
    const catalog = makeCatalog();
    catalog.parts.push(part("weldFlange", 25, 16, { outerDiameter: 33.7 }), part("reducer", 100, 16, {
      id: "restricted-reducer", dnSmall: 25, outerDiameterSmall: 33.7, wallThicknessSmall: 3, lengthMm: 80, geometry: "concentric",
    }));
    catalog.engineering.endRules.push({ connection: "flanged", material: "st20", dn: 25, pn: 16, axialAdditionMm: 10, source: "fixture:seating" });
    globalThis.__insertionsTest.catalog = catalog;
    const before = await calculate(), excluded = before.rows.find(row => row.dnSmall === 25);
    assert.ok(excluded.exportable);
    const count = sqlite.prepare("SELECT COUNT(*) n FROM component_insertions").get().n;
    catalog.engineering.flangedEndExclusions = { dns: [15, 20, 25], source: "fixture:confirmed exclusion" };
    const metadata = await (await api.GET(request("GET", admin))).json();
    assert.match(metadata.meta.connectionNotes.join(" "), /DN15, DN20, DN25.*только в резьбовом/);
    assert.equal((await exportRows(before, [excluded.identityKey])).status, 409);
    const after = await calculate();
    assert.ok(!after.rows.some(row => row.dnSmall === 25));
    const forged = await (await exportRows(after, [excluded.identityKey], { rows: [excluded], engineering: { flangedEndExclusions: { dns: [], source: "client override" } } })).json();
    assert.equal(forged.created, 0); assert.equal(forged.updated, 0); assert.equal(forged.failed.length, 1);
    assert.match(forged.failed[0].reason, /отсутствует в текущем серверном расчёте/);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM component_insertions").get().n, count);
  } finally { globalThis.__insertionsTest.catalog = previous; }
});

test("PN25 sensor warning persists through server create/update and shared catalogue; other failures and stale previews stay blocked", async () => {
  const previous = globalThis.__insertionsTest.catalog;
  try {
    const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
    const catalog = makeInsertCatalog(JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8")));
    globalThis.__insertionsTest.catalog = catalog;
    const sensorInput = { ...input, dnFrom: 50, dnTo: 50, materials: ["st20", "aisi304"], withSensorNipple: true };
    const allowance = catalog.engineering.sensorNipplePn25Allowance;
    delete catalog.engineering.sensorNipplePn25Allowance;
    const beforeAllowance = await calculate(sensorInput);
    assert.ok(beforeAllowance.rows.filter(row => row.pn === 25).every(row => !row.exportable));
    catalog.engineering.sensorNipplePn25Allowance = allowance;
    const preview = await calculate(sensorInput);
    assert.equal((await exportRows(beforeAllowance, [preview.rows.find(row => row.pn === 25 && row.exportable).identityKey], { input: sensorInput })).status, 409);
    const selected = ["st20", "aisi304"].flatMap(material => [16, 25].map(pn => preview.rows.find(row => row.material === material && row.pn === pn && row.geometry === "straight")));
    assert.ok(selected.every(row => row.exportable));
    const steelNipple = catalog.parts.find(part => part.id === "сгоны-резьба-001-r0005");
    const originalPrice = steelNipple.price;
    steelNipple.price = null;
    const missingPrice = await calculate(sensorInput);
    const blocked = missingPrice.rows.filter(row => row.material === "st20" && row.pn === 25);
    assert.ok(blocked.length > 0 && blocked.every(row => !row.exportable));
    const rejected = await (await exportRows(missingPrice, blocked.map(row => row.identityKey), { input: sensorInput, rows: blocked.map(row => ({ ...row, complete: true, price: 1, warnings: [], assumptions: [] })) })).json();
    assert.equal(rejected.created, 0); assert.equal(rejected.failed.length, blocked.length);
    steelNipple.price = originalPrice;
    const count = sqlite.prepare("SELECT count(*) n FROM component_insertions").get().n;
    const result = await (await exportRows(preview, selected.map(row => row.identityKey), { input: sensorInput, price: 1, rows: selected.map(row => ({ ...row, assumptions: [] })) })).json();
    assert.equal(result.created, 4); assert.deepEqual(result.failed, []);
    for (const row of selected) {
      const saved = sqlite.prepare("SELECT * FROM component_insertions WHERE identity_key=?").get(row.identityKey);
      const audit = JSON.parse(saved.calculation_json);
      assert.equal(saved.cached_price_microunits, Math.round(row.price * 1e6));
      assert.equal(audit.dimensions.find(d => d.unit === "°C").value, 40);
      assert.equal(audit.dimensions.find(d => d.unit === "бар").value, row.material === "st20" ? 16 : 20);
      assert.match(store.savedInsertionComponent(saved).fields.find(field => field.column === "Описание").value, /до \+40 °C/);
      assert.deepEqual(audit.bom, row.bom);
      assert.deepEqual(audit.assumptions, row.assumptions);
      const shared = store.savedInsertionComponent(saved);
      if (row.pn === 25) {
        assert.equal(audit.assumptions[0].code, "sensor-pn25-pressure");
        assert.match(shared.fields.find(field => field.column === "Допущения расчёта").value, /при 25 бар не подтверждена/);
        assert.match(shared.fields.find(field => field.column === "Описание").value, /Предупреждение/);
        const items = sqlite.prepare("SELECT item_json FROM component_insertion_items WHERE insertion_id=? ORDER BY sort_order").all(saved.id).map(item => JSON.parse(item.item_json));
        assert.match(items.find(item => item.role === "sensor-nipple").source, /при 25 бар не подтверждена/);
      } else assert.equal(audit.assumptions, undefined);
    }
    catalog.parts.find(part => part.id === "сгоны-резьба-001-r0005").price += 1;
    assert.equal((await exportRows(preview, selected.map(row => row.identityKey), { input: sensorInput })).status, 409);
    const refreshed = await calculate(sensorInput);
    const repeated = await (await exportRows(refreshed, selected.map(row => row.identityKey), { input: sensorInput })).json();
    assert.equal(repeated.created, 0); assert.equal(repeated.updated, 4);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM component_insertions").get().n, count + 4);
  } finally { globalThis.__insertionsTest.catalog = previous; }
});

test("PN25 flange material adoption invalidates old previews and persists its source with unchanged original alloy names", async () => {
  const previous = globalThis.__insertionsTest.catalog;
  try {
    const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
    const data = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
    const beforeData = structuredClone(data);
    for (const item of beforeData.items) item.fields = item.fields.filter(f => !f.column.startsWith("CALC_FLANGE_MATERIAL_"));
    globalThis.__insertionsTest.catalog = makeInsertCatalog(beforeData);
    const approvedInput = { ...input, dnFrom: 65, dnTo: 65, materials: ["aisi304"] };
    const before = await calculate(approvedInput);
    const oldRow = before.rows.find(row => row.geometry === "straight" && row.pn === 25);
    assert.equal(oldRow.exportable, false);
    globalThis.__insertionsTest.catalog = makeInsertCatalog(data);
    assert.equal((await exportRows(before, [oldRow.identityKey], { input: approvedInput })).status, 409);
    const after = await calculate(approvedInput), row = after.rows.find(row => row.geometry === "straight" && row.pn === 25);
    assert.ok(row.exportable);
    const result = await (await exportRows(after, [row.identityKey], { input: approvedInput, price: 1 })).json();
    assert.equal(result.created, 1); assert.deepEqual(result.failed, []);
    const saved = sqlite.prepare("SELECT * FROM component_insertions WHERE identity_key=?").get(row.identityKey);
    const audit = JSON.parse(saved.calculation_json);
    const flange = audit.bom.find(item => item.role === "left-flanged");
    assert.match(flange.name, /12Х18Н10Т/); assert.match(flange.source, /Проектная взаимозаменяемость/);
    assert.equal(saved.cached_price_microunits, Math.round(row.price * 1e6));
    assert.ok(audit.warnings.every(reason => !/противореч/.test(reason)));
    const repeated = await (await exportRows(after, [row.identityKey], { input: approvedInput })).json();
    assert.equal(repeated.created, 0); assert.equal(repeated.updated, 1);
  } finally { globalThis.__insertionsTest.catalog = previous; }
});

test("painting tariff changes invalidate previews; export stores the recalculated service and price with the same identity", async () => {
  const previous = globalThis.__insertionsTest.catalog;
  try {
    globalThis.__insertionsTest.catalog = makeCatalog();
    const before = await calculate(), row = before.rows.find(row => row.dnLarge === 50 && row.pn === 16);
    const price = row.price, count = sqlite.prepare("SELECT count(*) n FROM component_insertions").get().n;
    globalThis.__insertionsTest.catalog.paintingRates.find(rate => rate.dn === 50).pricePerMeter = 600;
    assert.equal((await exportRows(before, [row.identityKey])).status, 409);
    const after = await calculate(), changed = after.rows.find(item => item.identityKey === row.identityKey);
    assert.ok(Math.abs(changed.bom.find(item => item.kind === "painting").cost - 84) < 1e-8);
    assert.ok(Math.abs(changed.price - price - 21) < 1e-8);
    const exported = await (await exportRows(after, [changed.identityKey], { price: 1, paintingRates: [] })).json();
    assert.equal(exported.updated, 1); assert.equal(exported.created, 0); assert.deepEqual(exported.failed, []);
    const saved = sqlite.prepare("SELECT id,cached_price_microunits,calculation_json FROM component_insertions WHERE identity_key=?").get(row.identityKey);
    assert.equal(saved.cached_price_microunits, Math.round(changed.price * 1e6));
    const expected = changed.bom.find(item => item.kind === "painting");
    assert.deepEqual(JSON.parse(saved.calculation_json).bom.find(item => item.kind === "painting"), expected);
    assert.deepEqual(sqlite.prepare("SELECT item_json FROM component_insertion_items WHERE insertion_id=?").all(saved.id).map(row => JSON.parse(row.item_json)).find(item => item.kind === "painting"), expected);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM component_insertions").get().n, count);
    globalThis.__insertionsTest.catalog.paintingRates = [];
    const missing = await calculate(), incomplete = missing.rows.find(item => item.identityKey === row.identityKey);
    assert.equal(incomplete.exportable, false); assert.equal(incomplete.price, null);
    const blocked = await (await exportRows(missing, [row.identityKey])).json();
    assert.equal(blocked.updated, 0); assert.equal(blocked.failed.length, 1);
    assert.equal(sqlite.prepare("SELECT cached_price_microunits FROM component_insertions WHERE id=?").get(saved.id).cached_price_microunits, saved.cached_price_microunits);
  } finally { globalThis.__insertionsTest.catalog = previous; }
});

test("ready supplier flanges export with their prices and geometry, repeat without duplicates and reject stale price previews", async () => {
  const previous = globalThis.__insertionsTest.catalog;
  try {
    const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
    const data = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
    globalThis.__insertionsTest.catalog = makeInsertCatalog(data);
    const supplierInput = { ...input, dnFrom: 100, dnTo: 100, materials: ["aisi304"] };
    const first = await calculate(supplierInput);
    const row = first.rows.find(row => row.geometry === "straight" && row.pn === 25 && row.bom.filter(item => item.componentId === "ifitting-en01:1154").length === 2);
    assert.ok(row.exportable);
    const result = await (await exportRows(first, [row.identityKey], { input: supplierInput, price: 1, bom: [] })).json();
    assert.equal(result.created, 1); assert.deepEqual(result.failed, []);
    const saved = sqlite.prepare("SELECT * FROM component_insertions WHERE identity_key=?").get(row.identityKey);
    assert.equal(saved.cached_price_microunits, Math.round(row.price * 1e6));
    const audit = JSON.parse(saved.calculation_json);
    assert.ok(audit.bom.filter(item => item.componentId === "ifitting-en01:1154").every(item => item.unitPrice === 8730 && item.source.includes("ifitting.ru")));
    assert.equal(audit.totalLengthMm, row.totalLengthMm);
    const repeated = await (await exportRows(first, [row.identityKey], { input: supplierInput })).json();
    assert.equal(repeated.created, 0); assert.equal(repeated.updated, 1);
    globalThis.__insertionsTest.catalog.parts.find(part => part.id === "ifitting-en01:1154").price += 100;
    assert.equal((await exportRows(first, [row.identityKey], { input: supplierInput })).status, 409);
    const next = await calculate(supplierInput), changed = next.rows.find(item => item.identityKey === row.identityKey);
    assert.equal(changed.price, row.price + 200);
  } finally { globalThis.__insertionsTest.catalog = previous; }
});

test("machining needs a sourced fit and tariff; server persists real operations and rejects stale tariffs", async () => {
  const previous = globalThis.__insertionsTest.catalog;
  try {
    const catalog = makeCatalog(); globalThis.__insertionsTest.catalog = catalog;
    const flange = catalog.parts.find(part => part.id === "weldFlange-50-16");
    flange.boreDiameterMm = 59; flange.dimensionSources.boreDiameterMm = "TEST original bore";
    catalog.engineering.flangeBoring = { source: "TEST approval", diametralClearanceMm: null, clearanceSource: null };
    const incomplete = await calculate(), blocked = incomplete.rows.find(row => row.dnLarge === 50 && row.pn === 16);
    assert.equal(blocked.exportable, false); assert.equal(blocked.price, null);
    assert.equal((await (await exportRows(incomplete, [blocked.identityKey], { price: 1, flangeBoringRates: [{ pricePerPiece: 1 }] })).json()).failed.length, 1);
    // These fit/tariff values are a test fixture, never adopted production values.
    catalog.engineering.flangeBoring = { source: "TEST approval", diametralClearanceMm: 0.5, clearanceSource: "TEST fit" };
    catalog.flangeBoringRates = [{ id: "test-boring", material: "st20", dn: 50, pn: 16, pricePerPiece: 120, source: "TEST tariff", warnings: [] }];
    const complete = await calculate(), row = complete.rows.find(row => row.dnLarge === 50 && row.pn === 16);
    assert.ok(row.exportable, row.warnings.join("; "));
    assert.ok(row.machining.every(operation => operation.targetBoreMm === 60.8 && operation.originalBoreMm === 59));
    assert.equal((await (await exportRows(complete, [row.identityKey], { price: 1 })).json()).created, 1);
    const saved = sqlite.prepare("SELECT * FROM component_insertions WHERE identity_key=?").get(row.identityKey);
    assert.deepEqual(JSON.parse(saved.calculation_json).machining, row.machining);
    assert.equal(saved.cached_price_microunits, Math.round(row.price * 1e6));
    catalog.flangeBoringRates[0].pricePerPiece = 150;
    assert.equal((await exportRows(complete, [row.identityKey])).status, 409);
    const next = await calculate(), changed = next.rows.find(item => item.identityKey === row.identityKey);
    assert.equal(changed.price, row.price + 60);
    const result = await (await exportRows(next, [row.identityKey])).json();
    assert.equal(result.created, 0); assert.equal(result.updated, 1);
    catalog.engineering.flangeBoring.diametralClearanceMm = 1;
    assert.ok((await calculate()).rows.filter(item => item.dnLarge === 50 && item.pn === 16).every(item => item.identityKey !== row.identityKey));
  } finally { globalThis.__insertionsTest.catalog = previous; }
});


test("pump reducer persists catalogue length without pipe; repeat is idempotent and stale reducer prices are rejected", async () => {
  const previous = globalThis.__insertionsTest.catalog;
  try {
    const catalog = extensionCatalog(); globalThis.__insertionsTest.catalog = catalog;
    const first = await calculate(extensionInput), row = first.rows.find(row => row.geometry === "concentric");
    assert.ok(row.exportable, row.conflict ?? row.warnings.join("; "));
    const count = sqlite.prepare("SELECT count(*) n FROM component_insertions").get().n;
    const result = await (await exportRows(first, [row.identityKey], { input: extensionInput, extension: { lengthMm: 999 }, bom: [], price: 1 })).json();
    assert.equal(result.created, 1); assert.deepEqual(result.failed, []);
    const saved = sqlite.prepare("SELECT * FROM component_insertions WHERE identity_key=?").get(row.identityKey);
    assert.equal(saved.base_length_mm, 76); assert.equal(saved.total_length_mm, 86);
    assert.deepEqual(JSON.parse(saved.configuration_json).extension, row.configuration.extension);
    assert.deepEqual(JSON.parse(saved.calculation_json).welds, row.welds);
    assert.deepEqual(sqlite.prepare("SELECT item_json FROM component_insertion_items WHERE insertion_id=? ORDER BY sort_order").all(saved.id).map(item => JSON.parse(item.item_json)), row.bom);
    assert.equal(saved.cached_price_microunits, Math.round(row.price * 1e6));
    const repeated = await (await exportRows(first, [row.identityKey], { input: extensionInput })).json();
    assert.equal(repeated.created, 0); assert.equal(repeated.updated, 1);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM component_insertions").get().n, count + 1);
    const fields = store.savedInsertionComponent(saved).fields;
    assert.equal(fields.find(f => f.headerPath.at(-1) === "Длина удлиняющей трубы, мм"), undefined);
    assert.equal(JSON.parse(saved.configuration_json).extension, undefined);
    catalog.parts.find(p => p.id === "ext-reducer").price += 100;
    assert.equal((await exportRows(first, [row.identityKey], { input: extensionInput })).status, 409);
    const refreshed = await calculate(extensionInput), changed = refreshed.rows.find(r => r.identityKey === row.identityKey);
    assert.equal(changed.isNew, false); assert.ok(Math.abs(changed.price - row.price - 100) < 1e-8);
    assert.equal((await (await exportRows(refreshed, [row.identityKey], { input: extensionInput })).json()).updated, 1);
    catalog.parts.find(p => p.id === "ext-reducer").price = null;
    const missing = await calculate(extensionInput), blocked = missing.rows.find(r => r.identityKey === row.identityKey);
    assert.equal(blocked.exportable, false);
    const denied = await (await exportRows(missing, [row.identityKey], { input: extensionInput, price: 1 })).json();
    assert.equal(denied.updated, 0); assert.equal(denied.failed.length, 1);
    assert.equal(sqlite.prepare("SELECT cached_price_microunits FROM component_insertions WHERE id=?").get(saved.id).cached_price_microunits, Math.round(changed.price * 1e6));
  } finally { globalThis.__insertionsTest.catalog = previous; }
});

test("client cannot waive missing direct seating profiles or restore the removed extension", async () => {
  const previous = globalThis.__insertionsTest.catalog;
  try {
    const catalog = extensionCatalog();
    delete catalog.parts.find(p => p.kind === "reducer").cylindricalLengthLargeMm;
    globalThis.__insertionsTest.catalog = catalog;
    const first = await calculate(extensionInput), row = first.rows.find(r => r.geometry === "concentric");
    assert.equal(row.exportable, false);
    assert.equal(row.extension, undefined);
    const rejected = await (await exportRows(first, [row.identityKey], {
      input: { ...extensionInput, reducerExtension: { side: "left", lengthMm: 95 } }, complete: true, warnings: [], price: 1
    })).json();
    assert.equal(rejected.created, 0); assert.equal(rejected.updated, 0); assert.equal(rejected.failed.length, 1);
    assert.ok(rejected.failed[0]);
  } finally { globalThis.__insertionsTest.catalog = previous; }
});

for (const [label, pn, geometry, ids] of [
  ["Newkey concentric", 25, "concentric", ["newkey-din2503:NK-FDh50-4", "newkey-din2503:NK-FDh32-4"]],
  ["Newkey eccentric", 25, "eccentric", ["newkey-din2503:NK-FDh50-4", "newkey-din2503:NK-FDh32-4"]],
]) test(`only server-approved ${label} seating can be exported; decisions persist and revocation makes previews stale`, async () => {
  const previous = globalThis.__insertionsTest.catalog;
  try {
    const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
    const data = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
    const catalog = makeInsertCatalog(data), approvals = catalog.engineering.reducerSeatingApprovals;
    delete catalog.engineering.reducerReadyBoreSeating; // Isolate the historical per-part approval lifecycle.
    globalThis.__insertionsTest.catalog = catalog;
    const requestInput = { ...extensionInput, includeEccentric: geometry === "eccentric" };
    const target = row => row.geometry === geometry && row.dnSmall === 32 && row.pn === pn
      && row.bom.filter(item => ids.includes(item.componentId)).length === 2;
    catalog.engineering.reducerSeatingApprovals = [];
    const unapproved = await calculate(requestInput), blocked = unapproved.rows.find(target);
    assert.equal(blocked.exportable, false);
    const forgery = await (await exportRows(unapproved, [blocked.identityKey], {
      input: { ...requestInput, reducerSeatingApprovals: approvals }, engineering: { reducerSeatingApprovals: approvals }, complete: true, price: 1,
    })).json();
    assert.equal(forgery.created, 0); assert.equal(forgery.updated, 0); assert.equal(forgery.failed.length, 1);
    catalog.engineering.reducerSeatingApprovals = approvals;
    assert.equal((await exportRows(unapproved, [blocked.identityKey], { input: requestInput })).status, 409);
    const approved = await calculate(requestInput), row = approved.rows.find(target);
    assert.equal(row.identityKey, blocked.identityKey); assert.equal(row.exportable, true);
    assert.equal(row.assemblyDecisions.length, 2);
    const count = sqlite.prepare("SELECT count(*) n FROM component_insertions").get().n;
    const result = await (await exportRows(approved, [row.identityKey], { input: requestInput, assemblyDecisions: [], price: 1 })).json();
    assert.equal(result.created, 1); assert.deepEqual(result.failed, []);
    const saved = sqlite.prepare("SELECT * FROM component_insertions WHERE identity_key=?").get(row.identityKey);
    const persisted = JSON.parse(saved.calculation_json);
    assert.deepEqual(persisted.assemblyDecisions, row.assemblyDecisions);
    assert.deepEqual(persisted.dimensions, row.dimensions);
    assert.equal(saved.cached_price_microunits, Math.round(row.price * 1e6));
    assert.deepEqual(sqlite.prepare("SELECT item_json FROM component_insertion_items WHERE insertion_id=? ORDER BY sort_order").all(saved.id).map(item => JSON.parse(item.item_json)), row.bom);
    const shared = store.savedInsertionComponent(saved);
    assert.match(shared.fields.find(f => f.column === "Принятые решения сборки").value, /15 мм/);
    assert.match(shared.fields.find(f => f.column === "Принятые решения сборки").value, /13 мм/);
    const repeated = await (await exportRows(approved, [row.identityKey], { input: requestInput })).json();
    assert.equal(repeated.created, 0); assert.equal(repeated.updated, 1);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM component_insertions").get().n, count + 1);
    const afterRepeat = sqlite.prepare("SELECT * FROM component_insertions WHERE id=?").get(saved.id);
    catalog.engineering.reducerSeatingApprovals = [];
    assert.equal((await exportRows(approved, [row.identityKey], { input: requestInput })).status, 409);
    const revoked = await calculate(requestInput), incomplete = revoked.rows.find(target);
    assert.equal(incomplete.identityKey, row.identityKey); assert.equal(incomplete.isNew, false); assert.equal(incomplete.exportable, false);
    const rejected = await (await exportRows(revoked, [row.identityKey], { input: requestInput })).json();
    assert.equal(rejected.updated, 0); assert.equal(rejected.failed.length, 1);
    assert.deepEqual(sqlite.prepare("SELECT * FROM component_insertions WHERE id=?").get(saved.id), afterRepeat);
  } finally { globalThis.__insertionsTest.catalog = previous; }
});

test("server exposes and exports one supplier choice per execution; hidden alternatives cannot be forced by the client", async () => {
  const previous = globalThis.__insertionsTest.catalog;
  try {
    const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
    const { insertVariantSlot } = await loadTs(new URL("../app/component-insert-variants.ts", import.meta.url));
    const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
    globalThis.__insertionsTest.catalog = makeInsertCatalog(source);
    const requestInput = { ...extensionInput, includeEccentric: false };
    const result = await calculate(requestInput);
    assert.equal(new Set(result.rows.map(insertVariantSlot)).size, result.rows.length);
    const variants = result.rows.filter(row => row.dnSmall === 32 && row.pn === 25 && row.geometry === "concentric");
    assert.equal(variants.length, 1);
    const row = variants[0]; assert.ok(row.exportable); assert.equal(row.selection.candidateCount, 4);
    const count = sqlite.prepare("SELECT COUNT(*) n FROM component_insertions").get().n;
    const alternative = row.selection.alternatives[0];
    const blocked = await (await exportRows(result, [alternative.identityKey], { input: requestInput, selection: null, variantSelection: null, complete: true, price: 1 })).json();
    assert.equal(blocked.created, 0); assert.equal(blocked.updated, 0); assert.equal(blocked.failed.length, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM component_insertions").get().n, count);
    const exported = await (await exportRows(result, [row.identityKey], { input: requestInput, selection: { reason: "forged" } })).json();
    assert.equal(exported.updated, 1); assert.deepEqual(exported.failed, []);
    const saved = sqlite.prepare("SELECT * FROM component_insertions WHERE identity_key=?").get(row.identityKey);
    assert.deepEqual(JSON.parse(saved.calculation_json).selection, row.selection);
    assert.match(store.savedInsertionComponent(saved).fields.find(field => field.column === "Выбор комплектующих").value, /Исходной базы|исходной базы/);
  } finally { globalThis.__insertionsTest.catalog = previous; }
});

test("marked historical inserts do not block creating or updating new assemblies and remain separate after reload", async () => {
  const previousCatalog = globalThis.__insertionsTest.catalog, previousSource = globalThis.__insertionsTest.source;
  const oldItem = structuredClone(suctionCatalogItems.find(item => item.id === "suction-table:ff-100"));
  let savedId;
  try {
    globalThis.__insertionsTest.catalog = makeCatalog();
    globalThis.__insertionsTest.source = { items: [oldItem] };
    const result = await calculate();
    const row = result.rows.find(item => item.dnLarge === 100 && item.geometry === "straight");
    assert.equal(row.conflict, null);
    assert.equal(row.isNew, true);
    assert.equal(row.exportable, true);
    const firstExport = await (await exportRows(result, [row.identityKey])).json();
    assert.equal(firstExport.created, 1); assert.deepEqual(firstExport.failed, []);
    const saved = sqlite.prepare("SELECT * FROM component_insertions WHERE identity_key=?").get(row.identityKey);
    savedId = saved.id;
    assert.equal(saved.cached_price_microunits, Math.round(row.price * 1e6));
    const reloaded = await calculate();
    const existing = reloaded.rows.find(item => item.identityKey === row.identityKey);
    assert.equal(existing.isNew, false); assert.equal(existing.existingId, saved.id);
    assert.equal(existing.conflict, null); assert.equal(existing.exportable, true);
    const repeated = await (await exportRows(reloaded, [row.identityKey])).json();
    assert.equal(repeated.created, 0); assert.equal(repeated.updated, 1); assert.deepEqual(repeated.failed, []);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM component_insertions WHERE identity_key=?").get(row.identityKey).n, 1);
    const shared = await (await components.GET(request("GET", ordinary))).json();
    const current = shared.items.find(item => item.id === `calculated-insertion:${saved.id}`);
    assert.equal(current.catalogId, "ответные-части");
    assert.equal(isLegacyNomenclature(current), false);
    assert.deepEqual(suctionCatalogItems.find(item => item.id === oldItem.id), oldItem);
    assert.equal(isLegacyNomenclature(oldItem), true);
  } finally {
    if (savedId) sqlite.prepare("DELETE FROM component_insertions WHERE id=?").run(savedId);
    globalThis.__insertionsTest.catalog = previousCatalog;
    globalThis.__insertionsTest.source = previousSource;
  }
});

test("general ready-bore assembly saves DN50-40 PN25 dimensions and rejects client waivers after policy removal", async () => {
  const previous=globalThis.__insertionsTest.catalog;
  try {
    const { makeInsertCatalog }=await loadTs(new URL("../app/component-insert-catalog.ts",import.meta.url));
    const source=JSON.parse(await readFile(new URL("../public/binding-components.json",import.meta.url),"utf8"));
    const catalog=makeInsertCatalog(source);globalThis.__insertionsTest.catalog=catalog;
    const requestInput={...extensionInput,includeEccentric:false};
    const target=row=>row.dnSmall===40&&row.pn===25&&row.geometry==="concentric"&&row.leftConnection==="flanged"&&row.rightConnection==="flanged";
    const result=await calculate(requestInput),row=result.rows.find(target);
    assert.ok(row.exportable,row.warnings.join("; "));assert.equal(row.totalLengthMm,86);
    assert.deepEqual(row.assemblyDecisions.map(decision=>decision.depthMm),[15,13]);
    const exported=await(await exportRows(result,[row.identityKey],{input:requestInput,price:1})).json();
    assert.equal(exported.created,1);assert.deepEqual(exported.failed,[]);
    const saved=sqlite.prepare("SELECT * FROM component_insertions WHERE identity_key=?").get(row.identityKey);
    assert.deepEqual(JSON.parse(saved.calculation_json).assemblyDecisions,row.assemblyDecisions);
    assert.deepEqual(JSON.parse(saved.calculation_json).dimensions,row.dimensions);
    assert.equal(saved.cached_price_microunits,Math.round(row.price*1e6));
    const rule=catalog.engineering.reducerReadyBoreSeating;delete catalog.engineering.reducerReadyBoreSeating;
    assert.equal((await exportRows(result,[row.identityKey],{input:requestInput})).status,409);
    const recalculated=await calculate(requestInput),blocked=recalculated.rows.find(target);
    assert.equal(blocked.exportable,false);
    const denied=await(await exportRows(recalculated,[blocked.identityKey],{input:{...requestInput,reducerReadyBoreSeating:rule},engineering:{reducerReadyBoreSeating:rule},complete:true,price:1})).json();
    assert.equal(denied.updated,0);assert.equal(denied.failed.length,1);
    assert.deepEqual(sqlite.prepare("SELECT * FROM component_insertions WHERE id=?").get(saved.id),saved);
  }finally{globalThis.__insertionsTest.catalog=previous;}
});


test("server enforces collector flange rules and rejects historical disallowed keys even with a fresh catalogue version", async () => {
  const previous = globalThis.__insertionsTest.catalog;
  try {
    const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
    const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
    const historical = JSON.parse(await readFile(new URL("./fixtures/insertion-3d.json", import.meta.url), "utf8"));
    const old = historical.rows.find(row => row.dnLarge === 50 && row.dnSmall === 32 && row.pn === 10 && row.leftConnection === "flanged");
    assert.ok(old?.identityKey);
    globalThis.__insertionsTest.catalog = makeInsertCatalog(source);
    const requested = { ...extensionInput, leftConnection: "flanged", rightConnection: "flanged", connectionPairs: [{ left: "flanged", right: "flanged" }] };
    const result = await calculate(requested);
    const target = result.rows.filter(row => row.dnSmall === 32 && row.pn === 10 && row.geometry === "concentric");
    assert.equal(target.length, 1); assert.ok(target[0].exportable);
    assert.deepEqual([target[0].leftConnection, target[0].rightConnection], ["collar", "collar"]);
    assert.equal(target[0].totalLengthMm, 114);
    assert.ok(result.rows.every(row => row.identityKey !== old.identityKey));
    const before = sqlite.prepare("SELECT count(*) n FROM component_insertions").get().n;
    const rejected = await (await exportRows(result, [old.identityKey], { input: requested, calculation: old, complete: true, price: 1 })).json();
    assert.equal(rejected.created, 0); assert.equal(rejected.updated, 0);
    assert.equal(rejected.failed.length, 1); assert.match(rejected.failed[0].reason, /отсутствует в текущем серверном расчёте/);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM component_insertions").get().n, before);
  } finally { globalThis.__insertionsTest.catalog = previous; }
});

test("DN150 PN25 reducer export uses server-priced ready flanges, persists dimensions and rejects stale prices", async () => {
  const previous = globalThis.__insertionsTest.catalog;
  try {
    const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
    const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
    const catalog = makeInsertCatalog(source); globalThis.__insertionsTest.catalog = catalog;
    const requested = { dnFrom: 150, dnTo: 150, materials: ["aisi304"], withSensorNipple: false, includeEccentric: false };
    const result = await calculate(requested);
    const rows = result.rows.filter(row => row.pn === 25 && [80, 100, 125].includes(row.dnSmall));
    assert.equal(rows.length, 3); assert.ok(rows.every(row => row.exportable));
    const keys = rows.map(row => row.identityKey);
    const exported = await (await exportRows(result, keys, { input: requested, price: 1, bom: [] })).json();
    assert.equal(exported.created, 3); assert.deepEqual(exported.failed, []);
    for (const row of rows) {
      const saved = sqlite.prepare("SELECT * FROM component_insertions WHERE identity_key=?").get(row.identityKey);
      assert.deepEqual([saved.base_length_mm, saved.total_length_mm], [140, 150]);
      assert.equal(saved.cached_price_microunits, Math.round(row.price * 1e6));
      const calculated = JSON.parse(saved.calculation_json);
      assert.deepEqual(calculated.bom, row.bom); assert.deepEqual(calculated.dimensions, row.dimensions);
      assert.equal(calculated.bom.find(item => item.role === "left-flanged").componentId, "newkey-din2503:NK-FDh150-4");
    }
    const repeated = await (await exportRows(result, keys, { input: requested })).json();
    assert.equal(repeated.created, 0); assert.equal(repeated.updated, 3);
    catalog.parts.find(part => part.id === "newkey-din2503:NK-FDh150-4").price += 100;
    assert.equal((await exportRows(result, keys, { input: requested })).status, 409);
  } finally { globalThis.__insertionsTest.catalog = previous; }
});

test("3D API protects previews, reads saved server calculations, ignores client prices and does not write", async () => {
  const previous = globalThis.__insertionsTest.catalog;
  try {
    globalThis.__insertionsTest.catalog = makeCatalog();
    const calc = await calculate(), row = calc.rows.find(r => r.exportable);
    assert.ok(row);
    const body = { input, identityKey: row.identityKey, catalogVersion: calc.catalogVersion, price: 1, calculation: { price: 1 }, angle: 0 };
    for (const [token, status] of [[null, 401], [ordinary, 403]]) assert.equal((await insert3d.POST(request("POST", token, body))).status, status);
    assert.equal((await insert3d.GET(request("GET", null))).status, 401);
    assert.equal((await insert3d.POST(request("POST", admin, body, { Origin: "https://external.invalid" }))).status, 403);
    const before = sqlite.prepare("SELECT COUNT(*) n FROM component_insertions").get().n;
    const preview = await insert3d.POST(request("POST", admin, body)); assert.equal(preview.status, 200);
    const t = (await preview.json()).template; assert.equal(t.source.price, row.price); assert.equal(t.source.recordId, null);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM component_insertions").get().n, before);
    assert.equal((await insert3d.POST(request("POST", admin, { ...body, catalogVersion: "old" }))).status, 409);
    assert.equal((await insert3d.POST(request("POST", admin, { ...body, identityKey: "unknown" }))).status, 404);
    assert.equal((await insert3d.POST(request("POST", admin, { ...body, angle: 361 }))).status, 422);
    await exportRows(calc, [row.identityKey]);
    const saved = sqlite.prepare("SELECT * FROM component_insertions WHERE identity_key=?").get(row.identityKey);
    const response = await insert3d.GET(new Request(`http://localhost/api/component-insertions-3d?id=${saved.id}`, { headers: { Cookie: `ps_session=${ordinary}` } }));
    assert.equal(response.status, 200); const loaded = (await response.json()).template;
    assert.equal(loaded.source.recordId, saved.id); assert.equal(loaded.source.revision, saved.revision); assert.equal(loaded.source.price, row.price);
    assert.equal(loaded.geometryKey, t.geometryKey);
    assert.equal((await insert3d.GET(new Request("http://localhost/api/component-insertions-3d?id=unknown", { headers: { Cookie: `ps_session=${ordinary}` } }))).status, 404);
    assert.equal(sqlite.prepare("SELECT revision FROM component_insertions WHERE id=?").get(saved.id).revision, saved.revision);
  } finally { globalThis.__insertionsTest.catalog = previous; }
});

test("ST20 concentric reducers are always visible; eccentric adds rows without changing straight PN lengths", async () => {
  const previous = globalThis.__insertionsTest.catalog;
  try {
    const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
    const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
    globalThis.__insertionsTest.catalog = makeInsertCatalog(source);
    const requested = { dnFrom: 50, dnTo: 150, materials: ["st20"], withSensorNipple: false };
    const without = await calculate({ ...requested, includeEccentric: false });
    const withReducers = await calculate({ ...requested, includeEccentric: true });
    assert.ok(without.rows.length > 0);
    assert.ok(without.rows.some(row => row.geometry === "concentric"));
    assert.ok(!without.rows.some(row => row.geometry === "eccentric"));
    assert.deepEqual(withReducers.rows.filter(row => row.geometry !== "eccentric"), without.rows);
    const transitions = withReducers.rows.filter(row => row.geometry === "eccentric");
    assert.ok(transitions.some(row => row.dnLarge === 50 && row.dnSmall === 32 && row.pn === 25));
    assert.ok(transitions.some(row => row.exportable));
    assert.ok(transitions.some(row => !row.exportable && row.warnings.length > 0));
    assert.equal(new Set(withReducers.rows.map(row => row.selection.slot)).size, withReducers.rows.length);
    const availability = withReducers.meta.reducerAvailability;
    assert.ok(availability.some(part => part.material === "st20" && part.dn === 50 && part.geometry === "eccentric"));
    assert.ok(availability.some(part => part.material === "st20" && part.geometry === "concentric"));
    assert.equal(new Set(availability.map(part => `${part.material}:${part.dn}:${part.geometry}`)).size, availability.length);
    const meta = await (await api.GET(request("GET", admin))).json();
    assert.deepEqual(meta.meta.reducerAvailability, availability);
  } finally { globalThis.__insertionsTest.catalog = previous; }
});

test("ST20 concentric inserts export all three PN, retain source prices and painting, and update without duplicates", async () => {
  const previous = globalThis.__insertionsTest.catalog;
  try {
    const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
    const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
    globalThis.__insertionsTest.catalog = makeInsertCatalog(source);
    const requested = { dnFrom: 80, dnTo: 80, materials: ["st20"], withSensorNipple: false, includeEccentric: false };
    const result = await calculate(requested);
    const rows = result.rows.filter(r => r.geometry === "concentric" && r.dnSmall === 65 && r.exportable);
    assert.deepEqual(rows.map(r => r.pn).sort((a, b) => a - b), [10, 16, 25]);
    const keys = rows.map(r => r.identityKey);
    const written = await (await exportRows(result, keys, { input: requested })).json();
    assert.equal(written.created, 3); assert.equal(written.failed.length, 0);
    for (const row of rows) {
      const saved = sqlite.prepare("SELECT * FROM component_insertions WHERE identity_key=?").get(row.identityKey);
      assert.equal(saved.cached_price_microunits, Math.round(row.price * 1e6));
      const calc = JSON.parse(saved.calculation_json);
      assert.deepEqual(calc.bom, row.bom); assert.equal(calc.baseLengthMm, 75); assert.equal(calc.totalLengthMm, 85);
      assert.ok(calc.bom.some(p => p.kind === "painting" && p.cost > 0));
      assert.match(calc.bom.find(p => p.kind === "reducer").source, /metall-ural/);
    }
    const repeated = await (await exportRows(result, keys, { input: requested })).json();
    assert.equal(repeated.created, 0); assert.equal(repeated.updated, 3);
    const reloaded = await calculate(requested);
    assert.ok(reloaded.rows.filter(r => keys.includes(r.identityKey)).every(r => !r.isNew && r.existingId));
    const baseId = rows[0].bom.find(p => p.kind === "reducer").componentId;
    globalThis.__insertionsTest.catalog.parts.find(p => p.id === baseId).price += 10;
    assert.equal((await exportRows(result, keys, { input: requested })).status, 409);
  } finally { globalThis.__insertionsTest.catalog = previous; }
});
