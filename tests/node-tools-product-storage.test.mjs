import assert from "node:assert/strict";
import test from "node:test";
import { engineeringStore } from "./fixtures/engineering-store.mjs";
import { addPumpProductFixture } from "./fixtures/pump-product.mjs";

const values={stationType:"utility","main.flowRate":10,"main.head":20,"main.workingPumpCount":1,"main.reservePumpCount":0,"main.medium":"wastewater"};
const item={modelId:"model-good",variantId:"good",curveSetId:"curve-good",frequencyHz:50,issues:[],provenance:{source:"isolated fixture"},pump:{id:"good",manufacturer:"Fixture",series:"F",group:"F",model:"F10",execution:"F10 380V",type:"vertical_multistage",power:3,efficiency:null,nominalFlow:10,minFlow:0,maxFlow:20,minHead:10,maxHead:30,price:1000,priceCurrency:"RUB",priceKind:"net",priceSource:"fixture",source:"fixture",drawing:null,curve:[[0,30],[10,20],[20,10]],medium:"water",active:true,selectable:true,inletDn:null,outletDn:null}};
const snapshot=(id="a")=>({sourceId:"pump_catalog_v2",id:id.repeat(64),schemaVersion:"test-v1",sourceStatus:"isolated fixture",status:"ready",created:"2026-11-07T00:00:00Z",items:[structuredClone(item)],issues:[]});

async function fixture(){
 let current=snapshot(),calls=0;
 const store=await engineeringStore({catalogService:{fetch:async()=>{calls++;return Response.json(current);}}});
 const storage=await store.load("node-tools/storage-server"),state=await storage.toolState(),base=await storage.toolDefaults();
 const product=await store.load("node-tools/product"),runtime=await store.load("node-tools/runtime"),productState=await store.load("node-tools/product-state");
 return {store,storage,state,base,product,runtime,productState,setSnapshot(value){current=value;},get calls(){return calls;},close(){store.close();}};
}

async function publish(f,doc,contexts={settings:values}){
 const state=await f.storage.toolState();
 const published=await f.storage.toolCommand({action:"publish",revision:state.revision,document:doc,contexts,values:contexts.settings},"Тест общего продукта");
 return f.storage.toolProgram(published.active);
}

