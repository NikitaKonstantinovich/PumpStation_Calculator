import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { loadTs } from './load-ts.mjs';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const [report, registry, manifest, pumps] = await Promise.all([
  'data/onis-model-import.json', 'data/onis-model-registry.json',
  'public/model-assets/manifest.json', 'public/pumps.json',
].map(json));
const { parseModelLibrary, filterLibrary, addLibraryModel } = await loadTs(new URL('app/model-editor/library.ts', root));
const { resolvePumpLayout } = await loadTs(new URL('app/model-editor/pump-spatial.ts', root));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const localCad = { skip: process.env.PSC_TEST_CAD_FILES !== '1' };

test('all imported ONIS originals remain accounted for; unsupported DWG never masquerades as STEP', () => {
  assert.equal(report.files.length, 258);
  assert.equal(report.files.filter(r=>r.format==='.dwg').length, 23);
  assert.equal(report.files.filter(r=>r.status==='ready').length, 235);
  for (const row of report.files) {
    if (row.format==='.dwg') {
      assert.equal(row.status, 'unsupported');
      assert.equal(row.meshUrl, undefined);
    }
  }
});

test('local original files match the archived hashes', localCad, async () => {
  for (const row of report.files) {
    const original = await readFile(new URL('../'+row.archivedSource, root));
    assert.equal(sha(original), row.originalHash ?? row.sourceHash, row.name);
  }
});

test('every ready mesh has a matching source, bounds and valid binary STL; library search finds MV and MH', localCad, async () => {
  const library = await json('public/model-assets/library.json');
  const parsed = parseModelLibrary(library);
  for (const row of report.files.filter(r=>r.status==='ready')) {
    const source = await readFile(new URL('../'+row.source, root));
    const mesh = await readFile(new URL('public'+row.meshUrl, root));
    assert.equal(sha(source), row.sourceHash, row.name);
    assert.equal(sha(mesh), row.meshHash, row.name);
    assert.ok(mesh.readUInt32LE(80)>0);
    assert.equal(mesh.length, 84+50*mesh.readUInt32LE(80));
    assert.ok(row.preservation.originalGeometryDefinitionsPreserved);
    assert.ok(row.bounds.every(Number.isFinite));
    assert.ok(parsed.models.some(m=>m.id===row.sourceHash&&m.status==='ready'));
  }
  for (const query of ['ONIS MV1-10', 'ONIS MH 1-3']) {
    assert.ok(filterLibrary(parsed.models, query, 'Насосы', 'ready').length, query);
  }
});

const mvFlow = await json('data/onis-flow-reviews.json');
test('only independently reviewed MV solids acquire flow roles, including profiles in pinned manifests', () => {
  assert.equal(registry.models.length, 208);
  for (const profile of registry.models) {
    const pump = pumps.find(p=>p.id===profile.pumpId);
    assert.equal(pump.manufacturer, 'ONIS');
    assert.ok(['MV','MH'].includes(pump.series));
    assert.equal(manifest.profiles[pump.id].sourceHash, profile.sourceHash);
    const spatial = resolvePumpLayout(pump, manifest.profiles[pump.id]);
    assert.equal(spatial.info.envelope, 'cad');
    assert.deepEqual(spatial.bounds, profile.bounds);
    assert.equal(spatial.info.schematic, undefined);
    assert.equal(profile.ports[0].point.every(n=>n===0), true);
    if (pump.series==='MH') assert.deepEqual(spatial.ports.find(p=>p.id==='outlet').axis,[0,0,1]);
    else if (mvFlow[profile.sourceHash]) {
      const row=mvFlow[profile.sourceHash];
      assert.equal(row.pumpId,pump.id);
      assert.equal(row.arrows.length,2);
      assert.deepEqual(spatial.ports.find(p=>p.id==='inlet').point,row.originalPorts[row.inlet].point);
      assert.deepEqual(spatial.ports.find(p=>p.id==='outlet').point,row.originalPorts[row.inlet==='port-a'?'port-b':'port-a'].point);
      assert.ok(!spatial.note.includes('Направление потока MV не подтверждено'));
    } else {
      assert.deepEqual(spatial.ports.map(p=>p.id),['port-a','port-b']);
      assert.ok(spatial.info.issues.some(s=>s.includes('всасывающего')));
    }
  }
  assert.ok(registry.models.some(p=>p.warnings.some(w=>w.includes('Расхождение габарита'))));
});

