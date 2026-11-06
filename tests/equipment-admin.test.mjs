import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, readdir, mkdir, writeFile, rm, unlink } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { loadTs } from './load-ts.mjs';
import { pumpFileService } from '../services/local-storage/pump-files.mjs';
import { equipmentAssetService } from '../services/local-storage/equipment-assets.mjs';

const model=await loadTs(new URL('../app/equipment-admin.ts',import.meta.url));
const {withEquipmentCadSources}=await loadTs(new URL('../app/equipment-cad-sources.ts',import.meta.url));
test('catalogue files reuse exact CAD registry identities, including valves and native instrument models',async()=>{
  const registry=JSON.parse(await readFile('data/line-valve-registry.json','utf8'));
  for(const source of registry.models){
    const row=withEquipmentCadSources(model.genericEquipment('equipment','valves','Арматура',{id:source.key.slice('equipment:'.length),name:'Позиция'}));
    assert.ok(row.cadModels.some(file=>file.path===source.source&&file.hash===source.sourceHash),source.key);
    assert.ok(row.values['Исходные CAD-модели'].length);
  }
  for(const id of ['кипиа-004-r0028','резьбовые-фитинги-003-r0235','мембранный-бак-001-r0006','шаровые-краны-002-r0203']){
    const row=withEquipmentCadSources(model.genericEquipment('equipment','other','Прочее',{id,name:id}));
    assert.ok(row.cadModels.some(file=>model.cadSource(file.path)),id);
  }
  const unknown=withEquipmentCadSources(model.genericEquipment('equipment','valves','Затворы',{id:'unmapped-valve',name:'017W DN50'}));
  assert.equal(unknown.cadModels,undefined,'names must not bind an unrelated CAD file');
});

test('registered CAD is downloadable, resolves published originals and selects an existing alternative',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'equipment-cad-'));
  const equipmentRoot=join(directory,'Equipment'),publicRoot=join(directory,'public'),sources=join(directory,'sources');
  for(const folder of [equipmentRoot,publicRoot,sources])await mkdir(folder);
  const payload=Buffer.from('ISO-10303-21;\nEND-ISO-10303-21;'),hash='b'.repeat(64),opened=[];
  await writeFile(join(equipmentRoot,'valve.stp'),payload);await writeFile(join(sources,hash+'.sldprt'),payload);
  const service=equipmentAssetService({equipmentRoot,publicRoot,manifestPath:join(directory,'manifest.json'),allowReveal:true,platform:'win32',reveal:async path=>opened.push(path)});
  const valve={key:'equipment:valve',kind:'model',models:[{path:'Equipment/missing.stp'},{path:'Equipment/valve.stp',note:'Модель серии'}]};
  const published={key:'equipment:instrument',kind:'model',models:[{path:'Equipment/missing-instrument.SLDPRT',hash}]};
  const call=(route,body)=>service(new Request('http://internal/'+route,{method:'POST',body:JSON.stringify(body)}));
  try{
    const info=await(await call('inspect',{candidates:[valve,published,{key:'preview',kind:'model',models:[{path:'/preview.stl'}]}]})).json();
    assert.deepEqual(info.files.map(file=>file.available),[true,true,false]);
    assert.equal(info.files[0].note,'Модель серии');assert.equal(info.files[1].name,'missing-instrument.SLDPRT');
    assert.equal(info.files[1].path,join(sources,hash+'.sldprt'));
    const download=await call('download',valve);assert.deepEqual(Buffer.from(await download.arrayBuffer()),payload);
    assert.equal(download.headers.get('X-Equipment-File-Name'),'valve.stp');
    assert.equal((await call('location',{...valve,reveal:true})).status,200);assert.equal(opened.pop(),join(equipmentRoot,'valve.stp'));
    await unlink(join(equipmentRoot,'valve.stp'));
    assert.equal((await(await call('inspect',{candidates:[valve]})).json()).files[0].available,false);
    assert.equal((await call('download',valve)).status,404);
    const escaped=await(await call('inspect',{candidates:[{key:'escape',kind:'model',models:[{path:'Equipment/../sources/'+hash+'.sldprt',hash}]}]})).json();
    assert.equal(escaped.files[0].available,false);
  }finally{assert.equal(dirname(resolve(directory)),resolve(tmpdir()));await rm(directory,{recursive:true,force:true});}
});

