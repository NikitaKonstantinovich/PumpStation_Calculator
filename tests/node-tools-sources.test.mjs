import assert from "node:assert/strict";
import test from "node:test";
import {engineeringStore} from "./fixtures/engineering-store.mjs";

const store=await engineeringStore();test.after(()=>store.close());
const {initialTools}=await store.load("node-tools/factory");
const {compileTools}=await store.load("node-tools/compiler");
const {evaluatePlan,migrateValues}=await store.load("node-tools/runtime");
const {toolDefaults,toolState,toolCommand,toolProgram,verifyWorkspace}=await store.load("node-tools/storage-server");
const base=await toolDefaults();
const values={stationType:"combined","main.medium":"wastewater","secondary.medium":"wastewater","main.flowRate":10,"main.head":20,"main.workingPumpCount":1,"main.reservePumpCount":0,"secondary.flowRate":7,"secondary.head":15,"secondary.workingPumpCount":1,"secondary.reservePumpCount":0};
const context={values,defaults:base.defaults,role:"admin"};
const typeFor=(doc,key)=>doc.types.find(t=>t.parameter?.key===key);
const evalDoc=(doc,ctx=context)=>evaluatePlan(compileTools(doc,"draft").plans.settings,ctx);
const flatten=view=>[view,...(view.children??[]).flatMap(flatten)];

test("fixed clean water overrides both saved contours, visibility preserves field structure and explicit migration removes overrides",()=>{
  const doc=initialTools(),legacy=JSON.parse(JSON.stringify(compileTools(doc,"historic")));
  assert.equal(evaluatePlan(legacy.plans.settings,context).value.main.medium,"wastewater");
  typeFor(doc,"medium").parameter.source={mode:"fixed",value:"water"};
  const uiField=doc.types.find(t=>t.id==="ui.field");
  if(!uiField.fields.some(f=>f.key==="visible"))uiField.fields.push({key:"visible",name:"Показывать в форме",kind:"boolean",meaning:"flag",unit:"",direction:"input",initial:true});
  const field=doc.diagrams.find(g=>g.id==="tool.contour").nodes.find(n=>n.id==="field_medium");
  const before=structuredClone(field);field.values.visible=false;
  const result=evalDoc(doc);
  assert.equal(result.value.main.medium,"water");assert.equal(result.value.secondary.medium,"water");
  assert(result.bindings.filter(b=>b.key.endsWith(".medium")).every(b=>b.mode==="fixed"&&!b.editable));
  assert(flatten(result.view).filter(v=>v.binding?.key.endsWith(".medium")).every(v=>v.visible===false));
  const migrated=migrateValues(compileTools(doc,"next").plans.settings,context);
  assert(!Object.hasOwn(migrated.values,"main.medium"));assert(!Object.hasOwn(migrated.values,"secondary.medium"));
  assert.equal(migrated.values["secondary.flowRate"],7);assert.equal(migrated.messages.length,2);
  assert.equal(evalDoc(doc,{...context,values:migrated.values}).value.main.medium,"water");
  field.values.visible=true;
  assert(flatten(evalDoc(doc).view).filter(v=>v.binding?.key.endsWith(".medium")).every(v=>v.visible));
  assert.deepEqual({...field,values:before.values},before);
  assert.equal(evaluatePlan(legacy.plans.settings,context).value.main.medium,"wastewater");
});

test("source modes use typed executable inputs and declared registry contracts",()=>{
  const doc=initialTools(),flow=typeFor(doc,"flowRate"),graph=doc.diagrams.find(g=>g.id==="tool.contour");
  flow.parameter.source={mode:"computed"};
  const value={...flow.parameter.field,key:"value",direction:"output",initial:undefined,required:false};
  doc.types.push({id:"test.flow",name:"Расчёт расхода",category:"Расчёт",description:"Расчёт",fields:[{...value,key:"input",direction:"input",initial:6},value],formulas:{value:"input * 2"}});
  graph.nodes.push({id:"flowCalculation",type:"test.flow",name:"Расчёт расхода",x:0,y:0,values:{}});
  graph.edges.push({from:"flowCalculation",out:"value",to:"flowRate",input:"computed"});
  const result=evalDoc(doc);assert.equal(result.value.main.flowRate,12);assert.equal(result.value.secondary.flowRate,12);
  assert.equal(result.bindings.find(b=>b.key==="main.flowRate").editable,false);
  const plan=compileTools(doc,"computed").plans.settings;
  assert(plan.steps.find(s=>s.id==="settings/main/flowRate").links.some(e=>e.input==="computed"));
  assert(!Object.hasOwn(migrateValues(plan,context).values,"main.flowRate"));
  graph.edges=graph.edges.filter(e=>e.input!=="computed");
  assert.throws(()=>compileTools(doc,"invalid"),e=>e.diagram==="tool.contour"&&e.node==="flowRate");
  flow.parameter.source={mode:"source",registry:"base-values",attribute:"usdRate"};
  assert.throws(()=>compileTools(doc,"invalid"),/смысл|единица/);
  flow.parameter.source={mode:"user"};
  const rate=typeFor(doc,"usdRate");rate.parameter.source={mode:"source",registry:"base-values",attribute:"usdRate"};
  assert.equal(evalDoc(doc,{...context,values:{...values,usdRate:1}}).value.usdRate,base.defaults.usdRate);
  assert.equal(evalDoc(doc).bindings.find(b=>b.key==="usdRate").source.attribute,"usdRate");
});

