import test from 'node:test';
import assert from 'node:assert/strict';
import {engineeringStore} from './fixtures/engineering-store.mjs';
const item={id:'frame-hardware-test',catalogId:'метизы',family:'Тест',fields:[],prices:[]};
test('frame catalogue is persistent, idempotent, immutable and rejects concurrent replacement',async()=>{
 const store=await engineeringStore();try{
  const api=await store.load('frame-calculation/catalog-store-server');
  const a=await api.publishFrameCatalog([item],0,'Тест');assert.equal(a.revision,1);
  const b=await api.publishFrameCatalog([item],1,'Тест');assert.equal(b.revision,1);
  const changed={...item,family:'Новая'};await api.publishFrameCatalog([changed],1,'Тест');
  await assert.rejects(()=>api.publishFrameCatalog([item],1,'Другой'),e=>e.status===409);
  assert.equal((await api.readFrameCatalog()).items[0].family,'Новая');
  assert.equal(store.sql.prepare('select count(*) n from frame_catalog_versions').get().n,2);
  assert.throws(()=>store.sql.prepare('update frame_catalog_versions set payload=?').run('[]'),/immutable/);
  await assert.rejects(()=>api.publishFrameCatalog([item,item],2,'Тест'));
 }finally{store.close();}
});
test('frame catalogue API denies users and cross-origin mutation',async()=>{
 const store=await engineeringStore();try{
  const route=await store.load('api/admin/frame-catalog/route');
  assert.equal((await route.GET(new Request('http://fixture/api/admin/frame-catalog'))).status,401);
  assert.equal((await route.GET(new Request('http://fixture/api/admin/frame-catalog',{headers:{'x-test-role':'user'}}))).status,403);
  assert.equal((await route.POST(new Request('http://fixture/api/admin/frame-catalog',{method:'POST',headers:{'x-test-role':'admin',origin:'https://elsewhere.example'},body:'{}'}))).status,403);
 }finally{store.close();}
});
