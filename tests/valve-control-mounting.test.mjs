import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { loadTs } from './load-ts.mjs';
const json = async p => JSON.parse(await readFile(new URL(p, import.meta.url), 'utf8'));
const model = await loadTs(new URL('../app/model-editor/model.ts', import.meta.url));
const controls = await loadTs(new URL('../app/model-editor/valve-controls.ts', import.meta.url));
const { createProject } = await loadTs(new URL('../app/project-config.ts', import.meta.url));
const mounts = await json('../data/valve-control-mounts.json'), valves = (await json('../data/line-valve-models.json')).rows;
const pumps = await json('../public/pumps.json'), profiles = await json('../public/model-assets/manifest.json');
const near = (a,b) => a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-6, `${a} != ${b}`));
const samePose = (a,b) => { near(a.position,b.position); for (const axis of [[1,0,0],[0,1,0],[0,0,1]]) near(model.rotate(axis,a.rotation),model.rotate(axis,b.rotation)); };
function fixture(dn, count=3) {
  const project=createProject('Контроль положения', { id:'control-test' });
  Object.assign(project.entities['system-input'], { selectedPumpId:'9', calculated:true, workingPumpCount:count-1, reservePumpCount:1 });
  const valve=valves.find(v=>v.series==='017W' && v.drive==='handle' && v.dn===dn);
  const equipmentId=`valve-${dn}`;
  const geometry={ equipmentId,revision:'test',dn,source:valve.source,length:valve.length,ports:[],fidelity:'cad',issues:[],valveModels:[{
    drive:'handle',series:'017W',source:valve.source,length:valve.length,catalogLength:valve.catalogLength,
    shape:{kind:'mesh',meshUrl:`/model-assets/model-${valve.sourceHash}-v1.stl`,modelHash:valve.sourceHash,meshBounds:valve.bounds,modelPosition:valve.position,modelRotation:valve.rotation},
  }] };
  const rows=['suction','discharge'].flatMap((section,i)=>[
    { position:`${i}.1`,section,option:`primary${i?'Discharge':'Suction'}Valve`,name:`Dendor 017W DN${dn}`,details:'с рукояткой PN16',selectedPn:16,equipmentId,quantity:count,status:'selected' },
    { position:`${i}.2`,section,assemblyRole:'primary-limit-switches-bracket',name:'Кронштейн',details:'',equipmentId:dn<=80?'кронштейны-001-r0005':'кронштейны-001-r0006',quantity:count,status:'selected' },
    { position:`${i}.3`,section,assemblyRole:'primary-limit-switches-switch',name:'TZ-8111',details:'',equipmentId:'кипиа-004-r0028',quantity:2*count,status:'selected' },
  ]);
  project.entities['station-spec'].items=rows;
  return { project, data:{version:1,revision:'test',items:{[equipmentId]:geometry},issues:[]}, geometry };
}
const build = f => model.buildAssembly(f.project,pumps,profiles,f.data);

test('all six diameters: every primary valve, including reserve pumps and both sides, has one bracket and two switches',()=>{
  for (const dn of [50,65,80,100,125,150]) {
    const f=fixture(dn), original=JSON.stringify(f.project), a=build(f);
    const parents=a.components.filter(c=>c.line && /primary(Suction|Discharge)Valve/.test(c.line.role));
    assert.equal(parents.length,6);
    assert.equal(a.components.filter(c=>c.valveControl).length,18);
    for (const parent of parents) {
      const children=a.components.filter(c=>c.valveControl?.parentId===parent.id);
      assert.deepEqual(children.map(c=>c.valveControl.role),['bracket','switch-1','switch-2']);
      for (const c of children) { assert.equal(c.line.quantity,1); samePose(c,controls.composeValvePose(parent,c.valveControl)); }
      assert.ok(children.every(c=>c.meshUrl && !c.shape));
    }
    assert.ok(!a.components.some(c=>c.line?.role.includes('limit-switches') && !c.valveControl));
    assert.equal(new Set(a.components.map(c=>c.id)).size,a.components.length);
    assert.equal(JSON.stringify(f.project),original,'Mounting must never change the BOM or prices');
  }
});