test('native catalogue bindings include stamped flanges, gaskets, collars and exact hardware configurations',()=>{
  const row=(id,name,fields=[],catalogId='метизы',extra={})=>model.genericEquipment('equipment',catalogId,catalogId,{id,name,catalogId,fields:fields.map(([label,value])=>({headerPath:[label],value})),...extra});
  const bolt=withEquipmentCadSources(row('bolt','Болт М16х50 DIN933 Ц 8,8',[["Диаметр резьбы, мм",16],["Длина болта, мм",50]]));
  assert.equal(bolt.cadModels[0].configuration,'Болт M16x50 DIN933');
  assert.match(bolt.cadModels[0].path,/SLDPRT$/);
  assert.equal(bolt.values['Исходные CAD-модели'][0]['Конфигурация SolidWorks'],'Болт M16x50 DIN933');
  assert.equal(withEquipmentCadSources(row('bolt','Болт М16х51 DIN933 Ц 8,8',[["Диаметр резьбы, мм",16],["Длина болта, мм",51]])).cadModels,undefined);
  assert.equal(withEquipmentCadSources(row('bolt','Болт М16х51 DIN933 Ц 8,8',[["Диаметр резьбы, мм",16],["Длина болта, мм",50]])).cadModels,undefined,'conflicting names and dimensions must not pick a different size');
  assert.equal(withEquipmentCadSources(row('bolt','Болт М16х50 DIN912 Ц 8,8',[["Диаметр резьбы, мм",16],["Длина болта, мм",50]])).cadModels,undefined);
  assert.equal(withEquipmentCadSources(row('bolt','Болт М16х50 DIN933 AISI304',[["Диаметр резьбы, мм",16],["Длина болта, мм",50]])).cadModels,undefined);
  const stud=withEquipmentCadSources(row('stud','Шпилька М16х130 Ц 8,8',[["Диаметр резьбы, мм",16],["Длина болта, мм",130]]));
  assert.match(stud.cadModels[0].path,/М16 L=130мм/,'legacy stud rows store length in the bolt-length column');
  const nut=withEquipmentCadSources(row('nut','Гайка М16 DIN934 Ц 8,8',[["Диаметр резьбы, мм",16],["Ширина, мм",13]]));
  assert.equal(nut.cadModels[0].configuration,'Гайка M16 DIN 934');
  assert.match(nut.cadModels[0].note,/14\.8 мм, в каталоге 13 мм/,'a known source remains available with its dimension discrepancy visible');
  for(const id of ['фланцы-006-r0114','воротники-001-r0013','прокладки-001-r0012'])assert.ok(withEquipmentCadSources(row(id,id,[],'other')).cadModels?.length,id);
  const flange=withEquipmentCadSources(row('фланцы-006-r0114','Фланец',[],'фланцы'));
  assert.match(flange.cadModels[0].path,/Штампованные/,'use the accepted stamped source instead of the old flat flange');
  assert.equal(withEquipmentCadSources(row('фланцы-006-r0110','Фланец',[],'фланцы')).cadModels,undefined,'a rejected stock shape must not get the old flat CAD');
});

test('audited filesystem matches keep equipment identity and manufacturer guards',async()=>{
  const index=JSON.parse(await readFile('data/equipment-cad-bindings.json','utf8'));
  assert.ok(index.bindings.some(row=>row.key.startsWith('pump:')));
  assert.ok(index.bindings.some(row=>row.key.startsWith('equipment:фланцы-')));
  for(const binding of index.bindings){
    const [prefix,...id]=binding.key.split(':');
    const input=model.genericEquipment(prefix,'test','test',{id:id.join(':'),name:binding.name,manufacturer:binding.manufacturer});
    assert.deepEqual(withEquipmentCadSources(input).cadModels,binding.models);
    assert.equal(withEquipmentCadSources({...input,name:'Другая модель'}).cadModels,undefined);
    assert.equal(withEquipmentCadSources({...input,values:{...input.values,manufacturer:'Другой производитель'}}).cadModels,undefined);
  }
});
test('complete records preserve zero, false, nested values and inactive rows; filters sort numerically',()=>{
  const rows=[model.genericEquipment('equipment','fittings','Фитинги',{id:'a',family:'Фланец',active:false,price:0,fields:[{column:'B',headerPath:['DN'],value:0},{column:'C',headerPath:['Допуск'],value:false}],nested:{deep:[1,2]}}),model.genericEquipment('equipment','fittings','Фитинги',{id:'b',name:'Фланец 2',price:10})];
  assert.equal(rows[0].values.DN,0);assert.equal(rows[0].values['Допуск'],false);assert.equal(rows[0].active,false);assert.equal(rows[0].incomplete,false);
  assert.deepEqual(rows[0].values.nested,{deep:[1,2]});assert.equal(model.equipmentValue(false),'Нет');assert.equal(model.equipmentValue(0),'0');assert.equal(model.equipmentValue(null),'—');
  const options={search:'',field:'',value:'',status:'all',sort:'price',descending:false};
  assert.equal(model.filterEquipment(rows,options)[0].key,'equipment:a');assert.equal(model.filterEquipment(rows,{...options,status:'inactive'}).length,1);
  assert.equal(model.filterEquipment(rows,{...options,field:'Допуск',value:'нет'}).length,1);
  for(const path of ['pump.glb','preview.stl','pump.obj'])assert.equal(model.cadSource(path),false);
  for(const path of ['pump.SLDPRT','assembly.zip','pump.step'])assert.equal(model.cadSource(path),true);
});

