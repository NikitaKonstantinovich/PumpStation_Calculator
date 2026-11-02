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
test("BOM hardware rows do not duplicate physical fasteners", () => {
  const m=createCadManifest(project([component(),component({id:"bom",line:{role:"fasteners-bolts"}})]));
  assert.equal(m.instances.length,1);
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
