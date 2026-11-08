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

test("source inline type reaches the type, manufacturer and series filters without changing unknown types", async () => {
  const f = await fixture();
  try {
    const db = new DatabaseSync(f.path);
    db.exec(`
      INSERT INTO pump_types VALUES('vertical_single_stage_inline','Вертикальный одноступенчатый инлайн'),('inline','Инлайн'),('unmapped_type','Неизвестный тип');
      UPDATE models SET pump_type_id='vertical_single_stage_inline' WHERE id='a';
      UPDATE models SET pump_type_id='unmapped_type',designation='Inline TD model' WHERE id='b';
    `);
    db.close();
    const before = await hash(f.path), snapshot = readCatalogSnapshot(f.path);
    assert.equal(await hash(f.path), before);
    const inline = snapshot.items.filter(item => item.modelId === "a");
    assert.equal(inline.length, 2);
    assert(inline.every(item => item.pump.type === "inline" && item.provenance.pumpType.id === "vertical_single_stage_inline"));
    assert.equal(snapshot.items.find(item => item.modelId === "b").pump.type, "unknown");
    const { executePumpOperation } = await loadTs(new URL("../app/node-tools/pump-runtime.ts", import.meta.url));
    const sourceBefore = JSON.stringify(snapshot);
    const context = { values: {}, defaults: {}, role: "admin", resources: { pump_catalog_v2: snapshot } };
    const run = (operation, values) => executePumpOperation({ id: operation, operation, fields: [], values: {}, links: [], expressions: {} }, values, context);
    const catalog = run("pump.catalog", { source: "pump_catalog_v2" }).value;
    const types = run("pump.options", { catalog, attribute: "type" }).options;
    assert.deepEqual(types.find(option => option.value === "inline"), { value: "inline", label: "Вертикальный in-line" });
    assert.deepEqual(run("pump.options", { catalog, attribute: "manufacturer", type: "inline" }).options, [{ value: "Изготовитель", label: "Изготовитель" }]);
    assert.deepEqual(run("pump.options", { catalog, attribute: "series", type: "inline", manufacturer: "Изготовитель" }).options, [{ value: "Серия", label: "Серия" }]);
    const filtered = run("pump.filter", { catalog, type: "inline", request: { flowRate: 10, head: 30, staticHead: 0, workingPumpCount: 1, medium: "water" } }).value;
    assert.deepEqual(filtered.rows.map(row => row.variantId).sort(), ["variant-one", "variant-two"]);
    assert.equal(JSON.stringify(snapshot), sourceBefore);
    const canonical = new DatabaseSync(f.path);
    canonical.exec("UPDATE models SET pump_type_id='inline' WHERE id='a'");
    canonical.close();
    assert(readCatalogSnapshot(f.path).items.filter(item => item.modelId === "a").every(item => item.pump.type === "inline"));
  } finally { await f.close(); }
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

async function dimensionFixture() {
  const f=await fixture(),db=new DatabaseSync(f.path);
  db.exec(`
    ALTER TABLE models ADD COLUMN family_id TEXT;UPDATE models SET family_id='family-a' WHERE id='a';
    CREATE TABLE dimension_definitions(code TEXT PRIMARY KEY,name_ru TEXT,unit TEXT,meaning TEXT);
    INSERT INTO dimension_definitions VALUES('overall_height','Общая высота','mm','От опоры'),('base_length','Длина основания','mm','Вдоль потока');
    CREATE TABLE dimension_sets(id TEXT PRIMARY KEY,model_id TEXT,exact_designation TEXT,scope TEXT,source_document_name TEXT,source_document_sha256 TEXT,document_page INTEGER,applicability TEXT,source_id TEXT);
    CREATE TABLE dimension_values(dimension_set_id TEXT,source_key TEXT,source_symbol TEXT,dimension_code TEXT,value_mm REAL,mapping_status TEXT,value_method TEXT);
    CREATE TABLE preferred_dimension_sets(variant_id TEXT,dimension_set_id TEXT,printed_page INTEGER,applicability TEXT,source_id TEXT);
    CREATE TABLE inline_dimension_selections(model_id TEXT,dimension_set_id TEXT,evidence_level TEXT,source_id TEXT);
    CREATE TABLE catalogue_geometry_profiles(id TEXT PRIMARY KEY,family_id TEXT,axis_definition TEXT,applicability TEXT,source_id TEXT,pdf_page INTEGER,printed_page INTEGER);
    CREATE TABLE catalogue_geometry_values(profile_id TEXT,code TEXT,value REAL,unit TEXT,source_symbol TEXT,source_dimension_text TEXT,dimension_code TEXT);
    CREATE TABLE variant_geometry_bindings(variant_id TEXT,profile_id TEXT,applicability TEXT);
    CREATE TABLE assets(id TEXT PRIMARY KEY,kind TEXT,path TEXT);
    INSERT INTO assets VALUES('local-file','dimension_image','C:/private/library/pump.png'),('public-file','dimension_image','frontend/public/drawings/pump.png');
    CREATE TABLE external_asset_references(variant_id TEXT,kind TEXT,url TEXT,local_asset_id TEXT);
    INSERT INTO external_asset_references VALUES('variant-one','drawing_pdf','https://manufacturer.example/pump.pdf','local-file');
  `);
  return {...f,db,async close(){db.close();await f.close();}};
}

test("variant dimension preferences keep separate exact bindings, source symbols, scope and provenance without inventing asset URLs",async()=>{
  const f=await dimensionFixture();
  try {
    f.db.exec(`
      INSERT INTO dimension_sets VALUES('d1','a','Общее название','designation','C:/private/catalogue/official.pdf','hash-one',7,'catalogue_designation_not_factory_as_built','dims-one'),('d2','a','Общее название','designation','official2.pdf','hash-two',8,'another_motor_execution','dims-two');
      INSERT INTO dimension_values VALUES('d1','H','H','overall_height',800,'semantic_source_key','official_source'),('d1','H1','H1',NULL,250,'symbol_only','source_symbol'),('d1','H-alternative','H','overall_height',999,'alternative_execution','other_motor'),('d2','H','H','overall_height',900,'semantic_source_key','official_source');
      INSERT INTO preferred_dimension_sets VALUES('variant-one','d1',6,'selected_variant_binding','pref-one'),('variant-two','d2',7,'selected_variant_binding','pref-two');
    `);
    const before=await hash(f.path),snapshot=readCatalogSnapshot(f.path),first=snapshot.items.find(item=>item.variantId==='variant-one'),second=snapshot.items.find(item=>item.variantId==='variant-two');
    assert.equal(await hash(f.path),before);assert.equal(first.pump.dimensions.overall_height,800);assert.equal(second.pump.dimensions.overall_height,900);
    assert.equal(first.pump.dimensions.scope,'variant_bound_designation');assert.equal(first.pump.dimensions.sourceValues.length,3);assert.equal(first.pump.dimensions.sourceValues.find(row=>row.key==='H1').code,null);assert.equal(first.pump.dimensions.H1,undefined);
    assert.equal(first.provenance.dimensions.document,'official.pdf');assert.equal(first.provenance.dimensions.documentSha256,'hash-one');assert.equal(first.provenance.dimensions.page,7);assert.equal(first.provenance.dimensions.printedPage,6);assert.equal(first.provenance.dimensions.sourceId,'dims-one');assert.equal(first.provenance.dimensions.bindingSourceId,'pref-one');
    assert(first.issues.some(issue=>issue.includes('Альтернативные')));assert.equal(first.pump.drawing,null);assert.equal(first.pump.assets,undefined);
    assert(!JSON.stringify(first.pump).includes('C:/private'));assert(!JSON.stringify(first.pump).includes('/drawings/pump.png'));assert(!JSON.stringify(first.pump).includes('manufacturer.example'));
  } finally {await f.close();}
});

test("model reference dimensions and literal designation references never become verified factory article dimensions",async()=>{
  const f=await dimensionFixture();
  try {
    f.db.exec(`
      INSERT INTO dimension_sets VALUES('reference','b',NULL,'model_reference','reference.pdf','hash-ref',2,'reference_not_every_pressure_variant','ref-source'),('designation','a','Общее название','designation','designation.pdf','hash-exact',4,'exact_designation_only','designation-source');
      INSERT INTO dimension_values VALUES('reference','H','H','overall_height',1000,'semantic_source_key','model_reference'),('designation','H','H','overall_height',850,'semantic_source_key','exact_designation');
      INSERT INTO inline_dimension_selections VALUES('b','reference','official_model_table','inline-source');
    `);
    const snapshot=readCatalogSnapshot(f.path),reference=snapshot.items.find(item=>item.variantId==='variant-empty'),designation=snapshot.items.find(item=>item.variantId==='variant-one');
    assert.equal(reference.pump.dimensions.scope,'model_reference');assert.equal(reference.pump.dimensions.overall_height,1000);assert.equal(reference.provenance.dimensions.selection,'explicit_model_selection');assert(reference.pump.dimensions.note.includes('не подтверждена'));
    assert.equal(designation.pump.dimensions.scope,'designation_reference');assert.equal(designation.pump.dimensions.overall_height,850);assert.equal(designation.provenance.dimensions.selection,'exact_designation_reference');assert(designation.pump.dimensions.note.includes('привязка к артикулу отсутствует'));
    f.db.exec("UPDATE dimension_sets SET exact_designation='Other manufacturer execution' WHERE id='designation'");
    assert.equal(readCatalogSnapshot(f.path).items.find(item=>item.variantId==='variant-one').pump.dimensions,undefined);
  } finally {await f.close();}
});

test("ambiguous dimension sets, conflicting semantic values and wrong model bindings remain explicitly unknown",async()=>{
  const f=await dimensionFixture();
  try {
    f.db.exec(`
      INSERT INTO dimension_sets VALUES('d1','a','Общее название','designation','one.pdf','h1',1,'exact','s1'),('d2','a','Общее название','designation','two.pdf','h2',2,'exact','s2');
      INSERT INTO dimension_values VALUES('d1','H','H','overall_height',800,'semantic_source_key','source'),('d2','H','H','overall_height',900,'semantic_source_key','source');
    `);
    let item=readCatalogSnapshot(f.path).items.find(item=>item.variantId==='variant-one');
    assert.equal(item.pump.dimensions.scope,'unknown');assert.equal(item.pump.dimensions.overall_height,undefined);assert(item.issues.some(issue=>issue.includes('однозначный набор')));
    f.db.exec("INSERT INTO preferred_dimension_sets VALUES('variant-one','d1',1,'explicit','pref');INSERT INTO dimension_values VALUES('d1','H-conflict','H','overall_height',801,'semantic_source_key','other_source')");
    item=readCatalogSnapshot(f.path).items.find(item=>item.variantId==='variant-one');
    assert.equal(item.pump.dimensions.overall_height,null);assert.equal(item.pump.dimensions.sourceValues.length,2);assert(item.issues.some(issue=>issue.includes('Неоднозначные значения')));
    f.db.exec("UPDATE dimension_sets SET model_id='b' WHERE id='d1'");
    item=readCatalogSnapshot(f.path).items.find(item=>item.variantId==='variant-one');
    assert.equal(item.pump.dimensions.scope,'unknown');assert(item.issues.some(issue=>issue.includes('не соответствует модели')));
  } finally {await f.close();}
});

test("explicit family geometry stays in its own scoped block and is never inferred for another execution",async()=>{
  const f=await dimensionFixture();
  try {
    f.db.exec(`
      INSERT INTO catalogue_geometry_profiles VALUES('base','family-a','x along flow','motor_independent_base','base-source',10,9);
      INSERT INTO catalogue_geometry_values VALUES('base','base_length_along_flow',150,'mm',NULL,'150','base_length'),('base','mounting_hole_count',4,'count',NULL,'4',NULL);
      INSERT INTO variant_geometry_bindings VALUES('variant-one','base','exact_listed_execution');
    `);
    const before=await hash(f.path),snapshot=readCatalogSnapshot(f.path),first=snapshot.items.find(item=>item.variantId==='variant-one'),second=snapshot.items.find(item=>item.variantId==='variant-two');
    assert.equal(await hash(f.path),before);assert.equal(first.pump.dimensions.scope,'unknown');assert.equal(first.pump.dimensions.base_length,undefined);assert.equal(first.pump.dimensions.baseGeometry.base_length,150);assert.equal(first.pump.dimensions.baseGeometry.scope,'variant_bound_family_geometry');assert.equal(first.pump.dimensions.baseGeometry.sourceValues.find(row=>row.key==='mounting_hole_count').unit,'count');assert.equal(first.provenance.dimensions.baseGeometry.sourceId,'base-source');assert.equal(second.pump.dimensions,undefined);
    f.db.exec("UPDATE catalogue_geometry_profiles SET family_id='different-family'");
    const rejected=readCatalogSnapshot(f.path).items.find(item=>item.variantId==='variant-one');assert.equal(rejected.pump.dimensions,undefined);assert(rejected.issues.some(issue=>issue.includes('Геометрия основания')));
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

async function serverFixture() {
  const f=await fixture(),sql=new DatabaseSync(":memory:"),unique="__nodeCatalogRetry"+crypto.randomUUID().replaceAll("-","");
  try {
    sql.exec(await readFile(new URL("../drizzle/0018_node_catalog_snapshots.sql",import.meta.url),"utf8"));
    class Statement {constructor(query,params=[]){this.query=query;this.params=params;}bind(...params){return new Statement(this.query,params);}async first(){return sql.prepare(this.query).get(...this.params)??null;}async all(){return{results:sql.prepare(this.query).all(...this.params)};}async run(){return{meta:{changes:sql.prepare(this.query).run(...this.params).changes}};}}
    const state={db:{prepare:query=>new Statement(query),async batch(statements){sql.exec("BEGIN");try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec("COMMIT");return result;}catch(e){sql.exec("ROLLBACK");throw e;}}},service:undefined};
    globalThis[unique]=state;
    const base=new URL("../app/",import.meta.url),server=await loadTs(new URL("node-tools/catalog-server.ts",base),{
      [new URL("auth-server.ts",base).href]:`export const db=()=>globalThis.${unique}.db;`,
      [new URL("node-tools/catalog-binding-server.ts",base).href]:`export const catalogService=()=>globalThis.${unique}.service;`
    });
    return {server,state,sql,snapshot:readCatalogSnapshot(f.path),async close(){delete globalThis[unique];sql.close();await f.close();}};
  } catch(e) {delete globalThis[unique];sql.close();await f.close();throw e;}
}

test("latest catalogue retries one transient transport or decode failure and preserves its pinned snapshot",async()=>{
  const f=await serverFixture();
  try {
    for(const failure of [()=>{throw new TypeError("connection reset");},()=>new Response("truncated json")]) {
      let calls=0;
      f.state.service={fetch:async()=>++calls===1?failure():Response.json(f.snapshot)};
      const snapshot=await f.server.catalogSnapshot();
      assert.equal(calls,2);assert.equal(snapshot.id,f.snapshot.id);
      assert.equal((await f.server.catalogSnapshot(snapshot.id)).id,snapshot.id);assert.equal(calls,2);
    }
  } finally {await f.close();}
});

test("simultaneous latest catalogue requests share one source read and stored result",async()=>{
  const f=await serverFixture();
  try {
    let calls=0,release;
    f.state.service={fetch:()=>{calls++;return new Promise(resolve=>{release=resolve;});}};
    const requests=[f.server.catalogSnapshot(),f.server.catalogSnapshot(),f.server.catalogSnapshot()];
    assert.equal(calls,1);
    release(Response.json(f.snapshot));
    const snapshots=await Promise.all(requests);
    assert.equal(calls,1);assert.equal(snapshots[0].id,f.snapshot.id);
    assert.strictEqual(snapshots[0],snapshots[1]);assert.strictEqual(snapshots[1],snapshots[2]);
  } finally {await f.close();}
});

test("permanent transport failures stop after two attempts and release the pending latest request",async()=>{
  const f=await serverFixture();
  try {
    let calls=0;
    f.state.service={fetch:async()=>{calls++;throw new TypeError("connection reset");}};
    const failed=error=>error instanceof f.server.CatalogError&&error.status===503;
    await assert.rejects(()=>f.server.catalogSnapshot(),failed);assert.equal(calls,2);
    await assert.rejects(()=>f.server.catalogSnapshot(),failed);assert.equal(calls,4);
    f.state.service={fetch:async()=>{calls++;return Response.json(f.snapshot);}};
    assert.equal((await f.server.catalogSnapshot()).id,f.snapshot.id);assert.equal(calls,5);
  } finally {await f.close();}
});

test("invalid snapshot contracts and explicit HTTP errors are never retried",async()=>{
  const f=await serverFixture();
  try {
    for(const [response,status] of [
      [()=>Response.json({...f.snapshot,sourceId:"invalid"}),503],
      [()=>Response.json({error:"Invalid source"},{status:400}),400],
      [()=>Response.json({error:"Unavailable source"},{status:503}),503],
      [()=>new Response("unreadable error body",{status:503}),503]
    ]) {
      let calls=0;
      f.state.service={fetch:async()=>{calls++;return response();}};
      await assert.rejects(()=>f.server.catalogSnapshot(),error=>error instanceof f.server.CatalogError&&error.status===status);
      assert.equal(calls,1);
    }
    f.state.service={fetch:async()=>Response.json(f.snapshot)};
    assert.equal((await f.server.catalogSnapshot()).id,f.snapshot.id);
  } finally {await f.close();}
});

test("missing or damaged pinned snapshots and storage failures never retry the live source",async()=>{
  const f=await serverFixture();
  try {
    let calls=0;
    f.state.service={fetch:async()=>{calls++;return Response.json(f.snapshot);}};
    const snapshot=await f.server.catalogSnapshot();assert.equal(calls,1);
    await assert.rejects(()=>f.server.catalogSnapshot("0".repeat(64)),error=>error.status===404);assert.equal(calls,1);
    await assert.rejects(()=>f.server.catalogSnapshot("invalid"),error=>error.status===400);assert.equal(calls,1);
    f.sql.prepare("INSERT INTO node_catalog_snapshots(id,source,header) VALUES(?,?,?)").run("c".repeat(64),"pump_catalog_v2","{");
    await assert.rejects(()=>f.server.catalogSnapshot("c".repeat(64)),error=>error.status===503);assert.equal(calls,1);
    const originalDb=f.state.db;
    f.state.db={prepare(){throw Error("storage unavailable");}};
    await assert.rejects(()=>f.server.catalogSnapshot(snapshot.id),error=>error.status===503);assert.equal(calls,1);
    await assert.rejects(()=>f.server.catalogSnapshot(),error=>error.status===503);assert.equal(calls,2);
    f.state.db=originalDb;
    assert.equal((await f.server.catalogSnapshot(snapshot.id)).id,snapshot.id);assert.equal(calls,2);
  } finally {await f.close();}
});