test('separating valves expand nested controls per valve without duplicating top-level prices',()=>{
  const f=fixture(150); f.project.entities['system-input'].selectedPumpId='';
  const parts=f.project.entities['station-spec'].items.slice(1,3).map(r=>({...r,quantity:r.assemblyRole.endsWith('switch')?2:1,assemblyRole:r.assemblyRole.replace('primary','separator')}));
  f.project.entities['station-spec'].items=['suction','discharge'].map((section,i)=>({position:`separator-${i}`,section,equipmentId:'valve-150',name:'Разделительный',details:'',quantity:2,price:12345,hydraulicAssembly:{version:1,accounting:'assembly',requirement:{kind:'isolating-valve',dn:150,pn:16,actuator:'handle'},parts}}));
  const a=build(f);
  assert.equal(a.components.filter(c=>!c.valveControl).length,4);
  assert.equal(a.components.filter(c=>c.valveControl).length,12);
  assert.ok(a.components.filter(c=>c.valveControl).every(c=>!c.line));
  assert.equal(f.project.entities['station-spec'].items[0].price,12345);
});

test('parent translation/rotation, child adjustment, locking, serialization and undo stay in the same local mounting frame',()=>{
  const f=fixture(65), generated=build(f), parent=generated.components.find(c=>c.line?.role==='primarySuctionValve');
  let a=model.editComponent(generated,{id:parent.id,patch:{position:[123,456,789],rotation:[24,-90,37]}});
  for (const c of a.components.filter(c=>c.valveControl?.parentId===parent.id)) samePose(c,controls.composeValvePose(a.components.find(c=>c.id===parent.id),c.valveControl));
  const child=a.components.find(c=>c.valveControl?.parentId===parent.id && c.valveControl.role==='switch-1');
  a=model.editComponent(a,{id:child.id,patch:{position:child.position.map(v=>v+3),rotation:[22,33,44]}});
  const local=structuredClone(a.components.find(c=>c.id===child.id).valveControl);
  a=model.editComponent(a,{id:child.id,patch:{locked:true}});
  const locked=a.components.find(c=>c.id===child.id);
  samePose(model.editComponent(a,{id:child.id,patch:{position:[0,0,0]}}).components.find(c=>c.id===child.id),locked);
  a=model.editComponent(a,{id:parent.id,patch:{rotation:[-41,75,-32]}});
  const saved=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:a}))).assembly;
  const merged=model.mergeAssembly(saved,build(f));
  const adjusted=merged.components.find(c=>c.id===child.id);
  assert.deepEqual(adjusted.valveControl,local);
  assert.equal(adjusted.locked,true);
  samePose(adjusted,controls.composeValvePose(merged.components.find(c=>c.id===parent.id),local));
  const history=model.execute(model.createHistory(generated),merged);
  assert.deepEqual(model.undo(history).present,generated);
  assert.deepEqual(model.redo(model.undo(history)).present,merged);
  assert.equal(model.mergeAssembly(merged,build(f)).components.length,merged.components.length);
});

test('unknown CAD/gear/no controls never invent mounting; old grouped markers are replaced while manual library objects survive',()=>{
  const f=fixture(80), generated=build(f);
  const old=structuredClone(generated);
  const child=old.components.find(c=>c.valveControl?.role==='bracket');
  old.components=old.components.filter(c=>!c.valveControl);
  old.components.push({...child,id:'old-marker',valveControl:undefined,locked:true});
  old.components.push({...child,id:'manual-model',valveControl:undefined,line:undefined,sourceKey:'manual'});
  const merged=model.mergeAssembly(old,generated);
  assert.ok(!merged.components.some(c=>c.id==='old-marker'));
  assert.ok(merged.components.some(c=>c.id==='manual-model'));
  const unknown=structuredClone(f);unknown.data.items['valve-80'].valveModels[0].shape.modelHash='a'.repeat(64);
  assert.equal(build(unknown).components.filter(c=>c.valveControl).length,0);
  const noControls=structuredClone(f);noControls.project.entities['station-spec'].items=noControls.project.entities['station-spec'].items.filter(r=>!r.assemblyRole);
  assert.equal(build(noControls).components.filter(c=>c.valveControl).length,0);
  assert.equal(model.mergeAssembly(generated,build(noControls)).components.filter(c=>c.valveControl).length,0);
});

