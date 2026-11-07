import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {Miniflare} from "miniflare";
import {loadTs} from "./load-ts.mjs";
assert.equal(JSON.parse(await readFile("dist/release.json","utf8")).profile,"full","Run npm run build:full");
const server=resolve("dist/server"),modules=(await readdir(server,{recursive:true})).filter(p=>p.endsWith(".js")).sort((a,b)=>a==="index.js"?-1:b==="index.js"?1:a.localeCompare(b)),projects=new Map(),history=new Map();
const projectStore=async request=>{
  const input=await request.json(),key=input.owner+"/"+input.id,current=projects.get(key);
  if(input.action==="load"){
    const saved=input.revision==null?current:history.get(key+"/"+input.revision);
    return saved?Response.json(saved):Response.json({error:"Проект не найден"},{status:404});
  }
  if(input.action==="save"){
    const id=input.config.project.id,k=input.owner+"/"+id,old=projects.get(k);
    if((old?.revision??0)!==input.baseRevision)return Response.json({error:"Конфликт ревизии"},{status:409});
    const revision=(old?.revision??0)+1,saved={config:input.config,revision};projects.set(k,saved);history.set(k+"/"+revision,structuredClone(saved));return Response.json({revision});
  }
  return Response.json({error:"Тестовая команда недоступна"},{status:400});
};
const worker=new Miniflare({host:"127.0.0.1",port:0,modulesRoot:server,modules:modules.map(path=>({type:"ESModule",path:resolve(server,path)})),compatibilityDate:"2026-05-15",compatibilityFlags:["nodejs_compat"],d1Databases:["DB"],serviceBindings:{PROJECT_STORE:projectStore},assets:{directory:resolve("dist/client"),binding:"ASSETS",routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}}});
const scratch=new DatabaseSync(":memory:");
try{
  for(const name of (await readdir("drizzle")).filter(n=>n.endsWith(".sql")).sort())scratch.exec(await readFile(resolve("drizzle",name),"utf8"));
  const db=await worker.getD1Database("DB");
  await db.batch(scratch.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all().map(r=>db.prepare(r.sql)));
  await db.prepare("INSERT INTO node_tool_state(id) VALUES(1)").run();
  await db.prepare("INSERT INTO engineering_versions(id,program,author) VALUES(?,?,?)").bind("engineering-v1",JSON.stringify({version:"engineering-v1",plans:{},args:{}}),"Тест").run();
  await db.prepare("INSERT INTO engineering_state(id,active) VALUES(1,?)").bind("engineering-v1").run();
  for(const role of ["admin","base"]){
    await db.prepare("INSERT INTO users(id,email,name,password_hash,email_verified_at,role,access_level) VALUES(?,?,?,?,CURRENT_TIMESTAMP,?,'base')").bind(role,role+"@example.test",role,"fixture",role==="admin"?"admin":"user").run();
    await db.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at,last_seen_at) VALUES(?,?,?,datetime('now','+1 hour'),CURRENT_TIMESTAMP)").bind(role,role,createHash("sha256").update(role).digest("base64url")).run();
  }
  const origin=(await worker.ready).origin;
  const request=(path,body,role="admin",method)=>fetch(new URL(path,origin),{method:method??(body?"POST":"GET"),headers:{Cookie:"ps_session="+role,Origin:origin,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  const json=async(path,body,role="admin",method)=>{const response=await request(path,body,role,method),value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;};
  for(const path of ["/?view=node-editor","/api/admin/node-tools"]){assert.equal((await request(path,undefined,"base")).status,403);assert.equal((await request(path,undefined,"")).status,401);}
  const state=await json("/api/admin/node-tools"),runtime=await json("/api/workspace2");
  assert(runtime.program.plans.settings);assert.equal(state.draft.tools[0].id,"settings");
  const {createProject}=await loadTs(new URL("../app/project-config.ts",import.meta.url)),project=createProject("Нодовые настройки");
  const saved={version:runtime.program.version,baseVersions:runtime.baseVersions,values:{stationType:"combined","main.medium":"wastewater","secondary.medium":"wastewater","main.flowRate":10,"main.head":20,"main.workingPumpCount":1,"main.reservePumpCount":0,"secondary.flowRate":7,"secondary.head":15,"secondary.workingPumpCount":1,"secondary.reservePumpCount":0}};
  project.workspace2={schema:1,tools:{settings:saved}};
  const put=body=>request("/api/projects?id="+project.project.id,body,"admin","PUT");
  let response=await put({config:project,operation:crypto.randomUUID(),baseRevision:0});assert.equal(response.status,200,await response.text());
  const restored=await json("/api/projects?id="+project.project.id);assert.equal(restored.config.workspace2.tools.settings.values["main.flowRate"],10);
  const bad=structuredClone(project);bad.workspace2.tools.settings.values["main.workingPumpCount"]=1.5;
  response=await put({config:bad,operation:crypto.randomUUID(),baseRevision:1});assert.equal(response.status,400);
  assert.equal((await json("/api/projects?id="+project.project.id)).revision,1);
  const trial=await json("/api/admin/node-tools",{action:"test",revision:state.revision,document:state.draft,tool:"settings",values:saved.values});assert(trial.tests.every(t=>t.passed));assert.equal(trial.result.value.main.flowRate,10);
  state.draft.diagrams.find(g=>g.id==="tool.settings").nodes.find(n=>n.id==="form").values.title="Проверенная форма";
  const publication=await json("/api/admin/node-tools",{action:"publish",revision:state.revision,document:state.draft});
  assert.notEqual(publication.active,runtime.program.version);
  assert.equal((await json("/api/workspace2?version="+runtime.program.version)).program.version,runtime.program.version);
  response=await request("/api/admin/node-tools",{action:"save",revision:state.revision,document:state.draft});assert.equal(response.status,409);
  await json("/api/admin/node-tools",{action:"rollback",revision:publication.revision,version:runtime.program.version});
  // Execute the primary editor workflow against the built full worker and normal project API.
  const {evaluatePlan,migrateValues}=await loadTs(new URL("../app/node-tools/runtime.ts",import.meta.url));
  const primary=await json("/api/admin/node-tools"),doc=primary.draft;
  doc.types.find(t=>t.parameter?.key==="medium").parameter.source={mode:"fixed",value:"water"};
  const fieldType=doc.types.find(t=>t.id==="ui.field");
  if(!fieldType.fields.some(f=>f.key==="visible"))fieldType.fields.push({key:"visible",name:"Показывать в форме",kind:"boolean",meaning:"flag",unit:"",direction:"input",initial:true});
  const mediumField=doc.diagrams.find(g=>g.id==="tool.contour").nodes.find(n=>n.id==="field_medium"),fieldBefore=structuredClone(mediumField);
  mediumField.values.visible=false;
  const flatten=view=>[view,...(view.children??[]).flatMap(flatten)];
  const fixedTrial=await json("/api/admin/node-tools",{action:"test",revision:primary.revision,document:doc,tool:"settings",values:saved.values,role:"base"});
  assert(fixedTrial.tests.every(t=>t.passed));assert.equal(fixedTrial.dataset.role,"base");assert.equal(fixedTrial.dataset.simulatedRole,true);
  assert.equal(fixedTrial.result.value.main.medium,"water");assert.equal(fixedTrial.result.value.secondary.medium,"water");
  const hiddenFields=flatten(fixedTrial.result.view).filter(v=>v.binding?.key.endsWith(".medium"));
  assert.equal(hiddenFields.length,2);assert(hiddenFields.every(v=>v.visible===false&&!v.binding.editable));
  assert.equal(fixedTrial.result.bindings.find(b=>b.key==="stationType").editable,false);
  const draftSaved=await json("/api/admin/node-tools",{action:"save",revision:primary.revision,document:doc});
  const fixedPublication=await json("/api/admin/node-tools",{action:"publish",revision:draftSaved.revision,document:draftSaved.draft});
  const current=await json("/api/workspace2"),pinned=await json("/api/workspace2?version="+saved.version+"&base="+encodeURIComponent(JSON.stringify(saved.baseVersions)));
  assert.equal(current.program.version,fixedPublication.active);assert.notEqual(current.program.version,saved.version);
  const context={values:saved.values,defaults:pinned.defaults,role:"admin"};
  assert.equal(evaluatePlan(pinned.program.plans.settings,context).value.main.medium,"wastewater");
  assert.equal((await json("/api/projects?id="+project.project.id)).config.workspace2.tools.settings.version,saved.version,"Publication must not silently change the project version");
  for(const raw of ["wastewater","water"]){
    const forged=structuredClone(project);forged.workspace2.tools.settings={version:current.program.version,baseVersions:current.baseVersions,values:{...saved.values,"main.medium":raw}};
    response=await put({config:forged,operation:crypto.randomUUID(),baseRevision:1});
    assert.equal(response.status,403,await response.text());
    assert.equal((await json("/api/projects?id="+project.project.id)).revision,1);
  }
  const migrated=migrateValues(current.program.plans.settings,{values:saved.values,defaults:current.defaults,role:"admin"});
  assert(!Object.hasOwn(migrated.values,"main.medium"));assert(!Object.hasOwn(migrated.values,"secondary.medium"));assert.equal(migrated.values["secondary.flowRate"],7);
  assert.equal(migrated.messages.length,2);
  const applied=structuredClone(project);applied.workspace2.tools.settings={version:current.program.version,baseVersions:current.baseVersions,values:migrated.values};
  response=await put({config:applied,operation:crypto.randomUUID(),baseRevision:1});assert.equal(response.status,200,await response.text());
  const reloaded=await json("/api/projects?id="+project.project.id),tool=reloaded.config.workspace2.tools.settings;
  assert.equal(reloaded.revision,2);assert.equal(tool.version,current.program.version);assert.deepEqual(tool.values,migrated.values);
  const reloadedRuntime=await json("/api/workspace2?version="+tool.version+"&base="+encodeURIComponent(JSON.stringify(tool.baseVersions))),evaluated=evaluatePlan(reloadedRuntime.program.plans.settings,{values:tool.values,defaults:reloadedRuntime.defaults,role:reloadedRuntime.role});
  assert.equal(evaluated.value.main.medium,"water");assert.equal(evaluated.value.secondary.medium,"water");assert(flatten(evaluated.view).filter(v=>v.binding?.key.endsWith(".medium")).every(v=>v.visible===false));
  const historical=await json("/api/projects?id="+project.project.id+"&revision=1");
  assert.equal(historical.config.workspace2.tools.settings.version,saved.version);assert.equal(historical.config.workspace2.tools.settings.values["main.medium"],"wastewater");
  assert.equal(evaluatePlan(pinned.program.plans.settings,{...context,values:historical.config.workspace2.tools.settings.values}).value.secondary.medium,"wastewater");
  mediumField.values.visible=true;
  const restoredField=await json("/api/admin/node-tools",{action:"test",revision:fixedPublication.revision,document:doc,tool:"settings",values:migrated.values});
  assert(flatten(restoredField.result.view).filter(v=>v.binding?.key.endsWith(".medium")).every(v=>v.visible===true));
  assert.deepEqual({...mediumField,values:fieldBefore.values},fieldBefore,"Restoring visibility preserves the field definition and layout");
  console.log("PASS · real full routes, admin access, immutable publications, rollback, fixed clean water + hidden field, explicit migration + project PUT/reload, readonly admin 403, reproducible historical version, restored field and invalid integer rejection");
}finally{scratch.close();await worker.dispose();}
