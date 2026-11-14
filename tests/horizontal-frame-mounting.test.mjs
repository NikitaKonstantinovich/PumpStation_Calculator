import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {DoubleSide,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {build} from 'esbuild';
import {load,fixture,resources,json} from './fixtures/station-specification.mjs';
import {catalogMounting} from '../services/local-storage/node-mountings.mjs';

const mountings=await json('data/horizontal-frame-mounts.json');
const native=await json('data/prepared-pump-cad-models.json');
const frames=await json('data/frame-catalog-import.json'),hardware=await json('data/frame-fasteners-import.json');
const model=await load('model-editor/model'),calc=await load('frame-calculation/project');
const {layoutFrame}=await load('frame-calculation/layout');
const {DEFAULT_FRAME_RULES:rules}=await load('frame-calculation/types');
const root=new URL('../../../../',import.meta.url);
const assets=new URL('Equipment/Pumps/PreparedForAssembly/meshes/',root);
const sourceAvailable=existsSync(assets);
const models={...native.models,...mountings.models};
const sources={...resources.components,items:[...resources.components.items,...frames.items,...hardware.items]};
const emptyProfiles={version:1,profiles:{}};
const close=(a,b)=>assert(Math.abs(a-b) < 0.02,`${a} vs ${b}`);
const readMesh=url=>{
 const name=url.split('/').at(-1);
 const paths=[new URL(name,assets),new URL('frontend/public'+url,root)];
 if(process.env.PROJECT_MODEL_LIBRARY)paths.push(process.env.PROJECT_MODEL_LIBRARY+'/'+name);
 const file=paths.find(path=>existsSync(path));
 assert(file,`Missing pump mesh ${name}`);
 return readFileSync(file);
};

function pumpInput(row,id=row.variantId){
 const m=models[row.variantId];
 assert(m,row.variantId);
 const options={variant:{id,designation:row.designation,manufacturer_article:row.article},
  model:{id:row.modelId},motor:row.motor,manufacturer:row.manufacturer,series:row.series};
 return {options,pump:{...resources.pumps[0],id,manufacturer:m.manufacturer,series:m.series,model:m.model,
  article:m.article,execution:m.execution,power:m.powerKw,frequencyHz:m.frequencyHz,weightKg:35,
  type:row.series==='NIS'?'end_suction':'horizontal_multistage',mounting:catalogMounting(options)}};
}

function assembled(row,count=2){
 const {pump}=pumpInput(row);
 const project=fixture();
 Object.assign(project.entities['system-input'],{selectedPumpId:pump.id,workingPumpCount:count,reservePumpCount:0});
 Object.assign(project.entities['station-settings'],{stationType:'utility',membraneTank:false});
 project.entities['station-collectors'].discharge.configuration={primary:{spacing:330}};
 const work={original:project,next:project,resources:{...resources,components:sources,pumps:[pump]},reasons:[]};
 const state=calc.beginFrame(work);
 calc.selectFrameConstruction(state);calc.placeFrame(state);calc.selectFrameVariant(state);calc.frameParts(state);
 const next=calc.finishFrame(state).next;
 return {next,pump,result:state.result,assembly:model.buildAssembly(next,[pump],emptyProfiles)};
}

test('reviewed horizontal mountings validate by exact execution and preserve the local CAD axes',()=>{
 assert(mountings.rows.length>150);
 for(const row of mountings.rows){
  const {options,pump}=pumpInput(row),datum=row.mounting.cad;
  const mounting=calc.readMounting(pump.mounting.frameV1);
  assert(mounting,row.designation);
  assert.equal(mounting.cad.sourceHash,models[row.variantId].profile.sourceHash);
  assert.deepEqual(mounting.cad.pointsMm,datum.pointsMm);
  assert.equal(catalogMounting({...options,motor:{...row.motor,power_kw:999}}),undefined);
  const altered=structuredClone(pump.mounting.frameV1);
  altered.holes[0].x+=1;
  assert.equal(calc.readMounting(altered),null);
  const l=layoutFrame([{id:pump.id,name:pump.model,count:2,massKg:35,spacingMm:330,mounting,circuit:1}],600,null,rules);
  for(const p of l.pumps){
   close(l.holes.find(h=>h.owner===p.id).x-p.x,mounting.holes[0].x);
   assert.equal(p.equipmentId,pump.id);
  }
 }
});

test('each published set of centers falls inside the openings of its actual mesh', {skip:!sourceAvailable},()=>{
 const validated=new Set(),material=new MeshBasicMaterial({side:DoubleSide}),loader=new STLLoader();
 for(const row of mountings.rows){
  const profile=models[row.variantId].profile,{sourceHash,pointsMm}=row.mounting.cad;
  if(validated.has(sourceHash))continue;
  const bytes=readMesh(profile.meshUrl);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),profile.meshHash);
  const geometry=loader.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const mesh=new Mesh(geometry,material);
  mesh.updateMatrixWorld();
  for(const [i,[x,y,z]] of pointsMm.entries()){
   const clamp=row.mounting.clampHeightMm??0;
   const ray=new Raycaster(new Vector3(x,y,z-.2),new Vector3(0,0,1),0,clamp+.1);
   assert.equal(ray.intersectObject(mesh).length,0,`${row.designation} ${sourceHash.slice(0,12)} foot ${i}`);
  }
  geometry.dispose();
  validated.add(sourceHash);
 }
 material.dispose();
 console.log(`Verified openings in ${validated.size} unique pump meshes`);
});

