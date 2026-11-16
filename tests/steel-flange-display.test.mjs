import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {loadTs} from './load-ts.mjs';

const root=new URL('../',import.meta.url);
const source=JSON.parse(await readFile(new URL('public/binding-components.json',root),'utf8'));
const reference=JSON.parse(await readFile(new URL('data/flange-dimensions.json',root),'utf8'));
const collectorCatalog=JSON.parse(await readFile(new URL('public/collector-catalog.json',root),'utf8'));
const {readFlangeDimensions:read,FLANGE_FIELDS}=await loadTs(new URL('app/flange-dimensions.ts',root));
const {makeInsertCatalog}=await loadTs(new URL('app/component-insert-catalog.ts',root));
const {generateInsertCalculations}=await loadTs(new URL('app/component-insert-calculations.ts',root));
const {lineGeometry}=await loadTs(new URL('app/line-geometry-catalog.ts',root));
const auth=new URL('app/auth-server.ts',root);
const {insertionGeometryContext,insertion3d}=await loadTs(new URL('app/component-insert-3d-server.ts',root),{[auth.href]:'export const sha256=async()=>"a".repeat(64);'});
const {calculateCollector}=await loadTs(new URL('app/collector-calculations.ts',root));
const {buildCollectorTemplate}=await loadTs(new URL('app/model-editor/collector-template.ts',root));
const renderer=new URL('app/model-editor/insertion-renderer.ts',root);
const {pieceObject,disposeInsertionObject}=await loadTs(renderer,{[renderer.href]:(await readFile(renderer,'utf8')).replace('from "three"',`from ${JSON.stringify(import.meta.resolve('three'))}`)});

// Reproduce the actual older DB: only b, bore and chamfer were imported.
const profileKeys=['outerDiameterMm','boltCircleMm','boltHoleDiameterMm','holes','faceHeightMm','faceDiameterMm'];
const steel=reference.rows.filter(r=>r.geometrySource);
const old=structuredClone(source);
for(const item of old.items.filter(i=>steel.some(r=>r.componentId===i.id))) {
  item.fields=item.fields.filter(f=>!profileKeys.some(k=>f.column===FLANGE_FIELDS[k][0]||f.headerPath.at(-1)===FLANGE_FIELDS[k][1]));
}
const catalog=makeInsertCatalog(old),context=insertionGeometryContext(old,catalog);
const id='фланцы-002-r0035',item=old.items.find(i=>i.id===id);
const get=(row=item,pn=16,sha=old.source.sha256)=>read(row,pn,reference,sha);

test('all 60 exact steel executions recover the missing profile without changing source rows or prices',()=>{
  const before=JSON.stringify(old);
  for(const row of steel){
    const i=old.items.find(i=>i.id===row.componentId),d=get(i,row.pn).dimensions;
    assert.deepEqual(d,row.dimensions,row.componentId);
    const g=lineGeometry(i,catalog,context);
    assert.equal(g.shape.kind,'flange',row.componentId);
    assert.equal(g.shape.outerMm,row.dimensions.outerDiameterMm);
    assert.equal(g.shape.faceHeightMm,row.dimensions.faceHeightMm);
    assert.equal(g.shape.boltHoles,row.dimensions.holes);
    assert.equal(g.length,row.dimensions.thicknessMm);
  }
  assert.equal(JSON.stringify(old),before);
  assert.deepEqual(profileKeys.map(k=>get().dimensions[k]),[215,180,18,8,4,158]);
  assert.equal(get(old.items.find(i=>i.id==='фланцы-002-r0033')).dimensions.holes,4,'DN65 row 1 must not silently use row 2 drilling');
  assert.equal(get(old.items.find(i=>i.id==='фланцы-002-r0038')).dimensions.holes,12,'DN200 PN16 differs from PN10');
});

