import test from 'node:test';
import assert from 'node:assert/strict';
import {engineeringStore} from './fixtures/engineering-store.mjs';

test('large compiled programs are saved atomically in immutable bounded chunks',async()=>{
 const f=await engineeringStore();try{
  const storage=await f.load('node-tools/storage-server');await storage.initializeAlgorithms();
  const api=await f.load('node-tools/algorithm-store-server');
  const state=await storage.toolState();
  const program={version:'test',tools:[],plans:{},note:'Насос 🧰 '.repeat(300000)};
  const version=await api.saveAlgorithmVersion('pump-station',state.revision,state.draft,program,'Тест');
  const saved=JSON.parse((await api.algorithmSnapshot('pump-station',version)).program);
  assert.deepEqual(saved,{...program,version,algorithmId:'pump-station'});
  const header=JSON.parse(f.sql.prepare('SELECT program FROM node_tool_versions WHERE id=?').get(version).program);
  assert.equal(header.storage,'node-program-chunks-v1');
  const chunks=f.sql.prepare('SELECT payload FROM node_program_chunks WHERE version=?').all(version);
  assert.equal(chunks.length,header.chunks);
  for(const chunk of chunks)assert(Buffer.byteLength(chunk.payload)<360010);
  assert.throws(()=>f.sql.prepare('UPDATE node_program_chunks SET payload=? WHERE version=?').run('null',version),/immutable/);
  await assert.rejects(()=>api.saveAlgorithmVersion('pump-station',state.revision,state.draft,program,'Конкурент'),e=>e.status===409);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM node_program_chunks').get().n,chunks.length);
  await assert.rejects(()=>api.algorithmSnapshot('another-product',version),e=>e.status===404);
  const loaded=await storage.toolProgram(version,'pump-station');
  const prepare=f.db.prepare;
  f.db.prepare=query=>{
   assert(!query.includes("node_program_chunks"),"A warm program read must not reload its chunks");
   return prepare(query);
  };
  assert.equal(await storage.toolProgram(version,'pump-station'),loaded);
 }finally{f.close();}
});

test('large legacy programs remain readable without changing their original bytes',async()=>{
 const f=await engineeringStore();try{
  const storage=await f.load('node-tools/storage-server');await storage.initializeAlgorithms();
  const api=await f.load('node-tools/algorithm-store-server');
  const original=JSON.stringify({version:'legacy-big',note:'Насос 🧰 '.repeat(300000)});
  f.sql.prepare('INSERT INTO node_tool_versions(id,document,program,author) VALUES(?,?,?,?)').run('legacy-big','{}',original,'Тест');
  f.sql.prepare('INSERT INTO node_algorithm_versions(id,algorithm_id,number,reason) VALUES(?,?,?,?)').run('legacy-big','pump-station',100,'save');
  const saved=await api.algorithmSnapshot('pump-station','legacy-big');
  assert.equal(saved.program,original);
  const codec=await f.load('node-tools/program-storage-server');
  const archive=codec.prepareProgramStorage('legacy-big',original);
  await f.db.batch(archive.statements);
  f.sql.prepare('INSERT INTO node_program_archives(version,document,header) VALUES(?,?,?)').run('legacy-big','{}',archive.header);
  const prepare=f.db.prepare;
  f.db.prepare=query=>{if(query.includes('s.program')||query.includes('substr(program'))throw Error('D1_ERROR: SQLITE_TOOBIG');return prepare(query);};
  assert.equal((await api.algorithmSnapshot('pump-station','legacy-big')).program,original);
  assert.throws(()=>f.sql.prepare('UPDATE node_program_archives SET document=?').run('{}'),/immutable/);
  assert.equal(f.sql.prepare('SELECT program FROM node_tool_versions WHERE id=?').get('legacy-big').program,original);
 }finally{f.close();}
});
