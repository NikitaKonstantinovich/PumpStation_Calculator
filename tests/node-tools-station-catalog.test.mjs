import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";

const app = new URL("../app/", import.meta.url);
const { legacyBaseValues, baseSnapshot, stableBaseJson } = await loadTs(new URL("base-values.ts", app));
async function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(await readFile(new URL("../drizzle/0018_node_catalog_snapshots.sql", import.meta.url), "utf8"));
  sql.exec("CREATE TABLE component_calculator_source_revision(id INTEGER PRIMARY KEY,revision INTEGER NOT NULL);INSERT INTO component_calculator_source_revision VALUES(1,1);CREATE TABLE catalog_imports(id INTEGER PRIMARY KEY,source_sha256 TEXT,imported_at TEXT,is_active INTEGER);INSERT INTO catalog_imports VALUES(1,'fixture-source','2026-11-08',1)");
  const state = { baseId: "base-a", baseValues: legacyBaseValues(), saved: [{ id: "saved-1", catalogId: "ответные-части", family: "Сохранённая вставка", fields: [], prices: [{ amount: 200, currency: "RUB", label: "Подтверждено" }] }], collector: { version: "collector-a", components: [], bolts: [] }, insertVersion: "insert-a", calls: { base: 0, resolve: 0, saved: 0, insert: 0, collector: 0 }, failSource: false, failDb: false, delay: null, statements: [] };
  class Statement {
    constructor(query, params = []) { this.query = query; this.params = params; }
    bind(...params) { return new Statement(this.query, params); }
    async first() { if (state.failDb) throw Error("D1 недоступна"); if (this.query.startsWith("SELECT revision,")) { state.markerCalls = (state.markerCalls ?? 0) + 1; if (state.changingMarker || state.changeOnce && state.markerCalls === 2) sql.exec("UPDATE component_calculator_source_revision SET revision=revision+1"); } return sql.prepare(this.query).get(...this.params) ?? null; }
    async all() { if (state.failDb) throw Error("D1 недоступна"); return { results: sql.prepare(this.query).all(...this.params) }; }
    async run() { if (state.failDb) throw Error("D1 недоступна"); state.statements.push(this); return { meta: { changes: sql.prepare(this.query).run(...this.params).changes } }; }
  }
  state.db = { prepare: query => new Statement(query), async batch(statements) { sql.exec("BEGIN"); try { const result = []; for (const statement of statements) result.push(await statement.run()); sql.exec("COMMIT"); return result; } catch (error) { sql.exec("ROLLBACK"); throw error; } } };
  state.currentBase = async () => { state.calls.base++; if (state.delay) await state.delay; return { id: state.baseId, values: structuredClone(state.baseValues) }; };
  state.resolveBase = async versions => { state.calls.resolve++; assert.equal(Object.keys(versions).length, Object.keys(baseSnapshot("a", state.baseValues).versions).length); return { versions: { ...versions }, values: structuredClone(state.baseValues) }; };
  const unique = "__stationCatalog" + crypto.randomUUID().replaceAll("-", "");
  globalThis[unique] = state;
  const global = "globalThis." + unique;
  const replacements = {
    [new URL("auth-server.ts", app).href]: `export const db=()=>${global}.db;export const sha256=async value=>Buffer.from(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))).toString("base64url");export const currentUser=async request=>request.headers.has("x-role")?{role:request.headers.get("x-role")}:null;export const json=(v,status=200,headers={})=>Response.json(v,{status,headers});`,
    [new URL("base-values-server.ts", app).href]: `export const currentBasePublication=()=>${global}.currentBase();export const resolveBaseVersions=versions=>${global}.resolveBase(versions);`,
    [new URL("component-insert-store-server.ts", app).href]: `export const readSavedInsertions=async()=>{${global}.calls.saved++;if(${global}.failSource)throw Error("Источник вставок недоступен");if(${global}.changingSaved)${global}.saved[0].prices[0].amount++;return structuredClone(${global}.saved);};export const savedInsertionComponent=(row,version)=>({...row,sourceVersion:version});`,
    [new URL("component-insert-catalog-server.ts", app).href]: `export const currentInsertCatalog=async (_source,base)=>{${global}.calls.insert++;return {version:${global}.insertVersion+":"+base.versions.welding};};`,
    [new URL("collector-catalog-server.ts", app).href]: `export const currentCollectorCatalog=async()=>{${global}.calls.collector++;return structuredClone(${global}.collector);};`,
    [new URL("node-tools/catalog-server.ts", app).href]: "export class CatalogError extends Error {constructor(message,status=503){super(message);this.status=status;}}export const catalogSnapshot=async()=>{throw Error('Pump catalogue must not be read by station resources');};",
    [new URL("release-policy.ts", app).href]: "export const IS_BETA=false;",
    [new URL("../public/binding-components.json", app).href]: JSON.stringify({ source: { sha256: "static-binding" }, items: [], catalogs: [], statistics: { componentRows: 0, pricedComponentRows: 0 } }),
    [new URL("../public/control-cabinet-database.json", app).href]: JSON.stringify({ components: [], cabinets: [{ id: "smart-a", model: "SMART" }], statistics: { components: 0, pricedComponents: 0 } }),
    [new URL("../public/control-cabinets.json", app).href]: JSON.stringify([{ id: "cabinet-a", model: "Шкаф" }]),
  };
  const load = path => loadTs(new URL(path + ".ts", app), replacements);
  return { state, sql, load, server: await load("node-tools/station-catalog-server"), client: await load("node-tools/station-catalog"), route: await load("api/node-station-catalog/route"), close() { delete globalThis[unique]; sql.close(); } };
}
const counts = state => JSON.stringify(state.calls);

