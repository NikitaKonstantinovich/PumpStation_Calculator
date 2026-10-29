import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { loadTs } from "./load-ts.mjs";
globalThis.__PSC_RELEASE_PROFILE__ = "full";
const sqlite = new DatabaseSync(":memory:");
sqlite.exec("PRAGMA foreign_keys=ON");
for (const file of (await readdir(new URL("../drizzle/",import.meta.url))).filter(f => f.endsWith(".sql")).sort()) sqlite.exec(await readFile(new URL(`../drizzle/${file}`,import.meta.url),"utf8"));
class Statement {
  constructor(sql, values = []) { this.sql = sql; this.values = values; }
  bind(...v) { return new Statement(this.sql,v); }
  async first() { return sqlite.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return {success:true,results:sqlite.prepare(this.sql).all(...this.values)}; }
  async run() { return this.all(); }
}
globalThis.__lineServer = { DB: { prepare: sql => new Statement(sql), async batch(statements) {
  sqlite.exec("BEGIN"); try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec("COMMIT"); return results; } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
} }, source: JSON.parse(await readFile(new URL("../public/component-insert-source.json",import.meta.url),"utf8")) };
const {makeInsertCatalog} = await loadTs(new URL("../app/component-insert-catalog.ts",import.meta.url));
globalThis.__lineServer.catalog = makeInsertCatalog(globalThis.__lineServer.source);
const authUrl = new URL("../app/auth-server.ts",import.meta.url), sourceUrl = new URL("../app/component-insert-catalog-server.ts",import.meta.url);
const replacements = { [authUrl.href]: (await readFile(authUrl,"utf8")).replace('import { env } from "cloudflare:workers";', 'const env = globalThis.__lineServer;'),
  [sourceUrl.href]: 'export const currentInsertSource=async()=>globalThis.__lineServer.source; export const currentInsertCatalog=async()=>globalThis.__lineServer.catalog;' };
const auth = await loadTs(authUrl,replacements), api = await loadTs(new URL("../app/api/model-line-data/route.ts",import.meta.url),replacements);
sqlite.prepare("INSERT INTO users(id,email,name,password_hash,email_verified_at,role) VALUES(?,?,?,?,CURRENT_TIMESTAMP,?)").run("line-user","line@example.test","Geometry test","not-used","user");
const token = await auth.createSession("line-user");
const request = (ids, session = token, headers = {}) => new Request("http://localhost/api/model-line-data",{method:"POST",headers:{"Content-Type":"application/json",...(session?{Cookie:`ps_session=${session}`} : {}),...headers},body:JSON.stringify({ids})});

test("geometry endpoint is read-only, authenticated, full-only and does not require calculator admin", async () => {
  assert.equal((await api.POST(request([],null))).status,401);
  assert.equal((await api.POST(request([],token,{Origin:"https://unrelated.test"}))).status,403);
  assert.equal((await api.POST(request([null]))).status,400);
  const before = sqlite.prepare("SELECT COUNT(*) n FROM component_insertions").get().n;
  const response = await api.POST(request(["прокладки-001-r0009","прокладки-001-r0009","missing-equipment"]));
  assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"no-store");
  const data = await response.json(); assert.equal(data.version,1);assert.equal(Object.keys(data.items).length,1);assert.equal(data.issues.length,1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM component_insertions").get().n,before);
});

test("geometry endpoint serves real pipe wall data without inventing cut length or trusting request geometry", async () => {
  const part = globalThis.__lineServer.catalog.parts.find(p => p.kind === "pipe" && p.wallThickness && p.outerDiameter);
  const response = await api.POST(request([part.id]));assert.equal(response.status,200);
  const item = (await response.json()).items[part.id];assert.equal(item.outerDiameter,part.outerDiameter);assert.equal(item.wall,part.wallThickness);
  assert.equal(item.length,null);assert.ok(item.issues.some(i=>/монтажная длина/.test(i)));
});

test("legacy insertion geometry supplies calculator variants with exact end IDs without changing the price row", async () => {
  const response=await api.POST(request(['suction-table:ff-65'])); assert.equal(response.status,200);
  const geometry=(await response.json()).items['suction-table:ff-65'];
  assert.equal(geometry.length,null); assert.equal(geometry.shape,undefined);
  const variant=geometry.insertionBodies.find(b=>b.pn===16&&b.leftPartId==='воротники-002-r0035'&&b.rightPartId==='воротники-002-r0035');
  assert.ok(variant); assert.equal(variant.length,120); assert.equal(variant.outer,76.1); assert.equal(variant.wall,2.5);
  assert.equal(variant.leftAxial,25); assert.equal(variant.rightAxial,25);
});

test("ordinary 3D clients receive the documented KMS dimensions by PN and an exact unscaled mesh", async () => {
  const response=await api.POST(request(["компенсаторы-001-r0119"]));assert.equal(response.status,200);
  const geometry=(await response.json()).items["компенсаторы-001-r0119"];
  assert.equal(geometry.length,null);
  assert.equal(geometry.vibrationModels.find(m=>m.pn===16).length,135);
  assert.equal(geometry.vibrationModels.find(m=>m.pn===16).shape.kind,"mesh");
  assert.equal(geometry.vibrationModels.find(m=>m.pn===25).length,null);
  assert.equal(geometry.vibrationModels.find(m=>m.pn===25).shape,undefined);
});

test("DN20 membrane-tank nipple gets its reviewed wall through the real geometry endpoint", async () => {
  const id="сгоны-резьба-002-r0018",original=globalThis.__lineServer.source.items.find(p=>p.id===id),before=JSON.stringify(original);
  const response=await api.POST(request([id]));assert.equal(response.status,200);
  const geometry=(await response.json()).items[id];
  assert.equal(geometry.outerDiameter,26.9);assert.equal(geometry.wall,2.6);assert.equal(geometry.length,null);
  assert.match(geometry.source,/Ц0000003619/);assert.equal(JSON.stringify(original),before);
  assert.equal(globalThis.__lineServer.catalog.parts.find(p=>p.id===id).pn,null,"wall data must not confer a pressure rating");
});