test('admin catalog uses real categories, durable attachments, access control and safe local file locations',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'equipment-admin-')),sqlite=new DatabaseSync(':memory:');
  const publicRoot=resolve('public'),equipmentRoot=join(directory,'Equipment'),uploaded=join(directory,'uploads'),manifestPath=join(directory,'manifest.json');
  await mkdir(equipmentRoot);await writeFile(join(equipmentRoot,'pump.step'),'ISO-10303-21;\nEND-ISO-10303-21;');
  await writeFile(manifestPath,JSON.stringify({profiles:{'706':{source:'Equipment/pump.step'}},equipment:{}}));
  for(const name of (await readdir('drizzle')).filter(name=>name.endsWith('.sql')).sort())sqlite.exec(await readFile(join('drizzle',name),'utf8'));
  const database={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return sqlite.prepare(sql).get(...args)??null;},async all(){return {success:true,results:sqlite.prepare(sql).all(...args)};},async run(){const result=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  const opened=[];
  const locationOptions={allowReveal:true,platform:'win32',reveal:async path=>opened.push(path)};
  let store=pumpFileService(uploaded,locationOptions);
  const originals=equipmentAssetService({equipmentRoot,publicRoot,manifestPath,...locationOptions});
  const env={ASSETS:{async fetch(request){try{const path=new URL(request.url).pathname,data=await readFile(resolve(publicRoot,'.'+path));return new Response(request.method==='HEAD'?null:data,{headers:{'Content-Type':path.endsWith('.json')?'application/json':'application/octet-stream','Content-Length':String(data.length)}});}catch{return new Response(null,{status:404});}}},PUMP_FILES:{fetch:(url,init)=>store(new Request(url,{...init,...(init?.body?{duplex:'half'}:{})}))},EQUIPMENT_ASSETS:{fetch:(url,init)=>originals(new Request(url,init))}};
  globalThis.__equipmentAdmin={database,user:null,env};
  const authUrl=new URL('../app/auth-server.ts',import.meta.url),catalogUrl=new URL('../app/equipment-catalog-server.ts',import.meta.url),fileUrl=new URL('../app/equipment-files-server.ts',import.meta.url),storageUrl=new URL('../app/pump-file-storage-server.ts',import.meta.url);
  const replacements={
    [authUrl.href]:'export const db=()=>globalThis.__equipmentAdmin.database;export const currentUser=async()=>globalThis.__equipmentAdmin.user;export const json=(body,status=200,headers)=>Response.json(body,{status,headers});',
  };
  for(const url of [catalogUrl,fileUrl,storageUrl])replacements[url.href]=(await readFile(url,'utf8')).replace('import { env } from "cloudflare:workers";','const env=globalThis.__equipmentAdmin.env;');
  const catalog=await loadTs(new URL('../app/api/admin/equipment/route.ts',import.meta.url),replacements),files=await loadTs(new URL('../app/api/admin/equipment/files/route.ts',import.meta.url),replacements);
  const getCatalog=()=>catalog.GET(new Request('http://localhost/api/admin/equipment'));
  const action=(body,headers={},origin='http://localhost')=>files.POST(new Request(origin+'/api/admin/equipment/files',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}));
  const put=(key,kind,name,body,headers={})=>{
    const request=new Request('http://localhost'+model.equipmentFileUrl(key,kind),{method:'PUT',headers:{'X-File-Name':encodeURIComponent(name),'X-File-Size':String(body.length),...headers},body});
    // Reproduce the framework's cross-realm Request: not constructible as a native Request input.
    return files.PUT({url:request.url,method:request.method,headers:request.headers,body:request.body,get bodyUsed(){return request.bodyUsed;}});
  };
  const get=(key,kind,method='GET')=>files[method](new Request('http://localhost'+model.equipmentFileUrl(key,kind),{method}));
  try{
    assert.equal((await getCatalog()).status,401);assert.equal((await action({action:'inspect',keys:[]})).status,401);
    for(const role of ['base','plus','pro']){
      globalThis.__equipmentAdmin.user={id:role,role};
      assert.equal((await getCatalog()).status,403);assert.equal((await get('pump:706','model')).status,403);assert.equal((await get('pump:706','model','HEAD')).status,403);
      assert.equal((await put('pump:706','model','x.step',Buffer.from('x'))).status,403);assert.equal((await action({action:'reveal',key:'pump:706'})).status,403);
    }
    globalThis.__equipmentAdmin.user={id:'admin',role:'admin'};
    const response=await getCatalog();assert.equal(response.status,200,await response.clone().text());const data=await response.json();
    const source=JSON.parse(await readFile('public/binding-components.json','utf8'));
    const existingKeys=new Set(data.rows.map(row=>row.key));
    for(const item of source.items)assert.ok(existingKeys.has('equipment:'+item.id),item.id);
    assert.equal(data.rows.filter(row=>row.pump).length,JSON.parse(await readFile('public/pumps.json','utf8')).length);
    for(const item of source.catalogs)assert.ok(data.rows.some(row=>row.category==='binding:'+item.id),item.id);
    assert.ok(data.rows.some(row=>row.category==='cabinets'));assert.ok(data.rows.some(row=>row.category.startsWith('electrical:')));
    const part=data.rows.find(row=>row.category==='binding:затворы').key;
    let inspected=await (await action({action:'inspect',keys:['pump:706',part]})).json();assert.equal(inspected.files['pump:706'].model.available,true);assert.equal(inspected.files[part].model.available,false);
    assert.match(await (await get('pump:706','model')).text(),/ISO-10303/);
    assert.equal((await action({action:'reveal',key:'pump:706'})).status,200);assert.equal(opened.pop(),join(equipmentRoot,'pump.step'));
    assert.equal((await action({action:'reveal',key:'pump:706'}, {},'https://remote.example')).status,409);
    assert.equal((await action({action:'inspect',keys:[]},{origin:'https://other.test'})).status,403);
    assert.equal((await put(part,'drawing','x.pdf',Buffer.from('%PDF-1.4'))).status,400);
    assert.equal((await put(part,'model','x.glb',Buffer.from('glb'))).status,400);
    assert.equal((await put('nonexistent','model','x.step',Buffer.from('x'))).status,404);
    const step=Buffer.from('ISO-10303-21;\nEND-ISO-10303-21;'),pdf=Buffer.from('%PDF-1.4\nfixture');
    const saved=await put(part,'model','Valve.STEP',step);assert.equal(saved.status,201,await saved.clone().text());
    const savedFile=(await saved.json()).file;
    assert.equal((await put('pump:706','drawing','Чертёж.pdf',pdf)).status,201);
    store=pumpFileService(uploaded,locationOptions);
    assert.deepEqual(Buffer.from(await (await get(part,'model')).arrayBuffer()),step);assert.deepEqual(Buffer.from(await (await get('pump:706','drawing')).arrayBuffer()),pdf);
    assert.equal((await get(part,'model','HEAD')).headers.get('Content-Length'),String(step.length));
    assert.match((await get(part,'model')).headers.get('Content-Disposition'),/Valve.STEP/);
    inspected=await (await action({action:'inspect',keys:[part,'pump:706']})).json();assert.equal(inspected.files[part].model.available,true);assert.equal(inspected.files['pump:706'].drawing.available,true);
    assert.equal((await action({action:'reveal',key:part})).status,200);assert.ok(opened.pop().startsWith(uploaded));
    const stored=sqlite.prepare('SELECT storage_key FROM manual_pump_files WHERE id=?').get(savedFile.id);
    await unlink(join(uploaded,stored.storage_key));
    inspected=await (await action({action:'inspect',keys:[part]})).json();assert.equal(inspected.files[part].model.available,false);
    assert.equal((await get(part,'model')).status,404);assert.equal((await action({action:'reveal',key:part})).status,404);
    const outside=await originals(new Request('http://internal/inspect',{method:'POST',body:JSON.stringify({candidates:[{key:'escape',kind:'model',path:'Equipment/../manifest.json'},{key:'escape2',kind:'model',path:'C:/outside.step'}]})}));
    assert.ok((await outside.json()).files.every(file=>!file.available));
    // Real active-import path: inactive values, dates and false must survive joins.
    sqlite.exec("INSERT INTO catalog_imports(id,source_file,source_sha256,source_size_bytes,source_modified_at,imported_at,schema_version,is_active) VALUES(999,'fixture','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1,'now','now',1,1)");
    sqlite.exec("INSERT INTO component_catalogs(id,import_id,source_id,name,source_sheet,sort_order) VALUES(999,999,'fixture','Проверка','Лист',0)");
    sqlite.exec("INSERT INTO component_families(id,catalog_id,source_id,title,source_range) VALUES(999,999,'fixture-table','Семейство','A1:B2')");
    sqlite.exec("INSERT INTO components(id,family_id,source_id,source_row,is_active,display_name) VALUES(999,999,'fixture-part',2,0,'Отключённая позиция')");
    sqlite.exec("INSERT INTO attribute_definitions(id,family_id,source_column,key,label,header_path_json,data_type) VALUES(999,999,'B','flag','Флаг','[\"Флаг\"]','boolean')");
    sqlite.exec("INSERT INTO component_attribute_values(component_id,attribute_definition_id,value_type,boolean_value) VALUES(999,999,'boolean',0)");
    const refreshed=await getCatalog();assert.equal(refreshed.status,200,await refreshed.clone().text());const inactive=(await refreshed.json()).rows.find(row=>row.key==='equipment:fixture-part');
    assert.equal(inactive.active,false);assert.equal(inactive.values['Флаг'],false);
    // The actual full local profile uses published cabinets and has none of
    // the optional configurator tables. Its remaining SQL catalogue is live.
    sqlite.exec('DROP TABLE control_cabinet_items; DROP TABLE control_cabinets; DROP TABLE control_components');
    const publishedResponse=await getCatalog();assert.equal(publishedResponse.status,200,await publishedResponse.clone().text());
    const published=(await publishedResponse.json()).rows;
    const electrical=JSON.parse(await readFile('public/control-cabinet-database.json','utf8'));
    for(const cabinet of electrical.cabinets)assert.ok(published.some(row=>row.key==='control-cabinet:'+cabinet.id),cabinet.id);
    for(const part of electrical.components)assert.ok(published.some(row=>row.key==='control-part:'+part.id),part.id);
    assert.ok(published.some(row=>row.key==='equipment:fixture-part'&&!row.active));
    assert.equal((await action({action:'inspect',keys:['pump:706',part]})).status,200);
    // A partial migration or a database outage must never look like an empty
    // but successfully loaded catalogue.
    sqlite.exec('CREATE TABLE control_cabinets(id TEXT PRIMARY KEY)');
    const previousError=console.error;console.error=()=>{};
    try{assert.equal((await getCatalog()).status,503);}finally{console.error=previousError;}
  }finally{sqlite.close();delete globalThis.__equipmentAdmin;assert.equal(dirname(resolve(directory)),resolve(tmpdir()));await rm(directory,{recursive:true,force:true});}
});

