import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";
import { model, hardware, realStation } from "./fixtures/flange-fasteners.mjs";
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
const { rebuildFasteners }=await loadTs(new URL("../app/model-editor/flange-fasteners.ts",import.meta.url));
const replacements={};
for(const name of ["fastener-renderer","insertion-renderer"]){const url=new URL(`../app/model-editor/${name}.ts`,import.meta.url);replacements[url.href]=(await readFile(url,"utf8")).replace('from "three"',`from ${JSON.stringify(new URL("../node_modules/three/build/three.module.js",import.meta.url).href)}`);}
const { fastenerObject }=await loadTs(new URL("../app/model-editor/fastener-renderer.ts",import.meta.url),replacements);
const { disposeInsertionObject:disposeObject }=await loadTs(new URL("../app/model-editor/insertion-renderer.ts",import.meta.url),replacements);

function flange(id,x,rotation=0){
  return {id,name:id,kind:"equipment",position:[x,0,0],rotation:[0,0,rotation],hidden:false,locked:false,opacity:1,sourceNote:"fixture exact flange",
    parameters:{length:20,width:200,height:200,diameter:200,routeOffset:0},
    shape:{kind:"flange",lengthMm:20,outerMm:200,innerMm:80,boltCircleMm:160,boltHoles:8,boltHoleMm:18},
    ports:[{id:"left",point:[0,0,0],axis:[-1,0,0],connection:"flanged",dn:80,pn:16},{id:"right",point:[20,0,0],axis:[1,0,0],connection:"weld"}]};
}
function pair(){
  return rebuildFasteners({version:1,sourceFingerprint:"fixture",fastenerCatalog:hardware,components:[flange("a",0,180),flange("b",2),{
    ...flange("gasket",0),name:"Gasket",shape:{kind:"tube",lengthMm:2,outerMm:140,innerMm:80},
    line:{version:1,circuit:1,pumpId:"test",side:"discharge",role:"primary-valve-gaskets",specPosition:"1",instance:0,quantity:1,sequence:1,fidelity:"parametric",length:2,issues:[],ports:["left","right"],baseline:{position:[0,0,0],rotation:[0,0,0]},geometryRevision:"test"},
    ports:[{id:"left",point:[0,0,0],axis:[-1,0,0],connection:"flanged"},{id:"right",point:[2,0,0],axis:[1,0,0],connection:"flanged"}],
  }],lineJoints:[{id:"ag",a:{componentId:"a",portId:"left"},b:{componentId:"gasket",portId:"left"},kind:"face",overlap:0,provisional:false},{id:"gb",a:{componentId:"gasket",portId:"right"},b:{componentId:"b",portId:"left"},kind:"face",overlap:0,provisional:false}]});
}
test("one actual-size set spans two flanges and actual gasket; renderer instances each hole",()=>{
  const a=pair(),c=a.components.find(c=>c.fastener),b=c.fastener;
  assert.equal(b.status,"ready",b.issues.join(";"));assert.equal(b.count,8);assert.equal(b.grip,42);assert.equal(b.minimumLength,63);
  assert.ok(b.dimensions.length>=63);assert.equal(b.dimensions.ends,1);
  const object=fastenerObject(c);assert.equal(object.children.length,4);
  assert.ok(object.children.every(m=>m.isInstancedMesh&&m.count===8));
  let disposed=0;for(const mesh of object.children)mesh.addEventListener("dispose",()=>disposed++);
  disposeObject(object);assert.equal(disposed,4,"instance GPU buffers must be released on scene rebuild");
  assert.deepEqual(rebuildFasteners(a),a);
});
test("movement diagnoses gap, arbitrary common transform follows, undo/reopen preserve visibility and no duplicates",()=>{
  const a=pair(),group=a.components.find(c=>c.fastener),h=model.createHistory(a);
  const changed=model.editComponent(a,{id:"b",patch:{position:[2,2,0]}});
  assert.equal(changed.components.find(c=>c.fastener).fastener.status,"blocked");
  assert.deepEqual(model.undo(model.execute(h,changed)).present,a);
  const hidden=model.editComponent(a,{id:group.id,patch:{hidden:true,locked:false}});
  assert.equal(hidden.components.find(c=>c.fastener).locked,true);
  const opened=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:hidden,showFasteners:false})));
  assert.equal(opened.showFasteners,false);assert.equal(opened.assembly.components.find(c=>c.fastener).hidden,true);
  const moved={...a,components:a.components.filter(c=>!c.fastener).map(c=>({...c,position:model.add(model.rotate(c.position,[25,17,12]),[100,200,50]),rotation:c.id==="a"?[25,17,192]:[25,17,12]}))};
  const next=rebuildFasteners(moved);assert.equal(next.components.filter(c=>c.fastener).length,1);assert.equal(next.components.find(c=>c.fastener).fastener.status,"ready");
});
test("clocking mismatch, diameter/PN mismatch and absent standard hardware block plausible but wrong bolts",()=>{
  for(const mutate of [c=>c.rotation[0]=10,c=>c.shape.boltCircleMm=180,c=>c.ports[0].pn=25,c=>c.shape.innerMm=145]){
    const a=pair();mutate(a.components.find(c=>c.id==="b"));assert.equal(rebuildFasteners(a).components.find(c=>c.fastener).fastener.status,"blocked");
  }
  const a=pair();a.fastenerCatalog={version:1,items:[]};assert.equal(rebuildFasteners(a).components.find(c=>c.fastener).fastener.status,"blocked");
});
test("real CDM assembly groups wafer packages once and preserves pump flow and manual layout",async()=>{
  const {assembly:a}=await realStation();
  const groups=a.components.filter(c=>c.fastener);
  assert.ok(groups.length>=6);
  assert.equal(groups.length,6);
  assert.ok(groups.every(c=>c.fastener.status==="ready"),groups.map(c=>c.fastener.issues).flat().join("\n"));
  assert.equal(groups.filter(c=>c.fastener.dimensions.ends===2).length,2);
  assert.ok(groups.some(c=>c.fastener.members.some(id=>/between-valves-flanges-looseFlange/.test(id))),"loose insert flange is a package support");
  assert.ok(groups.some(c=>c.fastener.members.some(id=>a.components.find(p=>p.id===id)?.collector)),"collector flange is a package support");
  for(const c of a.components.filter(c=>/CheckValve|SuctionValve|DischargeValve/.test(c.line?.role??"")))assert.ok(groups.filter(g=>g.fastener.members.includes(c.id)).length<=1,`duplicate ${c.id}`);
  const pump=a.components.find(c=>c.kind==="pump"),changed=model.editComponent(a,{id:pump.id,patch:{position:model.add(pump.position,[0,0,7]),locked:true}});
  const reopened=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:changed}))).assembly;
  const merged=model.mergeAssembly(reopened,a);assert.deepEqual(merged.components.find(c=>c.id===pump.id).position,changed.components.find(c=>c.id===pump.id).position);
  assert.equal(merged.components.find(c=>c.id===pump.id).cadSource.hash,pump.cadSource.hash);
});