test("station catalogue captures current base, components, saved insertions and cabinets and pins each source revision immutably", async () => {
  const f = await fixture(); try {
    const old = await f.server.stationCatalogSnapshot();
    assert.equal(old.sourceId, "station_catalog"); assert.match(old.id, /^[a-f0-9]{64}$/);
    assert.equal(old.baseSettings.versions.welding, "base-a");
    assert.equal(old.components.items.find(item => item.id === "saved-1").sourceVersion, "insert-a:base-a");
    assert.equal(old.cabinets[0].id, "cabinet-a"); assert.equal(old.smartCabinets[0].id, "smart-a");
    assert.deepEqual(old.components.collectorCatalog, old.collectorCatalog);
    assert(old.collectorCatalog.version.startsWith("collector-a:base:"));
    assert.equal((await f.server.stationCatalogSnapshot()).id, old.id, "Unchanged content gives the same snapshot");
    f.state.collector.version = "collector-b"; f.state.saved[0].prices[0].amount = 400; f.state.insertVersion = "insert-b";
    const current = await f.server.stationCatalogSnapshot(); assert.notEqual(current.id, old.id);
    assert.equal(current.components.items.find(item => item.id === "saved-1").prices[0].amount, 400);
    const before = counts(f.state); f.state.failSource = true;
    assert.equal((await f.server.stationCatalogSnapshot(old.id, old.baseSettings.versions)).components.items.find(item => item.id === "saved-1").prices[0].amount, 200);
    assert.equal(counts(f.state), before, "Pinned load never reads live sources");
    await assert.rejects(() => f.server.stationCatalogSnapshot("0".repeat(64)), error => error.status === 404);
    await assert.rejects(() => f.server.stationCatalogSnapshot("invalid"), error => error.status === 400);
    assert.equal(counts(f.state), before, "Missing or invalid pins never fall back to latest");
    assert.throws(() => f.sql.prepare("UPDATE node_catalog_snapshots SET header='{}' WHERE id=?").run(old.id), /immutable/);
    assert.throws(() => f.sql.prepare("DELETE FROM node_catalog_chunks WHERE snapshot_id=?").run(old.id), /immutable/);
    assert.throws(() => f.sql.prepare("INSERT INTO node_catalog_chunks VALUES(?, -1, ?)").run(old.id, '"bad"'), /CHECK/);
    for (const row of f.sql.prepare("SELECT payload FROM node_catalog_chunks").all()) assert.equal(typeof JSON.parse(row.payload), "string");
  } finally { f.close(); }
});

