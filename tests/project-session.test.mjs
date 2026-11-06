import assert from 'node:assert/strict';
import test from 'node:test';
import {loadTs} from './load-ts.mjs';

const {ProjectSession}=await loadTs(new URL('../app/project-session.ts',import.meta.url));
const {mergeProjectChanges,sameProject}=await loadTs(new URL('../app/project-merge.ts',import.meta.url));
const base=()=>({schemaVersion:1,project:{id:'station',name:'Станция',createdAt:'2026-11-05',updatedAt:'2026-11-05'},entities:{input:{flow:10,head:20,enabled:false},model:{zoom:1},spec:{items:[{name:'Насос',quantity:2}]}},workspace:{zoom:100,windows:[{id:'input',x:0}]}});
const edit=(config,change)=>{const next=structuredClone(config);change(next);return next;};

// IndexedDB writes are exercised through the session; the transactional adapter
// is intentionally small because these tests concern version coordination.
const drafts=new Map();
globalThis.indexedDB={open(){const request={};queueMicrotask(()=>{request.result={transaction(){const tx={objectStore(){return {put(row){drafts.set(row.key,structuredClone(row));},delete(key){drafts.delete(key);},get(key){const req={};queueMicrotask(()=>{req.result=drafts.get(key);req.onsuccess?.();});return req;}};}};setTimeout(()=>tx.oncomplete?.(),0);return tx;}};request.onsuccess?.();});return request;}};

function server(t,initial=base()) {
  const previous=globalThis.fetch;
  let config=structuredClone(initial),revision=1;
  const receipts=new Map(),writes=[],sessions=[];
  const api={loseResponse:false,hold:null,reads:0,
    get config(){return config;},get revision(){return revision;},writes,
    remote(change){config=edit(config,change);revision++;},
    session(onChange=()=>{}){const messages=[];const session=new ProjectSession('owner',structuredClone(initial),1,m=>messages.push(m),()=>{},onChange);sessions.push(session);return {session,messages};},
  };
  globalThis.fetch=async(url,options)=>{
    assert.match(String(url),/^\/api\/projects/);
    if(options.method==='GET'){api.reads++;return Response.json({...config.project,config,revision});}
    const request=JSON.parse(options.body);writes.push(request);
    if(api.hold){const hold=api.hold;api.hold=null;await hold;}
    const receipt=receipts.get(request.operation);
    if(receipt){assert.deepEqual(request,receipt.request,'retries must preserve the exact pending request');return Response.json({revision:receipt.revision});}
    if(request.baseRevision!==revision)return Response.json({error:'Проект изменён в другой вкладке'},{status:409});
    config=structuredClone(request.config);revision++;
    receipts.set(request.operation,{request,revision});
    if(api.loseResponse){api.loseResponse=false;throw new TypeError('Connection lost after commit');}
    return Response.json({revision});
  };
  t.after(()=>{sessions.forEach(session=>session.dispose());globalThis.fetch=previous;});
  return api;
}

test('JSONB key order, absent optional values and timestamps do not create false changes',()=>{
  const config=base();
  const remote=JSON.parse(JSON.stringify(config),(key,value)=>value&&!Array.isArray(value)&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse()):value);
  remote.project.updatedAt='2026-11-06';remote.entities.input.optional=undefined;
  assert.equal(sameProject(config,remote),true);
  remote.entities.input.flow=0;assert.equal(sameProject(config,remote),false);
  assert.equal(sameProject(config,edit(config,c=>{c.entities.input.enabled=null;})),false);
});

test('independent fields merge, overlapping values and reordered arrays remain conflicts',()=>{
  const original=base(),local=edit(original,c=>{c.entities.input.flow=0;}),remote=edit(original,c=>{c.entities.input.head=25;});
  const merged=mergeProjectChanges(original,local,remote);
  assert.deepEqual(merged.conflicts,[]);assert.equal(merged.config.entities.input.flow,0);assert.equal(merged.config.entities.input.head,25);
  assert.deepEqual(mergeProjectChanges(original,local,edit(original,c=>{c.entities.input.flow=30;})).conflicts,['entities.input.flow']);
  const a=edit(original,c=>{c.entities.spec.items[0].quantity=3;}),b=edit(original,c=>{c.entities.spec.items.push({name:'Клапан',quantity:1});});
  assert.deepEqual(mergeProjectChanges(original,a,b).conflicts,['entities.spec.items']);
});

test('loading an unchanged saved project does not write a new version',async t=>{
  const api=server(t),{session}=api.session();
  session.update(structuredClone(session.latest));
  assert.equal(session.dirty,false);assert.equal(await session.flush(),true);assert.equal(api.writes.length,0);
});