test('ONIS MV20-3 uses the actual mounting holes and rejects altered or re-positioned CAD',()=>{
  const pump=pumps.find(p=>p.id==='nu-e54dc111d0241fcb'), profile=manifest.profiles[pump.id], row=mvFlow[profile.sourceHash];
  assert.equal(row.inlet,'port-a');
  for(const mount of Object.values(row.mounts)){
    assert.equal(mount.holes.length,4); assert.equal(mount.holeDiameter,18);
    assert.ok(mount.holes.every(([,y,z])=>Math.abs(Math.hypot(y,z)-62.5)<.01));
  }
  for(const altered of [{...profile,sourceHash:'0'.repeat(64)}, {...profile,ports:profile.ports.map(p=>({...p,point:[p.point[0]+20,0,0]}))}])
    assert.deepEqual(resolvePumpLayout(pump,altered).ports.map(p=>p.id),['port-a','port-b']);
});

test('a reviewed library-only pump keeps measured ports without borrowing a catalogue SKU',async()=>{
  const source=report.files.find(f=>f.model==='MV20-14');
  assert.ok(source && !source.pumpId);
  const library=await json('public/model-assets/library.json');
  const pump=parseModelLibrary({version:1,models:library.models.filter(m=>m.sourceHash===source.sourceHash)}).models[0];
  const assembly=addLibraryModel({components:[]},pump,'manual-onsite');
  assert.deepEqual(assembly.components[0].ports.map(p=>p.id),['inlet','outlet']);
  assert.equal(assembly.components[0].equipmentId,undefined);
});

test('canonical ONIS MV variants resolve their exact STEP and only reviewed ports gain flow roles', async () => {
  const { onisMvCadProfile } = await loadTs(new URL('app/model-editor/onis-mv-cad.ts', root));
  const { models } = await json('data/onis-mv-cad-models.json');
  let flowReviewed = 0;
  for (const [id, record] of Object.entries(models)) {
    const pump = { id, manufacturer: 'ONIS', series: 'MV', model: record.designation, article: record.article };
    const profile = onisMvCadProfile(pump);
    assert.deepEqual(profile, record.profile);
    assert.equal(profile.meshUrl, `/model-assets/model-${profile.sourceHash}-v1.stl`);
    assert.equal(onisMvCadProfile({...pump, article: 'invalid'}), undefined);
    assert.equal(onisMvCadProfile({...pump, model: 'MV 5-999'}), undefined);
    const spatial = resolvePumpLayout(pump, profile);
    assert.deepEqual(spatial.bounds, profile.bounds);
    assert.equal(spatial.info.envelope, 'cad');
    assert.equal(spatial.info.schematic, undefined);
    const flow = mvFlow[profile.sourceHash];
    if (spatial.ports.some(port => port.id === 'inlet')) {
      flowReviewed++;
      assert.equal(flow.method, 'casing_arrows');
      assert.deepEqual(spatial.ports.find(p => p.id === 'inlet').point, flow.originalPorts[flow.inlet].point);
      assert.ok(spatial.ports.some(p => p.id === 'outlet'));
    } else {
      assert.deepEqual(spatial.ports.map(p => p.id), ['port-a', 'port-b']);
    }
  }
  assert.equal(Object.keys(models).length, 185);
  assert.equal(flowReviewed, 9);
  assert.equal(onisMvCadProfile({id: 'ONIS:MV:110176', manufacturer: 'ONIS', series: 'MV', model: 'MV 45-9-2', article: '110176'}), undefined);
});

test('three node-selected MV 5-8 instances carry the measured STEP into SolidWorks', async () => {
  const { createProject } = await loadTs(new URL('app/project-config.ts', root));
  const { buildAssembly } = await loadTs(new URL('app/model-editor/model.ts', root));
  const { cadContents } = await loadTs(new URL('app/cad-export.ts', root));
  const { models } = await json('data/onis-mv-cad-models.json');
  const id = 'ONIS:MV:110061';
  const { profile } = models[id];
  const legacy = pumps.find(p => p.id === 'nu-7a97f5b430b82833');
  const pump = { ...legacy, id, article: '110061' };
  const project = createProject();
  Object.assign(project.entities['system-input'], { selectedPumpId: id, workingPumpCount: 2, reservePumpCount: 1 });
  const assembly = buildAssembly(project, [pump], {version: 1, profiles: {}});
  const instances = assembly.components.filter(c => c.kind === 'pump');
  assert.equal(instances.length, 3);
  for (const instance of instances) {
    assert.equal(instance.equipmentId, id);
    assert.equal(instance.meshUrl, profile.meshUrl);
    assert.deepEqual(instance.cadSource, {path: profile.source, hash: profile.sourceHash});
    assert.deepEqual(instance.ports.map(p => p.id), ['port-a', 'port-b']);
  }
  const exported = cadContents(assembly);
  assert.equal(exported.instances.filter(p => p.equipmentId === id && p.geometry.kind === 'native' && p.geometry.hash === profile.sourceHash).length, 3);
  assert.ok(exported.warnings.some(warning => warning.includes('монтажный допуск требуют сверки')));
});