test("base mismatches are rejected and explicit base versions create an independently reproducible snapshot", async () => {
  const f = await fixture(); try {
    const first = await f.server.stationCatalogSnapshot(), versions = baseSnapshot("base-b", f.state.baseValues).versions;
    const before = counts(f.state);
    await assert.rejects(() => f.server.stationCatalogSnapshot(first.id, versions), error => error.status === 409 && /базовых правил/.test(error.message));
    assert.equal(counts(f.state), before);
    const second = await f.server.stationCatalogSnapshot(undefined, versions);
    assert.notEqual(second.id, first.id); assert.deepEqual(second.baseSettings.versions, versions);
    assert.equal(f.state.calls.base, 1); assert.equal(f.state.calls.resolve, 1);
    assert.equal((await f.server.stationCatalogSnapshot(first.id, Object.fromEntries(Object.entries(first.baseSettings.versions).reverse()))).id, first.id, "Version map order is immaterial");
    assert.equal((await f.server.stationCatalogSnapshot(second.id, versions)).collectorCatalog.weldRates.aisi304, f.state.baseValues.welding.aisi304);
  } finally { f.close(); }
});

test("coalesced current capture shares source reads, and a failed capture never publishes empty success or sticks in cache", async () => {
  const f = await fixture(); try {
    let release; f.state.delay = new Promise(resolve => { release = resolve; });
    const requests = [f.server.stationCatalogSnapshot(), f.server.stationCatalogSnapshot(), f.server.stationCatalogSnapshot()];
    assert.equal(f.state.calls.base, 1); release();
    const values = await Promise.all(requests); assert.strictEqual(values[0], values[1]); assert.strictEqual(values[1], values[2]);
    assert.equal(f.state.calls.saved, 2); assert.equal(f.state.calls.collector, 1); assert.equal(f.state.calls.insert, 1);
    f.state.failSource = true; const rows = f.sql.prepare("SELECT count(*) AS n FROM node_catalog_snapshots").get().n;
    await assert.rejects(() => f.server.stationCatalogSnapshot(), /Источник вставок недоступен/);
    assert.equal(f.sql.prepare("SELECT count(*) AS n FROM node_catalog_snapshots").get().n, rows);
    f.state.failSource = false; f.state.saved[0].prices[0].amount = 999;
    assert.notEqual((await f.server.stationCatalogSnapshot()).id, values[0].id);
    f.state.failDb = true; const before = counts(f.state);
    await assert.rejects(() => f.server.stationCatalogSnapshot(values[0].id), /D1 недоступна/);
    assert.equal(counts(f.state), before);
  } finally { f.close(); }
});

test("corrupt or incomplete immutable chunks fail rather than consulting the changing source", async () => {
  const f = await fixture(); try {
    const fake = "f".repeat(64);
    f.sql.prepare("INSERT INTO node_catalog_snapshots(id,source,header) VALUES(?,'station_catalog','{}')").run(fake);
    f.sql.prepare("INSERT INTO node_catalog_chunks(snapshot_id,ordinal,payload) VALUES(?,0,?)").run(fake, JSON.stringify("{}"));
    const before = counts(f.state);
    await assert.rejects(() => f.server.stationCatalogSnapshot(fake), error => error.status === 503 && /повреждены/.test(error.message));
    assert.equal(counts(f.state), before);
    const empty = "e".repeat(64); f.sql.prepare("INSERT INTO node_catalog_snapshots(id,source,header) VALUES(?,'station_catalog','{}')").run(empty);
    await assert.rejects(() => f.server.stationCatalogSnapshot(empty), error => error.status === 503);
    assert.equal(counts(f.state), before);
  } finally { f.close(); }
});

test("source revision or saved insertion changes are retried and never captured as a mixed snapshot", async () => {
  const f = await fixture(); try {
    f.state.changeOnce = true;
    await f.server.stationCatalogSnapshot(); assert.equal(f.state.calls.collector, 2, "A changed source is reread before capture");
    const before = f.sql.prepare("SELECT count(*) AS n FROM node_catalog_snapshots").get().n;
    f.state.changingMarker = true;
    await assert.rejects(() => f.server.stationCatalogSnapshot(), error => error.status === 409 && /изменяются/.test(error.message));
    assert.equal(f.sql.prepare("SELECT count(*) AS n FROM node_catalog_snapshots").get().n, before);
    f.state.changingMarker = false; f.state.changingSaved = true;
    await assert.rejects(() => f.server.stationCatalogSnapshot(), error => error.status === 409);
    assert.equal(f.sql.prepare("SELECT count(*) AS n FROM node_catalog_snapshots").get().n, before);
    f.state.changingSaved = false;
    assert.match((await f.server.stationCatalogSnapshot()).id, /^[a-f0-9]{64}$/);
  } finally { f.close(); }
});