test('CAD bundles retain assemblies and parts and reject incomplete or unsafe ZIP directories',async()=>{
  const files=await loadTs(new URL('../app/equipment-files.ts',import.meta.url));
  function zip(names){
    const entries=[],locals=[];let offset=0;
    for(const name of names){const bytes=Buffer.from(name),local=Buffer.alloc(30+bytes.length+1),entry=Buffer.alloc(46+bytes.length);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(bytes.length,26);local.writeUInt32LE(1,18);local.writeUInt32LE(1,22);bytes.copy(local,30);entry.writeUInt32LE(0x02014b50,0);entry.writeUInt16LE(bytes.length,28);entry.writeUInt32LE(offset,42);bytes.copy(entry,46);locals.push(local);entries.push(entry);offset+=local.length;}
    const directory=Buffer.concat(entries),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(names.length,8);end.writeUInt16LE(names.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,directory,end]);
  }
  const consume=async bytes=>new Response(files.checkedEquipmentStream(new Blob([bytes]).stream(),bytes.length,'zip')).arrayBuffer();
  const good=zip(['Assembly.SLDASM','parts/Body.SLDPRT']);assert.deepEqual(Buffer.from(await consume(good)),good);
  for(const names of [['Assembly.SLDASM'],['preview.glb'],['Assembly.SLDASM','../Body.SLDPRT']])await assert.rejects(()=>consume(zip(names)));
  assert.equal(files.checkEquipmentFile('model','Pack and Go.zip',1024).extension,'zip');assert.throws(()=>files.checkEquipmentFile('model','mesh.glb',100));
});
