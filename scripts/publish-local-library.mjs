import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,constants} from 'node:fs';
import {mkdir,readFile,copyFile,link,unlink,writeFile,stat,realpath,rename} from 'node:fs/promises';
import {basename,dirname,join,resolve,extname,relative,isAbsolute} from 'node:path';
import {connectStore,transaction} from '../services/local-storage/store.mjs';

const target=process.env.PROJECT_MODEL_LIBRARY;
if(!target||!isAbsolute(target))throw new Error('PROJECT_MODEL_LIBRARY должен быть абсолютным путём к постоянной библиотеке');
const root=await realpath(process.argv[2]??'..'), input=resolve('public/model-assets');
let manifestBytes=await readFile(join(input,'manifest.json')),libraryBytes=await readFile(join(input,'library.json'));
const manifest=JSON.parse(manifestBytes),library=JSON.parse(libraryBytes);
let remapped=false;
const hash=async path=>{const h=createHash('sha256');for await(const block of createReadStream(path))h.update(block);return h.digest('hex');};
const inside=(dir,path)=>{const rel=relative(dir,path);if(isAbsolute(rel)||rel.startsWith('..'))throw new Error('Путь вне исходной библиотеки');};
const seen=new Set();
async function publish(source,destination,expected) {
  if(!/^[0-9a-f]{64}$/.test(expected))throw new Error('Некорректная контрольная сумма');
  const dest=join(target,destination),key=dest+expected;
  if(seen.has(key))return;
  await mkdir(dirname(dest),{recursive:true});
  try {await stat(dest);if(await hash(dest)!==expected){const error=new Error('Файл назначения имеет другое содержание: '+dest);error.code='VERSION_CONFLICT';throw error;}}
  catch(error){
    if(error.code!=='ENOENT')throw error;
    const tmp=dest+'.'+randomUUID()+'.tmp';
    try{
      await copyFile(source,tmp,constants.COPYFILE_EXCL);
      if(await hash(tmp)!==expected)throw new Error('Исходный файл отличается от каталога: '+source);
      await link(tmp,dest);
    } finally {await unlink(tmp).catch(()=>{});}
  }
  seen.add(key);
}
await mkdir(target,{recursive:true});
const models=[...library.models.map(x=>[x.id,x]),...Object.entries(manifest.profiles).map(([k,v])=>['pump:'+k,v]),...Object.entries(manifest.equipment)];
const records=[];
for(const [id,m] of models){
  const source=await realpath(resolve(root,m.source)); inside(root,source);
  const sourcePath='sources/'+m.sourceHash+extname(source).toLowerCase();
  await publish(source,sourcePath,m.sourceHash);
  let mesh=null;
  if(m.meshUrl){
    mesh=basename(m.meshUrl);
    const sourceMesh=join(input,mesh);
    try {await publish(sourceMesh,mesh,m.meshHash);}
    catch(e){
      if(e.code!=='VERSION_CONFLICT')throw e;
      mesh='mesh-'+m.meshHash+'.stl';
      await publish(sourceMesh,mesh,m.meshHash);
      m.meshUrl='/model-assets/'+mesh;
      remapped=true;
    }
  }
  records.push([id,mesh,m.meshHash??null,sourcePath,m.sourceHash,m.units??'unknown',JSON.stringify(m.ports??[]),JSON.stringify(m)]);
}
if(remapped){manifestBytes=Buffer.from(JSON.stringify(manifest));libraryBytes=Buffer.from(JSON.stringify(library));}
const release=createHash('sha256').update(manifestBytes).update(libraryBytes).digest('hex');
for(const [name,bytes] of [['manifest',manifestBytes],['library',libraryBytes]]){
  const path=join(target,name+'-'+release+'.json');
  try {await writeFile(path,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||!(await readFile(path)).equals(bytes))throw e;}
}
const pool=await connectStore();
try{await transaction(pool,async db=>{
  for(const [id,...fields] of records)await db.query('INSERT INTO model_versions VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING',[id,release,...fields]);
  await db.query('INSERT INTO model_releases(version) VALUES($1) ON CONFLICT DO NOTHING',[release]);
  await db.query('UPDATE project_revisions SET model_release=$1 WHERE model_release IS NULL',[release]);
});}finally{await pool.end();}
for(const [name,bytes] of [['manifest',manifestBytes],['library',libraryBytes]]){
  const current=join(target,name+'.json'),temp=current+'.'+randomUUID()+'.tmp';
  await writeFile(temp,bytes);
  await rename(temp,current);
}
console.log('Библиотека опубликована:',release,'профилей:',records.length);