test("stud hardware remains outside the entire package; washers and nuts have open bores",async()=>{
  const {assembly}=await realStation(),c=assembly.components.find(c=>c.fastener?.dimensions?.ends===2),b=c.fastener,d=b.dimensions;
  const object=fastenerObject(c);object.updateMatrixWorld(true);
  const [rod,washer,nut]=object.children;
  assert.equal(rod.count,8);assert.equal(washer.count,16);assert.equal(nut.count,16);
  for(const mesh of [washer,nut]) {
    mesh.geometry.computeBoundingBox();
    for(let i=0;i<mesh.count;i++) {
      const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);
      const bounds=mesh.geometry.boundingBox.clone().applyMatrix4(matrix);
      assert.ok(bounds.max.x<=1e-5 || bounds.min.x>=b.grip-1e-5,"bearing hardware must be outside the grip");
    }
    const p=b.centers[0],ray=new THREE.Raycaster(new THREE.Vector3(-d.length,p[1],p[2]),new THREE.Vector3(1,0,0));
    assert.equal(ray.intersectObject(mesh).length,0,"the nominal bore must remain open");
  }
  assert.ok(d.length-b.grip-2*(d.nut+d.washer)>=10-.01);
  disposeObject(object);
});

test("explicit short specification bolt is diagnosed instead of stretched or silently replaced",()=>{
  const a=pair(),gasket=a.components.find(c=>c.id==="gasket");
  const short=hardware.items.find(h=>h.kind==="bolt"&&h.diameter===16&&h.length<63);
  assert.ok(short);
  a.components.push({...gasket,id:"spec-bolt",equipmentId:short.id,ports:[],line:{...gasket.line,role:"primary-pump-fasteners-bolts",quantity:8}});
  const group=rebuildFasteners(a).components.find(c=>c.fastener);
  assert.equal(group.fastener.status,"blocked");assert.match(group.fastener.issues.join(" "),/короче фактического пакета/);
});

