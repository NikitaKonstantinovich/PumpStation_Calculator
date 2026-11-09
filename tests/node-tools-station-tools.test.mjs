import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { addPumpProductFixture } from "./fixtures/pump-product.mjs";
import { resources as engineering } from "./fixtures/station-specification.mjs";

const base=new URL("../app/",import.meta.url);
const { initialTools }=await loadTs(new URL("node-tools/factory.ts",base));
const { prepareDocument }=await loadTs(new URL("node-tools/authoring.ts",base));
const { addStationTool,stationToolSources }=await loadTs(new URL("node-tools/station-tools.ts",base));
const { compileTools }=await loadTs(new URL("node-tools/compiler.ts",base));
const { evaluateProduct }=await loadTs(new URL("node-tools/runtime.ts",base));
const { applyParameterWrites }=await loadTs(new URL("node-tools/form-actions.ts",base));
const { legacyBaseSnapshot }=await loadTs(new URL("base-values.ts",base));
const { defaultDnOverrides }=await loadTs(new URL("node-tools/dn-runtime.ts",base));

function fixture(){
  const doc=addPumpProductFixture(prepareDocument(initialTools())),root=doc.diagrams.find(g=>g.id===doc.product.root);
  root.nodes.find(n=>n.id==="settings").name="Исходные параметры объекта";
  root.nodes.find(n=>n.id==="pumpFixture").name="Мой подбор";
  return doc;
}
function chain(){
  const original=fixture(),dn=addStationTool(original,"dn",{settingsId:"settings",selectionId:"pumpFixture"}),collectors=addStationTool(dn.document,"collectors",{dnId:dn.id}),spec=addStationTool(collectors.document,"specification",{collectorsId:collectors.id});
  return {original,dn,collectors,spec,program:compileTools(spec.document,"station-fixture-v1")};
}
const pump={id:"node-exact",manufacturer:"Fixture",series:"F",group:"F",model:"F20",execution:"F20 exact",type:"vertical_multistage",power:3,efficiency:null,nominalFlow:10,minFlow:0,maxFlow:20,minHead:10,maxHead:30,price:1000,priceCurrency:"RUB",priceKind:"net",priceSource:"fixture",source:"exact fixture",drawing:null,curve:[[0,30],[10,20],[20,10]],frequencyHz:50,medium:"water",selectable:true,active:true,inletDn:50,outletDn:40,inlet:{dn:50,connection_type:"flanged",pn_nominal_bar:16},outlet:{dn:40,connection_type:"flanged",pn_nominal_bar:16}};
const snapshot={sourceId:"pump_catalog_v2",id:"a".repeat(64),schemaVersion:"fixture/v1",sourceStatus:"test",status:"ready",created:"2026-11-08T00:00:00Z",items:[{modelId:"model",variantId:pump.id,curveSetId:"qh",frequencyHz:50,pump,issues:[],provenance:{}}],issues:[]};
const baseSettings=legacyBaseSnapshot(),stationCatalog={sourceId:"station_catalog",id:"b".repeat(64),components:engineering.components,cabinets:engineering.cabinets,smartCabinets:engineering.smartCabinets,collectorCatalog:engineering.components.collectorCatalog,baseSettings};
const settings={stationType:"utility","main.flowRate":10,"main.head":20,"main.workingPumpCount":1,"main.reservePumpCount":1};
function contexts(program,role="admin"){
  return Object.fromEntries(program.tools.map(tool=>[tool.id,{role,defaults:{usdRate:85,cnyRate:13,discount_cnp:0,discount_aquastrong:0,discount_onis:0,discount_vandjord:0,discount_wellmix:0},values:tool.id==="settings"?settings:{},resources:{pump_catalog_v2:snapshot,station_catalog:stationCatalog}}]));
}
function selectedContexts(program,role="admin"){
  const ctx=contexts(program,role),result=evaluateProduct(program,"pumpFixture",ctx),selection=result.trace["pumpFixture/checkSelection"].outputs.selection;
  ctx.pumpFixture.values={selectedPump:{variantId:pump.id,snapshotId:selection.snapshotId,requestKey:selection.requestKey}};
  return ctx;
}
const findView=(view,kind)=>view?.kind===kind?view:view?.children?.map(child=>findView(child,kind)).find(Boolean);

