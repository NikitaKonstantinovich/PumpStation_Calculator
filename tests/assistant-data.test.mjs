import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

globalThis.__PSC_RELEASE_PROFILE__ = "full";
const sqlite = new DatabaseSync(":memory:");
class Statement {
  constructor(sql, values=[]) { this.sql=sql; this.values=values; }
  bind(...values) { return new Statement(this.sql,values); }
  async first() { return sqlite.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return {success:true,results:sqlite.prepare(this.sql).all(...this.values)}; }
  async run() { return this.all(); }
}
const DB={prepare:sql=>new Statement(sql),async batch(statements){const result=[];for(const statement of statements)result.push(await statement.run());return result;}};
const pumps=JSON.parse(await readFile(new URL("../public/pumps.json",import.meta.url),"utf8"));
globalThis.__assistantDataTestEnv={DB,OPENAI_API_KEY:"fixture-secret-never-model-context",OPENAI_MODEL:"gpt-6-luna",AI_ASSISTANT_ENABLED:"true",ASSETS:{async fetch(url){assert.equal(url,"https://assets.local/pumps.json");return Response.json(pumps);}}};
const replacements={};
for(const file of ["auth-server","assistant-server","assistant-data-server"]){const url=new URL(`../app/${file}.ts`,import.meta.url);replacements[url.href]=(await readFile(url,"utf8")).replace('import { env } from "cloudflare:workers";','const env=globalThis.__assistantDataTestEnv;');}
const load=name=>loadTs(new URL(`../app/${name}.ts`,import.meta.url),replacements);
const auth=await load("auth-server"),base=await load("base-values"),baseServer=await load("base-values-server"),data=await load("assistant-data-server"),server=await load("assistant-server"),knowledge=await load("assistant-knowledge-server");
await auth.ensureAuthSchema();await baseServer.ensureBaseValues();
for(const id of ["owner","other"])sqlite.prepare("INSERT INTO users(id,email,name,password_hash,role,access_level,email_verified_at) VALUES(?,?,?,'private-hash','user','pro',CURRENT_TIMESTAMP)").run(id,`${id}@private.example`,`Private ${id}`);
const settings={stationType:"utility",usdRate:85,cnyRate:13,manufacturerDiscounts:{cnp:45},baseValues:base.baseSnapshot("initial-v1",base.initialBaseValues())};
settings.baseValues.values.spacing.rules.forEach(rule=>{rule.spacing=9999;});
const config={schemaVersion:1,project:{id:"mine",name:"PRIVATE-PROJECT-NAME"},entities:{"system-input":{kind:"input",flowRate:20,head:40,selectedPumpId:"218",password:"PRIVATE-INPUT-FIELD"},"station-settings":settings,"station-dn":{suctionValveDn:40},"station-collectors":{suction:{spacing1:650,spacing1Manual:true}},"station-spec":{items:[{name:"PRIVATE-SPEC-NOTE"}]}}};
sqlite.prepare("INSERT INTO user_projects(id,user_id,name,config_json) VALUES('mine','owner','PRIVATE-PROJECT-NAME',?)").run(JSON.stringify(config));
sqlite.prepare("INSERT INTO user_projects(id,user_id,name,config_json) VALUES('theirs','other','PRIVATE-OTHER-PROJECT',?)").run(JSON.stringify({...config,entities:{...config.entities,"system-input":{flowRate:987654}}}));
const latest=base.initialBaseValues();latest.spacing.rules.filter(rule=>rule.modelIds.includes("218")||rule.modelId==="218").forEach(rule=>{rule.spacing=800;});
sqlite.prepare("INSERT INTO base_value_versions(id,values_json,author) VALUES('test-latest',?,'PRIVATE-AUTHOR')").run(JSON.stringify(latest));
sqlite.exec("UPDATE base_value_state SET active_id='test-latest'; CREATE TABLE component_calculator_source_revision(id INTEGER,revision INTEGER); INSERT INTO component_calculator_source_revision VALUES(1,7); CREATE TABLE catalog_imports(id INTEGER,source_sha256 TEXT,imported_at TEXT,is_active INTEGER);");
sqlite.exec("CREATE TABLE component_insertions(id TEXT,name TEXT,configuration_json TEXT,cached_price_microunits INTEGER,price_updated_at TEXT,catalog_version TEXT,revision INTEGER,created_by_user_id TEXT); CREATE TABLE collectors(id TEXT,code TEXT,configuration_json TEXT,cached_price_microunits INTEGER,price_updated_at TEXT,created_by_user_id TEXT);");
for(let i=0;i<7;i++){sqlite.prepare("INSERT INTO component_insertions VALUES(?,?,?,?,?,?,?,?)").run(`i${i}`,`DN40-${i}`,JSON.stringify({dnLarge:40,pn:16,secret:"PRIVATE-CONFIG"}),100000000,"2026-10-29","old-snapshot",1,"PRIVATE-AUTHOR");sqlite.prepare("INSERT INTO collectors VALUES(?,?,?,?,?,?)").run(`c${i}`,`DN100-${i}`,JSON.stringify({dn:100,pn:16}),200000000,"2026-10-29","PRIVATE-AUTHOR");}
const tools=(overrides={})=>data.createAssistantDataTools({userId:"owner",role:"pro",profile:"full",context:{projectId:"mine"},...overrides});
const call=async(instance,name,args)=>JSON.parse(await instance.run(name,JSON.stringify(args)));

