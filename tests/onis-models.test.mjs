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
const { parseModelLibrary, filterLibrary } = await loadTs(new URL('app/model-editor/library.ts', root));
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

test('exact catalogue profiles show CAD; MH points up, MV flow remains explicitly unassigned', () => {
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
    else {
      assert.deepEqual(spatial.ports.map(p=>p.id),['port-a','port-b']);
      assert.ok(spatial.info.issues.some(s=>s.includes('всасывающего')));
    }
  }
  assert.ok(registry.models.some(p=>p.warnings.some(w=>w.includes('Расхождение габарита'))));
});
