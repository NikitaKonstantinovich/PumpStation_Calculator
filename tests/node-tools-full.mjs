import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {Miniflare} from "miniflare";
import {loadTs} from "./load-ts.mjs";
assert.equal(JSON.parse(await readFile("dist/release.json","utf8")).profile,"full","Run npm run build:full");
const server=resolve("dist/server"),modules=(await readdir(server,{recursive:true})).filter(p=>p.endsWith(".js")).sort((a,b)=>a==="index.js"?-1:b==="index.js"?1:a.localeCompare(b)),projects=new Map();
const projectStore=async request=>{
  const input=await request.json(),key=input.owner+"/"+input.id,current=projects.get(key);
  if(input.action==="load")return current?Response.json(current):Response.json({error:"Проект не найден"},{status:404});
  if(input.action==="save"){
    const id=input.config.project.id,k=input.owner+"/"+id,old=projects.get(k);
    if((old?.revision??0)!==input.baseRevision)return Response.json({error:"Конфликт ревизии"},{status:409});
    const revision=(old?.revision??0)+1;projects.set(k,{config:input.config,revision});return Response.json({revision});
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
  const saved={version:runtime.program.version,baseVersions:runtime.baseVersions,values:{stationType:"utility","main.flowRate":10,"main.head":20,"main.workingPumpCount":1,"main.reservePumpCount":0}};
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
  console.log("PASS · real full routes, admin access, factory sources, draft trial, immutable publications, rollback, project PUT/load/revision and rejected invalid integer");
}finally{scratch.close();await worker.dispose();}
