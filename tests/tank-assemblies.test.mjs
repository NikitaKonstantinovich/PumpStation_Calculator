import test from "node:test";
import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fixture,sync,rows,resources,load,json,choose,parseProjectConfig } from "./fixtures/station-specification.mjs";
import { loadTs } from "./load-ts.mjs";
const model=await load("model-editor/model"),{calculateCollector}=await load("collector-calculations"),{makeInsertCatalog}=await load("component-insert-catalog"),{lineGeometry}=await load("line-geometry-catalog"),{lineGeometryIds}=await load("model-editor/specification-models");
const source=await json("public/component-insert-source.json"),catalog=makeInsertCatalog(source),profiles=await json("public/model-assets/manifest.json");
const {insertionGeometryContext}=await loadTs(new URL("../app/component-insert-3d-server.ts",import.meta.url),{[new URL("../app/auth-server.ts",import.meta.url).href]:"export const sha256=async()=> 'unused';"});
const context=insertionGeometryContext(source,catalog),items=new Map([...resources.components.items,...source.items].map(i=>[i.id,i]));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`),vec=(a,b)=>a.forEach((v,i)=>close(v,b[i]));
function prepare({volume=8,on=true,count=3,material="aisi304"}={}){
  let p=fixture();choose(p,"318",Math.max(1,count-1),count>1?1:0);Object.assign(p.entities["station-settings"],{membraneTank:on,membraneTankVolume:volume});p.entities["station-dn"].collectorMaterial=material;p=sync(p);
  for(const side of ["suction","discharge"]){const card=p.entities["station-collectors"][side];card.calculation=calculateCollector(card.configuration,resources.components.collectorCatalog);}
  const lines={version:1,revision:"tank-test",items:Object.fromEntries(lineGeometryIds(p).filter(id=>items.has(id)).map(id=>[id,lineGeometry(items.get(id),catalog,context)])),issues:[]};
  return {p,lines,assembly:model.buildAssembly(p,resources.pumps,profiles,lines)};
}
const tankRow=p=>rows(p).find(r=>r.assemblyRole==="discharge:tank");
const active=a=>a.components.filter(c=>c.tankMount);
const tankJoints=a=>model.connectionIssues(a).filter(i=>(i.id.startsWith("tank-")||i.id==="collector-discharge")&&/соединение нарушено|оси стыка|разные DN|несовместим|точка подключения стыка не найдена/.test(i.message));
const {finishCollectorTemplate}=await load("model-editor/collector-template");
const {composeValvePose,relativePose}=await load("model-editor/valve-controls");

test("tank takeoff stays 200 mm from last-pump end flange, including changes in collector length and 1/3/5 pumps",()=>{
  for(const count of [1,3,5]){
    const {assembly:a}=prepare({count,on:false}),c=a.components.find(c=>c.id==="collector-discharge"),end=c.ports.find(p=>p.id==="network-right"),port=c.ports.find(p=>p.id==="instrument-tank-0");
    close(end.point[0]-port.point[0],200);assert.ok(c.collector.template.pieces.some(p=>p.id==="instrument-tank-0-plug"));assert.equal(active(a).length,0);
    const b=model.editComponent(a,{id:c.id,patch:{parameters:{length:c.parameters.length+300}}}),updated=b.components.find(p=>p.id===c.id);
    close(updated.ports.find(p=>p.id==="network-right").point[0]-updated.ports.find(p=>p.id==="instrument-tank-0").point[0],200);
    if(count>1){
      const reversed=structuredClone(c.collector.template),pumps=reversed.ports.filter(p=>!p.id.startsWith("network-")&&!p.id.startsWith("instrument"));
      reversed.ports=[...reversed.ports.filter(p=>!pumps.includes(p)),...pumps.reverse()];
      finishCollectorTemplate(reversed);
      close(reversed.ports.find(p=>p.id==="instrument-tank-0").point[0]-reversed.ports.find(p=>p.id==="network-left").point[0],200);
    }
  }
});

test("disabled option uses exactly one female cap in collector BOM and 3D; toggling preserves the outlet",()=>{
  for(const volume of [8,50,80,100]){
    const off=prepare({volume,on:false}),on=prepare({volume}),card=off.p.entities["station-collectors"].discharge;
    const port=card.configuration.instrumentPorts.find(p=>p.id==="tank");assert.equal(port.state,"capped");assert.equal(port.dn,20);
    assert.equal(card.calculation.bom.find(r=>r.role==="instrument-tank").quantity,1);assert.equal(card.calculation.bom.find(r=>r.role==="instrument-tank-plug").quantity,1);
    assert.ok(!on.p.entities["station-collectors"].discharge.calculation.bom.some(r=>r.role==="instrument-tank-plug"));
    const c=off.assembly.components.find(c=>c.id==="collector-discharge"),shape=c.collector.template.pieces.find(p=>p.id==="instrument-tank-0-plug").shape;
    assert.equal(shape.kind,"mesh");assert.equal(tankRow(off.p),undefined);
    const locked=model.editComponent(on.assembly,{id:c.id,patch:{locked:true}}),merged=model.mergeAssembly(locked,off.assembly);
    assert.equal(active(merged).length,0);assert.ok(merged.components.find(p=>p.id===c.id).collector.template.pieces.some(p=>p.id==="instrument-tank-0-plug"));
  }
});

test("8 L body stays over its DN20 collector takeoff while valve and hose are omitted from 3D",()=>{
  const {p,assembly:a}=prepare(),tank=a.components.find(c=>c.id==="tank-discharge"),valve=a.components.find(c=>c.id==="tank-discharge-valve"),row=tankRow(p);
  assert.equal(valve,undefined);assert.equal(active(a).length,1);assert.equal(tank.tankMount.mode,"port");assert.equal(tank.tankMount.parentId,"collector-discharge");assert.equal(tank.tankMount.volume,8);
  assert.deepEqual(tank.bounds,[-100,-100,0,100,100,311]);assert.match(tank.sourceNote,/Габаритная|Габарит|габарит|профиль|Профиль/);
  assert.equal(row.hydraulicAssembly.parts.find(p=>p.assemblyRole==="tank-valve").equipmentId,"tank-ld-pride-dn20-drain");
  assert.equal(row.hydraulicAssembly.parts.find(p=>p.assemblyRole==="tank-valve").price,null,"unknown LD20 price must not be borrowed");
  assert.ok(!row.hydraulicAssembly.parts.some(p=>p.assemblyRole==="tank-hose"));assert.ok(!a.components.some(c=>c.id.startsWith(`spec-${row.position}-equipment:${row.equipmentId}-`)));
  assert.deepEqual(tankJoints(a),[]);assert.ok(!a.lineJoints?.some(j=>j.id.startsWith("tank-joint-")));assert.match(tank.sourceNote,/не отрисовываются/);
  const collector=a.components.find(c=>c.id==="collector-discharge");close(tank.position[2]-model.portPoint(a,{componentId:collector.id,portId:"instrument-tank-0"})[2],33.5);
  const c=a.components.find(c=>c.id==="collector-discharge"),moved=model.editComponent(a,{id:c.id,patch:{position:[123,456,789],rotation:[29,-37,51]}});
  assert.deepEqual(tankJoints(moved),[]);assert.ok(!active(moved).some(c=>c.orphaned));
});

test("50/80/100 L retain 200 mm envelope gap and frame support, with transition and hose in specification only",()=>{
  for(const volume of [50,80,100]){
    const {p,assembly:a}=prepare({volume}),tank=a.components.find(c=>c.id==="tank-discharge"),last=a.components.filter(c=>c.kind==="pump").at(-1),frame=a.components.find(c=>c.kind==="frame");
    assert.equal(active(a).length,1);assert.equal(tank.tankMount.parentId,last.id);assert.equal(tank.tankMount.mode,"floor");assert.ok(tank.meshUrl);
    const pb=model.componentBounds(a,last),tb=model.componentBounds(a,tank),fb=model.componentBounds(a,frame);close(tb[1]-pb[4],200);close(tb[2],fb[5]);assert.ok(tb[4]<=fb[4]+1e-5);
    assert.ok(!a.components.some(c=>c.id==="tank-discharge-hose"||c.id==="tank-discharge-valve"));
    assert.ok(!a.lineJoints?.some(j=>j.id.startsWith("tank-joint-")));
    const product=tankRow(p);assert.equal(product.quantity,1);assert.equal(product.hydraulicAssembly.parts.find(p=>p.assemblyRole==="tank-hose").quantity,1);
    assert.equal(product.hydraulicAssembly.parts.find(p=>p.assemblyRole==="tank-diameter-transition").quantity,1);
    assert.equal(a.components.find(c=>c.id==="collector-discharge").ports.find(p=>p.id==="instrument-tank-0").dn,20);
    const b=model.editComponent(a,{id:last.id,patch:{rotation:[0,0,45]}}),pump=b.components.find(c=>c.id===last.id),updated=b.components.find(c=>c.id===tank.id);
    close(model.componentBounds(b,updated)[1]-model.componentBounds(b,pump)[4],200);
    assert.deepEqual(tankJoints(b),[]);
    const next=prepare({volume,count:5}).assembly,merged=model.mergeAssembly(a,next),mt=merged.components.find(c=>c.id===tank.id),lastNext=merged.components.filter(c=>c.kind==="pump").at(-1);
    assert.equal(mt.tankMount.parentId,lastNext.id);assert.ok(!mt.orphaned);
    close(model.componentBounds(merged,mt)[1]-model.componentBounds(merged,lastNext)[4],200);
  }
});

test("tank links, body/cap geometry, manual corrections, Undo/Redo and resource refresh survive JSON",()=>{
  for(const volume of [8,50,80,100]){
    const {p,lines,assembly:a}=prepare({volume}),body=a.components.find(c=>c.id==="tank-discharge"),target=model.add(body.position,[7,0,0]);
    const moved=model.editComponent(a,{id:body.id,patch:{position:target}}),history=model.execute(model.createHistory(a),moved);
    assert.deepEqual(model.undo(history).present,a);assert.deepEqual(model.redo(model.undo(history)).present,moved);
    const saved=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:moved}))).assembly;assert.ok(saved);vec(saved.components.find(c=>c.id===body.id).position,target);
    assert.ok(!active(saved).some(c=>c.orphaned));
    const fresh=model.buildAssembly(p,resources.pumps,profiles,lines),merged=model.mergeAssembly(saved,fresh),refreshed=model.refreshModelAssets(merged,p,resources.pumps,profiles,lines);
    vec(refreshed.components.find(c=>c.id===body.id).position,target);assert.equal(active(refreshed).length,1);
    assert.deepEqual(tankJoints(refreshed),[]);
    assert.equal(parseProjectConfig(JSON.parse(JSON.stringify(p))).entities["station-settings"].membraneTankVolume,volume);
  }
  for(const volume of [8,50]){const off=prepare({on:false,volume}),saved=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:off.assembly}))).assembly;
    assert.equal(saved.components.find(c=>c.id==="collector-discharge").collector.template.pieces.find(p=>p.id==="instrument-tank-0-plug").shape.kind,"mesh");}
});

test("legacy valves, hoses and rigid joints disappear on saved-scene refresh while manual tank offsets survive",()=>{
  for(const volume of [8,50]){
    const {p,lines,assembly:a}=prepare({volume}),legacy=structuredClone(a),body=legacy.components.find(c=>c.id==="tank-discharge"),target=model.add(body.position,[7,0,0]);
    const collector=legacy.components.find(c=>c.id==="collector-discharge");
    const oldAnchor=volume===8?composeValvePose(body,{position:[0,0,12],rotation:[0,0,0]}):body;
    const local=relativePose(oldAnchor,{...body,position:target});
    body.position=target;body.tankMount={...body.tankMount,...local,revision:"tank-end200-pump-gap200-v1",manual:true,...(volume===8?{parentId:"tank-discharge-valve",portId:"outlet"}:{})};
    for(const role of ["valve","hose"]){legacy.components.push({...structuredClone(body),id:`tank-discharge-${role}`,locked:true,hidden:false,tankMount:{...body.tankMount,parentId:collector.id,portId:"instrument-tank-0",role}});}
    legacy.lineJoints??=[];legacy.lineJoints.push({id:"tank-joint-legacy",a:{componentId:collector.id,portId:"instrument-tank-0"},b:{componentId:body.id,portId:"inlet"},kind:"thread",overlap:12,provisional:true});
    for(const next of [model.mergeAssembly(legacy,a),model.refreshModelAssets(legacy,p,resources.pumps,profiles,lines)]){
      assert.equal(active(next).length,1);assert.equal(active(next)[0].tankMount.role,"tank");vec(active(next)[0].position,target);
      assert.ok(!next.lineJoints.some(j=>j.id.startsWith("tank-joint-")));
    }
    const saved=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:legacy}))).assembly;
    assert.equal(active(saved).length,1);vec(active(saved)[0].position,target);
  }
});

test("updating a locked old DN25 tank takeoff changes only its section to DN20 and closes it with a DN20 cap",()=>{
  const {assembly:a}=prepare({volume:100,on:false}),old=structuredClone(a),collector=old.components.find(c=>c.id==="collector-discharge");
  collector.locked=true;
  const template=collector.collector.template,branch=template.branches.find(b=>b.id==="instrument-tank-0"),fresh=structuredClone(branch);
  const other=structuredClone(template.branches.filter(b=>b.id!==branch.id));
  branch.outerMm+=5;branch.innerMm+=5;branch.thread.designation='1″';branch.thread.pitchMm=25.4/11;
  for(const p of [...template.ports,...collector.ports].filter(p=>p.id==="instrument-tank-0")){p.dn=25;p.thread="G1";}
  const next=model.mergeAssembly(old,a).components.find(c=>c.id===collector.id),updated=next.collector.template.branches.find(b=>b.id===branch.id);
  assert.equal(next.locked,true);assert.equal(next.ports.find(p=>p.id==="instrument-tank-0").dn,20);assert.equal(updated.outerMm,fresh.outerMm);assert.equal(updated.innerMm,fresh.innerMm);assert.equal(updated.thread.designation,fresh.thread.designation);
  assert.deepEqual(next.collector.template.branches.filter(b=>b.id!==branch.id),other);
  assert.equal(next.collector.template.pieces.filter(p=>p.id==="instrument-tank-0-plug").length,1);
});

test("published tank CAD assets match sources and remain unscaled; nominal 8 L dimensions match passport metadata",async()=>{
  const data=await json("data/tank-models.json");
  for(const asset of Object.values(data.assets)){
    const source=await readFile(new URL(`../../${asset.source}`,import.meta.url)),mesh=await readFile(new URL(`../public${asset.meshUrl}`,import.meta.url));
    assert.equal(createHash("sha256").update(source).digest("hex"),asset.sourceHash);assert.equal(createHash("sha256").update(mesh).digest("hex"),asset.meshHash);assert.equal(mesh.length,84+50*mesh.readUInt32LE(80));
  }
  assert.equal(data.tank8.diameterMm,200);assert.equal(data.tank8.heightMm,311);
  if(process.env.TANK_PREVIEW_DIR){for(const volume of [8,50,80,100]){const {p,assembly}=prepare({volume});await writeFile(`${process.env.TANK_PREVIEW_DIR}/tank-${volume}.json`,JSON.stringify({assembly,project:p}));}const off=prepare({on:false});await writeFile(`${process.env.TANK_PREVIEW_DIR}/tank-off.json`,JSON.stringify({assembly:off.assembly,project:off.p}));}
});