test("four-hole DN50 and absent drill metadata use actual geometry and refuse unsupported mounts",()=>{
  const a=pair();
  for(const c of a.components.filter(c=>c.shape?.kind==="flange")) {
    Object.assign(c.shape,{boltHoles:4,boltCircleMm:125,outerMm:165,innerMm:60.3});c.ports[0].dn=50;
  }
  const ready=rebuildFasteners(a).components.find(c=>c.fastener);
  assert.equal(ready.fastener.status,"ready",ready.fastener.issues.join(";"));assert.equal(ready.fastener.count,4);
  delete a.components[0].shape.boltCircleMm;
  const blocked=rebuildFasteners(a).components.find(c=>c.fastener);
  assert.equal(blocked.fastener.status,"blocked");assert.match(blocked.fastener.issues.join(" "),/нет подтверждённых отверстий/);
});

test("nested insertion end uses its actual flange transform, not the component bounding box",()=>{
  const a=pair(),b=a.components.find(c=>c.id==="b"),shape=b.shape;
  delete b.shape;
  b.insertion={template:{geometry:{pieces:[{id:"left",source:"fixture flange metadata",position:[0,0,0],rotation:[0,0,0],shape}]}},hiddenPieceIds:[]};
  const g=rebuildFasteners(a).components.find(c=>c.fastener);
  assert.equal(g.fastener.status,"ready",g.fastener.issues.join(";"));assert.equal(g.fastener.grip,42);
});

test("persisted incomplete dimensions are rejected; redo and repeated merge retain hidden groups",async()=>{
  const {parseFastenerBinding}=await loadTs(new URL("../app/model-editor/fastener-types.ts",import.meta.url));
  const a=pair(),g=a.components.find(c=>c.fastener),invalid=structuredClone(g.fastener);
  delete invalid.dimensions.washerInner;assert.equal(parseFastenerBinding(invalid),undefined);
  invalid.dimensions={...g.fastener.dimensions};invalid.count=8.5;assert.equal(parseFastenerBinding(invalid),undefined);
  const hidden=model.editComponent(a,{id:g.id,patch:{hidden:true}}),h=model.execute(model.createHistory(a),hidden);
  assert.deepEqual(model.redo(model.undo(h)).present,hidden);
  const merged=model.mergeAssembly(hidden,a);
  assert.equal(merged.components.filter(c=>c.fastener).length,1);assert.equal(merged.components.find(c=>c.fastener).hidden,true);
});

test("CDM42 fasteners clear pump, wafer and KMS STL bodies, including head and shaft radii",async()=>{
  const cache=new Map();
  for(const vibration of [false,true]) {
  const {assembly}=await realStation("371",80,"aisi304",2,vibration);
  for(const group of assembly.components.filter(c=>c.fastener?.status==="ready")) {
    const b=group.fastener,d=b.dimensions;
    const transform=new THREE.Matrix4().compose(new THREE.Vector3(...group.position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...group.rotation.map(x=>x*Math.PI/180))),new THREE.Vector3(1,1,1));
    const axis=new THREE.Vector3(1,0,0).transformDirection(transform),start=d.ends===2?-(d.length-b.grip)/2:0;
    for(const component of assembly.components.filter(c=>b.members.includes(c.id))) {
      const url=component.meshUrl??(component.shape?.kind==="mesh"?component.shape.meshUrl:null);
      if(!url)continue;
      if(!cache.has(url)){const bytes=await readFile(new URL(`../public${url}`,import.meta.url));cache.set(url,new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));}
      const mesh=new THREE.Mesh(cache.get(url),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
      const local=new THREE.Group();local.add(mesh);local.position.fromArray(component.position);local.rotation.set(...component.rotation.map(x=>x*Math.PI/180));
      if(component.shape?.kind==="mesh"){mesh.position.fromArray(component.shape.modelPosition??[0,0,0]);mesh.rotation.set(...(component.shape.modelRotation??[0,0,0]).map(x=>x*Math.PI/180));}
      local.updateMatrixWorld(true);
      const envelopes=[[start+.01,d.length-.02,d.diameter/2-.05,8,0]];
      if(d.ends===1)envelopes.push([-d.head+.01,d.head-.02,d.flats/Math.sqrt(3)-.05,6,-Math.PI/2]);
      for(const [x,length,radius,samples,phase] of envelopes)for(const center of b.centers)for(let sample=0;sample<samples;sample++){
        const angle=sample*2*Math.PI/samples+phase;
        const origin=new THREE.Vector3(x,center[1]+radius*Math.cos(angle),center[2]+radius*Math.sin(angle)).applyMatrix4(transform);
        const ray=new THREE.Raycaster(origin,axis,0,length);
        assert.equal(ray.intersectObject(mesh).length,0,`${component.name}: fastener hits CAD body at hole ${center}; vibration=${vibration}, x=${x}, r=${radius}, a=${angle}; hits=${JSON.stringify(ray.intersectObject(mesh).map(h=>({distance:h.distance,point:h.point})))}`);
      }
      mesh.material.dispose();
    }
  }
  }
  for(const geometry of cache.values())geometry.dispose();
});

