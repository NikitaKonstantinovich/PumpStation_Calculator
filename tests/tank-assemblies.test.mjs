import { readLocalCad } from "./local-cad-assets.mjs";
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
const {finishCollectorTemplate,moveCollectorBranchX,collectorTankX}=await load("model-editor/collector-template");
const {composeValvePose,relativePose}=await load("model-editor/valve-controls");

test("tank takeoff bisects the last branch-to-flange interval for 1/3/5 pumps and either collector end",()=>{
  for(const count of [1,3,5]){
    const {assembly:a}=prepare({count,on:false}),c=a.components.find(c=>c.id==="collector-discharge"),end=c.ports.find(p=>p.id==="network-right"),port=c.ports.find(p=>p.id==="instrument-tank-0");
    const pumpPorts=t=>t.ports.filter(p=>!p.id.startsWith("network-")&&!p.id.startsWith("instrument"));
    const last=pumpPorts(c.collector.template).at(-1);
    close(end.point[0]-port.point[0],port.point[0]-last.point[0]);
    close(c.collector.template.branches.find(b=>b.id===port.id).origin[0],port.point[0]);
    close(c.collector.template.pieces.find(p=>p.id==="instrument-tank-0-plug").position[0],port.point[0]);assert.equal(active(a).length,0);
    const b=model.editComponent(a,{id:c.id,patch:{parameters:{length:c.parameters.length+300}}}),updated=b.components.find(p=>p.id===c.id);
    const nextPort=updated.ports.find(p=>p.id===port.id),nextEnd=updated.ports.find(p=>p.id===end.id);
    close(nextEnd.point[0]-nextPort.point[0],nextPort.point[0]-last.point[0]);
    close(nextPort.point[0]-port.point[0],75);
    close(updated.collector.template.pieces.find(p=>p.id==="instrument-tank-0-plug").position[0],nextPort.point[0]);
    const moved=moveCollectorBranchX(c.collector.template,last.id,last.point[0]+40),movedTank=moved.ports.find(p=>p.id===port.id);
    close(movedTank.point[0]-port.point[0],20);
    close(moved.branches.find(b=>b.id===port.id).origin[0],movedTank.point[0]);
    close(moved.pieces.find(p=>p.id==="instrument-tank-0-plug").position[0],movedTank.point[0]);
    assert.deepEqual(moved.branches.filter(b=>b.role==="instrument"&&b.id!==port.id),c.collector.template.branches.filter(b=>b.role==="instrument"&&b.id!==port.id));
    if(count>1){
      const reversed=structuredClone(c.collector.template),pumps=pumpPorts(reversed);
      reversed.ports=[...reversed.ports.filter(p=>!pumps.includes(p)),...pumps.reverse()];
      finishCollectorTemplate(reversed);
      const x=reversed.ports.find(p=>p.id===port.id).point[0],left=reversed.ports.find(p=>p.id==="network-left").point[0];
      close(x-left,pumpPorts(reversed).at(-1).point[0]-x);
    }
    const noBranches={...c.collector.template,ports:c.ports.filter(p=>!pumpPorts(c.collector.template).includes(p))};
    assert.equal(collectorTankX(noBranches),undefined,"no invented axis when pump ports are missing");
  }
});

