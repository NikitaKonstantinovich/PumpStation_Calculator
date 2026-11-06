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
  const program=compilePublication(base,"test");
  assert.ok(program.plans.buildAssembly.steps.some(s=>s.id.startsWith("model/")));
  assert.ok(program.plans.stationComposition.steps.length>10);
  assert.ok(!program.plans.specificationLineTotal.steps.some(s=>s.id.startsWith("model/")));
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
  const prior=await runtime();assert.equal(prior.version,"engineering-station-v2");assert.ok(JSON.stringify(prior)===JSON.stringify(compilePublication(initialDocument(),prior.version)),"The installed factory version must match the editor");assert.deepEqual((await runtime("engineering-v1")).plans,{});
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
    const root=doc.diagrams.find(g=>g.id==="station");
    if(root.edges.some(e=>e.to==="result"&&e.input===sig.id)){
      root.nodes.push({id:"probe_"+sig.id,type:type.id,name:"Проверка входа "+sig.id,x:0,y:0,values:{value}});
      root.edges=root.edges.map(e=>e.to==="result"&&e.input===sig.id?{...e,from:"probe_"+sig.id,out:"value"}:e);
    }
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

test("station factory preserves engineering results for two circuits, manual overrides and incomplete resources",async()=>{
  const {createProject}=await store.load("project-config"),{stationComposition}=await store.load("station-specification");
  const {buildAssembly}=await store.load("model-editor/model"),{dischargeHydraulics}=await store.load("dn-defaults");
  const {specificationLineTotal}=await store.load("specification-readiness"),{collectProjectIssues}=await store.load("diagnostics");
  const {evaluatePumpCandidates}=await store.load("pump-selection"),{operatingPoint}=await store.load("pump-catalog");
  const before={version:"engineering-v1",plans:{},args:{}},after=compilePublication(initialDocument(),"station");
  const pump=(id,dn,price)=>({id,model:id,type:"vertical_multistage",manufacturer:"CNP",manualEntry:true,outlet:{dn,type:"flanged"},inlet:{dn,type:"flanged"},price,priceCurrency:"RUB",discountPercent:0,curve:[[0,32],[10,20],[20,5]],weightKg:80});
  const pumps=[pump("A",65,100),pump("B",50,120)],settingsPrice={usdRate:95,cnyRate:13,manufacturerDiscounts:{cnp:0}};
  for(const available of [pumps,pumps.slice(0,1),null]){
    const project=createProject("Сравнение");const e=project.entities;
    Object.assign(e["station-settings"],{stationType:"combined",...settingsPrice});
    for(const [i,key] of ["system-input","system-input-2"].entries())Object.assign(e[key],{selectedPumpId:pumps[i].id,calculated:true,workingPumpCount:1,reservePumpCount:0,flowRate:10,head:20,staticHead:0});
    Object.assign(e["station-dn"],{secondaryPumpDischargePort:{pumpId:"B",dn:40,source:"Проект",connection:"flanged"}});
    const res={pumps:available,cabinets:null,smartCabinets:null};
    const calculate=()=>{
      const next=stationComposition(structuredClone(project),res),rows=next.entities["station-spec"].items;
      return {composition:next,totals:rows.map(specificationLineTotal),issues:collectProjectIssues(next,available??[],undefined,[],{}),
        model:buildAssembly(next,available??[],{version:1,profiles:{}},{version:1,revision:"test",items:{},issues:[]}),
        selection:evaluatePumpCandidates(available??[],e["system-input"],settingsPrice,{}),
        point:operatingPoint(pumps[0],1,e["system-input"]),
        ports:pumps.map((p,i)=>dischargeHydraulics(e["station-dn"],e[i?"system-input-2":"system-input"],e["station-settings"],!!i,p))};
    };
    assert.deepEqual(withEvaluationProgram(after,calculate),withEvaluationProgram(before,calculate));
  }
});

test("encapsulation preserves crossing wires, project persistence and nested trace for a two-input 10 kg instrument",async()=>{
  const {encapsulate,compileTree}=await store.load("engineering/hierarchy");
  const state=(await store.call()).body,doc=state.draft,g=doc.diagrams.find(d=>d.id==="lab");
  const made=encapsulate(doc,g,["operation"],"Масса партии",[
    {key:"mass",node:"operation",field:"mass",direction:"input"},{key:"count",node:"operation",field:"count",direction:"input"},
    {key:"total",node:"operation",field:"value",direction:"output"}]);
  const saved=await store.call({action:"save",document:made.document,revision:state.revision});
  assert.equal(saved.status,200);
  const reload=(await store.call()).body.draft;
  const project=reload.diagrams.find(g=>g.id==="station");
  const plan=compileTree(reload,project);
  assert.ok(plan.steps.some(s=>s.id==="lab/"+made.id+"/operation"));
  const trial=await store.call({action:"test",diagram:"lab",document:reload,inputs:{},revision:saved.body.revision});
  assert.equal(trial.status,200);
  assert.equal(trial.body.value,10);
  assert.equal(trial.body.trace[made.id+"/operation"].outputs.value,10);
});