test("KMS has two independent eight-bolt joints; native STEP offsets do not bridge its rubber body",async()=>{
  const {assembly}=await realStation("371",80,"aisi304",2,true);
  const kms=assembly.components.filter(c=>c.line?.role.endsWith("-vibration-compensator"));
  assert.equal(kms.length,4);
  const groups=assembly.components.filter(c=>c.fastener);
  assert.equal(groups.length,14);assert.ok(groups.every(c=>c.fastener.status==="ready"),groups.flatMap(c=>c.fastener.issues).join(";"));
  for(const c of kms) {
    const pair=groups.filter(g=>g.fastener.members.includes(c.id));
    assert.equal(pair.length,2);assert.ok(pair.every(g=>g.fastener.count===8&&g.fastener.dimensions.ends===1));
    assert.ok(pair.every(g=>g.fastener.grip>40&&g.fastener.grip<50),"use the recessed steel ring, not the 135 mm full body");
    assert.ok(pair.every(g=>g.fastener.hardware.rod.length===70));
    assert.ok(pair.some(g=>g.name.endsWith("к насосу")));assert.ok(pair.some(g=>g.name.endsWith("к вставке")));
    const broken=model.editComponent(assembly,{id:c.id,patch:{position:model.add(c.position,[0,0,5])}});
    assert.ok(broken.components.filter(g=>g.fastener?.members.includes(c.id)).every(g=>g.fastener.status==="blocked"));
  }
  const reopened=model.normalizeEditor({...model.emptyEditor(),assembly}).assembly;
  assert.equal(reopened.components.filter(c=>c.fastener).length,14);assert.deepEqual(rebuildFasteners(reopened),reopened);
  const shortAssembly=structuredClone(assembly),short=hardware.items.find(h=>h.kind==="bolt"&&h.diameter===16&&h.length===40);
  const specBolt=shortAssembly.components.find(c=>c.line?.pumpId===kms[0].line.pumpId&&c.line?.side===kms[0].line.side&&c.line.role==="primary-vibration-pump-fasteners-bolts");
  assert.ok(short&&specBolt);specBolt.equipmentId=short.id;
  const shortGroups=rebuildFasteners(shortAssembly).components.filter(g=>g.fastener?.members.includes(kms[0].id));
  assert.equal(shortGroups.find(g=>g.name.endsWith("к насосу")).fastener.status,"blocked");
  assert.equal(shortGroups.find(g=>g.name.endsWith("к вставке")).fastener.status,"ready");
  const changed=structuredClone(assembly),first=changed.components.find(c=>c.id===kms[0].id);
  first.shape.modelHash="0".repeat(64);
  assert.ok(rebuildFasteners(changed).components.filter(g=>g.fastener?.members.includes(first.id)).every(g=>g.fastener.status==="blocked"));
});

test("four pumps keep 96 rods in twelve distinct sets after reopening and repeated rebuild",async()=>{
  const {assembly}=await realStation("371",80,"aisi304",4);
  const groups=assembly.components.filter(c=>c.fastener);
  assert.equal(groups.length,12);assert.equal(new Set(groups.map(c=>c.id)).size,12);
  assert.ok(groups.every(c=>c.fastener.status==="ready"));
  const reopened=model.normalizeEditor({...model.emptyEditor(),assembly}).assembly;
  assert.ok(reopened);assert.equal(reopened.components.filter(c=>c.fastener).length,12);
  assert.deepEqual(rebuildFasteners(reopened),reopened);
  assert.equal(groups.reduce((sum,c)=>sum+c.fastener.count,0),96);
});
