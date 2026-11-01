import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fixture, sync, rows, resources, load, json } from "./fixtures/station-specification.mjs";
const model = await load("model-editor/model");
const { calculateCollector } = await load("collector-calculations");
const { lineGeometryIds } = await load("model-editor/specification-models");
const { makeInsertCatalog } = await load("component-insert-catalog");
const { lineGeometry } = await load("line-geometry-catalog");
const { buildCollectorTemplate, applyCollectorTemplate } = await load("model-editor/collector-template");
const { loadTs } = await import("./load-ts.mjs");
const server = new URL("../app/component-insert-3d-server.ts", import.meta.url);
const { insertionGeometryContext } = await loadTs(server, { [new URL("../app/auth-server.ts", import.meta.url).href]: "export const sha256=async()=> 'unused';" });
const source = await json("public/component-insert-source.json"), catalog = makeInsertCatalog(source), context = insertionGeometryContext(source, catalog);
const items = new Map([...resources.components.items, ...source.items].map(i => [i.id, i]));
const profiles = await json("public/model-assets/manifest.json");
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-5, `${a} != ${b}`);
const vec = (a,b) => a.forEach((v,i)=>close(v,b[i]));
function prepare(p=fixture()) {
  p=sync(p);
  for(const side of ["suction","discharge"]){const c=p.entities["station-collectors"][side];c.calculation=calculateCollector(c.configuration,resources.components.collectorCatalog);c.status=c.calculation.complete?"complete":"incomplete";}
  const lines={version:1,revision:"kip-test",items:Object.fromEntries(lineGeometryIds(p).filter(id=>items.has(id)).map(id=>[id,lineGeometry(items.get(id),catalog,context)])),issues:[]};
  const assembly=model.buildAssembly(p,resources.pumps,profiles,lines);
  return {p,lines,assembly};
}
const parts = a => a.components.filter(c=>c.instrumentMount);
const jointIssues = a => model.connectionIssues(a).filter(i=>i.id.startsWith("kip-") && /нарушено|соосны|несовместим|не найдена/.test(i.message));

test("actual station mounts one KIP per occupied DN15: gauge above, relay/transducer immediately after bush, no staged duplicates",async()=>{
  const {p,assembly:a}=prepare();
  assert.equal(parts(a).length,11);assert.deepEqual(jointIssues(a),[]);
  for(const side of ["suction","discharge"]){
    const cs=parts(a).filter(c=>c.instrumentMount.parentId===`collector-${side}`);
    assert.deepEqual(cs.map(c=>c.instrumentMount.role),side==="suction"?["valve","gauge","adapter","bush","relay"]:["valve","gauge","adapter","bush","transducer","connector"]);
    const port=a.components.find(c=>c.id===`collector-${side}`).ports.find(p=>p.id==="instrument-kip-1-0");assert.equal(port.dn,15);assert.equal(port.thread,"G1/2");assert.equal(port.occupiedBy,"kip");
    assert.equal(a.lineJoints.filter(j=>j.id.startsWith(`kip-joint-${side}`)).length,5);
    const sensor=cs.find(c=>["relay","transducer"].includes(c.instrumentMount.role)),bush=cs.find(c=>c.instrumentMount.role==="bush");
    const tip=model.portPoint(a,{componentId:sensor.id,portId:"inlet"}),mouth=model.portPoint(a,{componentId:bush.id,portId:"outlet"});close(model.distance(tip,mouth),8);
    assert.ok(!a.components.some(c=>c.id.startsWith("spec-")&&cs.some(n=>n.equipmentId===c.equipmentId)),"automatic staging must be replaced");
    const bom=p.entities["station-collectors"][side].calculation.bom;assert.equal(bom.find(r=>r.role==="instrument-kip-1").quantity,1);assert.ok(!bom.some(r=>r.role==="instrument-kip-1-plug"));
  }
  const before=JSON.stringify(rows(p));model.buildAssembly(p,resources.pumps,profiles);assert.equal(JSON.stringify(rows(p)),before,"3D must not mutate cost or quantities");
  if(process.env.KIP_PREVIEW)await writeFile(process.env.KIP_PREVIEW,JSON.stringify({assembly:a,project:p}));
});

test("parent translation, arbitrary XYZ rotation, sgon length, save/reload and Undo/Redo preserve all mounted parts",()=>{
  const {p,lines,assembly:a}=prepare();
  const before=structuredClone(a);let b=model.editComponent(a,{id:"collector-suction",patch:{position:[123,456,789],rotation:[23,-37,59]}});
  assert.deepEqual(a,before,"edits must not mutate the previous history state");assert.deepEqual(jointIssues(b),[]);
  const parent=b.components.find(c=>c.id==="collector-suction"),t=structuredClone(parent.collector.template);
  const branch=t.branches.find(c=>c.id==="instrument-kip-1-0"),oldEnd=branch.endMm;
  t.mount.instrumentLengthsMm[branch.id]=90;
  const next=applyCollectorTemplate(parent,buildCollectorTemplate(p.entities["station-collectors"].suction,lines,t.ports.filter(p=>p.id.startsWith("pump-")).map(p=>({id:p.id,circuit:1,x:p.point[0]})),"suction",t.mount,t.pumpBranchOrientation));
  const history=model.execute(model.createHistory(b),{...b,components:b.components.map(c=>c.id===parent.id?next:c)});b=history.present;
  const delta=next.collector.template.branches.find(c=>c.id===branch.id).endMm-oldEnd;close(delta,30);
  for(const c of parts(b).filter(c=>c.instrumentMount.parentId===parent.id)){
    const old=parts(history.past[0]).find(n=>n.id===c.id);
    vec(model.subtract(c.position,old.position),model.rotate([0,0,30],parent.rotation));
  }
  assert.deepEqual(jointIssues(b),[]);
  const opened=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:b}))).assembly;
  assert.equal(parts(opened).length,11);assert.deepEqual(jointIssues(opened),[]);
  assert.deepEqual(model.undo(history).present,history.past[0]);assert.deepEqual(model.redo(model.undo(history)).present,b);
});