test("station templates append editable graph stages and preserve prior nodes, wires and renamed sources",()=>{
  const {original,dn,collectors,spec,program}=chain();
  for(const graph of original.diagrams){const next=spec.document.diagrams.find(g=>g.id===graph.id);for(const node of graph.nodes)assert.deepEqual(next.nodes.find(n=>n.id===node.id),node);for(const edge of graph.edges)assert(next.edges.some(e=>JSON.stringify(e)===JSON.stringify(edge)));}
  assert.deepEqual(stationToolSources(spec.document).dn,[{id:dn.id,name:"Расчёт DN"}]);assert.deepEqual(stationToolSources(spec.document).collectors,[{id:collectors.id,name:"Конструктор коллекторов"}]);
  for(const id of [dn.id,collectors.id,spec.id])assert(program.product.dependencies[id].includes("settings"));
  assert(program.product.dependencies[collectors.id].includes(dn.id));assert(program.product.dependencies[spec.id].includes(collectors.id));
  const roundTrip=JSON.parse(JSON.stringify(spec.document));assert.doesNotThrow(()=>compileTools(roundTrip,"roundtrip"));
  assert.throws(()=>addStationTool(original,"collectors",{dnId:"settings"}),/выход/);
  const root=original.diagrams.find(g=>g.id===original.product.root),settingsNode=root.nodes.find(n=>n.id==="settings"),settingsType=original.types.find(t=>t.id===settingsNode.type);
  settingsType.fields.push({...settingsType.fields.find(f=>f.direction==="output"&&f.meaning==="record"),key:"ambiguous"});
  assert.throws(()=>addStationTool(original,"dn",{settingsId:"settings",selectionId:"pumpFixture"}),/один выход/);
});

test("confirmed selection drives DN, collectors and complete specification stages through real wires",()=>{
  const {program,dn,collectors,spec}=chain(),ctx=selectedContexts(program);
  const d=evaluateProduct(program,dn.id,ctx),c=evaluateProduct(program,collectors.id,ctx),s=evaluateProduct(program,spec.id,ctx);
  assert.equal(d.value.project.station.selectedPumpId,pump.id);assert.equal(d.value.primary.values.suctionValveDn,50);assert.equal(d.value.primary.values.dischargeValveDn,40);
  assert.equal(findView(d.view,"dn-calculator").binding.key,"dnOverrides");
  assert.equal(c.value.project.entities["station-dn"].pumpSuctionPort.pumpId,pump.id);assert.equal(c.value.entity.suction.configuration.primary.dn,50);
  assert(findView(c.view,"collector-constructor"));
  assert(s.value.project.entities["station-spec"].items.some(item=>item.option==="primaryPump"&&item.quantity===2));
  assert(findView(s.view,"specification"));assert(s.trace[spec.id+"/pumps"]);assert(s.trace[spec.id+"/cabinet"]);assert(s.trace[spec.id+"/frame"]);assert(s.trace[spec.id+"/lines"]);assert(s.trace[spec.id+"/options"]);assert(s.trace[spec.id+"/finalize"]);
  assert(!s.trace["pumpFixture/table"]);assert(!s.trace["settings/form"]);
});

