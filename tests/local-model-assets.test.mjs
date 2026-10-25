import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { localModelAssets } from '../scripts/local-model-assets.mjs';

async function fixture(t) {
  const parent = resolve(tmpdir()), root = await mkdtemp(join(parent, 'local-model-assets-'));
  t.after(async () => { assert.equal(dirname(resolve(root)), parent); await rm(root, { recursive: true, force: true }); });
  return { root, fetch: localModelAssets(root, () => new Response('bundled')) };
}

test('local CAD binding streams files exceeding the static-asset limit and supports HEAD', async t => {
  const fixtureData = await fixture(t), body = Buffer.alloc(26 * 1024 * 1024, 0x3c);
  await writeFile(join(fixtureData.root, 'large.stl'), body);
  const head = await fixtureData.fetch(new Request('http://local/model-assets/large.stl', { method: 'HEAD' }));
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), String(body.length));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const response = await fixtureData.fetch(new Request('http://local/model-assets/large.stl'));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('content-type'), 'model/stl');
  const received = Buffer.from(await response.arrayBuffer());
  assert.equal(received.length, body.length);
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(received), hash(body));
});

test('CAD binding restricts filenames and methods and delegates other assets', async t => {
  const { fetch } = await fixture(t);
  for (const path of ['missing.stl', 'private.txt', 'nested/model.stl', '%2e%2e%2foutside.stl', 'source.step']) {
    assert.equal((await fetch(new Request('http://local/model-assets/' + path))).status, 404, path);
  }
  const denied = await fetch(new Request('http://local/model-assets/library.json', { method: 'POST' }));
  assert.equal(denied.status, 405);
  assert.equal(denied.headers.get('allow'), 'GET, HEAD');
  assert.equal(await (await fetch(new Request('http://local/assets/app.js'))).text(), 'bundled');
});

test('new meshes and updated library metadata are available without restarting the binding', async t => {
  const { root, fetch } = await fixture(t);
  assert.equal((await fetch(new Request('http://local/model-assets/new.stl'))).status, 404);
  await writeFile(join(root, 'new.stl'), 'new mesh');
  assert.equal(await (await fetch(new Request('http://local/model-assets/new.stl'))).text(), 'new mesh');
  for (const ready of [1, 2]) {
    await writeFile(join(root, 'library.json'), JSON.stringify({ ready }));
    assert.deepEqual(await (await fetch(new Request('http://local/model-assets/library.json'))).json(), { ready });
  }
});
