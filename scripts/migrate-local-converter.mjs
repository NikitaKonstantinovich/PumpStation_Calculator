import {DatabaseSync} from 'node:sqlite';
import {constants,createReadStream} from 'node:fs';
import {mkdir,copyFile,realpath} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {connectStore,transaction} from '../services/local-storage/store.mjs';
if(!process.argv[2]||!process.env.MODEL_CONVERTER_STATE)throw new Error('Нужны исходный каталог конвертера и MODEL_CONVERTER_STATE');
const src=resolve(process.argv[2]), dst=resolve(process.env.MODEL_CONVERTER_STATE,'assets');
await mkdir(dst,{recursive:true});
const sqlite=new DatabaseSync(join(src,'jobs.sqlite'),{readOnly:true});
const pool=await connectStore();
try{
  await transaction(pool,async db=>{
    sqlite.exec('BEGIN');
    await db.query('CREATE SCHEMA IF NOT EXISTS cad_worker;CREATE TABLE IF NOT EXISTS cad_worker.jobs(id text primary key,owner text,project text,request text,created double precision,body text,unique(owner,request));CREATE TABLE IF NOT EXISTS cad_worker.assets(hash text primary key,body text)');
    const assets=sqlite.prepare('SELECT hash,body FROM assets').all();
    for(const row of assets){
      const info=JSON.parse(row.body);
      assert.equal(basename(info.filename),info.filename);
      const source=await realpath(join(src,'assets',info.filename));
      assert.equal(dirname(source),await realpath(join(src,'assets')));
      const dest=join(dst,info.filename);
      try{await copyFile(source,dest,constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;}
      const h=createHash('sha256');for await(const block of createReadStream(dest))h.update(block);
      assert.equal(h.digest('hex'),info.assetHash);
      await db.query('INSERT INTO cad_worker.assets VALUES($1,$2) ON CONFLICT DO NOTHING',[row.hash,row.body]);
      const stored=await db.query('SELECT body FROM cad_worker.assets WHERE hash=$1',[row.hash]);
      assert.deepEqual(JSON.parse(stored.rows[0].body),info);
    }
    const jobs=sqlite.prepare('SELECT id,owner,project,request,created,body FROM jobs').all();
    for(const j of jobs){
      await db.query('INSERT INTO cad_worker.jobs VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING',[j.id,j.owner,j.project,j.request,j.created,j.body]);
      const {rows:[row]}=await db.query('SELECT owner,request FROM cad_worker.jobs WHERE id=$1',[j.id]);
      assert.equal(row.owner,j.owner);assert.equal(row.request,j.request);
    }
    sqlite.exec('COMMIT');
    console.log('Проверено моделей конвертера:',assets.length,'заданий:',jobs.length);
  });
}finally{sqlite.close();await pool.end();}