test('published mounting sources and unscaled meshes match hashes; all assets exist',async()=>{
  const assets=[mounts.switch,...mounts.rows.map(m=>m.bracket)];
  for (const asset of new Map(assets.map(a=>[a.sourceHash,a])).values()) {
    assert.equal(createHash('sha256').update(await readFile(new URL(`../../${asset.source}`,import.meta.url))).digest('hex'),asset.sourceHash);
    assert.equal(createHash('sha256').update(await readFile(new URL(`../public${asset.meshUrl}`,import.meta.url))).digest('hex'),asset.meshHash);
  }
  for (const mount of mounts.rows) {
    const c={position:mount.bracketPosition,rotation:mount.bracketRotation};
    const hole=mount.dn<=80?[17.6776695297,0,17.6776695297]:[26.8700576851,-22.627416998,0];
    const h=model.worldPoint(c,hole);
    assert.ok(Math.abs(Math.hypot(h[0],h[1])-mount.boltCircle/2)<1e-6);
    assert.equal(h[2],mount.seatZ);
    for (let i=0;i<2;i++) {
      const pose={position:mount.switchPositions[i],rotation:mount.switchRotations[i]};
      near(model.rotate([0,0,-1],pose.rotation),[0,0,1]);
      assert.equal(pose.position[2],mount.seatZ+mount.thickness);
    }
  }
});

test('asset refresh migrates old DN150 drive and staged control copies without losing the parent pose',()=>{
  const f=fixture(150), current=build(f), parent=current.components.find(c=>c.line?.role==='primarySuctionValve');
  parent.position=[32,54,76]; parent.rotation=[11,22,33];
  parent.shape={...parent.shape,modelHash:'a'.repeat(64)};
  const control=current.components.find(c=>c.valveControl?.parentId===parent.id && c.valveControl.role==='switch-1');
  current.components=current.components.filter(c=>!c.valveControl);
  current.components.push({...control,id:`spec-${control.line.specPosition}-equipment:${control.equipmentId}-0`,line:undefined,valveControl:undefined});
  const refreshed=model.refreshModelAssets(current,f.project,pumps,{version:1,profiles:{},equipment:{}},f.data);
  const valve=refreshed.components.find(c=>c.id===parent.id);
  samePose(valve,parent);
  assert.equal(valve.shape.modelHash,mounts.rows.find(r=>r.dn===150).valveHash);
  assert.equal(refreshed.components.filter(c=>c.valveControl).length,18);
  assert.ok(!refreshed.components.some(c=>c.id.startsWith(`spec-${control.line.specPosition}-equipment:${control.equipmentId}-`)));
  for(const c of refreshed.components.filter(c=>c.valveControl?.parentId===parent.id)) samePose(c,controls.composeValvePose(valve,c.valveControl));
});

// A deterministic UI review scene built by the production mounting function.
if (process.env.PSC_MOUNT_PROOF==='1') {
  const components=[];
  for (const [i,dn] of [50,65,80,100,125,150].entries()) {
    const f=fixture(dn,1), built=build(f), parent=built.components.find(c=>c.line?.role==='primaryDischargeValve');
    const moved=model.editComponent(built,{id:parent.id,patch:{position:[(i%3)*480,Math.floor(i/3)*500,0],rotation:[0,0,0]}});
    const group=moved.components.filter(c=>c.id===parent.id || c.valveControl?.parentId===parent.id);
    for (const c of group) { c.id=`dn${dn}-${c.id}`; if(c.valveControl)c.valveControl.parentId=`dn${dn}-${c.valveControl.parentId}`; delete c.line; }
    components.push(...group);
  }
  await writeFile(new URL('../work/limit-switch-models-ui/mounting-scene.json',import.meta.url),JSON.stringify({version:1,sourceFingerprint:'mounting-proof',components}));
}
