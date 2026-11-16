import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {connectStore,saveProject,readProject,listManagedProjects,copyManagedProject,projectService} from '../services/local-storage/store.mjs';

test('admin project listing and independent, pinned, idempotent copies in PostgreSQL',{skip:!process.env.LOCAL_PROJECT_TEST_URL},async()=>{
 const pool=await connectStore(process.env.LOCAL_PROJECT_TEST_URL),ownerA=randomUUID(),ownerB=randomUUID(),admin=randomUUID(),prefix=randomUUID(),modelVersion="models-"+randomUUID();
 await pool.query("INSERT INTO model_releases(version) VALUES($1)",[modelVersion]);
 const create=async(owner,name,algorithm='pump-station')=>{
  const config={schemaVersion:1,project:{id:randomUUID(),name:prefix+' '+name,modelLibraryVersion:modelVersion,autoName:true,createdAt:'2020-01-01',updatedAt:'2020-01-01'},workspace:{windows:[]},entities:{opaque:{values:[3,9,7]}},workspace2:{schema:1,algorithmId:algorithm,product:{version:'old-pinned-graph',algorithmId:algorithm,sourceVersions:{pump_catalog_v2:'pinned-catalog'}},tools:{settings:{values:{requestNumber:'001-02'}}}}};
  await saveProject(pool,owner,{config,baseRevision:0,operation:randomUUID()});return config;
 };
 try{
  const first=await create(ownerA,'WENARD 100%_CDM'),other=await create(ownerB,'Пожарная установка','future-product');
  for(let n=0;n<25;n++)await create(ownerA,'Страница '+n);
  const page=await listManagedProjects(pool,{query:prefix});assert.equal(page.total,27);assert.equal(page.projects.length,25);assert.equal(page.next,25);assert(!JSON.stringify(page).includes('pinned-catalog'));
  const tail=await listManagedProjects(pool,{query:prefix,offset:25});assert.equal(tail.projects.length,2);assert.equal(tail.next,null);assert.equal(new Set([...page.projects,...tail.projects].map(p=>p.id)).size,27);
  assert.equal((await listManagedProjects(pool,{query:prefix,userId:ownerA})).total,26);
  assert.equal((await listManagedProjects(pool,{query:prefix,algorithmId:'future-product'})).projects[0].id,other.project.id);
  assert.equal((await listManagedProjects(pool,{query:'wenard 100%_cdm'})).projects[0].id,first.project.id);
  assert.equal((await listManagedProjects(pool,{query:'пожарная установка'})).projects[0].id,other.project.id);
  assert.equal((await listManagedProjects(pool,{query:"' OR 1=1 --"})).total,0);
  const request={id:first.project.id,revision:1,operation:randomUUID()};
  const [one,two]=await Promise.all([copyManagedProject(pool,admin,request),copyManagedProject(pool,admin,request)]);
  assert.equal(one.id,two.id);assert.notEqual(one.id,first.project.id);assert.equal(one.revision,1);
  assert.equal(one.config.project.modelLibraryVersion,modelVersion);assert.deepEqual(one.config.workspace2,first.workspace2);assert.deepEqual(one.config.entities,first.entities);assert.equal(one.config.project.autoName,true);
  assert.deepEqual(one.config.project.copyOf,{id:first.project.id,ownerId:ownerA,revision:1});
  await assert.rejects(readProject(pool,ownerA,one.id),e=>e.status===404);
  await assert.rejects(copyManagedProject(pool,admin,{...request,id:other.project.id}),e=>e.status===409);
  const edited=structuredClone(one.config);edited.workspace2.tools.settings.values.requestNumber='999-1';
  await saveProject(pool,admin,{config:edited,baseRevision:1,operation:randomUUID()});
  assert.equal((await readProject(pool,ownerA,first.project.id)).config.workspace2.tools.settings.values.requestNumber,'001-02');
  assert.equal((await copyManagedProject(pool,admin,request)).revision,2);
  await saveProject(pool,ownerA,{config:{...first,entities:{changed:true}},baseRevision:1,operation:randomUUID()});
  await assert.rejects(copyManagedProject(pool,admin,{...request,operation:randomUUID()}),e=>e.status===409);
  await pool.query('UPDATE projects SET deleted_at=now() WHERE id=$1',[other.project.id]);
  assert.equal((await listManagedProjects(pool,{userId:ownerB})).total,0);
  await assert.rejects(copyManagedProject(pool,admin,{id:other.project.id,revision:1,operation:randomUUID()}),e=>e.status===404);
  const service=projectService(pool);
  for(const action of ['admin-list','admin-copy'])assert.equal((await service(new Request('http://internal/',{method:'POST',body:JSON.stringify({owner:admin,action})}))).status,403);
  await assert.rejects(listManagedProjects(pool,{offset:-1}),e=>e.status===400);
 }finally{await pool.query('DELETE FROM projects WHERE owner_id=ANY($1::text[])',[[ownerA,ownerB,admin]]);await pool.query('DELETE FROM model_releases WHERE version=$1',[modelVersion]);await pool.end();}
});