test("CDM 10-5 uses application rules and distinguishes published, pinned and manual values",async()=>{
  const instance=tools();
  const published=await call(instance,"search_pumps",{query:"CDM 10-5",scope:"published",offset:0});
  assert.equal(published.data.exactMatch,true);assert.equal(published.data.items[0].id,"218");assert.equal(published.data.items[0].spacing.mm,800);assert.equal(published.data.baseVersions.spacing,"test-latest");
  const pinned=await call(instance,"search_pumps",{query:"218",scope:"project",offset:0});
  assert.equal(pinned.data.items[0].spacing.mm,600);assert.equal(pinned.data.items[0].spacing.status,"confirmed");assert.equal(pinned.data.baseVersions.spacing,"initial-v1");
  const project=await call(instance,"read_current_project",{});assert.equal(project.data.collectors.suction.spacing1,650);assert.equal(project.data.collectors.suction.spacing1Manual,true);
  const miss=await call(instance,"search_pumps",{query:"CDM10-5-UNKNOWN",scope:"published",offset:0});assert.equal(miss.data.total,0);assert.equal(miss.data.exactMatch,false);
  const serialized=JSON.stringify([published,pinned,project]);for(const secret of ["PRIVATE-","private.example","9999"])assert.ok(!serialized.includes(secret));
});
test("published base values are readable by all roles, with bounded rows and no draft or author",async()=>{
  for(const role of ["base","plus","pro","admin"]){const result=await call(tools({role}),"read_base_values",{scope:"published",section:"spacing",query:"",offset:0});assert.equal(result.data.version,"test-latest");assert.equal(result.data.values.rules.items.length,20);assert.equal(result.data.values.rules.nextOffset,20);assert.ok(!JSON.stringify(result).includes("PRIVATE-AUTHOR"));}
});
test("foreign or nonexistent project never falls back to another user's or published project data",async()=>{
  for(const id of ["theirs","missing"]){const instance=tools({role:"admin",context:{projectId:id}});assert.ok((await call(instance,"read_current_project",{})).error);const result=await call(instance,"search_pumps",{query:"218",scope:"project",offset:0});assert.equal(result.data.items[0].spacing,null);assert.ok(result.data.baseError);assert.ok(!JSON.stringify(result).includes("987654"));}
  const unknown=tools({context:{projectId:"mine"}});const old=JSON.parse(JSON.stringify(config));old.entities["station-settings"].baseValues.versions.spacing="missing-version";
  sqlite.prepare("UPDATE user_projects SET config_json=? WHERE id='mine'").run(JSON.stringify(old));
  assert.ok((await call(unknown,"read_current_project",{})).error);
  sqlite.prepare("UPDATE user_projects SET config_json=? WHERE id='mine'").run(JSON.stringify(config));
});
test("beta uses only supplied input with server-resolved versions and blocks full-only records",async()=>{
  const instance=tools({profile:"beta",context:{beta:{input:{flowRate:15,head:30,password:"PRIVATE-BETA"},versions:base.baseSnapshot("initial-v1",base.initialBaseValues()).versions}}});
  const result=await call(instance,"read_current_project",{});assert.equal(result.data.input.flowRate,15);assert.ok(!JSON.stringify(result).includes("PRIVATE"));
  const denied=await call(instance,"search_equipment",{catalog:"collectors",query:"",offset:0});assert.match(denied.error,/beta/);
  assert.ok((await call(tools({profile:"beta"}),"read_current_project",{})).error);
});
test("equipment search reads current import and saved records using fixed projections and paging",async()=>{
  const instance=tools();const component=await call(instance,"search_equipment",{catalog:"components",query:"DN100",offset:0});assert.equal(component.data.databaseRevision,7);assert.ok(component.data.items.length>0);assert.ok(component.data.items.length<=5);
  for(const catalog of ["insertions","collectors"]){const result=await call(instance,"search_equipment",{catalog,query:"DN",offset:0});assert.equal(result.data.items.length,5);assert.equal(result.data.nextOffset,5);assert.ok(!JSON.stringify(result).includes("PRIVATE-"));const next=await call(instance,"search_equipment",{catalog,query:"DN",offset:5});assert.equal(next.data.items.length,2);assert.equal(next.data.nextOffset,null);}
  const injected=await call(instance,"search_equipment",{catalog:"insertions",query:"' OR 1=1 --",offset:0});assert.deepEqual(injected.data.items,[]);
});
test("unknown tools, extra parameters and invalid scopes never become database access",async()=>{
  const instance=tools(),before=sqlite.prepare("SELECT total_changes() AS n").get().n;
  for(const [name,args] of [["execute_sql",{sql:"SELECT * FROM users"}],["read_current_project",{projectId:"theirs"}],["read_base_values",{scope:"draft",section:"financial",query:"",offset:0}],["search_pumps",{query:"218",scope:"published",offset:-1}]])assert.ok((await call(instance,name,args)).error);
  assert.equal(sqlite.prepare("SELECT total_changes() AS n").get().n,before);assert.deepEqual(instance.sources,[]);
});
test("Responses tool loop sends selected data and matching call IDs without account fields",async t=>{
  const requests=[];t.mock.method(globalThis,"fetch",async(_url,options)=>{
    const body=JSON.parse(options.body);requests.push(body);
    if(requests.length===1)return Response.json({status:"completed",output:[{type:"function_call",id:"fc1",call_id:"call1",name:"search_pumps",arguments:JSON.stringify({query:"CDM 10-5",scope:"project",offset:0})}]});
    const result=body.input.find(item=>item.type==="function_call_output");assert.equal(result.call_id,"call1");assert.equal(JSON.parse(result.output).data.items[0].spacing.mm,600);
    return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:"В закреплённой версии initial-v1 — 600 мм. [DATA-001] [DATA-999]"}]}]});
  });
  const answer=await server.answerAssistant([{role:"user",content:"Какое расстояние для CDM 10-5 в моём проекте?"}],{userId:"owner",role:"pro",profile:"full",context:{projectId:"mine"}});
  assert.equal(requests.length,2);assert.equal(requests[0].store,false);assert.ok(requests[0].tools.every(tool=>tool.strict&&tool.parameters.additionalProperties===false));assert.equal(answer.sources.length,1);assert.equal(answer.sources[0].kind,"data");assert.ok(!answer.text.includes("DATA-999"));
  const serialized=JSON.stringify(requests);for(const secret of ["PRIVATE-","private.example","fixture-secret-never-model-context"])assert.ok(!serialized.includes(secret));
});
test("tool execution stops at the turn budget",async t=>{
  let requests=0;t.mock.method(globalThis,"fetch",async(_url,options)=>{requests++;const body=JSON.parse(options.body);if(requests===4){assert.equal(body.tool_choice,"none");return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:"Уточните вопрос."}]}]});}return Response.json({status:"completed",output:[{type:"function_call",call_id:`c${requests}`,name:"read_base_values",arguments:JSON.stringify({scope:"published",section:"velocity",query:"",offset:0})}]});});
  await server.answerAssistant([{role:"user",content:"Какие правила скорости?"}],{userId:"owner",role:"pro",profile:"full"});assert.equal(requests,4);
  assert.equal(knowledge.assistantCitations("[DATA-001]",[]).text,"");
});
test("cancellation precedes database tool access",async t=>{
  const controller=new AbortController();let reads=0;
  t.mock.method(DB,"prepare",()=>{reads++;throw new Error("Unexpected database read");});
  t.mock.method(globalThis,"fetch",async()=>{controller.abort();return Response.json({status:"completed",output:[{type:"function_call",call_id:"cancelled",name:"read_current_project",arguments:"{}"}]});});
  await assert.rejects(server.answerAssistant([{role:"user",content:"Какие параметры у моего проекта?"}],{userId:"owner",role:"pro",profile:"full",context:{projectId:"mine"}},controller.signal),{name:"AbortError"});
  assert.equal(reads,0);
});
