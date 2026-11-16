import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { loadTs } from "./load-ts.mjs";

const { cadTransform, createCadManifest, cadReady, snapshotKey } = await loadTs(new URL("../app/cad-export.ts", import.meta.url));
const pose = (position = [0,0,0], rotation = [0,0,0]) => ({position,rotation});
const component = (extra = {}) => ({ id:"a",name:"Pump",kind:"pump",...pose([2100,-75,300],[10,20,35]),hidden:false,opacity:1,locked:false,
  cadSource:{path:"Equipment/fixture.step",hash:"a".repeat(64)},parameters:{length:100,width:50,height:80,diameter:40,routeOffset:0},ports:[],...extra });
const project = components => ({project:{id:"p",name:"Station",updatedAt:"2026-11-01T12:00:00Z"},entities:{"station-model":{editor:{assembly:{version:1,sourceFingerprint:"fixture",components}}}}});
const applySw = (p,t) => [0,1,2].map(j => p.reduce((sum,n,i)=>sum+n*t[3*i+j],0)+1000*t[9+j]);
const close = (a,b) => a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-8,`${a} != ${b}`));
test("fabricated tube carries its physical dimensions, material finish and revision in the CAD snapshot", async()=>{
  const pipe=component({kind:"pipe",name:"Труба",cadSource:undefined,ports:[],parameters:{length:250,width:60,height:60,diameter:60,wallThickness:3,routeOffset:0}});
  const p=project([pipe]);p.entities["station-dn"]={collectorMaterial:"st20"};
  const first=createCadManifest(p).instances;
  assert.match(first[0].detailName,/Ø60×3 мм L=250 мм/);assert.equal(first[0].appearance,"red");
  p.entities["station-dn"].collectorMaterial="aisi304";const second=createCadManifest(p).instances;
  assert.equal(second[0].appearance,"metal");assert.notEqual(await snapshotKey(first),await snapshotKey(second));
  const original=project([component({kind:"equipment",name:"Труба сталь 20",equipmentId:"library-pipe"})]);
  original.entities["station-dn"]={collectorMaterial:"aisi304"};
  assert.equal(createCadManifest(original).instances[0].appearance,"red");
});
test("SW row-axis matrices match Three.js XYZ, mm to metres, and nested local CAD bases", () => {
  for(let i=0;i<25;i++){
    const poses=[pose([i*50,-i*3,275],[i*11,-i*7,i*13]),pose([12,-7,33],[43,17,-61]),pose([-5,0,9],[0,90,0])];
    const matrix=new THREE.Matrix4();
    for(const p of poses)matrix.multiply(new THREE.Matrix4().compose(new THREE.Vector3(...p.position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation.map(n=>n*Math.PI/180))),new THREE.Vector3(1,1,1)));
    const t=cadTransform(...poses);
    for(const point of [[0,0,0],[2,7,-3],[100,-200,500]])close(applySw(point,t),new THREE.Vector3(...point).applyMatrix4(matrix).toArray());
    assert.deepEqual(t.slice(12),[1,0,0,0]);
  }
});
test("export snapshots manual positions and hidden parts without mutating or rebuilding the scene", () => {
  const source=project([component({hidden:true})]),before=JSON.stringify(source),m=createCadManifest(source);
  assert.equal(JSON.stringify(source),before);assert.equal(m.instances.length,1);assert.equal(m.instances[0].hidden,true);
  close(m.instances[0].transform.slice(9,12),[2.1,-.075,.3]);
  source.entities["station-model"].editor.assembly.components[0].position[0]=999;
  assert.equal(m.instances[0].transform[9],2.1);
});
test("nested insertion uses component, piece and original mesh bases exactly once", () => {
  const c=component({kind:"equipment",cadSource:undefined,rotation:[0,0,90],insertion:{hiddenPieceIds:["p1"],template:{issues:[],geometry:{pieces:[{
    id:"p1",name:"Valve",...pose([100,0,0],[0,90,0]),fidelity:"cad",shape:{kind:"mesh",modelHash:"b".repeat(64),modelPosition:[5,2,3],modelRotation:[30,0,0]}
  }]}}}});
  const m=createCadManifest(project([c]));assert.equal(m.instances.length,1);assert.equal(m.instances[0].hidden,true);
  assert.deepEqual(m.instances[0].geometry,{kind:"native",hash:"b".repeat(64)});
  close(m.instances[0].transform,cadTransform(c,c.insertion.template.geometry.pieces[0],pose([5,2,3],[30,0,0])));
});
test("symbolic instances carry an actionable diagnosis and leave usable geometry in the manifest", () => {
  const partial=createCadManifest(project([component(),component({id:"missing",name:"Клапан",cadSource:undefined,shape:{kind:"marker"}})]));
  assert.equal(partial.instances.length,2);
  assert.equal(partial.instances[1].geometry.kind,"unavailable");
  assert.match(partial.instances[1].geometry.reason,/геометрия/);
  const m=createCadManifest(project([component({kind:"frame",cadSource:undefined,equipmentId:"frame-1"})]));
  assert.equal(m.instances[0].geometry.kind,"catalogue");
});
test("threaded fitting exports a reviewed STEP but omits a dimension-only mesh", () => {
  const hash = "a".repeat(64);
  const local = pose([5, 2, 3], [0, 0, -90]);
  const shape = { kind: "mesh", modelHash: hash, modelPosition: local.position, modelRotation: local.rotation };
  const exact = component({ id: "exact", kind: "equipment", name: "Ниппель LD Pride", line: { fidelity: "cad", role: "primary-pump-nipple" }, shape });
  const outline = component({ id: "outline", kind: "equipment", name: "Ниппель LD Pride", line: { fidelity: "outline", role: "primary-between-valves-nipple" }, cadSource: undefined, shape });
  const { instances } = createCadManifest(project([exact, outline]));
  assert.deepEqual(instances[0].geometry, { kind: "native", hash, source: "Equipment/fixture.step" });
  close(instances[0].transform, cadTransform(exact, local));
  assert.equal(instances[1].geometry.kind, "unavailable");
  assert.match(instances[1].geometry.reason, /геометри|контур|оболоч/i);
});
test("BOM hardware rows do not duplicate physical fasteners", () => {
  const m=createCadManifest(project([component(),component({id:"bom",line:{role:"fasteners-bolts"}})]));
  assert.equal(m.instances.length,1);
});
test("collector subassemblies contain fabrication parts while KIP and caps keep their world poses at station level", async () => {
  const c=component({id:"collector-suction",name:"Всасывающий коллектор",kind:"equipment",cadSource:undefined});
  const makePiece=(id,shape)=>({id,componentId:id,name:id,role:id,...pose([55,12,83],[0,25,90]),ports:[],source:"fixture",fidelity:"parametric",shape});
  const flange={kind:"flange",lengthMm:20,outerMm:185,innerMm:81,boltCircleMm:145,boltHoleMm:18,boltHoles:8};
  const collar={kind:"collar",lengthMm:30,outerMm:76,innerMm:70,lipOuterMm:100,lipThicknessMm:3};
  const main={componentId:"pipe",outerMm:159,innerMm:153,lengthMm:900};
  const branch=(id,role)=>({id,name:id,role,componentId:id,portId:id,origin:[50,0,0],axis:[0,0,1],outerMm:26,innerMm:20,endMm:150});
  const pieces=[makePiece("end-left-weldFlange",flange),makePiece("end-right-collar",collar),makePiece("end-right-looseFlange",flange),
    makePiece("branch-pump-1-0-collar",collar),makePiece("branch-pump-1-0-looseFlange",flange),
    makePiece("instrument-reserve-0",{kind:"tube",lengthMm:50,outerMm:26,innerMm:20}),
    makePiece("instrument-reserve-0-plug",{kind:"mesh",modelHash:"b".repeat(64),modelPosition:[0,0,-10],modelRotation:[0,90,0]})];
  c.collector={hiddenPieceIds:[pieces.at(-1).id],template:{main,branches:[branch("branch-pump-1-0","branch"),branch("instrument-kip-1-0","instrument")],
    pieces,ports:["network-left","network-right","pump-1-0","instrument-kip-1-0","instrument-reserve-0"].map(id=>({id})),issues:[],assumptions:[]}};
  const instruments=["valve","gauge","switch","transducer","adapter","bush","connector"].map((role,i)=>component({id:`kip-${role}`,kind:"equipment",name:role,
    ...pose([100+i,125,720],[15,i,30]),instrumentMount:{parentId:c.id,role,portId:"instrument-kip-1-0"}}));
  const loose=component({id:"separate-loose",kind:"equipment",cadSource:undefined,shape:flange,line:{role:"branch-looseFlange",fidelity:"parametric"}});
  const p=project([c,...instruments,loose]);
  p.entities["station-model"].editor.assembly.lineJoints=[{a:{componentId:loose.id,portId:"left"},b:{componentId:c.id,portId:"pump-1-0"},kind:"seat"}];
  const before=JSON.stringify(p),m=createCadManifest(p),parts=m.instances.filter(i=>i.componentId===c.id);
  assert.equal(JSON.stringify(p),before,"export never changes mounting relationships or saved scene");
  assert.equal(m.instances.length,18,"all physical components remain exported exactly once");
  for(const part of parts.filter(i=>!i.pieceId.endsWith("-plug")))assert.equal(part.subassembly?.id,c.id,part.pieceId);
  assert.equal(m.instances.find(i=>i.componentId===loose.id).subassembly?.id,c.id,"seated loose flanges remain included");
  for(const instrument of instruments) {
    const part=m.instances.find(i=>i.componentId===instrument.id);
    assert.equal(part.subassembly,undefined);assert.deepEqual(part.transform,cadTransform(instrument));
  }
  const cap=parts.find(i=>i.pieceId.endsWith("-plug"));
  assert.equal(cap.subassembly,undefined);assert.equal(cap.hidden,true);
  assert.deepEqual(cap.transform,cadTransform(c,pieces.at(-1),pose([0,0,-10],[0,90,0])));
  const legacy=m.instances.map(i=>instruments.some(c=>c.id===i.componentId)||i.id===cap.id?{...i,subassembly:{id:c.id,name:c.name,transform:cadTransform(c)}}:i);
  assert.notEqual(await snapshotKey(legacy),await snapshotKey(m.instances),"previous SOLIDWORKS builds become stale");
});
test("cabinet profiles retain their cut length, slot coordinates and pose in the CAD snapshot", async () => {
  for (const length of [600, 800]) {
    const c = component({id:"frame-profile-upper",kind:"equipment",cadSource:undefined,
      frameProfile:{version:1,length,holes:[56,72,length-5.5]}});
    const [part] = createCadManifest(project([c])).instances;
    assert.equal(part.geometry.kind, "frame-profile");
    assert.equal(part.geometry.lengthMm, length);
    assert.deepEqual(part.geometry.slots.slice(0, 2), [[20,56],[72,72]]);
    assert.equal(part.geometry.slots.at(-1)[1], length-5.51);
    close(part.transform, cadTransform(c));
    c.frameProfile.holes[0] = 58;
    assert.notEqual(await snapshotKey([part]), await snapshotKey(createCadManifest(project([c])).instances));
  }
});
test("availability follows the exact built snapshot, including a restored partial job", async () => {
  const p=project([component()]), model=p.entities["station-model"], c=model.editor.assembly.components[0];
  const key=()=>snapshotKey(createCadManifest(p).instances);
  const original=await key();
  const job={snapshotKey:original,completed:1,status:"partial"};
  for(const state of ["queued","building","failed"]) assert.equal(cadReady({...job,status:state},original),false);
  assert.equal(cadReady(null,original),false);
  for(const state of ["completed","partial"]) assert.equal(cadReady(JSON.parse(JSON.stringify({...job,status:state})),original),true);
  assert.equal(cadReady({...job,completed:0}, original),false);
  assert.equal(cadReady({...job,staleReason:"changed file"}, original),false);
  model.editor.selectedId="a"; model.editor.camera={position:[3,4,5]}; c.opacity=.2; c.hidden=true;
  assert.equal(await key(),original);
  for(const mutate of [()=>c.position[1]++,()=>c.rotation[2]++,()=>c.parameters.length++,()=>{c.cadSource.hash="b".repeat(64);},
    ()=>model.editor.assembly.components.push(component({id:"extra"}))]) {
    const before=await key(); mutate(); assert.notEqual(await key(),before);
    assert.equal(cadReady(job,await key()),false);
  }
});