test('checked mountings and cut frame are coaxial with openings of the actual STL', {skip:!sourceAvailable}, async()=>{
 const compiled=await build({stdin:{resolveDir:fileURLToPath(new URL('../',import.meta.url)),
  contents:'export {drilledFrameGeometry} from "./app/model-editor/frame-renderer";'},
  bundle:true,platform:'node',format:'esm',write:false});
 const {drilledFrameGeometry}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const ids=['CHLF4-30LSWSC','CMI 20-20T-BQCE','CUC 2-60T-BACE','MH 2-2','ECH4-50','NIS80-50-200/2.2SWH'];
 const material=new MeshBasicMaterial({side:DoubleSide});
 const loader=new STLLoader();
 const geometry=bytes=>loader.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 const output=[];
 for(const designation of ids){
  const row=mountings.rows.find(r=>r.designation===designation);
  assert(row,designation);
  const {assembly,next,pump,result}=assembled(row);
  const frame=assembly.components.find(c=>c.kind==='frame');
  assert(frame.frameDrilling,designation);
  assert.equal(frame.ports.length,8,designation);
  const rawFrame=geometry(readFileSync(new URL('../public'+frame.meshUrl,import.meta.url)));
  const drilled=drilledFrameGeometry(rawFrame,frame.frameDrilling);
  const frameMesh=new Mesh(drilled,material);
  frameMesh.updateMatrixWorld();
  const first=assembly.components.find(c=>c.kind==='pump');
  assert.equal(first.cadSource.hash,row.mounting.cad.sourceHash);
  const bytes=readMesh(first.meshUrl);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),models[row.variantId].profile.meshHash);
  const pumpGeo=geometry(bytes),pumpMesh=new Mesh(pumpGeo,material);
  pumpMesh.updateMatrixWorld();
  let maxError=0;
  for(const [index,c] of assembly.components.filter(c=>c.kind==='pump').entries()){
   const owner=`pump-1-${index}`,group=assembly.components.find(p=>p.id===`frame-hardware-${owner}`)?.frameHardware;
   for(const [i,foot] of c.ports.filter(port=>port.id.startsWith('frame-foot-')).entries()){
    const f=frame.ports.find(p=>p.id===`${owner}/hole-${i}`);
    const station=model.worldPoint(c,foot.point),framePoint=model.worldPoint(frame,f.point);
    maxError=Math.max(maxError,Math.hypot(station[0]-framePoint[0],station[1]-framePoint[1]));
    close(station[0],framePoint[0]);close(station[1],framePoint[1]);close(station[2],framePoint[2]+(group?.supportLift??group?.head??0));
    const [x,y,z]=foot.point,clamp=row.mounting.clampHeightMm??0;
    assert.equal(new Raycaster(new Vector3(x,y,z-.2),new Vector3(0,0,1),0,clamp+.1).intersectObject(pumpMesh).length,0,designation+' pump foot '+i);
    if(group){
     const drilledHole=frame.frameDrilling.holes.find(h=>h.id===f.id);
     assert(drilledHole,designation);
     const ray=new Raycaster(new Vector3(f.point[0],f.point[1]+1,f.point[2]),new Vector3(0,-1,0),0,frame.frameDrilling.thickness+2);
     assert.equal(ray.intersectObject(frameMesh).length,0,designation+' frame '+i);
    }
   }
  }
  assert(!model.connectionIssues(assembly).some(i=>i.message.includes('крепления насоса и рамы не совмещены')));
  const moved=model.editComponent(assembly,{id:first.id,patch:{position:model.add(first.position,[1,2,0])}});
  assert(model.connectionIssues(moved).some(i=>i.id===first.id&&i.message.includes('2.24')));
  const saved=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly}))).assembly;
  assert.equal(saved.components.find(c=>c.kind==='frame').ports.length,8);
  const otherProfiles={version:1,profiles:{[pump.id]:{
   ...models[row.variantId].profile,sourceHash:'a'.repeat(64)
  }}};
  const pinned=model.buildAssembly(next,[pump],otherProfiles);
  assert.equal(pinned.components.find(c=>c.kind==='pump').cadSource.hash,row.mounting.cad.sourceHash);
  const incompatible=structuredClone(next);
  for(const p of incompatible.entities['station-spec'].frameCalculation.layout.pumps)p.cad.sourceHash='b'.repeat(64);
  const stale=model.buildAssembly(incompatible,[pump],otherProfiles);
  assert.equal(stale.components.find(c=>c.kind==='frame').ports.length,0);
  assert(!stale.components.find(c=>c.kind==='frame').frameDrilling.holes.some(h=>h.owner.startsWith('pump-')));
  if(designation==='CMI 20-20T-BQCE'){
   const outside=structuredClone(next);
   const calculation=outside.entities['station-spec'].frameCalculation;
   const holes=calculation.layout.holes;
   const edgeHole=holes.find(h=>h.owner==='pump-1-0');
   edgeHole.y=calculation.variant.widthMm/2;
   const affected=model.buildAssembly(outside,[pump],emptyProfiles).components.find(c=>c.kind==='frame');
   assert(affected.ports.some(p=>p.id===edgeHole.id));
   assert(!affected.frameDrilling.holes.some(h=>h.owner==='pump-1-0'));
   assert.equal(affected.frameDrilling.holes.filter(h=>h.owner==='pump-1-1').length,4);
  }
  output.push({designation,holes:8,drilled:frame.frameDrilling.holes.filter(h=>h.owner.startsWith('pump-')).length,maxError,frame:result.variant.id});
  for(const geo of [rawFrame,drilled,pumpGeo])geo.dispose();
 }
 material.dispose();
 console.log(JSON.stringify(output));
});
