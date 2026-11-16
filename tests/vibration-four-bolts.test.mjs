import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {loadTs} from './load-ts.mjs';
import {realStation,model} from './fixtures/flange-fasteners.mjs';
const {rebuildFasteners}=await loadTs(new URL('../app/model-editor/flange-fasteners.ts',import.meta.url));
const replacements={};
for(const name of ['fastener-renderer','insertion-renderer']) {
  const url=new URL(`../app/model-editor/${name}.ts`,import.meta.url);
  replacements[url.href]=(await readFile(url,'utf8')).replace('from "three"',`from ${JSON.stringify(import.meta.resolve('three'))}`);
}
const {fastenerObject}=await loadTs(new URL('../app/model-editor/fastener-renderer.ts',import.meta.url),replacements);
const {pumpVibrationDrilling,vibrationDrilling}=await loadTs(new URL('../app/pump-vibration-drilling.ts',import.meta.url));
const {selectVibrationCompensator}=await loadTs(new URL('../app/line-vibration.ts',import.meta.url));
const {resources}=await import('./fixtures/station-specification.mjs');
const id='ES:variant:c4c73a42735354919429ee87';
// The legacy fixture catalog has this same hydraulic model under ID 970.
// Bind its reviewed execution identity to the current normalized STEP.
const prepared=JSON.parse(await readFile(new URL('../data/prepared-pump-cad-models.json',import.meta.url),'utf8')).models[id];
const pumpMounts=JSON.parse(await readFile(new URL('../data/end-suction-flange-mounts.json',import.meta.url),'utf8'));
const vibrationMounts=JSON.parse(await readFile(new URL('../data/flange-cad-mounts.json',import.meta.url),'utf8')).models;
const matrix=pose=>new THREE.Matrix4().compose(new THREE.Vector3(...pose.position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...pose.rotation.map(v=>v*Math.PI/180))),new THREE.Vector3(1,1,1));
resources.pumps.push({...resources.pumps.find(p=>p.id==='970'),id,article:prepared.article,execution:prepared.execution,manualEntry:true,
  inlet:{dn:80,type:'flanged',pressure_class:'PN16'},outlet:{dn:65,type:'flanged',pressure_class:'PN16'}});
let result;
const station=()=>result??=realStation(id,125,'aisi304',3,true);

test('DN65 catalog audit uses the available eight-hole KMS and identifies the measured four-hole pump',()=>{
  const p=pumpVibrationDrilling(id,'outlet');assert.equal(p.holes,4);assert.ok(Math.abs(p.circle-145)<.001);
  const selected=selectVibrationCompensator(resources.components.items,65,16,'flanged',p);
  assert.equal(selected.item.id,'компенсаторы-001-r0118');assert.equal(vibrationDrilling(selected.item,16).holes,8);
});

test('NIS with KMS draws four pump bolts, keeps eight at the insertion and charges eight on each joint',async()=>{
  const {assembly,project}=await station();
  const rows=project.entities['station-spec'].items.filter(r=>r.section==='discharge');
  const note=rows.find(r=>r.assemblyRole==='primary-vibration-compensator');
  assert.match(note.details,/4 отверстия.*8.*4 болтовых/);
  for(const kind of ['bolts','nuts','washers']) {
    const row=rows.find(r=>r.assemblyRole===`primary-vibration-pump-fasteners-${kind}`);
    assert.equal(row.quantity,24);assert.match(row.details,/4 комплекта.*запасе/);assert.ok(row.price>0);
  }
  const vibrations=assembly.components.filter(c=>c.line?.side==='discharge'&&c.line?.role==='primary-vibration-compensator');
  assert.equal(vibrations.length,3);
  for(const vibration of vibrations) {
    const sets=assembly.components.filter(c=>c.fastener?.members.includes(vibration.id));
    assert.equal(sets.length,2);
    const pumpSet=sets.find(c=>c.fastener.members.some(id=>assembly.components.find(p=>p.id===id)?.kind==='pump'));
    const insertionSet=sets.find(c=>c!==pumpSet);
    for(const c of sets) assert.equal(c.fastener.status,'ready',c.fastener.issues.join('\n'));
    assert.equal(pumpSet.fastener.count,4);assert.equal(insertionSet.fastener.count,8);
    assert.ok(fastenerObject(pumpSet).children.every(m=>m.count===4));
    assert.match(pumpSet.fastener.issues.join(' '),/4 комплекта.*запасе/);
    const pump=assembly.components.find(c=>pumpSet.fastener.members.includes(c.id)&&c.kind==='pump');
    const pumpHoles=pumpMounts[pump.cadSource.hash].outlet.holes.map(h=>new THREE.Vector3(...h).applyMatrix4(matrix(pump)));
    const mesh=vibration.shape;
    const transform=matrix(vibration).multiply(matrix({position:mesh.modelPosition,rotation:mesh.modelRotation}));
    const vibHoles=vibrationMounts[mesh.modelHash].left.holes.map(h=>new THREE.Vector3(...h).applyMatrix4(transform));
    const boltAxis=new THREE.Vector3(1,0,0).transformDirection(matrix(pumpSet));
    for(const center of pumpSet.fastener.centers) {
      const origin=new THREE.Vector3(...center).applyMatrix4(matrix(pumpSet));
      const distance=h=>{const d=h.clone().sub(origin);return d.addScaledVector(boltAxis,-d.dot(boltAxis)).length();};
      assert.ok(pumpHoles.some(h=>distance(h)<.001),'bolt axis crosses actual pump hole');
      assert.ok(vibHoles.some(h=>distance(h)<.001),'bolt axis crosses actual KMS hole');
    }
  }
  assert.deepEqual(rebuildFasteners(assembly),assembly,'clocking and hardware must be idempotent');
  const restored=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly}))).assembly;
  for(const vibration of vibrations)assert.deepEqual(restored.components.find(c=>c.id===vibration.id).position,vibration.position);
});

test('four/eight exception does not accept a disconnected mating face',async()=>{
  const {assembly}=await station();
  const vibration=assembly.components.find(c=>c.line?.side==='discharge'&&c.line?.role==='primary-vibration-compensator');
  const changed=model.editComponent(assembly,{id:vibration.id,patch:{position:model.add(vibration.position,[0,0,5])}});
  const sets=changed.components.filter(c=>c.fastener?.members.includes(vibration.id));
  assert.ok(sets.every(c=>c.fastener.status==='blocked'));
});