test("typed fixed values preserve null, zero, false and reject invalid choices before publication",()=>{
  const doc=initialTools();
  typeFor(doc,"inletHead").parameter.source={mode:"fixed",value:null};
  typeFor(doc,"vibrationCompensators").parameter.source={mode:"fixed",value:false};
  typeFor(doc,"reservePumpCount").parameter.source={mode:"fixed",value:0};
  const result=evalDoc(doc);assert.equal(result.value.inletHead,null);assert.equal(result.value.vibrationCompensators,false);assert.equal(result.value.main.reservePumpCount,0);
  typeFor(doc,"medium").parameter.source={mode:"fixed",value:"invalid"};
  assert.throws(()=>compileTools(doc,"invalid"),/постоянное значение/);
});

test("explicit source modes prune unused input dependencies and prevent parameter formulas from overriding their value",()=>{
  const doc=initialTools(),flow=typeFor(doc,"flowRate"),graph=doc.diagrams.find(g=>g.id==="tool.contour");
  flow.parameter.source={mode:"fixed",value:4};
  doc.types.push({id:"test.unused",name:"Неиспользуемое вычисление",category:"Расчёт",description:"Проба",fields:[{...flow.parameter.field,key:"value",direction:"output",required:false,initial:undefined}],formulas:{value:"1 / 0"}});
  graph.nodes.push({id:"unused",type:"test.unused",name:"Неиспользуемое вычисление",x:0,y:0,values:{}});
  graph.edges.push({from:"unused",out:"value",to:"flowRate",input:"computed"});
  const program=compileTools(doc,"fixed"),plan=program.plans.settings,result=evaluatePlan(plan,context);
  assert.equal(result.value.main.flowRate,4);
  assert(!plan.steps.some(s=>s.id==="settings/main/unused"));
  assert(!plan.steps.find(s=>s.id==="settings/main/flowRate").links.some(e=>["computed","values","defaults"].includes(e.input)));
  flow.formulas.value="99";assert.throws(()=>compileTools(doc,"invalid"),/отдельную расчётную ноду/);
});

test("server rejects readonly values for actual users while pinned legacy versions and migrated saves remain valid",async()=>{
  const state=await toolState(),old=await toolProgram(),doc=state.draft;
  typeFor(doc,"medium").parameter.source={mode:"fixed",value:"water"};
  const published=await toolCommand({action:"publish",revision:state.revision,document:doc},"Тест источников");
  const data=(version,params)=>({schema:1,tools:{settings:{version,baseVersions:base.baseVersions,values:params}}});
  await verifyWorkspace(data(old.version,values),undefined,"admin");
  await assert.rejects(()=>verifyWorkspace(data(published.active,values),undefined,"admin"),/Запись параметра недоступна/);
  await assert.rejects(()=>verifyWorkspace(data(published.active,{...values,"main.medium":"water"}),undefined,"admin"),/Запись параметра недоступна/);
  const current=await toolProgram(published.active),migrated=migrateValues(current.plans.settings,context);
  await verifyWorkspace(data(current.version,migrated.values),data(old.version,values),"admin");
  const prior=data(old.version,{...values,stationType:"fire"});
  const removed={...values};delete removed.stationType;
  await assert.rejects(()=>verifyWorkspace(data(old.version,removed),prior,"base"),/Редактирование параметра недоступно/);
  const response=await toolCommand({action:"test",revision:published.revision,document:doc,values,role:"base"},"Тест");
  assert.equal(response.dataset.role,"base");assert.equal(response.dataset.simulatedRole,true);assert.deepEqual(response.dataset.sourceVersions,base.baseVersions);
  assert.equal(response.result.bindings.find(b=>b.key==="stationType").editable,false);
});

test("failed expectations link to the concrete parameter instance with the executed test inputs",async()=>{const {runTests}=await store.load("node-tools/compiler");const doc=initialTools();doc.tools[0].tests=[{id:"different",name:"Расход",values,role:"base",expected:{"value.main.flowRate":999}}];const report=runTests(doc,context)[0];assert.equal(report.passed,false);assert.equal(report.node,"settings/main/flowRate");assert.equal(report.inputs.values["main.flowRate"],10);assert.equal(report.inputs.role,"base");});