test("rebuild retains manual offsets and fixed collector, removes obsolete KIP instances and refreshes resources",()=>{
  const {p,lines,assembly:a}=prepare();
  const moved=model.editComponent(a,{id:"kip-suction-1-relay",patch:{position:[500,600,700]}});
  const saved=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:moved}))).assembly;
  const regenerated=model.buildAssembly(p,resources.pumps,profiles,lines),merged=model.mergeAssembly(saved,regenerated);
  const relay=merged.components.find(c=>c.id==="kip-suction-1-relay");vec(relay.position,[500,600,700]);assert.equal(relay.instrumentMount.manual,true);
  const fixed=model.editComponent(a,{id:"collector-suction",patch:{position:[200,300,400],locked:true}});
  const updated=model.mergeAssembly(fixed,regenerated);assert.deepEqual(jointIssues(updated),[]);
  const refreshed=model.refreshModelAssets(updated,p,resources.pumps,profiles,lines);assert.deepEqual(jointIssues(refreshed),[]);assert.equal(parts(refreshed).length,11);
  const legacy=structuredClone(fixed),parent=legacy.components.find(c=>c.id==="collector-suction");
  legacy.components=legacy.components.filter(c=>!c.instrumentMount);
  parent.ports=parent.ports.filter(p=>!p.id.startsWith("instrument"));parent.collector.template.ports=parent.ports;
  const upgraded=model.mergeAssembly(legacy,regenerated);assert.deepEqual(jointIssues(upgraded),[]);assert.equal(parts(upgraded).length,11);
  vec(upgraded.components.find(c=>c.id===parent.id).position,parent.position);
});

test("fire KIP quantities use distinct occupied sgons; open, capped, wrong DN or unthreaded ports never get mounted",()=>{
  const p=fixture();p.entities["station-settings"].stationType="fire";
  let {p:project,lines}=prepare(p);
  for(const side of ["suction","discharge"]){
    const card=project.entities["station-collectors"][side],first=card.configuration.instrumentPorts.find(p=>p.id==="kip-1");
    if(!card.configuration.instrumentPorts.some(p=>p.id==="kip-2"))card.configuration.instrumentPorts.push({...first,id:"kip-2",state:"occupied"});
  }
  for(const side of ["suction","discharge"]){const card=project.entities["station-collectors"][side];card.calculation=calculateCollector(card.configuration,resources.components.collectorCatalog);}
  const complete={p:project,assembly:model.buildAssembly(project,resources.pumps,profiles,lines)};
  assert.equal(parts(complete.assembly).length,22,JSON.stringify(complete.assembly.components.filter(c=>c.collector).map(c=>c.collector.template.issues)));assert.deepEqual(jointIssues(complete.assembly),[]);
  for(const patch of [{state:"open"},{state:"capped"},{dn:20},{threaded:false}]){
    project=structuredClone(complete.p);const card=project.entities["station-collectors"].suction;
    Object.assign(card.configuration.instrumentPorts.find(p=>p.id==="kip-1"),patch);card.calculation=calculateCollector(card.configuration,resources.components.collectorCatalog);
    const a=model.buildAssembly(project,resources.pumps,profiles,lines);
    assert.ok(!parts(a).some(c=>c.id.startsWith("kip-suction-1-")));assert.ok(a.components.find(c=>c.id==="collector-suction").collector.template.issues.some(i=>i.includes("КИП")));
    const merged=model.mergeAssembly(complete.assembly,a);assert.ok(!parts(merged).some(c=>c.id.startsWith("kip-suction-1-")),"old mounted instances must be removed");
  }
});

test("published KIP meshes match original CAD SHA256 and remain nonempty, unscaled assets",async()=>{
  const data=await json("data/instrument-mounts.json");
  for(const asset of Object.values(data.assets)){
    const source=await readFile(new URL(`../../${asset.source}`,import.meta.url)),mesh=await readFile(new URL(`../public${asset.meshUrl}`,import.meta.url));
    assert.equal(createHash("sha256").update(source).digest("hex"),asset.sourceHash);assert.equal(createHash("sha256").update(mesh).digest("hex"),asset.meshHash);
    assert.equal(mesh.length,84+50*mesh.readUInt32LE(80));assert.ok(mesh.readUInt32LE(80)>20);
    const bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
    for(let i=0;i<mesh.readUInt32LE(80);i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++){const x=mesh.readFloatLE(84+50*i+12+12*j+4*k);bounds[k]=Math.min(bounds[k],x);bounds[k+3]=Math.max(bounds[k+3],x);}
    bounds.forEach((v,i)=>close(v,asset.bounds[i]));
  }
});