test("changing the source priority in the draft crosses the DN boundary into the published discharge line and 3D",async()=>{
  const {createProject}=await store.load("project-config");
  const {buildAssembly}=await store.load("model-editor/model"),{dischargeHydraulics}=await store.load("dn-defaults");
  const s=(await store.call()).body,doc=s.draft,p=createProject("Источники DN"),e=p.entities,input=e["system-input"],dn=e["station-dn"];
  const pump={id:"manual-65",model:"A",manufacturer:"Test",manualEntry:true,type:"vertical_multistage",outlet:{dn:65,type:"flanged"},inlet:{dn:50,type:"flanged"},curve:[[0,25],[10,20]],spatialData:{version:1,units:"mm",coordinateSystem:"inlet",boundsMm:[-40,-40,-40,200,40,140],ports:[{id:"inlet",point:[0,0,0],axis:[-1,0,0],source:"test"},{id:"outlet",point:[160,0,90],axis:[1,0,0],source:"test"}],source:"test",rule:"test",issues:[]}};
  Object.assign(input,{selectedPumpId:pump.id,workingPumpCount:1,reservePumpCount:0,head:20,flowRate:10,staticHead:0,calculated:true});
  dn.pumpDischargePort={pumpId:pump.id,dn:80,source:"Проект",connection:"flanged"};
  const read=async(version="")=>(await store.effective.GET(new Request("http://fixture/api/engineering/runtime"+(version?"?version="+version:""),{headers:{"x-test-role":"base"}}))).json();
  const compute=()=>{const model=buildAssembly(p,[pump],{version:1,profiles:{}},{version:1,items:{},issues:[]});return [dischargeHydraulics(dn,input,e["station-settings"],false,pump).dn,model.components.find(c=>c.equipmentId===pump.id).ports.find(port=>port.id==="outlet").dn];};
  const previous=await read();assert.deepEqual(withEvaluationProgram(previous,compute),[80,80]);
  doc.types.find(t=>t.id==="resolve.port").formulas.port="catalog ?? override";
  const trial=await store.call({action:"test",revision:s.revision,diagram:"station",output:"dischargeHydraulics",document:doc,inputs:{project:p,catalogue:[pump],side:"outlet",secondary:false}});
  assert.equal(trial.status,200,trial.body.error);assert.equal(trial.body.value.dn,65);
  assert.deepEqual(withEvaluationProgram(await read(),compute),[80,80]);
  const pub=await store.call({action:"publish",revision:s.revision,document:doc});assert.equal(pub.status,200,pub.body.error);
  assert.deepEqual(withEvaluationProgram(await read(),compute),[65,65]);
  await store.call({action:"rollback",revision:pub.body.revision,version:previous.version});assert.deepEqual(withEvaluationProgram(await read(),compute),[80,80]);
  assert.deepEqual(withEvaluationProgram(await read(pub.body.active),compute),[65,65]);
});

test("a second-circuit instance can be rewired without changing primary selection",async()=>{
  const d=initialDocument(),root=d.diagrams.find(g=>g.id==="station"),sig=signatures.find(s=>s.id==="evaluatePumpCandidates");
  const type={id:"fixedCandidates",name:"Второй контур",category:"Тест",description:"",fields:[sig.result],formulas:{}};
  d.types.push(type);root.nodes.push({id:"fixed",type:type.id,name:type.name,x:0,y:0,values:{value:[{tag:"second"}]}});
  const edge=root.edges.find(e=>e.input==="secondCandidates"&&e.to==="result");edge.from="fixed";edge.out="value";
  const program=compilePublication(d,"two");
  const {withCircuit}=await store.load("engineering/runtime"),{evaluatePumpCandidates}=await store.load("pump-selection");
  const calc=()=>evaluatePumpCandidates([],{flowRate:10,head:15,staticHead:0,workingPumpCount:1},{manufacturerDiscounts:{}},{});
  assert.deepEqual(withEvaluationProgram(program,()=>withCircuit(false,calc)),[]);
  assert.deepEqual(withEvaluationProgram(program,()=>withCircuit(true,calc)),[{tag:"second"}]);
});

test("hierarchical migration preserves existing custom rules and rejects incompatible or recursive container boundaries",async()=>{
  const {legacyDocument,upgradeDocument}=await store.load("engineering/templates"),{compileTree}=await store.load("engineering/hierarchy");
  const old=legacyDocument();old.types.find(t=>t.id==="resolve.port").formulas.port="catalog ?? override";
  const legacy=old.diagrams.find(g=>g.id==="stationComposition");legacy.nodes.find(n=>n.id==="stationLines").name="Обвязка проекта";
  const migrated=upgradeDocument(structuredClone(old)),root=migrated.diagrams.find(g=>g.id==="station");
  assert.equal(root.nodes.find(n=>n.id==="spec").type,"tool.stationComposition");
  assert.equal(migrated.diagrams.find(d=>d.id===legacy.id).nodes.find(n=>n.id==="stationLines").name,"Обвязка проекта");
  assert.equal(migrated.types.find(t=>t.id==="resolve.port").formulas.port,"catalog ?? override");
  assert.equal(upgradeDocument(migrated),migrated);
  const bad=structuredClone(migrated);bad.types.find(t=>t.id==="stationSelection").fields[0].unit="бар";
  assert.throws(()=>compileTree(bad,bad.diagrams[0]),/порт.*границы/);
  const cyc=structuredClone(migrated);const diagram=cyc.diagrams.find(g=>g.id==="stationSelection");
  diagram.nodes.push({id:"again",name:"Снова",type:"stationSelection",values:{},x:0,y:0});
  assert.throws(()=>compileTree(cyc,cyc.diagrams[0]),/Цикл/);
});
