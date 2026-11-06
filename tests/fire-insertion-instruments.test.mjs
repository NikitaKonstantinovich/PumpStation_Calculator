import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fixture, sync, rows, resources, load, json, choose, parseProjectConfig } from "./fixtures/station-specification.mjs";
import { component, insertionDesign, generateInsertCalculations, catalog, source } from "./fixtures/station-insertions.mjs";
import { loadTs } from "./load-ts.mjs";
const model = await load("model-editor/model");
const { insertionOrientations } = await load("station-insertion-selection");
const { calculateCollector } = await load("collector-calculations");
const { lineGeometry } = await load("line-geometry-catalog");
const { lineGeometryIds } = await load("model-editor/specification-models");
const { installedInsertionBom, installedInsertionPrice, insertionPrice } = await load("calculated-insertion");
const { specificationHasPrice, requiredSpecificationNodes } = await load("specification-readiness");
const { specificationExportRows } = await load("specification-export");
const profiles = await json("public/model-assets/manifest.json"), cache = new Map();
globalThis.__fireInsertHash = v => createHash("sha256").update(v).digest("hex");
const server=await loadTs(new URL("../app/component-insert-3d-server.ts",import.meta.url),{
  [new URL("../app/auth-server.ts",import.meta.url).href]: "export const sha256=async v=>globalThis.__fireInsertHash(v);",
});
const context=server.insertionGeometryContext(source,catalog);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`),vec=(a,b)=>a.forEach((x,i)=>close(x,b[i]));
const sets=p=>rows(p).filter(r=>/^primary-sensor-/.test(r.assemblyRole??""));
const mounted=a=>a.components.filter(c=>c.instrumentMount?.kind==="fire-insertion");
function initial({type="fire",working=2,reserve=1,vibration=false,secondary=false,material,pumpId="318",pressureChecksEnabled=true}={}){
  let p=fixture();Object.assign(p.entities["station-settings"],{stationType:type,vibrationCompensators:vibration,jockeyPump:secondary&&type==="fire",pressureChecksEnabled});
  if(material)p.entities["station-dn"].collectorMaterial=material;
  choose(p,pumpId,working,reserve);if(secondary)choose(p,pumpId,2,1,true);
  return sync(p);
}
async function prepared(options={}){
  let p=initial(options);const selected=[];
  for(const row of rows(p).filter(r=>r.insertionRequirement)){
    const need=row.insertionRequirement,key=JSON.stringify([need.from.dn,need.to.dn,need.material,need.withSensorNipple]);
    if(!cache.has(key))cache.set(key,generateInsertCalculations({dnFrom:Math.min(need.from.dn,need.to.dn),dnTo:Math.max(need.from.dn,need.to.dn),materials:[need.material],withSensorNipple:need.withSensorNipple,includeEccentric:true},catalog));
    const c=cache.get(key).find(c=>c.complete&&insertionOrientations(component(c),need).length);
    assert.ok(c,JSON.stringify(need));selected.push(component(c,row.assemblyRole));
    (p.entities["station-dn"].insertionDesigns??={})[need.location]=insertionDesign(c);
  }
  const data={...resources,components:{...resources.components,items:[...resources.components.items,...selected]}};
  p=sync(p,data);
  for(const side of ["suction","discharge"]){const card=p.entities["station-collectors"][side];card.calculation=calculateCollector(card.configuration,resources.components.collectorCatalog);}
  const items=new Map([...data.components.items,...source.items].map(r=>[r.id,r]));
  const lines={version:1,revision:"fire-insert-test",items:{},issues:[]};
  for(const id of lineGeometryIds(p)){
    const item=items.get(id);if(!item)continue;const g=lineGeometry(item,catalog,context);
    if(item.calculatedInsertion){const t=await server.insertion3d(item.calculatedInsertion.calculation,source,catalog,{id:item.calculatedInsertion.id,revision:1});Object.assign(g,{template:t,length:t.geometry.totalLengthMm,ports:t.geometry.ports,bounds:t.geometry.bounds,issues:[...t.issues,...t.warnings],fidelity:"parametric"});}
    lines.items[id]=g;
  }
  return {p,data,lines,assembly:model.buildAssembly(p,data.pumps,profiles,lines)};
}

test("only two or more WORKING main fire pumps enable sets; each working/reserve branch gets exactly one",()=>{
  for(const type of ["utility","smart","fire","combined"])for(const working of [1,2,3])for(const reserve of [0,1,3]){
    const p=initial({type,working,reserve,secondary:type==="fire"||type==="combined"});
    const required=["fire","combined"].includes(type)&&working>=2;
    assert.equal(sets(p).length,required?4:0,JSON.stringify({type,working,reserve}));
    assert.ok(!rows(p).some(r=>r.assemblyRole?.startsWith("secondary-sensor-")));
    if(required){for(const role of ["valve","bush","relay"])assert.equal(sets(p).find(r=>r.assemblyRole===`primary-sensor-${role}`).quantity,working+reserve);close(sets(p).find(r=>r.assemblyRole.endsWith("seals")).quantity,(working+reserve)*.3);}
  }
});

test("installed insertion excludes reserve cap once, retains immutable source and exports effective BOM",async()=>{
  const {p,data}=await prepared();const row=rows(p).find(r=>r.insertionAssembly?.sensorConnection);
  assert.ok(row);const a=row.insertionAssembly,original=data.components.items.find(i=>i.id===row.equipmentId).calculatedInsertion;
  assert.deepEqual(a.snapshot,original);assert.ok(a.snapshot.calculation.bom.some(r=>r.role==="sensor-plug"));
  const cap=a.snapshot.calculation.bom.find(r=>r.role==="sensor-plug");assert.ok(cap.cost>0);
  close(row.price,Math.round((insertionPrice(a.snapshot)-cap.cost)*100)/100);
  assert.equal(installedInsertionPrice(a),row.price);assert.ok(specificationHasPrice(row));assert.ok(!installedInsertionBom(a).some(r=>r.role==="sensor-plug"));
  const exported=specificationExportRows([row],[{title:"Напор",sections:[{id:"discharge"}]}]).find(r=>r.kind==="item");assert.ok(!exported.cells[6].includes("sensor-plug:"));
  const restored=sync(parseProjectConfig(JSON.parse(JSON.stringify(p))),data);
  const saved=rows(restored).find(r=>r.insertionAssembly?.sensorConnection);
  assert.equal(saved.price,row.price);assert.equal(saved.insertionAssembly.sensorConnection,a.sensorConnection);
  assert.deepEqual(saved.insertionAssembly.snapshot.calculation.configuration,a.snapshot.calculation.configuration);
  const updatedCatalog=structuredClone(a);
  updatedCatalog.snapshot.currentCatalogVersion="changed";
  assert.equal(installedInsertionPrice(updatedCatalog),row.price);
  updatedCatalog.snapshot.calculation.bom.find(part=>part.role==="sensor-plug").cost=null;
  assert.equal(installedInsertionPrice(updatedCatalog),null);
  assert.equal(sets(restored).length,4);for(const node of requiredSpecificationNodes(restored).filter(n=>/^primary-sensor-/.test(n.id)))assert.equal(rows(restored).filter(node.matches).reduce((s,r)=>s+r.quantity,0),node.quantity);
});

test("real saved inserts carry valve, bush and upright relay on their own sensor ports without gauge/side adapters",async()=>{
  for(const material of ["st20","aisi304"])for(const vibration of [false,true]){
    const {p,lines,assembly:a}=await prepared({vibration,material});const cs=mounted(a);assert.equal(cs.length,9);
    for(const parentId of new Set(cs.map(c=>c.instrumentMount.parentId))){
      const parent=a.components.find(c=>c.id===parentId),children=cs.filter(c=>c.instrumentMount.parentId===parentId);
      assert.deepEqual(children.map(c=>c.instrumentMount.role),["valve","bush","relay"]);
      assert.ok(!parent.insertion.template.geometry.pieces.some(p=>p.id==="sensor-plug"));assert.equal(parent.ports.find(p=>p.id==="sensor").occupiedBy,"fire-pressure-switch");
      const original=lines.items[parent.equipmentId].template;assert.ok(original.geometry.pieces.some(p=>p.id==="sensor-plug"),"shared source template must retain cap");assert.notDeepEqual(parent.insertion.template.geometry,original.geometry);
      const valve=children.find(c=>c.instrumentMount.role==="valve"),relay=children.find(c=>c.instrumentMount.role==="relay");
      vec(model.portAxis(a,{componentId:valve.id,portId:"gauge"}),model.portAxis(a,{componentId:parent.id,portId:"sensor"}));
      vec(model.portAxis(a,{componentId:relay.id,portId:"inlet"}),model.portAxis(a,{componentId:parent.id,portId:"sensor"}).map(n=>-n));
    }
    const ids=new Set(cs.map(c=>c.id));assert.ok(!model.connectionIssues(a).some(i=>ids.has(i.id)&&/нарушено|соосны|несовместим|не найдена/.test(i.message)));
    assert.ok(!a.components.some(c=>c.id.startsWith("spec-")&&sets(p).some(r=>c.id.startsWith(`spec-${r.position}-`))));
    assert.ok(!a.components.some(c=>c.line?.role.startsWith("primary-sensor-")),"instruments must not enter main axial chain");
    if(process.env.FIRE_INSERT_PREVIEW&&!vibration&&material==="aisi304")await writeFile(process.env.FIRE_INSERT_PREVIEW,JSON.stringify({assembly:a,project:p}));
  }
});

test("insert transform, retained manual offset, saved scenes and count reduction keep attachments and remove obsolete sets",async()=>{
  const {p,data,lines,assembly:a}=await prepared(),parentId=mounted(a)[0].instrumentMount.parentId;
  const moved=model.editComponent(a,{id:parentId,patch:{position:[123,456,789],rotation:[37,-23,61]}});
  const history=model.execute(model.createHistory(a),moved);assert.deepEqual(model.undo(history).present,a);assert.deepEqual(model.redo(model.undo(history)).present,moved);
  const valve=mounted(moved).find(c=>c.instrumentMount.parentId===parentId&&c.instrumentMount.role==="valve");
  close(model.distance(model.portPoint(moved,{componentId:parentId,portId:"sensor"}),model.portPoint(moved,{componentId:valve.id,portId:"inlet"})),10);
  const relay=mounted(moved).find(c=>c.instrumentMount.parentId===parentId&&c.instrumentMount.role==="relay");
  const manual=model.editComponent(moved,{id:relay.id,patch:{position:[600,700,800]}});
  const reopened=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:manual}))).assembly;
  assert.ok(reopened.components.find(c=>c.id===parentId).insertion,"insertion template must survive normalization");
  assert.ok(!mounted(reopened).some(c=>c.orphaned));
  assert.equal(mounted(reopened).length,9);vec(mounted(model.mergeAssembly(reopened,a)).find(c=>c.id===relay.id).position,[600,700,800]);
  const fewer=structuredClone(p);choose(fewer,"318",1,3);const next=sync(fewer,data),rebuilt=model.buildAssembly(next,data.pumps,profiles,lines);
  assert.equal(mounted(model.mergeAssembly(reopened,rebuilt)).length,0);assert.equal(sets(next).length,0);
});

test("real ONIS maximum-head selection mounts priced transducers and a relay on every main fire branch",async()=>{
  const {p,assembly:a}=await prepared({type:"combined",pumpId:"nu-34f0554f7dc091e4",working:3,reserve:1,secondary:true,material:"aisi304",pressureChecksEnabled:false});
  const sensors=a.components.filter(c=>c.instrumentMount?.role==="transducer");
  assert.equal(sensors.length,2);assert.ok(sensors.every(c=>c.equipmentId==="station-v11-oni-ppt10-16"&&c.meshUrl&&!c.hidden));
  const relays=mounted(a).filter(c=>c.instrumentMount.role==="relay");assert.equal(relays.length,4);
  assert.ok(relays.every(c=>c.equipmentId==="кипиа-002-r0015"&&c.meshUrl&&!c.hidden));
  for(const c of [...sensors,...relays]){
    const row=rows(p).find(r=>r.position===c.instrumentMount.specPosition);assert.ok(row.price>0);assert.equal(row.technicalStatus,"ready");
    const parent=a.components.find(p=>p.id===c.instrumentMount.parentId);assert.ok(parent);
    const joint=a.lineJoints.find(j=>j.b.componentId===c.id);assert.ok(joint);
    close(model.distance(model.portPoint(a,joint.a),model.portPoint(a,joint.b)),joint.overlap);
  }
  const ids=new Set([...sensors,...relays].map(c=>c.id));assert.ok(!model.connectionIssues(a).some(i=>ids.has(i.id)&&/нарушено|соосны|несовместим|не найдена/.test(i.message)));
  const saved=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:a}))).assembly;
  assert.equal(mounted(saved).filter(c=>c.instrumentMount.role==="relay").length,4);
  if(process.env.KIP_MAX_HEAD_PREVIEW)await writeFile(process.env.KIP_MAX_HEAD_PREVIEW,JSON.stringify({assembly:a,project:p}));
});