test("the complete station graph accepts deeply frozen shared catalogue snapshots without mutation",()=>{
  const {program,dn,collectors,spec}=chain(),ctx=selectedContexts(program),resource=structuredClone(stationCatalog);
  const freeze=value=>{if(value&&typeof value==="object"&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;};
  freeze(resource);const before=JSON.stringify(resource);
  for(const context of Object.values(ctx))context.resources.station_catalog=resource;
  for(const id of [dn.id,collectors.id,spec.id]){
    const result=evaluateProduct(program,id,ctx);
    assert(result.value?.project);assert(!result.issues.some(issue=>/read only|readonly|extensible|frozen|Cannot assign|Cannot add property|Cannot delete property/i.test(issue.message)));
  }
  const result=evaluateProduct(program,spec.id,ctx);
  assert(result.value.project.entities["station-spec"].items.some(item=>item.option==="primaryPump"&&item.quantity===2));
  assert.equal(JSON.stringify(resource),before);assert(Object.isFrozen(resource.components.items));
});

test("collector template retains a stale database record for refreshing in UI while excluding it from specification",async()=>{
  const {program,collectors,spec}=chain(),ctx=selectedContexts(program);
  // New catalogue executions require an explicit spacing decision when the pinned legacy version has no rule.
  const { collectorSpacingConfirmation }=await loadTs(new URL("collector-spacing.ts",base));
  const preliminary=evaluateProduct(program,collectors.id,ctx).trace[collectors.id+"/resolve"].outputs.resolved;
  const manual=structuredClone(preliminary.entity);
  for(const side of ["suction","discharge"]){manual[side].spacing1=500;manual[side].spacing1Manual=true;}
  ctx[collectors.id].values={collectorState:manual};
  const pending=evaluateProduct(program,collectors.id,ctx).trace[collectors.id+"/resolve"].outputs.resolved;
  for(const side of ["suction","discharge"])manual[side].spacing1Confirmation=collectorSpacingConfirmation(pending.entity[side].configuration,0);
  ctx[collectors.id].values={collectorState:manual};
  const initial=evaluateProduct(program,collectors.id,ctx),resolved=initial.trace[collectors.id+"/resolve"].outputs.resolved;
  const state=structuredClone(resolved.entity),card=state.suction,calculation=structuredClone(initial.trace[collectors.id+"/calculate"].outputs.calculations.suction);
  assert(card.code);assert(calculation);
  // A formerly complete saved assembly belongs to an older catalogue revision.
  calculation.catalogVersion="older-catalogue";calculation.complete=true;calculation.price=12345;
  card.calculation=calculation;card.calculationSourceFingerprint=card.sourceFingerprint;card.databaseStatus="found";
  card.database={id:"older-saved-collector",code:card.code,configuration:card.configuration,calculation,price:12345,priceUpdatedAt:"2026-01-01T00:00:00Z",source:"TEST FIXTURE ONLY"};
  ctx[collectors.id].values={collectorState:state};
  const current=evaluateProduct(program,collectors.id,ctx),panel=findView(current.view,"collector-constructor");
  assert.equal(panel.collector.result.entity.suction.databaseStatus,"found");
  assert.equal(panel.collector.result.entity.suction.database.id,"older-saved-collector");
  assert.equal(panel.collector.result.entity.suction.status,"stale");
  assert.equal(current.value.entity.suction.database,null);
  const specification=evaluateProduct(program,spec.id,ctx),row=specification.value.project.entities["station-spec"].items.find(item=>item.option==="suctionCollector");
  assert(row);assert.notEqual(row.status,"selected");assert.notEqual(row.technicalStatus,"ready");
});

test("manual DN settings propagate into collector recommendation while stale pump proof never remains selected",()=>{
  const {program,dn,collectors,spec}=chain(),ctx=selectedContexts(program);
  ctx[dn.id].values={dnOverrides:{...defaultDnOverrides(),suctionCollectorDn:125,dischargeCollectorDn:150,suctionValveDn:65,dischargeValveDn:80,connectionType:"flanged",pn:25,collectorMaterial:"st20"}};
  const c=evaluateProduct(program,collectors.id,ctx);assert.equal(c.value.entity.suction.recommended.dn,125);assert.equal(c.value.entity.discharge.recommended.dn,150);assert.equal(c.value.entity.suction.recommended.primary.dn,65);assert.equal(c.value.entity.discharge.recommended.primary.dn,80);assert.equal(c.value.entity.suction.recommended.pn,25);assert.equal(c.value.entity.suction.recommended.material,"st20");
  ctx.settings.values={...settings,"main.head":21};
  const stale=evaluateProduct(program,dn.id,ctx);assert.equal(stale.value.pumps.length,0);assert.equal(stale.value.project.station.selectedPumpId,undefined);assert(stale.issues.some(issue=>/подтверд|выбран|выбор/i.test(issue.message)));
  const next=evaluateProduct(program,spec.id,ctx);assert(!next.value?.project?.entities["station-spec"]?.items.some(item=>item.option==="primaryPump"&&item.status==="selected"));
});

test("base role cannot mutate DN through an actual binding or a forged editable binding",()=>{
  const {program,dn}=chain(),ctx=selectedContexts(program,"base"),result=evaluateProduct(program,dn.id,ctx),binding=result.bindings.find(b=>b.toolId===dn.id&&b.key==="dnOverrides");
  assert(binding);assert.equal(binding.permission,"all");assert.equal(binding.editable,false);
  const current=Object.fromEntries(program.tools.map(t=>[t.id,ctx[t.id].values])),value={...defaultDnOverrides(),pn:25};
  assert.throws(()=>applyParameterWrites(current,result.bindings,[{binding,value}],dn.id),/недоступно/);
  assert.throws(()=>applyParameterWrites(current,result.bindings,[{binding:{...binding,editable:true},value}],dn.id),/Привязка/);
  assert.equal(current[dn.id].dnOverrides,undefined);
});

test("specification options write the exact upstream DN parameter and update collector inputs",()=>{
  const {program,dn,collectors,spec}=chain(),ctx=selectedContexts(program),evaluation=evaluateProduct(program,spec.id,ctx),view=findView(evaluation.view,"specification");
  assert.equal(view.specificationBindings.hydraulic.toolId,dn.id);assert.equal(view.specificationBindings.hydraulic.key,"hydraulicOptions");assert.equal(view.specificationBindings.dn.toolId,dn.id);assert.equal(view.specificationBindings.dn.key,"dnOverrides");
  const current=Object.fromEntries(program.tools.map(t=>[t.id,ctx[t.id].values]));
  const options={products:{"suction:plug":"explicit-choice"},hoseLengthMm:800};
  const updated=applyParameterWrites(current,evaluation.bindings,[{binding:view.specificationBindings.hydraulic,value:options}],spec.id);
  assert.deepEqual(updated[dn.id].hydraulicOptions,options);assert.equal(updated[spec.id].hydraulicOptions,undefined);
  for(const tool of program.tools)ctx[tool.id].values=updated[tool.id];
  const collector=evaluateProduct(program,collectors.id,ctx),specification=evaluateProduct(program,spec.id,ctx);
  assert.deepEqual(collector.value.project.entities["station-settings"].hydraulicOptions,options);
  assert.deepEqual(specification.value.project.entities["station-settings"].hydraulicOptions,options);
});

test("server rejects forged saved DN overrides for base role",async()=>{
  const {engineeringStore}=await import("./fixtures/engineering-store.mjs");
  const store=await engineeringStore({catalogService:{fetch:async()=>Response.json(snapshot)}});
  try{
    const storage=await store.load("node-tools/storage-server"),state=await storage.toolState(),defaults=await storage.toolDefaults();
    const doc=addPumpProductFixture(prepareDocument(state.draft));
    const added=addStationTool(doc,"dn",{settingsId:"settings",selectionId:"pumpFixture"});
    // This isolated permission test uses a constant explicit base input; catalogue
    // persistence and the complete station chain are covered independently.
    const graph=added.document.diagrams.find(g=>g.id===added.diagram);
    graph.nodes=graph.nodes.filter(n=>n.id!=="catalog");graph.edges=graph.edges.filter(e=>e.from!=="catalog"&&e.to!=="catalog");graph.nodes.find(n=>n.id==="context").values.baseSettings=baseSettings;
    const published=await storage.toolCommand({action:"publish",revision:state.revision,document:added.document,contexts:{settings,pumpFixture:{},[added.id]:{}}},"Тест DN");
    const program=await storage.toolProgram(published.active),sources=await storage.toolResources(program),productState=await store.load("node-tools/product-state");
    const previous={schema:1,tools:{settings:{version:"node-tools-v1",values:settings,baseVersions:defaults.baseVersions}}};
    const data=productState.migrateProduct(program,previous,defaults.defaults,defaults.baseVersions,"admin",sources.resources,sources.sourceVersions).data;
    await storage.verifyWorkspace(data,previous,"admin");
    const forged=structuredClone(data);forged.tools[added.id].values.dnOverrides={...defaultDnOverrides(),pn:25};
    await assert.rejects(()=>storage.verifyWorkspace(forged,data,"base"),error=>error.status===403&&/Редактирование параметра недоступно/.test(error.message));
  }finally{store.close();}
});