test('main and detached windows save independent edits concurrently without losing either',async t=>{
  const api=server(t),a=api.session().session,b=api.session().session;
  a.update(edit(a.latest,c=>{c.entities.input.flow=30;}));
  b.update(edit(b.latest,c=>{c.entities.input.head=50;}));
  assert.deepEqual(await Promise.all([a.flush(),b.flush()]),[true,true]);
  await Promise.all([a.refresh(),b.refresh()]);
  assert.equal(api.config.entities.input.flow,30);assert.equal(api.config.entities.input.head,50);
  assert.equal(a.blocked,false);assert.equal(b.blocked,false);
  assert.deepEqual(a.latest,api.config);assert.deepEqual(b.latest,api.config);
  assert.equal(a.revision,api.revision);assert.equal(b.revision,api.revision);
});

test('receiving a newer saved version preserves local changes in other fields',async t=>{
  const api=server(t),changes=[],{session}=api.session(config=>changes.push(config));
  session.update(edit(session.latest,c=>{c.entities.model.zoom=2;}));
  api.remote(c=>{c.entities.input.head=40;});
  assert.equal(await session.refresh(),true);
  assert.equal(session.latest.entities.input.head,40);assert.equal(session.latest.entities.model.zoom,2);
  assert.equal(changes.length,1);assert.equal(session.dirty,true);
  assert.equal(await session.flush(),true);assert.equal(session.dirty,false);
  assert.equal(api.config.entities.model.zoom,2);
});

test('simultaneous edits of the same value are not silently overwritten',async t=>{
  const api=server(t),a=api.session().session,{session:b,messages}=api.session();
  a.update(edit(a.latest,c=>{c.entities.input.flow=30;}));b.update(edit(b.latest,c=>{c.entities.input.flow=40;}));
  assert.equal(await a.flush(),true);assert.equal(await b.flush(),false);
  assert.equal(b.blocked,true);assert.equal(b.latest.entities.input.flow,40);assert.equal(api.config.entities.input.flow,30);
  assert.match(messages.at(-1),/Один и тот же параметр/);
  assert.ok([...drafts.values()].some(d=>d.config.entities.input.flow===40));
});

test('a lost save response replays its operation before merging a newer server version',async t=>{
  const api=server(t),{session}=api.session();
  session.update(edit(session.latest,c=>{c.entities.input.flow=30;}));api.loseResponse=true;
  assert.equal(await session.flush(),false);
  const pending=structuredClone(session.pending);
  api.remote(c=>{c.entities.input.head=45;});
  session.update(edit(session.latest,c=>{c.entities.model.zoom=2;}));
  assert.equal(await session.flush(),true);
  assert.deepEqual(api.writes[1],pending);
  assert.equal(api.config.entities.input.flow,30);assert.equal(api.config.entities.input.head,45);assert.equal(api.config.entities.model.zoom,2);
  assert.equal(session.pending,undefined);assert.equal(session.dirty,false);
});

test('edits made during an in-flight save are saved before flush completes',async t=>{
  const api=server(t),{session}=api.session();let release;
  api.hold=new Promise(resolve=>{release=resolve;});
  session.update(edit(session.latest,c=>{c.entities.input.flow=30;}));
  const saving=session.flush();
  while(!api.writes.length)await new Promise(resolve=>setTimeout(resolve,1));
  session.update(edit(session.latest,c=>{c.entities.input.head=45;}));release();
  assert.equal(await saving,true);assert.equal(api.config.entities.input.head,45);assert.equal(session.dirty,false);
});

test('broadcast saves update a second window and dispose disconnects it',async t=>{
  const oldWindow=globalThis.window,oldDocument=globalThis.document;
  globalThis.window=new EventTarget();globalThis.document=Object.assign(new EventTarget(),{visibilityState:'visible'});
  const api=server(t),a=api.session().session,b=api.session().session;
  t.after(()=>{globalThis.window=oldWindow;globalThis.document=oldDocument;});
  a.connect();b.connect();
  a.update(edit(a.latest,c=>{c.entities.input.flow=35;}));assert.equal(await a.flush(),true);
  for(let n=0;n<100&&b.revision!==api.revision;n++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(b.latest.entities.input.flow,35);assert.equal(b.dirty,false);
  b.dispose();const revision=b.revision;
  a.update(edit(a.latest,c=>{c.entities.input.flow=36;}));await a.flush();
  assert.equal(b.revision,revision);
});