test("large Unicode source records round trip through bounded chunks without splitting source JSON values", async () => {
  const f = await fixture(); try {
    const long = "Сталь\n漢🙂".repeat(40000);
    f.state.saved[0].fields = [{ column: "large-source", headerPath: ["Данные источника"], value: long }];
    const captured = await f.server.stationCatalogSnapshot();
    assert.equal((await f.server.stationCatalogSnapshot(captured.id)).components.items.find(item => item.id === "saved-1").fields[0].value, long);
    const chunks = f.sql.prepare("SELECT ordinal,payload FROM node_catalog_chunks WHERE snapshot_id=? ORDER BY ordinal").all(captured.id);
    assert(chunks.length > 2);
    for (const [index, chunk] of chunks.entries()) { assert.equal(chunk.ordinal, index); assert(JSON.parse(chunk.payload).length <= 60000); assert(Buffer.byteLength(chunk.payload, "utf8") <= 360002); }
  } finally { f.close(); }
});

test("API authorization and tool resource integration retain the exact station pin and base version contract", async () => {
  const f = await fixture(); try {
    assert.equal((await f.route.GET(new Request("http://fixture/api/node-station-catalog"))).status, 401);
    const current = await f.server.stationCatalogSnapshot(), program = { plans: { dn: { steps: [{ operation: "engineering.catalog" }] } } };
    const storage = await f.load("node-tools/storage-server"), before = counts(f.state);
    const loaded = await storage.toolResources(program, { station_catalog: current.id }, current.baseSettings.versions);
    assert.equal(loaded.sourceVersions.station_catalog, current.id); assert.equal(loaded.resources.station_catalog.id, current.id); assert.equal(counts(f.state), before);
    await assert.rejects(() => storage.toolResources(program, { station_catalog: "0".repeat(64) }, current.baseSettings.versions), error => error.status === 404);
    await assert.rejects(() => storage.toolResources(program, { station_catalog: current.id }, baseSnapshot("other", f.state.baseValues).versions), error => error.status === 409);
    const response = await f.route.GET(new Request("http://fixture/api/node-station-catalog?snapshot=" + current.id, { headers: { "x-role": "base" } }));
    assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "private, no-store"); assert.equal((await response.json()).snapshot.id, current.id);
    const absent = f.client.executeStationCatalog({ id: "catalog", operation: "engineering.catalog" }, {}, { values: {}, defaults: {}, role: "admin" });
    assert.equal(absent.resources, null); assert.equal(absent.issues.length, 1); assert(absent.issues[0].message.includes("не загружены"));
    assert.equal(f.client.executeStationCatalog({ id: "catalog", operation: "other" }, {}, {}), undefined);
  } finally { f.close(); }
});

test("client sends requested immutable pin/base and exposes HTTP failures without a latest retry", async () => {
  const f = await fixture(), previousFetch = globalThis.fetch; try {
    const snapshot = await f.server.stationCatalogSnapshot(), calls = [];
    globalThis.fetch = async (url, options) => { calls.push([url, options]); return Response.json({ snapshot }); };
    assert.equal((await f.client.loadStationCatalog(snapshot.id, snapshot.baseSettings.versions)).id, snapshot.id);
    const query = new URL(calls[0][0], "http://fixture").searchParams;
    assert.equal(query.get("snapshot"), snapshot.id); assert.equal(stableBaseJson(JSON.parse(query.get("base"))), stableBaseJson(snapshot.baseSettings.versions)); assert.equal(calls[0][1].cache, "no-store");
    globalThis.fetch = async url => { calls.push([url]); return Response.json({ error: "Закреплённые справочники отсутствуют" }, { status: 404 }); };
    await assert.rejects(() => f.client.loadStationCatalog(snapshot.id), /Закреплённые справочники отсутствуют/); assert.equal(calls.length, 2);
    globalThis.fetch = async () => Response.json({ snapshot: { ...snapshot, id: "0".repeat(64) } });
    await assert.rejects(() => f.client.loadStationCatalog(snapshot.id), /другой снимок/);
    globalThis.fetch = async () => Response.json({ snapshot });
    await assert.rejects(() => f.client.loadStationCatalog(snapshot.id, baseSnapshot("different-base", f.state.baseValues).versions), /не соответствуют/);
  } finally { globalThis.fetch = previousFetch; f.close(); }
});