test("product migration preserves stable IDs, explicit version choice, archived tools and immutable legacy execution",async()=>{
 const f=await fixture();try{
  const legacy=await f.storage.toolProgram(),legacyData={schema:1,tools:{settings:{version:legacy.version,values,baseVersions:f.base.baseVersions}}};
  await f.storage.verifyWorkspace(legacyData,undefined,"admin");
  assert.equal(f.runtime.evaluatePlan(legacy.plans.settings,{values,defaults:f.base.defaults,role:"admin"}).value.main.medium,"wastewater");
  const first=f.product.upgradeDocument(f.state.draft),root=first.diagrams.find(g=>g.id===first.product.root),settings=root.nodes.find(n=>n.id==="settings");
  root.nodes.push({...structuredClone(settings),id:"archived",name:"Другой экземпляр",x:800,tool:{order:2}});
  const versionA=await publish(f,first,{settings:values,archived:{...values,"main.flowRate":30}});
  const initial=f.productState.migrateProduct(versionA,legacyData,f.base.defaults,f.base.baseVersions,"admin").data;
  initial.tools.archived.values={...values,"main.flowRate":30};
  await f.storage.verifyWorkspace(initial,legacyData,"admin");
  const next=structuredClone(first),nextRoot=next.diagrams.find(g=>g.id===next.product.root);
  nextRoot.nodes=nextRoot.nodes.filter(n=>n.id!=="archived");nextRoot.nodes.find(n=>n.id==="settings").name="Переименованные настройки";
  next.types.find(t=>t.parameter?.key==="medium").parameter.source={mode:"fixed",value:"water"};
  const versionB=await publish(f,next),migration=f.productState.migrateProduct(versionB,initial,f.base.defaults,f.base.baseVersions,"admin"),migrated=migration.data;
  assert.equal(migrated.product.version,versionB.version);assert.equal(migrated.tools.settings.version,versionB.version);
  assert.equal(migrated.tools.settings.values["main.flowRate"],10);assert(!Object.hasOwn(migrated.tools.settings.values,"main.medium"));
  assert.deepEqual(migrated.tools.archived,initial.tools.archived);assert(migration.messages.some(m=>m.includes("архиве")));
  await f.storage.verifyWorkspace(migrated,initial,"admin");
  const evaluated=f.runtime.evaluateProduct(versionB,"settings",f.productState.productContexts(versionB,migrated,f.base.defaults,"admin"));
  assert.equal(evaluated.value.main.medium,"water");assert.equal(versionB.tools.find(t=>t.id==="settings").name,"Переименованные настройки");
  assert.equal(f.runtime.evaluatePlan((await f.storage.toolProgram(legacy.version)).plans.settings,{values,defaults:f.base.defaults,role:"admin"}).value.main.medium,"wastewater");
  const mixed=structuredClone(migrated);mixed.tools.settings.version=versionA.version;
  await assert.rejects(()=>f.storage.verifyWorkspace(mixed,migrated,"admin"),e=>e.status===409&&/единую версию/.test(e.message));
  const archiveTamper=structuredClone(migrated);archiveTamper.tools.archived.values["main.flowRate"]=99;
  await assert.rejects(()=>f.storage.verifyWorkspace(archiveTamper,migrated,"admin"),e=>e.status===403&&/Архив/.test(e.message));
  const archiveDelete=structuredClone(migrated);delete archiveDelete.tools.archived;
  for(const role of ["admin","base"])await assert.rejects(()=>f.storage.verifyWorkspace(archiveDelete,migrated,role),e=>e.status===403&&/Архив/.test(e.message));
  const downgrade=structuredClone(migrated);delete downgrade.product;
  await assert.rejects(()=>f.storage.verifyWorkspace(downgrade,migrated,"admin"),e=>e.status===409&&/целиком/.test(e.message));
 }finally{f.close();}
});

async function pumpFixture(){
 const f=await fixture();const {pumpNodeTypes}=await f.store.load("node-tools/pump-nodes");
 const doc=f.product.upgradeDocument(f.state.draft);for(const type of pumpNodeTypes())if(!doc.types.some(t=>t.id===type.id))doc.types.push(type);
 const pumpDoc=addPumpProductFixture(doc);pumpDoc.types.find(t=>t.parameter?.key==="medium").parameter.source={mode:"fixed",value:"water"};
 const program=await publish(f,pumpDoc,{settings:values,pumpFixture:{}}),resources=await f.storage.toolResources(program);
 const previous={schema:1,tools:{settings:{version:"node-tools-v1",values,baseVersions:f.base.baseVersions}}};
 const migration=f.productState.migrateProduct(program,previous,f.base.defaults,f.base.baseVersions,"admin",resources.resources,resources.sourceVersions);
 return {...f,program,resources,previous,data:migration.data,fixture:f};
}
function evaluatePump(f,data=f.data){return f.runtime.evaluateProduct(f.program,"pumpFixture",f.productState.productContexts(f.program,data,f.base.defaults,"admin",f.resources.resources));}
function chooseProof(f){const table=evaluatePump(f).view.children.find(v=>v.kind==="table");return {variantId:"good",snapshotId:table.selection.snapshotId,requestKey:table.selection.requestKey};}