test('changed identity, source, pressure or invalid dimensions do not inherit a reference body',()=>{
  for(const patch of [{id:'other'},{tableId:'other'},{family:'other'}]) assert.equal(get({...item,...patch}).dimensions.outerDiameterMm,undefined);
  assert.equal(get(item,25).dimensions.outerDiameterMm,undefined);
  assert.equal(get(item,16,'other').dimensions.outerDiameterMm,undefined);
  for(const key of ['thicknessMm','boreDiameterMm',...profileKeys]){
    const changed=structuredClone(item),[column,label]=FLANGE_FIELDS[key];
    changed.fields=changed.fields.filter(f=>f.column!==column);
    changed.fields.push({column,headerPath:[label],value:999});
    const result=get(changed);
    assert.ok(result.warnings.length,key);
    assert.equal(result.dimensions.outerDiameterMm,undefined,key);
  }
  const custom=structuredClone(item);
  custom.fields.push({column:'USER_OD',headerPath:[FLANGE_FIELDS.outerDiameterMm[1]],value:216});
  assert.equal(get(custom).dimensions.outerDiameterMm,216,'explicit user size survives');
  assert.equal(get(custom).dimensions.boltCircleMm,undefined,'no mixed execution');
});

test('saved DN100 steel insertion renders two drilled flanges and keeps engineering length/BOM',async()=>{
  const row=generateInsertCalculations({dnFrom:100,dnTo:100,materials:['st20'],withSensorNipple:false,includeEccentric:false},catalog)
    .find(r=>r.geometry==='straight'&&r.pn===16&&r.bom.some(b=>b.componentId===id));
  assert.ok(row);const before=JSON.stringify(row);
  const template=await insertion3d(row,old,catalog,{id:'saved-steel-insert',revision:3},0);
  const ends=template.geometry.pieces.filter(p=>p.id==='left'||p.id==='right');
  assert.equal(ends.length,2);
  for(const p of ends){
    assert.equal(p.shape.kind,'flange');assert.equal(p.fidelity,'parametric');
    const object=pieceObject(p);
    try{
      assert.equal(object.children.filter(c=>c.isMesh).length,2,'body plus raised sealing face');
      object.position.set(0,0,0);object.rotation.set(0,0,0);object.updateMatrixWorld(true);
      const box=new THREE.Box3().setFromObject(object);
      assert.ok(Math.abs(box.min.x)<1e-6);assert.ok(Math.abs(box.max.x-26)<1e-6);
      const radius=180/2,angle=Math.PI/8;
      const hits=new THREE.Raycaster(new THREE.Vector3(-10,Math.cos(angle)*radius,Math.sin(angle)*radius),new THREE.Vector3(1,0,0)).intersectObject(object,true);
      assert.equal(hits.length,0,'bolt hole is actually open');
    }finally{disposeInsertionObject(object);}
  }
  assert.equal(template.geometry.totalLengthMm,row.totalLengthMm);
  assert.equal(JSON.stringify(row),before);
});

test('collector ends and both pump branches receive steel flanges at the existing 5 mm seat',()=>{
  const cfg={type:'discharge',dn:100,pn:16,material:'st20',connection:'flanged',eccentric:false,stationType:'fire',simultaneous:false,jockey:false,primary:{flow:50,working:1,reserve:1,dn:100,connection:'flanged',spacing:500,pn:16},secondary:null};
  const calculation=calculateCollector(cfg,collectorCatalog);
  const items=Object.fromEntries(calculation.bom.filter(b=>b.componentId).map(b=>{const i=old.items.find(i=>i.id===b.componentId);return [b.componentId,i?lineGeometry(i,catalog,context):undefined];}));
  const before=JSON.stringify(calculation);
  const template=buildCollectorTemplate({configuration:cfg,calculation,status:'complete'},{version:1,revision:'test',items,issues:[]},[],'discharge');
  const flanges=template.pieces.filter(p=>p.id.endsWith('-weldFlange'));
  assert.equal(flanges.length,4);
  assert.ok(flanges.every(p=>p.shape.kind==='flange'&&p.shape.boltHoles===8&&p.shape.outerMm===215));
  assert.ok(!template.issues.some(s=>s.includes('привалочной поверхности')));
  for(const b of template.branches.filter(b=>b.role==='branch')){
    const f=flanges.find(p=>p.id===b.id+'-weldFlange');
    assert.ok(Math.abs(f.position[1]-b.endMm-5)<1e-6);
  }
  assert.equal(JSON.stringify(calculation),before);
});
