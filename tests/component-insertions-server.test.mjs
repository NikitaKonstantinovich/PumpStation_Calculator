import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

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

test("legacy body-only rows are conflicts; incomplete and forged identities cannot be exported", async () => {
  const result = await calculate(), legacy = result.rows.find(row => row.dnLarge === 100 && row.geometry === "straight");
  assert.ok(legacy.complete); assert.equal(legacy.exportable, false); assert.equal(legacy.isNew, false);
  assert.match(legacy.conflict, /suction-table:ff-100/);
  let exported = await (await exportRows(result, [legacy.identityKey, "forged-key"])).json();
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
    assert.ok(item.prices[0].amount > 1);
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
