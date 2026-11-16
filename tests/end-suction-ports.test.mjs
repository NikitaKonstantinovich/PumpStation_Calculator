import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTs } from './load-ts.mjs';
const root = new URL('../', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const data = await read('data/end-suction-ports.json');
const prepared = (await read('data/prepared-pump-cad-models.json')).models;
const { applyEndSuctionCadPorts, endSuctionDrawing } = await loadTs(new URL('app/model-editor/end-suction-ports.ts', root));
const { resolvePumpSpatial } = await loadTs(new URL('app/model-editor/pump-spatial.ts', root));
const { preparedPumpCadModel } = await loadTs(new URL('app/model-editor/prepared-pump-cad.ts', root));
const pumpFor = (id, row) => ({ id, ...row.identity, power: row.identity.powerKw, type: 'end_suction',
  dimensions: { sourceValues: JSON.parse(row.dimensionSignature ?? '[]').map(([key, valueMm]) => ({ key, valueMm })) } });
const find = model => { const [id, row] = Object.entries(data.variants).find(([, r]) => r.identity.model === model); return pumpFor(id, row); };

test('all reviewed end-suction executions resolve two distinct, sourced ports in a valid coordinate frame', () => {
  assert.equal(Object.keys(data.variants).length, 1247);
  for (const [id, row] of Object.entries(data.variants)) {
    const pump = pumpFor(id, row), profile = preparedPumpCadModel(pump)?.profile;
    const r = resolvePumpSpatial(pump, profile);
    assert.equal(r.ports.length, 2, pump.model);
    assert.deepEqual(r.ports.map(p => p.id), ['inlet', 'outlet'], pump.model);
    assert.deepEqual(r.ports.map(p => p.axis), [[-1, 0, 0], [0, 0, 1]], pump.model);
    assert.deepEqual(r.ports[0].point, [0, 0, 0]);
    assert.notDeepEqual(r.ports[1].point, [0, 0, 0]);
    for (const port of r.ports) {
      assert(port.source?.length > 10, pump.model);
      assert(port.point.every((value, i) => Number.isFinite(value) && value >= r.bounds[i] - .01 && value <= r.bounds[i + 3] + .01), pump.model);
    }
    assert(!r.info.schematic, pump.model);
  }
});

test('reviewed drawings retain direct dimensions and the correct base datum', () => {
  for (const [model, outlet, base] of [
    ['EST32-250/75', [154, 0, 198], 160],
    ['EST40-160/30', [80, 0, 168], 132],
    ['NIS100-80-125G/7.5', [100, 0, 180], 240],
    ['EEZ150-125-260/215-4NZ', [140, 0, 445], 350],
  ]) {
    const r = resolvePumpSpatial(find(model));
    assert.deepEqual(r.ports[1].point, outlet, model);
    assert.equal(r.bounds[2], -base, model);
    assert.deepEqual(r.info.dimensionsMm, [null, null, null]);
  }
});

test('drawing coordinates are invalidated by execution or dimension changes', () => {
  const pump = find('EST32-250/75');
  for (const key of ['id', 'type', 'manufacturer', 'series', 'model', 'article', 'execution', 'power', 'frequencyHz']) {
    const changed = { ...pump, [key]: typeof pump[key] === 'number' ? pump[key] + 1 : `${pump[key]}-changed` };
    assert.equal(endSuctionDrawing(changed), undefined, key);
  }
  assert.equal(endSuctionDrawing({ ...pump, dimensions: { sourceValues: [{ key: 'a', valueMm: 999 }] } }), undefined);
  const first = endSuctionDrawing(pump); first.ports[0].point[0] = 123;
  assert.equal(endSuctionDrawing(pump).ports[0].point[0], 0);
});

test('CAD role recovery requires the exact STEP hash, bounds and existing port geometry', () => {
  const [id, row] = Object.entries(data.variants).find(([id, r]) => r.cadHash && prepared[id].profile.ports[0].id === 'port-a');
  const pump = pumpFor(id, row), profile = structuredClone(prepared[id].profile);
  profile.ports.push({ id: 'port-b', point: [...data.cad[row.cadHash].outletMm], axis: [0, 0, 1] });
  assert.deepEqual(applyEndSuctionCadPorts(pump, profile).ports.map(p => p.id), ['inlet', 'outlet']);
  for (const changed of [
    { ...profile, sourceHash: '0'.repeat(64) },
    { ...profile, bounds: profile.bounds.map(n => n + 1) },
    { ...profile, ports: profile.ports.map(p => ({ ...p, axis: [1, 0, 0] })) },
    { ...profile, ports: profile.ports.map(p => ({ ...p, point: p.point.map(n => n + 1) })) },
  ]) assert.strictEqual(applyEndSuctionCadPorts(pump, changed), changed);
  assert.strictEqual(applyEndSuctionCadPorts({ ...pump, power: pump.power + 1 }, profile), profile);
  const named = { ...profile, ports: [{ id: 'inlet', point: [1, 2, 3], axis: [-1, 0, 0] }, { id: 'outlet', point: [4, 5, 6], axis: [0, 1, 0] }] };
  assert.strictEqual(applyEndSuctionCadPorts(pump, named), named, 'explicit manual roles remain authoritative');
});

test('NIS CAD with an omitted outlet recovers its measured plane without replacing its mesh', () => {
  const [id, row] = Object.entries(data.variants).find(([id, r]) => r.cadHash && prepared[id].profile.ports.length === 1);
  const pump = pumpFor(id, row), profile = prepared[id].profile;
  const corrected = applyEndSuctionCadPorts(pump, profile);
  assert.equal(corrected.meshUrl, profile.meshUrl);
  assert.deepEqual(corrected.bounds, profile.bounds);
  assert.deepEqual(corrected.ports[1].point, data.cad[row.cadHash].outletMm);
  assert.equal(profile.ports.length, 1, 'source profile is immutable');
});
