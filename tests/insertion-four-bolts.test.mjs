import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {loadTs} from './load-ts.mjs';
import {realStation,model,profiles} from './fixtures/flange-fasteners.mjs';
import {resources} from './fixtures/station-specification.mjs';
const root=new URL('../',import.meta.url);
const {rebuildFasteners}=await loadTs(new URL('app/model-editor/flange-fasteners.ts',root));
const {lineSpecParts}=await loadTs(new URL('app/line-spec-parts.ts',root));
const {addPumpInsertionJoint}=await loadTs(new URL('app/line-vibration.ts',root));
const {insertionPumpDrilling}=await loadTs(new URL('app/insertion-pump-drilling.ts',root));
const {cadContents}=await loadTs(new URL('app/cad-export.ts',root));
const {flangeHoleCenters}=await loadTs(new URL('app/model-editor/flange-hole-pattern.ts',root));
const id='ES:variant:c4c73a42735354919429ee87';
const prepared=JSON.parse(await readFile(new URL('data/prepared-pump-cad-models.json',root),'utf8')).models[id];
const mounts=JSON.parse(await readFile(new URL('data/end-suction-flange-mounts.json',root),'utf8'));
resources.pumps.push({...resources.pumps.find(p=>p.id==='970'),id,article:prepared.article,execution:prepared.execution,manualEntry:true,
  inlet:{dn:80,type:'flanged',pressure_class:'PN16'},outlet:{dn:65,type:'flanged',pressure_class:'PN16'}});
const matrix=pose=>new THREE.Matrix4().compose(new THREE.Vector3(...pose.position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...pose.rotation.map(v=>v*Math.PI/180))),new THREE.Vector3(1,1,1));
let result;
async function station() {
  if(result)return result;
  const original=await realStation(id,125,'aisi304',3,false),project=structuredClone(original.project);
  const spec=project.entities['station-spec'],insertion=spec.items.find(r=>r.section==='discharge'&&r.assemblyRole==='primary-reducer');
  assert.equal(insertion.insertionAssembly.pumpFlangeExecution,'dn65-pn16-four-hole');
  // Exercise the fallback with the published eight-hole flange, without the
  // preferred installed four-hole substitution. No model or hole data is mocked.
  delete insertion.insertionAssembly.pumpFlangeExecution;
  const drilling=insertionPumpDrilling(insertion,resources.components);
  assert.equal(drilling.holes,8);assert.equal(drilling.circle,145);
  spec.items=spec.items.filter(r=>r.section!=='discharge'||!/^primary-pump-(?:gasket|fasteners-)/.test(r.assemblyRole??''));
  const collector=project.entities['station-collectors'].discharge.configuration;
  const parts=lineSpecParts(spec.items,'discharge','ordinary-four-eight-test',collector,resources.components,resources.components.collectorCatalog);
  addPumpInsertionJoint({parts,database:resources.components,catalog:resources.components.collectorCatalog,collector,
    port:{dn:65,connection:'flanged'},valveDn:125,connection:'flanged',pn:16,count:3,prefix:'primary',title:'Насос — вставка',pumpId:id,pumpSide:'outlet'},insertion);
  const assembly=model.buildAssembly(project,resources.pumps,profiles,original.data);
  const insertions=assembly.components.filter(c=>c.line?.side==='discharge'&&c.line?.role==='primary-reducer');
  result={project,assembly,original,insertions,insertion};return result;
}
const pumpSet=(assembly,insertion)=>assembly.components.find(c=>c.fastener?.members.includes(insertion.id)&&c.fastener.members.some(id=>assembly.components.find(p=>p.id===id)?.kind==='pump'));

