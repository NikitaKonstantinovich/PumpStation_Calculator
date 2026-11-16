import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {loadTs} from './load-ts.mjs';
const sql=new DatabaseSync(':memory:');sql.exec("CREATE TABLE users(id TEXT,name TEXT,email TEXT);INSERT INTO users VALUES('owner','Пользователь','owner@example.test');CREATE TABLE node_algorithms(id TEXT,name TEXT,connected INTEGER);INSERT INTO node_algorithms VALUES('pump-station','Насосная установка',1),('future','Другой продукт',1)");
const db={prepare:query=>({all:async()=>({results:sql.prepare(query).all()})})};
const calls=[];globalThis.__managerApi={db,calls,storage:async(owner,command)=>{
 calls.push({owner,command});
 if(command.action==='admin-copy')return Response.json({id:'new-copy',revision:1});
 return Response.json({projects:[{id:'source',name:'Станция',ownerId:'owner',algorithmId:'pump-station'}],ownerIds:['owner'],algorithmIds:['pump-station'],total:1,next:null});
}};
const base=new URL('../app/',import.meta.url);
const api=await loadTs(new URL('api/admin/projects/route.ts',base),{
 [new URL('auth-server.ts',base).href]:`export const currentUser=async r=>r.headers.has('x-role')?{id:'actor',role:r.headers.get('x-role')}:null;export const db=()=>globalThis.__managerApi.db;export const json=(v,status=200,headers={})=>Response.json(v,{status,headers});`,
 [new URL('release-server.ts',base).href]:`export const guardDisabledBetaFeature=async r=>r.headers.has('x-beta')?Response.json({error:'beta'},{status:403}):null;`,
 [new URL('project-storage-server.ts',base).href]:`export const storageOperation=(owner,command)=>globalThis.__managerApi.storage(owner,command);`,
 [new URL('node-tools/storage-server.ts',base).href]:`export const initializeAlgorithms=async()=>{};`
});
const request=(method,role,body,path='',headers={})=>new Request('http://localhost/api/admin/projects'+path,{method,headers:{...(role?{'x-role':role}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
test('only admin can list and copy; cross-origin and beta copy requests are denied before storage',async()=>{
 calls.length=0;
 for(const role of [undefined,'base','plus','pro'])for(const method of ['GET','POST'])assert.equal((await api[method](request(method,role,method==='POST'?{id:'source'}:undefined))).status,role?403:401);
 assert.equal((await api.POST(request('POST','admin',{id:'source'},'',{origin:'https://other.test'}))).status,403);
 assert.equal((await api.POST(request('POST','admin',{id:'source'},'',{'sec-fetch-site':'cross-site'}))).status,403);
 assert.equal((await api.GET(request('GET','admin',undefined,'',{'x-beta':'1'}))).status,403);
 assert.equal(calls.length,0);
});
test('filters go to storage and metadata contains owner and algorithm labels without project contents',async()=>{
 const response=await api.GET(request('GET','admin',undefined,'?q=CDM&user=owner&algorithm=future&offset=25'));
 assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
 assert.deepEqual(calls.at(-1),{owner:'actor',command:{action:'admin-list',admin:true,query:'CDM',userId:'owner',algorithmId:'future',offset:25}});
 const data=await response.json();assert.equal(data.projects[0].owner.name,'Пользователь');assert.equal(data.projects[0].algorithm.name,'Насосная установка');assert.equal(data.algorithms.length,2);
});
test('copy target owner and privilege are derived from session, never from request body',async()=>{
 const response=await api.POST(request('POST','admin',{id:'source',revision:7,operation:'op',owner:'victim',admin:false,config:{malicious:true}}));assert.equal(response.status,200);
 assert.deepEqual(calls.at(-1),{owner:'actor',command:{action:'admin-copy',admin:true,id:'source',revision:7,operation:'op'}});
 assert.equal((await api.POST(request('POST','admin',{payload:'x'.repeat(5000)}))).status,413);
});
test.after(()=>{sql.close();delete globalThis.__managerApi;});
