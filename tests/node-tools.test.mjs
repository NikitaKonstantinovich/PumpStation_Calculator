import assert from "node:assert/strict";
import test from "node:test";
import {engineeringStore} from "./fixtures/engineering-store.mjs";

const store=await engineeringStore();test.after(()=>store.close());
const {initialTools}=await store.load("node-tools/factory");
const {compileTools,runTests,parameterType}=await store.load("node-tools/compiler");
const {evaluatePlan,parseNumber,migrateValues}=await store.load("node-tools/runtime");
const {parseProjectConfig,createProject}=await store.load("project-config");
const {toolCommand,toolState,toolProgram,toolDefaults,verifyWorkspace}=await store.load("node-tools/storage-server");
const defaults=(await toolDefaults()).defaults;
const values={stationType:"utility","main.flowRate":10,"main.head":20,"main.workingPumpCount":1,"main.reservePumpCount":0};
const context={values,defaults,role:"admin"};
const evaluate=(d=initialTools(),ctx=context)=>evaluatePlan(compileTools(d,"test").plans.settings,ctx);
test("shared contour definitions produce distinct bindings, conditional forms and role restrictions",()=>{
  const d=initialTools(),result=evaluate(d);
  assert.equal(result.value.main.flowRate,10);assert.equal(result.value.secondary,null);
  assert(result.bindings.some(b=>b.key==="main.flowRate"));assert(result.bindings.some(b=>b.key==="secondary.flowRate"));
  const both=evaluate(d,{...context,values:{...values,stationType:"combined","secondary.flowRate":5,"secondary.head":12,"secondary.workingPumpCount":1,"secondary.reservePumpCount":0}});
  assert.equal(both.value.secondary.flowRate,5);
  const base=evaluate(d,{...context,role:"base"});
  assert.equal(base.bindings.find(b=>b.key==="stationType").editable,false);
  assert.equal(base.bindings.find(b=>b.key==="main.flowRate").editable,true);
  assert.equal(evaluate(d,{...context,role:"plus"}).bindings.find(b=>b.key==="membraneTank").editable,true);
  assert(runTests(d,context).every(r=>r.passed));
});
test("empty, zero and false remain distinct; integer counts and locale input are validated",()=>{
  const result=evaluate(initialTools(),{...context,values:{...values,"main.flowRate":null,"main.workingPumpCount":1.5,"main.reservePumpCount":0,membraneTank:false}});
  assert(result.issues.some(i=>i.key==="main.flowRate"));assert(result.issues.some(i=>i.key==="main.workingPumpCount"));
  assert.equal(result.value.main.reservePumpCount,0);assert.equal(result.value.membraneTank,false);
  assert.equal(parseNumber("2,5",{kind:"float",name:"Масса"}),2.5);
  assert.equal(parseNumber("",{kind:"float"}),null);assert.throws(()=>parseNumber("1.5",{kind:"int",min:1}),/целое/);
});
test("draft field additions and layout edits control the published form and survive project normalization",()=>{
  const d=initialTools(),g=d.diagrams.find(g=>g.id==="tool.settings");
  const field={key:"designation",name:"Обозначение",kind:"string",meaning:"text",unit:"",direction:"input"};
  d.types.push(parameterType("newParam","Обозначение",field));
  g.nodes.push({id:"extra",type:"newParam",name:"Обозначение",x:0,y:0,values:{}},{id:"extraField",type:"ui.field",name:"Поле",x:300,y:0,values:{label:"Маркировка"}});
  g.edges.push({from:"project",out:"value",to:"extra",input:"values"},{from:"extra",out:"binding",to:"extraField",input:"binding",kind:"binding"},{from:"extraField",out:"value",to:"form",input:"child6"});
  const program=compileTools(d,"new"),result=evaluatePlan(program.plans.settings,{...context,values:{...values,designation:"НУ-1"}});
  assert(result.bindings.some(b=>b.key==="designation"&&b.value==="НУ-1"));
  const project=createProject("Эксперимент");project.workspace2={schema:1,tools:{settings:{version:"new",values:{designation:"НУ-1"},baseVersions:{financial:"legacy-v1"}}}};
  assert.equal(parseProjectConfig(project).workspace2.tools.settings.values.designation,"НУ-1");
  const next=migrateValues(program.plans.settings,{...context,values:{...values,designation:"НУ-1",removed:7}});
  assert.equal(next.values.designation,"НУ-1");assert(next.messages.some(m=>m.includes("removed")));
});
test("draft, publication, optimistic conflicts, pinned versions and rollback are independent from station graphs",async()=>{
  const state=await toolState(),doc=state.draft,prior=await toolProgram();
  doc.diagrams.find(g=>g.id==="tool.settings").nodes.find(n=>n.id==="form").values.title="Новое имя формы";
  await toolCommand({action:"save",revision:state.revision,document:doc},"Тест");
  assert.equal((await toolProgram()).version,prior.version);
  await assert.rejects(()=>toolCommand({action:"publish",revision:state.revision,document:doc},"Тест"),/другом окне/);
  const saved=await toolState(),pub=await toolCommand({action:"publish",revision:saved.revision,document:doc},"Тест");
  assert.notEqual(pub.active,prior.version);
  assert.equal(evaluatePlan((await toolProgram()).plans.settings,context).view.label,"Новое имя формы");
  assert.equal(evaluatePlan((await toolProgram(prior.version)).plans.settings,context).view.label,"Настройки проекта");
  await toolCommand({action:"rollback",revision:pub.revision,version:prior.version},"Тест");
  const restored=await toolProgram();
  assert.notEqual(restored.version,prior.version);
  assert.notEqual(restored.version,pub.active);
  assert.equal(evaluatePlan(restored.plans.settings,context).view.label,"Настройки проекта");
  assert.equal((await toolProgram(prior.version)).version,prior.version);
  assert.equal((await toolState()).versions[0].reason,"restore");
});
test("server rejects modified restricted fields, forged parameters and invalid values",async()=>{
  const program=await toolProgram(),base=await toolDefaults();
  const data={schema:1,tools:{settings:{version:program.version,baseVersions:base.baseVersions,values}}};
  await verifyWorkspace(data,undefined,"base");
  await assert.rejects(()=>verifyWorkspace({...data,tools:{settings:{...data.tools.settings,values:{...values,stationType:"fire"}}}},undefined,"base"),/недоступно/);
  await assert.rejects(()=>verifyWorkspace({...data,tools:{settings:{...data.tools.settings,values:{...values,unknown:1}}}},undefined,"admin"),/Неизвестный/);
  await assert.rejects(()=>verifyWorkspace({...data,tools:{settings:{...data.tools.settings,values:{...values,"main.workingPumpCount":1.3}}}},undefined,"admin"),/проверьте/);
});
test("administrative and runtime routes enforce role and authentication",async()=>{
  const route=await store.load("api/admin/node-tools/route"),runtime=await store.load("api/workspace2/route");
  const req=role=>new Request("http://fixture/api/admin/node-tools",{headers:role?{"x-test-role":role}:{}});
  assert.equal((await route.GET(req(null))).status,401);assert.equal((await route.GET(req("base"))).status,403);
  assert.equal((await route.GET(req("admin"))).status,200);
  assert.equal((await runtime.GET(req("base"))).status,200);
});


test("a connected custom check contributes diagnostics and guards project saving",()=>{
  const doc=initialTools(),g=doc.diagrams.find(g=>g.id==="tool.settings");
  g.nodes.push({id:"customCheck",type:"logic.check",name:"Проверка",x:0,y:0,values:{valid:false,key:"designation",message:"Требуется согласование"}},{id:"checkMessage",type:"ui.message",name:"Сообщение",x:350,y:0,values:{}});
  g.edges.push({from:"customCheck",out:"value",to:"checkMessage",input:"issues"},{from:"checkMessage",out:"value",to:"form",input:"child6"});
  const result=evaluate(doc);
  assert(result.issues.some(i=>i.key==="designation"&&i.message==="Требуется согласование"));
});
