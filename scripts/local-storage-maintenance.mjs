import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {access,cp,mkdir,open,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {basename,isAbsolute,join,relative,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {connectStore,transaction} from '../services/local-storage/store.mjs';

const [mode,archiveArg]=process.argv.slice(2);
if(!['backup','restore','export'].includes(mode)||!archiveArg)throw new Error('backup|restore|export <путь>');
const archive=resolve(archiveArg);
const tables=['projects','model_releases','project_revisions','project_save_receipts','model_versions','calculation_jobs','cad_worker.jobs','cad_worker.assets'];
const required=name=>{if(!process.env[name])throw new Error('Задайте '+name);return resolve(process.env[name]);};
const exists=async p=>{try{await access(p);return true;}catch(e){if(e.code!=='ENOENT')throw e;return false;}};
function separate(a,b){for(const [x,y] of [[a,b],[b,a]]){const rel=relative(x,y);if(!isAbsolute(rel)&&!rel.startsWith('..'))throw new Error('Пути архива и рабочих данных должны быть раздельными');}}
async function checksum(path){const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');}
const pool=await connectStore();
try {
  if(mode==='export'){
    await mkdir(archive,{recursive:false});
    const ids=await pool.query('SELECT id,owner_id FROM projects WHERE deleted_at IS NULL ORDER BY id');
    const index=[];
    for(const p of ids.rows){
      const {rows:[row]}=await pool.query('SELECT r.config,r.model_release FROM projects p JOIN project_revisions r ON p.id=r.project_id AND p.head=r.revision WHERE p.id=$1',[p.id]);
      if(row.model_release)row.config.project.modelLibraryVersion=row.model_release;
      const filename=randomUUID()+'.json';
      await writeFile(join(archive,filename),JSON.stringify(row.config));
      index.push({...p,filename});
    }
    await writeFile(join(archive,'index.json'),JSON.stringify(index,null,2));
  }else{
    const library=required('PROJECT_MODEL_LIBRARY'),state=required('PROJECT_STATE_DIR');
    const converter=process.env.MODEL_CONVERTER_STATE && resolve(process.env.MODEL_CONVERTER_STATE);
    for(const dir of [library,state,...(converter?[converter]:[])])separate(archive,dir);
    if(mode==='backup'){
      await mkdir(archive,{recursive:false});
      const counts={};
      await transaction(pool,async db=>{
        await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        if(!converter && (await db.query("SELECT to_regclass('cad_worker.assets') AS t")).rows[0].t){
          throw new Error('Укажите MODEL_CONVERTER_STATE для копирования подготовленных STL');
        }
        for(const table of tables){
          if(!(await db.query('SELECT to_regclass($1) AS t',[table])).rows[0].t)continue;
          const file=await open(join(archive,table+'.jsonl'),'wx');
          counts[table]=0;
          try{
            await db.query('DECLARE dump_cursor CURSOR FOR SELECT row_to_json(t)::text AS value FROM '+table+' t');
            for(;;){
              const {rows}=await db.query('FETCH 10 FROM dump_cursor');
              if(!rows.length)break;
              await file.writeFile(rows.map(r=>r.value+'\n').join(''));counts[table]+=rows.length;
            }
            await db.query('CLOSE dump_cursor');
          }finally{await file.close();}
        }
      });
      const d1=join(state,'v3/d1/miniflare-D1DatabaseObject');
      await mkdir(join(archive,'d1'));
      const sqliteFiles=(await readdir(d1)).filter(n=>n.endsWith('.sqlite'));
      if(!sqliteFiles.length)throw new Error('В профиле нет локальной D1');
      for(const file of sqliteFiles){
        const db=new DatabaseSync(join(d1,file),{readOnly:true});
        try{db.prepare('VACUUM INTO ?').run(join(archive,'d1',file));}finally{db.close();}
      }
      await cp(library,join(archive,'library'),{recursive:true,errorOnExist:true,force:false});
      if(converter)await cp(converter,join(archive,'converter'),{recursive:true});
      const hashes={};
      for(const name of Object.keys(counts))hashes[name]=await checksum(join(archive,name+'.jsonl'));
      await writeFile(join(archive,'backup.json'),JSON.stringify({version:1,counts,hashes,sqliteFiles,converter:Boolean(converter)},null,2));
    }else{
      const meta=JSON.parse(await readFile(join(archive,'backup.json'),'utf8'));
      if(meta.version!==1 || !Number.isSafeInteger(meta.counts.projects) || !meta.sqliteFiles.every(n=>typeof n==='string' && basename(n)===n && n.endsWith('.sqlite')))throw new Error('Некорректная копия');
      if(meta.converter && !converter)throw new Error('Для восстановления подготовленных моделей нужен MODEL_CONVERTER_STATE');
      for(const path of [state,library,...(meta.converter?[converter]:[])])if(await exists(path))throw new Error('Восстановление требует нового каталога: '+path);
      await transaction(pool,async db=>{
        for(const table of tables){
          const schema=(await db.query('SELECT to_regclass($1) AS t',[table])).rows[0].t;
          if(schema && (await db.query('SELECT 1 FROM '+table+' LIMIT 1')).rowCount)throw new Error('Для восстановления нужна отдельная пустая база');
        }
        if('cad_worker.jobs' in meta.counts){
          await db.query('CREATE SCHEMA IF NOT EXISTS cad_worker; CREATE TABLE IF NOT EXISTS cad_worker.jobs(id text primary key, owner text,project text, request text,created double precision,body text, UNIQUE(owner,request)); CREATE TABLE IF NOT EXISTS cad_worker.assets(hash text primary key,body text)');
        }
        for(const table of tables.filter(t=>t in meta.counts)){
          const path=join(archive,table+'.jsonl');
          if(await checksum(path)!==meta.hashes[table])throw new Error('Повреждена таблица '+table);
          let count=0;
          for await(const line of createInterface({input:createReadStream(path),crlfDelay:Infinity})){
            await db.query('INSERT INTO '+table+' SELECT * FROM json_populate_record(NULL::'+table+',$1::json)',[line]);count++;
          }
          if(count!==meta.counts[table])throw new Error('Не совпало количество строк '+table);
        }
        await cp(join(archive,'library'),library,{recursive:true});
        if(meta.converter)await cp(join(archive,'converter'),converter,{recursive:true});
        const d1=join(state,'v3/d1/miniflare-D1DatabaseObject');
        await mkdir(d1,{recursive:true});
        for(const name of meta.sqliteFiles)await cp(join(archive,'d1',name),join(d1,name));
        const {rows}=await db.query('SELECT DISTINCT mesh_path,mesh_hash,source_path,source_hash FROM model_versions');
        const checked=new Set();
        for(const row of rows)for(const [file,digest] of [[row.mesh_path,row.mesh_hash],[row.source_path,row.source_hash]]){
          if(!file||checked.has(file+digest))continue;
          const path=resolve(library,file);
          if(relative(library,path).startsWith('..')||isAbsolute(relative(library,path))||!(await stat(path)).isFile()||await checksum(path)!==digest)throw new Error('Проверка файла не пройдена: '+file);
          checked.add(file+digest);
        }
        if(meta.converter && 'cad_worker.assets' in meta.counts){
          const assets=(await db.query('SELECT body FROM cad_worker.assets')).rows;
          for(const asset of assets){
            const {filename,assetHash}=JSON.parse(asset.body);
            if(basename(filename)!==filename || await checksum(join(converter,'assets',filename))!==assetHash)throw new Error('Повреждена модель конвертера');
          }
        }
        for(const {version} of (await db.query('SELECT version FROM model_releases')).rows){
          if(!/^[0-9a-f]{64}$/.test(version))throw new Error('Повреждён идентификатор библиотеки');
          const digest=createHash('sha256');
          for(const name of ['manifest','library']){
            for await(const chunk of createReadStream(join(library,name+'-'+version+'.json')))digest.update(chunk);
          }
          if(digest.digest('hex')!==version)throw new Error('Не совпала версия CAD-каталога '+version);
        }
      });
    }
  }
  console.log(mode,'OK',archive);
}finally{await pool.end();}
