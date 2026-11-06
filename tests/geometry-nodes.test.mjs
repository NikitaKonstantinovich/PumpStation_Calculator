import assert from "node:assert/strict";
import test from "node:test";
import {engineeringStore} from "./fixtures/engineering-store.mjs";
const store=await engineeringStore();
test.after(()=>store.close());
const {initialDocument,signatures,compilePublication}=await store.load("engineering/templates");
const {compileDiagram,connectionProblem,runPlan,validateDocument}=await store.load("engineering/engine");
const {withEvaluationProgram}=await store.load("engineering/runtime");
const {compileExpression,evaluate}=await store.load("engineering/expression");
const base=initialDocument(),port=base.diagrams.find(g=>g.id==="resolvePort");
const native=()=>{throw Error("No native operation expected");};

test("all installed tools have complete, compilable port contracts; identity lowering",()=>{
  assert.doesNotThrow(()=>validateDocument(base,signatures,base.types,true));
  assert.deepEqual(compilePublication(base,"test").plans,{});
});
test("port selection preserves partial project overrides; connections support fan-out, semantic types, occupied inputs, cycles and missing values",()=>{
  const p=compileDiagram(port,base.types);
  const catalog={dn:65,connection:"flanged",source:"Каталог"};
  assert.deepEqual(runPlan(p,{catalog,override:null},native).value,catalog);
  const override={dn:null,connection:null,source:"Введено инженером"};
  assert.deepEqual(runPlan(p,{catalog,override},native).value,override);
  assert.equal(runPlan(p,{catalog:null,override:null},native).value,null);
  assert.equal(port.edges.filter(e=>e.from==="select"&&e.out==="port").length,2);
  assert.match(connectionProblem(port,base.types,{from:"assemble",out:"value",to:"select",input:"catalog"}),/цикл/);
  assert.match(connectionProblem(port,base.types,{from:"read",out:"dn",to:"select",input:"catalog"}),/Несовместимые/);
  assert.throws(()=>compileDiagram({...port,edges:[...port.edges,port.edges[0]]},base.types),/занят/);
});
test("formulas are bounded, keep null/false/0 distinct and reject unsafe access",()=>{
  const run=(s,v={})=>evaluate(compileExpression(s,new Set(Object.keys(v))),v);
  assert.equal(run("if(enabled, quantity * mass, 0)",{enabled:true,quantity:4,mass:2.5}),10);
  assert.equal(run("value ?? 2",{value:0}),0);assert.equal(run("value ?? 2",{value:false}),false);
  for(const s of ["globalThis.process","while(true)","eval(1)",'get(obj,"constructor")',"1 / 0"]){assert.throws(()=>run(s,{obj:{}}));}
});
test("admin lifecycle persists types, enforces revisions, publishes atomically, pins and rolls back the real hydraulic and 3D dependency",async()=>{
  assert.equal((await store.call(null,null)).status,401);
  assert.equal((await store.call(null,"base")).status,403);
  assert.equal((await store.call({action:"publish"},"pro")).status,403);
  const initial=(await store.call()).body;
  const doc=structuredClone(initial.draft);
  const massType=doc.types.find(t=>t.id==="lab.total");massType.name="Расчёт партии";
  let result=await store.call({action:"test",diagram:"lab",document:doc,revision:0,inputs:{}});
  assert.equal(result.status,200,JSON.stringify(result.body).slice(0,300));assert.equal(result.body.value,10);
  const props=doc.types.find(t=>t.id==="resolve.dn");props.formulas.dn='if(get(port, "dn") == null, null, get(port, "dn") + 5)';
  const saved=await store.call({action:"save",document:doc,revision:0});assert.equal(saved.status,200);assert.equal(saved.body.revision,1);
  assert.equal((await store.call()).body.draft.types.find(t=>t.id==="lab.total").name,"Расчёт партии");
  assert.equal((await store.call({action:"save",document:doc,revision:0})).status,409);
  const runtime=async id=>{const r=await store.effective.GET(new Request("http://fixture/api/engineering/runtime"+(id?"?version="+id:""),{headers:{"x-test-role":"base"}}));return r.json();};
  const prior=await runtime();assert.deepEqual(prior.plans,{});
  result=await store.call({action:"test",diagram:"resolvePort",document:doc,revision:1,inputs:{catalog:{dn:65,source:"fixture",connection:"flanged"},override:null}});
  assert.equal(result.body.value.dn,70);
  const pub=await store.call({action:"publish",document:doc,revision:1});assert.equal(pub.status,200);const used=await runtime();
  assert.equal(used.version,pub.body.active);assert(!JSON.stringify(used).includes('get(port,'));
  const {createProject}=await store.load("project-config"),{resolvePumpPortData}=await store.load("pump-ports");
  const {dischargeHydraulics}=await store.load("dn-defaults"),{buildAssembly}=await store.load("model-editor/model");
  const project=createProject("Проверка"),dn=project.entities["station-dn"],input=project.entities["system-input"],settings=project.entities["station-settings"];
  const pump={id:"fixture",type:"vertical_multistage",model:"A",manufacturer:"Test",manualEntry:true,outlet:{dn:65,type:"flanged"},inlet:{dn:50,type:"flanged"},curve:[[0,20],[10,15]],spatialData:{version:1,units:"mm",coordinateSystem:"inlet",boundsMm:[-40,-40,-40,200,40,140],ports:[{id:"inlet",point:[0,0,0],axis:[-1,0,0],source:"test"},{id:"outlet",point:[160,0,90],axis:[1,0,0],source:"test"}],source:"test",rule:"test",issues:[]}};
  Object.assign(input,{selectedPumpId:pump.id,calculated:true,workingPumpCount:1,reservePumpCount:0,flowRate:10,head:15,staticHead:0});
  Object.assign(project.station,{selectedPumpId:pump.id,totalPumpCount:1});
  const fn=()=>resolvePumpPortData(dn,input,false,"outlet",pump);
  assert.equal(withEvaluationProgram(prior,fn).dn,65);assert.equal(withEvaluationProgram(used,fn).dn,70);
  assert.equal(withEvaluationProgram(used,()=>dischargeHydraulics(dn,input,settings,false,pump)).dn,70);
  const rawLines={version:1,revision:"fixture",items:{},issues:[]};
  const assembly=withEvaluationProgram(used,()=>buildAssembly(project,[pump],{version:1,profiles:{}},rawLines));
  const instance=assembly.components.find(c=>c.equipmentId==="fixture");assert.equal(instance?.ports.find(p=>p.id==="outlet")?.dn,70);
  dn.secondaryPumpDischargePort={pumpId:"fixture",dn:32,source:"Проект",connection:"flanged"};
  assert.equal(withEvaluationProgram(used,()=>resolvePumpPortData(dn,input,true,"outlet",pump)).dn,37);
  const bad=structuredClone(doc);bad.diagrams[0].edges=[];
  assert.equal((await store.call({action:"publish",revision:2,document:bad})).status,400);
  assert.equal((await runtime()).version,used.version);
  assert.equal((await store.call({action:"rollback",revision:2,version:prior.version})).status,200);
  assert.equal(withEvaluationProgram(await runtime(),fn).dn,65);
  assert.equal(withEvaluationProgram(await runtime(used.version),fn).dn,70);
});