test("legacy 200 mm tank takeoff moves with its cap and attached 8 L assembly on refresh or JSON normalization",async()=>{
  const {followTankConnections}=await load("model-editor/tank-assemblies");
  for(const on of [false,true]){
    const {assembly:fresh}=prepare({on}),legacy=structuredClone(fresh),collector=legacy.components.find(c=>c.id==="collector-discharge"),t=collector.collector.template;
    const port=t.ports.find(p=>p.id==="instrument-tank-0"),expected=port.point[0],oldX=t.ports.find(p=>p.id==="network-right").point[0]-200,dx=oldX-expected;
    assert.ok(Math.abs(dx)>1);
    port.point[0]=oldX;t.branches.find(b=>b.id===port.id).origin[0]=oldX;
    for(const p of t.pieces)if(p.id===port.id||p.id.startsWith(port.id+"-"))p.position[0]+=dx;
    t.assumptions=t.assumptions.filter(note=>!note.startsWith("Сгон бака:"));
    t.assumptions.push("Сгон бака: ось на расстоянии 200 мм от привалочной плоскости торцевого фланца со стороны последнего насоса, по решению пользователя 01.11.2026.");
    const saved=followTankConnections(legacy),before=JSON.stringify(saved);
    for(const updated of [model.mergeAssembly(saved,fresh),model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:saved}))).assembly]){
      const c=updated.components.find(c=>c.id===collector.id);
      close(c.ports.find(p=>p.id===port.id).point[0],expected);
      assert.ok(!c.collector.template.assumptions.some(note=>note.startsWith("Сгон бака:")&&note.includes("200 мм")));
      if(on){
        for(const body of active(fresh))vec(updated.components.find(c=>c.id===body.id).position,body.position);
        assert.deepEqual(tankJoints(updated),[]);
      }else close(c.collector.template.pieces.find(p=>p.id===port.id+"-plug").position[0],expected);
    }
    assert.equal(JSON.stringify(saved),before,"saved snapshot remains immutable");
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

test("8 L tank sits on the actual DN20 valve with both threaded connections and no hose",()=>{
  const {p,assembly:a}=prepare(),tank=a.components.find(c=>c.id==="tank-discharge"),valve=a.components.find(c=>c.id==="tank-discharge-valve"),row=tankRow(p);
  assert.ok(valve.meshUrl&&valve.cadSource.hash);assert.equal(active(a).length,2);assert.equal(tank.tankMount.mode,"port");assert.equal(tank.tankMount.parentId,valve.id);assert.equal(valve.tankMount.parentId,"collector-discharge");assert.equal(tank.tankMount.volume,8);
  assert.deepEqual(tank.bounds,[-100,-100,0,100,100,311]);assert.match(tank.sourceNote,/Габаритная|Габарит|габарит|профиль|Профиль/);
  assert.equal(row.hydraulicAssembly.parts.find(p=>p.assemblyRole==="tank-valve").equipmentId,"tank-ld-pride-dn20-drain");
  assert.equal(row.hydraulicAssembly.parts.find(p=>p.assemblyRole==="tank-valve").price,1220,"approved estimate by DN20 drain/vent analogue preserves the native valve geometry");
  assert.ok(!row.hydraulicAssembly.parts.some(p=>p.assemblyRole==="tank-hose"));assert.ok(!a.components.some(c=>c.id.startsWith(`spec-${row.position}-equipment:${row.equipmentId}-`)));
  assert.deepEqual(tankJoints(a),[]);assert.deepEqual(a.lineJoints.filter(j=>j.id.startsWith("tank-joint-")).map(j=>[j.a.componentId,j.b.componentId,j.overlap]),[["collector-discharge",valve.id,10],[valve.id,tank.id,12]]);
  const collector=a.components.find(c=>c.id==="collector-discharge");close(tank.position[2]-model.portPoint(a,{componentId:collector.id,portId:"instrument-tank-0"})[2],33.5);
  const c=a.components.find(c=>c.id==="collector-discharge"),moved=model.editComponent(a,{id:c.id,patch:{position:[123,456,789],rotation:[29,-37,51]}});
  assert.deepEqual(tankJoints(moved),[]);assert.ok(!active(moved).some(c=>c.orphaned));
  const longer=model.editComponent(a,{id:c.id,patch:{parameters:{length:c.parameters.length+300}}});
  assert.deepEqual(tankJoints(longer),[]);
  for(const body of [tank,valve])close(model.distance(body.position,longer.components.find(c=>c.id===body.id).position),75);
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
    vec(refreshed.components.find(c=>c.id===body.id).position,target);assert.equal(active(refreshed).length,volume===8?2:1);
    if(volume===8)assert.ok(tankJoints(refreshed).length,"manually displaced tank must show its disconnected thread");else assert.deepEqual(tankJoints(refreshed),[]);
    assert.equal(parseProjectConfig(JSON.parse(JSON.stringify(p))).entities["station-settings"].membraneTankVolume,volume);
  }
  for(const volume of [8,50]){const off=prepare({on:false,volume}),saved=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:off.assembly}))).assembly;
    assert.equal(saved.components.find(c=>c.id==="collector-discharge").collector.template.pieces.find(p=>p.id==="instrument-tank-0-plug").shape.kind,"mesh");}
});

