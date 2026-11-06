// Run after npm run build:full. Uses bundled release assets and a temporary D1.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Miniflare } from "miniflare";
import {loadTs} from "./load-ts.mjs";

const release = JSON.parse(await readFile("dist/release.json", "utf8"));
assert.equal(release.profile, "full", "Run npm run build:full first");
const server = resolve("dist/server");
const modules = (await readdir(server, { recursive: true }))
  .filter(path => path.endsWith(".js"))
  .sort((a, b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b));
const worker = new Miniflare({
  host: "127.0.0.1", port: 0, modulesRoot: server,
  modules: modules.map(path => ({ type: "ESModule", path: resolve(server, path) })),
  compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"], d1Databases: ["DB"],
  assets: {directory: resolve("dist/client"), binding: "ASSETS", routerConfig: {has_user_worker: true, invoke_user_worker_ahead_of_assets: true}},
});

const scratch = new DatabaseSync(":memory:");
try {
  // Use the installed SQL schema, including later ALTER TABLE migrations.
  for (const name of (await readdir("drizzle")).filter(n => n.endsWith(".sql")).sort())
    scratch.exec(await readFile(resolve("drizzle", name), "utf8"));
  const db = await worker.getD1Database("DB");
  const schemas = scratch.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
  await db.batch(schemas.map(row => db.prepare(row.sql)));
  for (const statement of (await readFile("drizzle/0015_engineering_graphs.sql","utf8")).split(";").map(s=>s.trim()).filter(Boolean))
    await db.prepare(statement).run();
  for(const row of scratch.prepare("SELECT id,program,author FROM engineering_versions WHERE id=?").all("engineering-station-v2"))await db.prepare("INSERT INTO engineering_versions(id,program,author) VALUES (?,?,?)").bind(row.id,row.program,row.author).run();
  await db.prepare("UPDATE engineering_state SET active=\u0027engineering-station-v2\u0027 WHERE id=1").run();
  await db.prepare("INSERT OR IGNORE INTO component_calculator_source_revision(id,revision) VALUES(1,0)").run();
  const origin = (await worker.ready).origin;
  const adminPath="/api/admin/geometry-nodes";
  const url=(path,role,body)=>fetch(new URL(path,origin),{
    method:body?"POST":"GET",
    headers:{...(role?{Cookie:"ps_session="+role}:{}),"Content-Type":"application/json",Origin:origin},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  for(const role of ["admin","base"]){
    await db.prepare("INSERT INTO users(id,email,name,password_hash,email_verified_at,role,access_level) VALUES(?,?,?,?,CURRENT_TIMESTAMP,?,'base')")
      .bind(role,role+"@example.test",role,"fixture",role==="admin"?"admin":"user").run();
    await db.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at,last_seen_at) VALUES (?,?,?,datetime('now','+1 hour'),CURRENT_TIMESTAMP)")
      .bind(role,role,createHash("sha256").update(role).digest("base64url")).run();
  }
  for(const [role,status] of [[null,401],["base",403]]){
    assert.equal((await url("/?view=geometry-nodes",role)).status,status);
    assert.equal((await url(adminPath,role)).status,status);
  }
  assert.equal((await url("/?view=geometry-nodes","admin")).status,200);
  async function json(path,body){
    const response=await url(path,"admin",body), value=await response.json();
    assert.equal(response.status,200,value.error);return value;
  }
  const state=await json(adminPath);
  const types=state.draft.types.filter(t=>t.id.startsWith("equipment."));
  assert(types.length>6);
  const pump=types.find(t=>t.name==="Насос");
  assert(pump.fields.some(f=>f.key==="outletDn"));
  const catalogPath=adminPath+"?category="+encodeURIComponent(pump.id);
  const samples=await json(catalogPath);
  assert(samples.length>1);
  const a=await json(catalogPath+"&id="+encodeURIComponent(samples[0].id));
  const b=await json(catalogPath+"&id="+encodeURIComponent(samples[1].id));
  assert.notEqual(a.values.id,b.values.id);
  const sandbox=await json(adminPath,{action:"test",revision:0,diagram:"lab",document:state.draft,inputs:{}});
  assert.equal(sandbox.value,10);
  const {createProject}=await loadTs(new URL("../app/project-config.ts",import.meta.url));
  const asset=async path=>(await url(path,"admin")).json();
  const [catalogue,binding,control,cabinets]=await Promise.all(["/pumps.json","/binding-components.json","/control-cabinet-database.json","/control-cabinets.json"].map(asset));
  const [one,two]=catalogue.filter(p=>p.curve?.length>=2).slice(0,2);
  const specimen=createProject("Станция на заводском каталоге");specimen.entities["station-settings"].stationType="combined";
  for(const [i,p] of [one,two].entries())Object.assign(specimen.entities[i?"system-input-2":"system-input"],{selectedPumpId:p.id,calculated:true,workingPumpCount:i+1,reservePumpCount:1,flowRate:12,head:20,staticHead:0});
  specimen.entities["station-dn"].secondaryPumpDischargePort={pumpId:two.id,dn:65,source:"Проект",connection:"flanged"};
  const stationTrial=await json(adminPath,{action:"test",revision:0,diagram:"station",output:"stationComposition",document:state.draft,inputs:{project:specimen},useCatalog:true});
  assert.ok(stationTrial.value.entities["station-spec"].items.length>0);assert.ok(stationTrial.rows.some(r=>r.changes.length));
  const {assembleComponentDatabase}=await loadTs(new URL("../app/component-database.ts",import.meta.url)),{stationComposition}=await loadTs(new URL("../app/station-specification.ts",import.meta.url));
  const reference=stationComposition(structuredClone(specimen),{pumps:catalogue,cabinets,smartCabinets:control.cabinets,components:assembleComponentDatabase(binding,control,[])});
  assert.deepEqual(stationTrial.value,JSON.parse(JSON.stringify(reference)),"Published station and prior calculation must agree on the shipped catalogs");
  const calculation={action:"calculate",input:{dnFrom:65,dnTo:65,materials:["st20"],withSensorNipple:false,includeEccentric:false}};
  const countRows=async()=> (await json("/api/component-calculator",calculation)).rows.length;
  const originalCount=await countRows();assert(originalCount>0,"The shipped insert catalogue must produce rows");
  const inserts=state.draft.diagrams.find(g=>g.id==="generateInsertCalculations");
  const field=state.draft.types.find(t=>t.id==="tool.generateInsertCalculations").fields.find(f=>f.key==="value");
  state.draft.types.push({id:"fullProbe",name:"Контроль",category:"Тест",description:"",fields:[field],formulas:{}});
  inserts.nodes.push({id:"probe",type:"fullProbe",name:"Контроль",x:0,y:220,values:{value:[]}});
  inserts.edges=[...inserts.edges.filter(e=>e.to!=="result"),{from:"probe",out:"value",to:"result",input:"value"}];
  const publication=await json(adminPath,{action:"publish",revision:0,document:state.draft});
  const runtime=await (await url("/api/engineering/runtime","base")).json();
  assert.equal(runtime.version,publication.active);
  assert.equal(await countRows(),0,"Regular full Worker route must use the publication for this request");
  await json(adminPath,{action:"rollback",revision:publication.revision,version:"engineering-v1"});
  assert.equal(await countRows(),originalCount);
  console.log("PASS · full calculation HTTP "+originalCount+" → 0 → "+originalCount+", access, catalogue ("+types.length+" types), model switch, 10 kg, publish and rollback; draft "+Buffer.byteLength(JSON.stringify(state.draft))+" bytes");
} finally {
  scratch.close();
  await worker.dispose();
}