test("all public calculation entry points use the edited result of their published graph", async () => {
  const doc = initialDocument();
  const modules = new Map();
  const expected = new Map();
  for (const sig of signatures) {
    const graph = doc.diagrams.find(g => g.id === sig.id);
    const value = {number: 111, boolean: false, object: {probe: sig.id}, array: [sig.id]}[sig.result.kind];
    assert.notEqual(value, undefined, sig.id);
    expected.set(sig.id, value);
    const type = {id: "probe."+sig.id, name: "Контроль", category: "Тест", description: "", fields: [sig.result], formulas: {}};
    doc.types.push(type);
    graph.nodes.push({id: "probe", type: type.id, name: "Проба", x: 0, y: 0, values: {value}});
    graph.edges = [...graph.edges.filter(e => e.to !== "result"), {from: "probe", out: "value", to: "result", input: "value"}];
    if (!modules.has(sig.file)) modules.set(sig.file, await store.load(sig.file));
  }
  validateDocument(doc, signatures, initialDocument().types, true);
  const published = compilePublication(doc, "dispatch-test");
  for (const sig of signatures) {
    const entry = modules.get(sig.file)[sig.id];
    assert.equal(typeof entry, "function", sig.id);
    assert.deepEqual(withEvaluationProgram(published, () => entry()), expected.get(sig.id), sig.id);
  }
});

test("pressure cannot feed DN, missing required mass is reported and catalogue origin survives a trial", () => {
  const doc = initialDocument();
  const graph = doc.diagrams.find(g => g.id === "lab");
  const part = graph.nodes.find(n => n.id === "part");
  const field = doc.types.find(t => t.id === "lab.part").fields[0];
  const receiver = doc.types.find(t => t.id === "lab.total").fields[0];
  part.values.mass = 2.5;
  part.catalog = {id: "parts:test", name: "Деталь каталога", overridden: []};
  let trial = runPlan(compileDiagram(graph, doc.types), {}, native, true);
  assert.match(trial.trace.part.sources.mass, /Каталог/);
  part.catalog.overridden.push("mass");
  trial = runPlan(compileDiagram(graph, doc.types), {}, native, true);
  assert.match(trial.trace.part.sources.mass, /инженером/);
  const withoutMass = {...graph, edges: graph.edges.filter(e => e.from !== "part")};
  assert.throws(() => runPlan(compileDiagram(withoutMass, doc.types), {}, native), /operation.*обязательный вход пуст/);
  Object.assign(field, {meaning: "pressure", unit: "бар"});
  Object.assign(receiver, {meaning: "dn", unit: ""});
  assert.match(connectionProblem(graph, doc.types, graph.edges[0]), /pressure.*dn/);
});