test("server validates actual selection operation and rejects forged identities, request keys and proof extra fields",async()=>{
 const f=await pumpFixture();try{
  await f.storage.verifyWorkspace(f.data,f.previous,"admin");
  const proof=chooseProof(f),selected=structuredClone(f.data);selected.tools.pumpFixture.values.selectedPump=proof;
  await f.storage.verifyWorkspace(selected,f.data,"admin");assert.equal(evaluatePump(f,selected).value.variantId,"good");
  for(const forged of [{...proof,variantId:"not-in-catalogue"},{...proof,snapshotId:"b".repeat(64)},{...proof,requestKey:"forged"},{...proof,variantId:"not-in-catalogue",valid:true,bindingKey:"selectedPump"},{...proof,valid:true,bindingKey:"anotherBinding"}]){
   const next=structuredClone(f.data);next.tools.pumpFixture.values.selectedPump=forged;
   await assert.rejects(()=>f.storage.verifyWorkspace(next,f.data,"admin"),e=>e.status===403&&/не подтверждено|Некорректный контракт/.test(e.message));
  }
  const noProductPin=structuredClone(selected);delete noProductPin.product;
  await assert.rejects(()=>f.storage.verifyWorkspace(noProductPin,selected,"admin"),e=>e.status===409);
  const mixedSource=structuredClone(selected);mixedSource.tools.pumpFixture.sourceVersions={pump_catalog_v2:"b".repeat(64)};
  await assert.rejects(()=>f.storage.verifyWorkspace(mixedSource,selected,"admin"),e=>e.status===409);
 }finally{f.close();}
});

test("unchanged retained selection becomes visibly stale after upstream changes while a new invalid proof is rejected",async()=>{
 const f=await pumpFixture();try{
  const selected=structuredClone(f.data);selected.tools.pumpFixture.values.selectedPump=chooseProof(f);
  await f.storage.verifyWorkspace(selected,f.data,"admin");
  const changed=structuredClone(selected);changed.tools.settings.values["main.head"]=21;
  const result=evaluatePump(f,changed),selection=result.view.children.find(v=>v.kind==="table").selection;
  assert.equal(selection.valid,false);assert.equal(selection.stale,true);assert.equal(selection.variantId,"good");assert.equal(result.value,null);
  assert(result.issues.some(i=>i.severity==="warning"));assert(!result.issues.some(i=>i.severity==="error"));
  await f.storage.verifyWorkspace(changed,selected,"admin");
  const forged=structuredClone(changed);forged.tools.pumpFixture.values.selectedPump={...chooseProof(f),variantId:"other"};
  await assert.rejects(()=>f.storage.verifyWorkspace(forged,changed,"admin"),e=>e.status===403);
  const cleared=structuredClone(changed);cleared.tools.pumpFixture.values.selectedPump=null;
  await f.storage.verifyWorkspace(cleared,changed,"admin");
 }finally{f.close();}
});

test("catalogue updates require an explicit new snapshot and keep prior product selections reproducible",async()=>{
 const f=await pumpFixture();try{
  const selected=structuredClone(f.data);selected.tools.pumpFixture.values.selectedPump=chooseProof(f);
  await f.storage.verifyWorkspace(selected,f.data,"admin");
  const calls=f.fixture.calls,newer=snapshot("b");newer.items[0].pump.model="Updated source";f.setSnapshot(newer);
  await f.storage.verifyWorkspace(selected,selected,"admin");assert.equal(f.fixture.calls,calls);assert.equal(evaluatePump(f,selected).value.pump.model,"F10");
  const latest=await f.storage.toolResources(f.program),migration=f.productState.migrateProduct(f.program,selected,f.base.defaults,f.base.baseVersions,"admin",latest.resources,latest.sourceVersions),updated=migration.data;
  assert.equal(updated.product.sourceVersions.pump_catalog_v2,newer.id);assert.deepEqual(updated.tools.pumpFixture.values.selectedPump,selected.tools.pumpFixture.values.selectedPump);
  const current=f.runtime.evaluateProduct(f.program,"pumpFixture",f.productState.productContexts(f.program,updated,f.base.defaults,"admin",latest.resources));
  assert.equal(current.value,null);assert(current.view.children.find(v=>v.kind==="table").selection.stale);
  await f.storage.verifyWorkspace(updated,selected,"admin");
  assert.equal(evaluatePump(f,selected).value.pump.model,"F10");
 }finally{f.close();}
});