test('ordinary eight-hole insertion charges eight complete sets, renders and exports four at each pump',async()=>{
  const {assembly,project,insertions,insertion}=await station();
  assert.equal(project.entities['station-settings'].vibrationCompensators,false);
  assert.equal(insertions.length,3);assert.match(insertion.details,/4 отверстия.*8.*4 болтовых/);
  for(const kind of ['bolts','nuts','washers']) {
    const row=project.entities['station-spec'].items.find(r=>r.section==='discharge'&&r.assemblyRole===`primary-pump-fasteners-${kind}`);
    assert.equal(row.quantity,24);assert.ok(row.price>0);assert.ok(row.quantity*row.price>0);
    assert.match(row.details,/4 комплекта.*запасе/);
  }
  const cad=cadContents(assembly,project.entities['station-spec'].items);
  for(const insertion of insertions) {
    const set=pumpSet(assembly,insertion),b=set.fastener;
    assert.equal(b.status,'ready',b.issues.join('\n'));assert.equal(b.count,4);assert.equal(b.centers.length,4);
    assert.match(b.issues.join(' '),/4 комплекта.*запасе/);
    assert.doesNotMatch(b.issues.join(' '),/Количество крепежа.*отличается/);
    const exported=cad.instances.filter(i=>i.componentId===set.id);
    assert.equal(exported.length,12,'four bolts, four nuts and four washers in SOLIDWORKS input');
    const pump=assembly.components.find(c=>b.members.includes(c.id)&&c.kind==='pump');
    const pumpHoles=mounts[pump.cadSource.hash].outlet.holes.map(h=>new THREE.Vector3(...h).applyMatrix4(matrix(pump)));
    const piece=insertion.insertion.template.geometry.pieces.find(p=>p.shape.kind==='flange'&&p.shape.boltCircleMm===145);
    assert.equal(piece.shape.boltHoles,8);
    const flangeHoles=flangeHoleCenters(piece.shape).map(h=>new THREE.Vector3(...h).applyMatrix4(matrix(insertion).multiply(matrix(piece))));
    const axis=new THREE.Vector3(1,0,0).transformDirection(matrix(set));
    for(const center of b.centers) {
      const origin=new THREE.Vector3(...center).applyMatrix4(matrix(set));
      const distance=h=>{const d=h.clone().sub(origin);return d.addScaledVector(axis,-d.dot(axis)).length();};
      assert.ok(pumpHoles.some(h=>distance(h)<.001));assert.ok(flangeHoles.some(h=>distance(h)<.001));
    }
  }
  assert.deepEqual(rebuildFasteners(assembly),assembly,'clocking is stable');
  const restored=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly}))).assembly;
  assert.equal(pumpSet(restored,insertions[0]).fastener.count,4);
});

test('clocking only the pump-side flange preserves the pipe route and opposite end',async()=>{
  const {original,insertions}=await station();
  for(const insertion of insertions) {
    const previous=original.assembly.components.find(c=>c.id===insertion.id);
    assert.deepEqual(insertion.position,previous.position);assert.deepEqual(insertion.rotation,previous.rotation);
    for(const piece of insertion.insertion.template.geometry.pieces.filter(p=>p.shape.kind!=='flange'||p.shape.boltCircleMm!==145))
      assert.deepEqual(piece,previous.insertion.template.geometry.pieces.find(p=>p.id===piece.id));
    const set=pumpSet(original.assembly,previous);
    assert.equal(set.fastener.count,4);assert.equal(set.fastener.status,'ready');
  }
});

test('four/eight allowance cannot bypass disconnected faces, PCD or PN mismatch',async()=>{
  const {assembly,insertions}=await station(),id=insertions[0].id;
  for(const [label,change] of [['gap',c=>c.position[2]+=5],['PN',c=>c.ports.forEach(p=>p.pn=25)],['PCD',c=>{
    const p=c.insertion.template.geometry.pieces.find(p=>p.shape.boltCircleMm===145);
    p.shape.boltCircleMm=150;
  }]]) {
    const changed=structuredClone(assembly);change(changed.components.find(c=>c.id===id));
    if(label==='PN')changed.components.filter(c=>c.kind==='pump').forEach(c=>c.ports.forEach(p=>p.pn=16));
    const set=pumpSet(rebuildFasteners(changed),insertions[0]);assert.equal(set.fastener.status,'blocked',label);
  }
});
