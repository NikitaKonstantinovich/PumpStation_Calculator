import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { readCatalogSnapshot, nodeCatalogService } from "../services/local-storage/node-catalog.mjs";
import { loadTs } from "./load-ts.mjs";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "pumpstation-node-catalog-")), path = join(directory, "catalog.sqlite");
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    INSERT INTO metadata VALUES('schema_version','fixture/v1'),('status','draft');
    CREATE TABLE manufacturers(id TEXT PRIMARY KEY,name TEXT);INSERT INTO manufacturers VALUES('m','Изготовитель');
    CREATE TABLE series(id TEXT PRIMARY KEY,manufacturer_id TEXT,code TEXT);INSERT INTO series VALUES('s','m','Серия');
    CREATE TABLE pump_types(id TEXT PRIMARY KEY,name_ru TEXT);INSERT INTO pump_types VALUES('vertical_multistage','Вертикальный');
    CREATE TABLE models(id TEXT PRIMARY KEY,series_id TEXT,pump_type_id TEXT,designation TEXT,medium TEXT,lifecycle_status TEXT,selection_enabled INTEGER,source_id TEXT,nominal_flow_m3h REAL);
    INSERT INTO models VALUES('a','s','vertical_multistage','Модель','water','source_active',1,'source-a',10),('b','s','vertical_multistage','Без кривой',NULL,'source_active',1,'source-b',NULL);
    CREATE TABLE variants(id TEXT PRIMARY KEY,model_id TEXT,designation TEXT,manufacturer_article TEXT,source_id TEXT,has_sensors INTEGER,sensor_status TEXT);
    INSERT INTO variants VALUES('variant-one','a','Общее название','article-1','v1',NULL,'unknown'),('variant-two','a','Общее название','article-2','v2',0,'confirmed_absent'),('variant-empty','b','Без данных','article-3','v3',NULL,'unknown');
    CREATE TABLE motor_configurations(variant_id TEXT PRIMARY KEY,power_kw REAL,frequency_hz REAL,speed_rpm REAL,source_id TEXT);
    INSERT INTO motor_configurations VALUES('variant-one',3,50,2900,'motor1'),('variant-two',4,50,2900,'motor2');
    CREATE TABLE curve_sets(id TEXT PRIMARY KEY,model_id TEXT,frequency_hz REAL,source_id TEXT);INSERT INTO curve_sets VALUES('set-a','a',50,'qh1');
    CREATE TABLE curves(id TEXT PRIMARY KEY,curve_set_id TEXT,kind TEXT,x_unit TEXT,y_unit TEXT);INSERT INTO curves VALUES('qh-a','set-a','qh','m3/h','m');
    CREATE TABLE curve_points(curve_id TEXT,ordinal INTEGER,flow_m3h REAL,value REAL);INSERT INTO curve_points VALUES('qh-a',0,0,45),('qh-a',1,10,30),('qh-a',2,20,0);
    CREATE TABLE price_snapshots(id TEXT PRIMARY KEY,model_id TEXT,list_amount_decimal TEXT,net_amount_decimal TEXT,currency TEXT,price_kind TEXT,source_date TEXT,source_id TEXT,discount_percent REAL);
    INSERT INTO price_snapshots VALUES('price-a','a','100','55','RUB','net','2026-01-01','price-source',45);
    CREATE TABLE variant_price_links(variant_id TEXT,price_id TEXT,applicability TEXT);INSERT INTO variant_price_links VALUES('variant-one','price-a','exact');
  `);
  db.close();
  return { directory, path, async close() { if (dirname(resolve(directory)) === resolve(tmpdir()) && basename(directory).startsWith("pumpstation-node-catalog-")) await rm(directory, {recursive:true,force:true}); } };
}
const hash = async path => createHash("sha256").update(await readFile(path)).digest("hex");

test("registered catalogue normalizes separate variants, preserves unknowns and source data without writing the database", async () => {
  const f = await fixture();
  try {
    const before = await hash(f.path), snapshot = readCatalogSnapshot(f.path);
    assert.equal(await hash(f.path), before);assert.equal(snapshot.items.length,3);assert.equal(snapshot.sourceStatus,"draft");
    const first = snapshot.items.find(item=>item.variantId==="variant-one"), second = snapshot.items.find(item=>item.variantId==="variant-two");
    assert.equal(first.modelId,second.modelId);assert.notEqual(first.pump.id,second.pump.id);assert.equal(first.curveSetId,"set-a");assert.equal(first.frequencyHz,50);
    assert.equal(first.pump.price,55);assert.equal(first.pump.priceKind,"net");assert.equal(first.pump.inletDn,null);assert.equal(first.pump.weightKg,null);
    assert.equal(first.provenance.sensorStatus,"unknown");assert.equal(first.pump.mounting.hasSensors,null);assert.equal(second.pump.mounting.hasSensors,false);assert.equal(second.pump.price,null);
    const missing=snapshot.items.find(item=>item.variantId==="variant-empty");assert.equal(missing.pump.selectable,false);assert.equal(missing.curveSetId,null);assert.equal(missing.pump.medium,undefined);
    assert.equal(readCatalogSnapshot(f.path).id,snapshot.id);
    const db=new DatabaseSync(f.path);db.exec("UPDATE motor_configurations SET power_kw=5 WHERE variant_id='variant-one'");db.close();
    assert.notEqual(readCatalogSnapshot(f.path).id,snapshot.id);
    const changed=new DatabaseSync(f.path);changed.exec("INSERT INTO curve_sets VALUES('set-conflict','a',50,'source-other')");changed.close();const ambiguous=readCatalogSnapshot(f.path).items.find(i=>i.variantId==="variant-one");assert.equal(ambiguous.curveSetId,null);assert.equal(ambiguous.pump.selectable,false);assert(ambiguous.issues.some(issue=>issue.includes("однозначный")));
  } finally {await f.close();}
});

test("source rejects unregistered queries and distinguishes an empty catalogue from a missing or invalid source",async()=>{
  const f=await fixture();
  try {
    const service=nodeCatalogService(f.path), req=path=>new Request("http://catalog.internal"+path);
    assert.equal((await service(req("/snapshot?source=pump_catalog_v2&path=other.sqlite"))).status,400);
    assert.equal((await service(req("/snapshot?source=legacy"))).status,400);
    const unavailable=nodeCatalogService(join(f.directory,"missing.sqlite"));assert.equal((await unavailable(req("/snapshot?source=pump_catalog_v2"))).status,503);
    const db=new DatabaseSync(f.path);db.exec("DELETE FROM variants");db.close();
    const response=await service(req("/snapshot?source=pump_catalog_v2"));assert.equal(response.status,200);assert.equal((await response.json()).status,"empty");
  } finally {await f.close();}
});

test("immutable stored snapshots retain old catalogue data after live source changes and pinned lookup never falls back",async()=>{
  const f=await fixture(), sql=new DatabaseSync(":memory:");
  const unique="__nodeCatalog"+crypto.randomUUID().replaceAll("-","");
  try {
    sql.exec(await readFile(new URL("../drizzle/0018_node_catalog_snapshots.sql",import.meta.url),"utf8"));
    class Statement {constructor(query,params=[]){this.query=query;this.params=params;}bind(...params){return new Statement(this.query,params);}async first(){return sql.prepare(this.query).get(...this.params)??null;}async all(){return{results:sql.prepare(this.query).all(...this.params)};}async run(){return{meta:{changes:sql.prepare(this.query).run(...this.params).changes}};}}
    globalThis[unique]={db:{prepare:query=>new Statement(query),async batch(statements){sql.exec("BEGIN");try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec("COMMIT");return result;}catch(e){sql.exec("ROLLBACK");throw e;}}},service:{fetch:request=>nodeCatalogService(f.path)(typeof request==="string"?new Request(request):request)}};
    const base=new URL("../app/",import.meta.url), replacements={
      [new URL("auth-server.ts",base).href]:`export const db=()=>globalThis.${unique}.db;export const currentUser=async request=>request.headers.has("x-role")?{role:request.headers.get("x-role")}:null;export const json=(v,status=200,headers={})=>Response.json(v,{status,headers});`,
      [new URL("node-tools/catalog-binding-server.ts",base).href]:`export const catalogService=()=>globalThis.${unique}.service;`,
      [new URL("release-policy.ts",base).href]:"export const IS_BETA=false;"
    };
    const server=await loadTs(new URL("node-tools/catalog-server.ts",base),replacements), route=await loadTs(new URL("api/node-catalog/route.ts",base),replacements);
    assert.equal((await route.GET(new Request("http://fixture/api/node-catalog?source=pump_catalog_v2"))).status,401);
    assert.equal((await route.GET(new Request("http://fixture/api/node-catalog?source=other",{headers:{"x-role":"base"}}))).status,400);
    const old=await server.catalogSnapshot(), db=new DatabaseSync(f.path);db.exec("UPDATE motor_configurations SET power_kw=6 WHERE variant_id='variant-one'");db.close();
    const current=await server.catalogSnapshot();assert.notEqual(current.id,old.id);assert.equal((await server.catalogSnapshot(old.id)).items.find(i=>i.variantId==="variant-one").pump.power,3);
    assert.equal((await server.catalogSnapshot(current.id)).items.find(i=>i.variantId==="variant-one").pump.power,6);
    globalThis[unique].service=undefined;assert.equal((await server.catalogSnapshot(old.id)).id,old.id);await assert.rejects(()=>server.catalogSnapshot(),/не подключён/);await assert.rejects(()=>server.catalogSnapshot("0".repeat(64)),e=>e.status===404);
    await assert.rejects(()=>server.catalogSnapshot("invalid"),e=>e.status===400);
    sql.prepare("INSERT INTO node_catalog_snapshots(id,source,header) VALUES(?,?,?)").run("c".repeat(64),"pump_catalog_v2","{");await assert.rejects(()=>server.catalogSnapshot("c".repeat(64)),e=>e instanceof server.CatalogError&&e.status===503);
    assert.throws(()=>sql.exec("UPDATE node_catalog_chunks SET payload='[]'"),/immutable/);assert.throws(()=>sql.exec("DELETE FROM node_catalog_snapshots"),/immutable/);
  } finally {delete globalThis[unique];sql.close();await f.close();}
});
