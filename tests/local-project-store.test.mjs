import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connectStore,readProject,saveProject,projectService} from '../services/local-storage/store.mjs';

test('PostgreSQL: large snapshot, replay, concurrent edits, ownership, retention and restore',{
  skip:!process.env.LOCAL_PROJECT_TEST_URL
},async()=>{
  const pool=await connectStore(process.env.LOCAL_PROJECT_TEST_URL);
  const owner=randomUUID(),id=randomUUID();
  const cfg={schemaVersion:1,project:{id,name:'Тест',updatedAt:'t'},entities:{price:177,model:'Я'.repeat(1100000)}};
  const input={config:cfg,operation:randomUUID(),baseRevision:0};
  const save=(body)=>saveProject(pool,owner,body,{keep:2});
  const call=async payload=>projectService(pool)(new Request('http://local/',{method:'POST',body:JSON.stringify({owner,id,...payload})}));
  try {
    assert.deepEqual(await save(input),{revision:1});
    assert.deepEqual(await save(input),{revision:1});
    await assert.rejects(save({...input,config:{...cfg,entities:{foo:1}}}),e=>e.status===409);
    await assert.rejects(readProject(pool,'other',id),e=>e.status===404);
    await assert.rejects(saveProject(pool,'other',{...input,operation:randomUUID()}),e=>e.status===404);
    await assert.rejects(saveProject(pool,owner,input,{limit:1500000}),e=>e.status===413);
    const config=structuredClone(cfg);config.project.updatedAt='changed-only-time';
    assert.deepEqual(await save({config,baseRevision:1,operation:randomUUID()}),{revision:1});
    assert.equal((await call({action:'pin',revision:1,pinned:true})).status,200);
    const results=await Promise.allSettled([2,3].map(price=>save({config:{...config,entities:{price}},baseRevision:1,operation:randomUUID()})));
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(results.find(x=>x.status==='rejected').reason.status,409);
    for(let n=3;n<=6;n++)await save({config:{...config,entities:{price:n}},baseRevision:n-1,operation:randomUUID()});
    assert.deepEqual((await (await call({action:'history'})).json()).revisions.map(r=>r.revision),[6,5,1]);
    const restored=await readProject(pool,owner,id,1);
    await save({config:restored.config,baseRevision:6,restore:1,operation:randomUUID()});
    assert.equal((await readProject(pool,owner,id)).config.entities.price,177);
    assert.ok(!(await (await call({action:'list'})).text()).includes(cfg.entities.model.slice(0,100)));
    assert.equal((await call({action:'delete',baseRevision:6})).status,409);
    assert.equal((await call({action:'delete',baseRevision:7})).status,200);
    await assert.rejects(readProject(pool,owner,id),e=>e.status===404);
  } finally {await pool.query('DELETE FROM projects WHERE id=$1 AND owner_id=$2',[id,owner]);await pool.end();}
});