test("legacy fittings are replaced from specification and manual tank offsets survive",()=>{
  for(const volume of [8,50]){
    const {p,lines,assembly:a}=prepare({volume}),legacy=structuredClone(a),body=legacy.components.find(c=>c.id==="tank-discharge"),target=model.add(body.position,[7,0,0]);
    const collector=legacy.components.find(c=>c.id==="collector-discharge");
    const oldAnchor=volume===8?composeValvePose(body,{position:[0,0,12],rotation:[0,0,0]}):body;
    const local=relativePose(oldAnchor,{...body,position:target});
    body.position=target;body.tankMount={...body.tankMount,...local,revision:"tank-end200-pump-gap200-v1",manual:true,...(volume===8?{parentId:"tank-discharge-valve",portId:"outlet"}:{})};
    legacy.components=legacy.components.filter(c=>c.tankMount?.role!=="valve");
    for(const role of ["valve","hose"]){const old=structuredClone(a.components.find(c=>c.tankMount?.role===role)??body);
      legacy.components.push({...old,id:`tank-discharge-${role}`,locked:true,hidden:false,tankMount:{...old.tankMount,parentId:collector.id,portId:"instrument-tank-0",role,revision:"tank-end200-pump-gap200-v1",manual:false}});}
    legacy.lineJoints??=[];legacy.lineJoints.push({id:"tank-joint-legacy",a:{componentId:collector.id,portId:"instrument-tank-0"},b:{componentId:body.id,portId:"inlet"},kind:"thread",overlap:12,provisional:true});
    for(const next of [model.mergeAssembly(legacy,a),model.refreshModelAssets(legacy,p,resources.pumps,profiles,lines)]){
      assert.equal(active(next).length,volume===8?2:1);vec(next.components.find(c=>c.id===body.id).position,target);
      assert.ok(!next.lineJoints.some(j=>j.id==="tank-joint-legacy"));assert.ok(!active(next).some(c=>c.tankMount.role==="hose"));
    }
    const saved=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:legacy}))).assembly;
    assert.equal(active(saved).length,1);vec(active(saved)[0].position,target);
  }
});

test("body-only 8 L scene gains one valve without losing a hand-positioned tank",()=>{
  const {assembly:a}=prepare(),old=structuredClone(a);
  old.components=old.components.filter(c=>c.id!=="tank-discharge-valve");
  const tank=old.components.find(c=>c.id==="tank-discharge"),collector=old.components.find(c=>c.id==="collector-discharge"),p=collector.ports.find(p=>p.id==="instrument-tank-0");
  const anchor=composeValvePose(collector,{position:p.point,rotation:[0,0,0]});
  tank.position=model.add(tank.position,[8,-10,2]);tank.rotation=[4,5,6];
  tank.tankMount={...tank.tankMount,...relativePose(anchor,tank),parentId:collector.id,portId:p.id,revision:"tank-dn20-body-only-v2",manual:true};
  const updated=model.mergeAssembly(old,a),again=model.mergeAssembly(updated,a);
  assert.equal(active(again).length,2);const actual=again.components.find(c=>c.id===tank.id);vec(actual.position,tank.position);vec(actual.rotation,tank.rotation);
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
    const source=await readLocalCad(asset.source),mesh=await readFile(new URL(`../public${asset.meshUrl}`,import.meta.url));
    assert.equal(createHash("sha256").update(source).digest("hex"),asset.sourceHash);assert.equal(createHash("sha256").update(mesh).digest("hex"),asset.meshHash);assert.equal(mesh.length,84+50*mesh.readUInt32LE(80));
  }
  assert.equal(data.tank8.diameterMm,200);assert.equal(data.tank8.heightMm,311);
  if(process.env.TANK_PREVIEW_DIR){for(const volume of [8,50,80,100]){const {p,assembly}=prepare({volume});await writeFile(`${process.env.TANK_PREVIEW_DIR}/tank-${volume}.json`,JSON.stringify({assembly,project:p}));}const off=prepare({on:false});await writeFile(`${process.env.TANK_PREVIEW_DIR}/tank-off.json`,JSON.stringify({assembly:off.assembly,project:off.p}));}
});
