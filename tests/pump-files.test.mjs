import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { loadTs } from './load-ts.mjs';
import { pumpFileService } from '../services/local-storage/pump-files.mjs';

const files = await loadTs(new URL('../app/pump-files.ts',import.meta.url));
test('file formats, size boundaries and stream length are checked before accepting an attachment',async()=>{
  assert.equal(files.checkPumpFile('model','насос.STEP',100*1024*1024).extension,'step');
  for(const [kind,name,size] of [['image','pump.html',10],['image','pump.png',0],['image','pump.png',20*1024*1024+1],['model','pump.step',100*1024*1024+1]])assert.throws(()=>files.checkPumpFile(kind,name,size));
  const invalid=new Blob(['<html>bad image</html>']).stream();
  await assert.rejects(()=>new Response(files.checkedPumpFileStream(invalid,22,'png')).arrayBuffer());
  await assert.rejects(()=>new Response(files.checkedPumpFileStream(new Blob(['abc']).stream(),4,'stp')).arrayBuffer(),/не завершена/);
});

test('uploads persist outside the build, attach trusted metadata, and remain private after reopening',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pump-files-')),sqlite=new DatabaseSync(':memory:');
  let failInsert=false;
  const database={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return sqlite.prepare(sql).get(...args)??null;},async all(){return {success:true,results:sqlite.prepare(sql).all(...args)};},async run(){if(failInsert&&sql.startsWith('INSERT INTO manual_pump_files'))throw new Error('database fixture failure');const result=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  let service=pumpFileService(directory);
  const storage=(key,method,body,size)=>service(new Request(`http://internal/${key}`,{method,...(body?{body,duplex:'half',headers:{'X-File-Size':String(size)}}:{})}));
  globalThis.__pumpFilesTest={database,user:null,storage};
  const replacements={
    [new URL('../app/auth-server.ts',import.meta.url).href]:'export const db=()=>globalThis.__pumpFilesTest.database;export const currentUser=async()=>globalThis.__pumpFilesTest.user;export const json=(body,status=200,headers)=>Response.json(body,{status,headers});',
    [new URL('../app/pump-file-storage-server.ts',import.meta.url).href]:'export const pumpFileStorage=(...args)=>globalThis.__pumpFilesTest.storage(...args);',
  };
  const upload=await loadTs(new URL('../app/api/pumps/files/route.ts',import.meta.url),replacements),download=await loadTs(new URL('../app/api/pumps/files/[id]/route.ts',import.meta.url),replacements),pumps=await loadTs(new URL('../app/api/pumps/route.ts',import.meta.url),replacements);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7XcAAAAASUVORK5CYII=','base64');
  const send=(kind='image',name='насос.png',body=png,headers={})=>upload.POST(new Request('http://local/api/pumps/files',{method:'POST',headers:{'X-Pump-File-Kind':kind,'X-File-Name':encodeURIComponent(name),'X-File-Size':String(body.length),...headers},body}));
  const get=(id,method='GET')=>download[method](new Request(`http://local/api/pumps/files/${id}`,{method}),{params:Promise.resolve({id})});
  const save=data=>pumps.POST(new Request('http://local/api/pumps',{method:'POST',body:JSON.stringify({data})}));
  try{
    assert.equal((await send()).status,401);
    for(const role of ['base','plus','pro']){globalThis.__pumpFilesTest.user={id:role,role};assert.equal((await send()).status,403);}
    globalThis.__pumpFilesTest.user={id:'admin',role:'admin'};
    assert.equal((await send('image','pump.png',png,{origin:'https://other.test'})).status,403);
    assert.equal((await send('image','pump.html')).status,400);
    assert.equal((await send('model','pump.step',Buffer.from('x'),{'X-File-Size':String(100*1024*1024+1)})).status,413);
    const response=await send();assert.equal(response.status,201,await response.clone().text());const image=(await response.json()).file;
    assert.equal(image.name,'насос.png');assert.equal(image.contentType,'image/png');
    assert.deepEqual(Buffer.from(await (await get(image.id)).arrayBuffer()),png);
    const second=(await (await send()).json()).file;assert.notEqual(image.id,second.id,'same original filename never overwrites an existing file');
    const model=(await (await send('model','Модель насоса.STEP',Buffer.from('ISO-10303-21;\nEND-ISO-10303-21;'))).json()).file;
    const pdf=(await (await send('drawing','Чертёж.pdf',Buffer.from('%PDF-1.4\nfixture'))).json()).file;
    assert.equal((await get(pdf.id)).headers.get('Content-Type'),'application/pdf');
    assert.match((await get(model.id)).headers.get('Content-Disposition'),/^attachment;/);
    const savedResponse=await save({model:'Uploaded pump',imagePath:image.url,drawingPath:pdf.url,modelPath:model.url});
    assert.equal(savedResponse.status,201,await savedResponse.clone().text());const pump=(await savedResponse.json()).record.pump;
    assert.deepEqual(pump.assets.files,{image,drawing:pdf,model});
    assert.equal((await save({model:'Forged pump',modelPath:image.url})).status,400);
    service=pumpFileService(directory);
    assert.deepEqual(Buffer.from(await (await get(image.id)).arrayBuffer()),png,'file survives recreating the storage service');
    globalThis.__pumpFilesTest.user={id:'base',role:'base'};
    assert.equal((await get(image.id)).status,200);assert.equal((await get(image.id,'HEAD')).headers.get('Content-Length'),String(png.length));
    globalThis.__pumpFilesTest.user=null;assert.equal((await get(image.id)).status,401);
    globalThis.__pumpFilesTest.user={id:'admin',role:'admin'};
    const count=sqlite.prepare('SELECT COUNT(*) AS count FROM manual_pump_files').get().count;
    assert.ok((await send('image','bad.png',Buffer.from('not a png file at all'))).status>=400);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM manual_pump_files').get().count,count);
    const before=await readdir(join(directory,'image'));failInsert=true;assert.equal((await send()).status,503);failInsert=false;
    assert.deepEqual(await readdir(join(directory,'image')),before,'failed metadata insert cleans up its file');
    assert.equal((await service(new Request('http://internal/image/../../escape.png'))).status,404);
    sqlite.exec(await readFile(new URL('../drizzle/0013_manual_pump_files.sql',import.meta.url),'utf8'));
  }finally{sqlite.close();delete globalThis.__pumpFilesTest;assert.equal(dirname(resolve(directory)),resolve(tmpdir()));await rm(directory,{recursive:true,force:true});}
});
