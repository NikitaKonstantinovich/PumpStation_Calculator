import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRuntimeModelAssets,runtimeModelAssets,syncRuntimeModelAssets} from '../scripts/local-runtime-models.mjs';
import {localModelAssets} from '../scripts/local-model-assets.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const asset=bytes=>({sourceHash:'a'.repeat(64),meshHash:hash(bytes),meshUrl:`/model-assets/model-${'a'.repeat(64)}-v1.stl`});
async function fixture(t){
  const parent=resolve(tmpdir()),root=await mkdtemp(join(parent,'runtime-cad-'));
  t.after(async()=>{assert.equal(dirname(root),parent);await rm(root,{recursive:true,force:true});});
  const source=join(root,'source'),library=join(root,'library');await mkdir(source);await mkdir(library);
  return {source,library};
}
test('direct assembly assets deduplicate nested bracket records and reject unsafe/conflicting metadata',()=>{
  const a=asset('mesh');assert.equal(runtimeModelAssets([{assets:{relay:a}},{rows:[{bracket:a},{bracket:a}]}]).length,1);
  for(const patch of [{meshUrl:'/model-assets/../private.stl'},{sourceHash:'invalid'},{meshHash:'invalid'}])assert.throws(()=>runtimeModelAssets([{...a,...patch}]));
  assert.throws(()=>runtimeModelAssets([a,{...a,meshHash:'b'.repeat(64)}]),/Conflicting/);
});
test('startup copies missing KIP models and an already running ASSETS binding can immediately stream them',async t=>{
  const f=await fixture(t),bytes=Buffer.from('native mesh fixture'),a=asset(bytes),name=a.meshUrl.split('/').at(-1);
  await writeFile(join(f.source,name),bytes);await writeFile(join(f.library,'library.json'),'pinned library');
  const serve=localModelAssets(f.library,()=>new Response('fallback'));
  assert.equal((await serve(new Request('http://local'+a.meshUrl))).status,404);
  assert.deepEqual(await syncRuntimeModelAssets({...f,documents:[{assets:{relay:a}}]}),{checked:1,copied:1});
  const response=await serve(new Request('http://local'+a.meshUrl));assert.equal(response.status,200);assert.equal(hash(Buffer.from(await response.arrayBuffer())),a.meshHash);
  assert.equal(await readFile(join(f.library,'library.json'),'utf8'),'pinned library');
  assert.deepEqual(await syncRuntimeModelAssets({...f,documents:[a]}),{checked:1,copied:0});
});
test('checksum failures reject startup without overwriting existing published geometry',async t=>{
  const f=await fixture(t),a=asset('original'),name=a.meshUrl.split('/').at(-1);
  await writeFile(join(f.source,name),'corrupt source');
  await assert.rejects(syncRuntimeModelAssets({...f,documents:[a]}),/source checksum/);
  await writeFile(join(f.source,name),'original');await writeFile(join(f.library,name),'existing geometry');
  await assert.rejects(syncRuntimeModelAssets({...f,documents:[a]}),/Existing runtime CAD checksum/);
  assert.equal(await readFile(join(f.library,name),'utf8'),'existing geometry');
});

test('threaded mounting models are checksum-pinned in the selected release and stream unchanged',async t=>{
  const mounts=JSON.parse(await readFile(new URL('../data/threaded-line-mounts.json',import.meta.url),'utf8'));
  const mounted=mounts.filter(row=>row.meshHash);
  const names=new Set(mounted.map(row=>`model-${row.meshHash}-v1.stl`));
  assert.ok(names.size>0);
  const earlier=await loadRuntimeModelAssets({includeThreaded:false});
  const assets=JSON.parse(JSON.stringify(await loadRuntimeModelAssets()));
  assert.equal(assets.filter(row=>names.has(row.name)).length,names.size);
  assert.ok(earlier.every(row=>!names.has(row.name)));
  for(const row of mounted){
    const name=`model-${row.meshHash}-v1.stl`;
    assert.equal(assets.find(asset=>asset.name===name)?.meshHash,row.stlSha256);
    assert.notEqual(row.stlSha256,row.meshHash);
  }
  const {library}=await fixture(t),source=fileURLToPath(new URL('../public/model-assets',import.meta.url));
  assert.deepEqual(await syncRuntimeModelAssets({library,source,assets}),{checked:assets.length,copied:assets.length});
  const serve=localModelAssets(library,()=>new Response('fallback'));
  for(const row of mounted){
    const response=await serve(new Request(`http://local/model-assets/model-${row.meshHash}-v1.stl`));
    assert.equal(response.status,200);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())),row.stlSha256);
  }
  assert.deepEqual(await syncRuntimeModelAssets({library,source,assets}),{checked:assets.length,copied:0});
});

test('threaded mounting models require STL checksums and build manifests cannot publish arbitrary paths',async t=>{
  const meshHash='a'.repeat(64);
  assert.throws(()=>runtimeModelAssets([],[{meshHash}]),/Invalid runtime CAD metadata/);
  assert.throws(()=>runtimeModelAssets([],[{meshHash:'../private',stlSha256:meshHash}]),/Invalid runtime CAD metadata/);
  const f=await fixture(t);
  await assert.rejects(syncRuntimeModelAssets({...f,assets:[{name:'../private.stl',meshHash}]}),/Invalid runtime CAD manifest/);
});
