// Targeted transactional import with an SQLite online backup. Immutable historical
// catalogue versions, algorithms and project pins are deliberately preserved.
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {loadTs} from '../tests/load-ts.mjs';
const [databasePath,outputPath]=process.argv.slice(2);
const priceUnpriced=process.argv.includes('--price-unpriced');
if(!databasePath||!outputPath)throw Error('Usage: install-frame-fasteners-local.mjs <existing sqlite> <backup directory>');
const out=resolve(outputPath);await mkdir(out,{recursive:true});
const sql=new DatabaseSync(resolve(databasePath),{open:true});
sql.exec('PRAGMA busy_timeout=5000');
const originalBackup=join(out,'before-fasteners.sqlite');
const backupPath=existsSync(originalBackup)?join(out,`before-fasteners-${Date.now()}.sqlite`):originalBackup;
const saved=spawnSync('python',['-c','import sqlite3,sys,pathlib; src=sqlite3.connect(pathlib.Path(sys.argv[1]).as_uri()+"?mode=ro",uri=True); dst=sqlite3.connect(sys.argv[2]); src.backup(dst); dst.close(); src.close()',resolve(databasePath),backupPath],{encoding:'utf8',windowsHide:true});
if(saved.status!==0)throw Error('Backup failed: '+saved.stderr);
class Statement {
 constructor(query,params=[]){this.query=query;this.params=params;}
 bind(...args){return new Statement(this.query,args);}
 async first(){return sql.prepare(this.query).get(...this.params)??null;}
 async all(){return {success:true,results:sql.prepare(this.query).all(...this.params)};}
 async run(){return {success:true,meta:{changes:sql.prepare(this.query).run(...this.params).changes}};}
}
globalThis.__frameMigrationDb={prepare:query=>new Statement(query),async batch(statements){sql.exec('BEGIN IMMEDIATE');try{const rows=[];for(const st of statements)rows.push(await st.run());sql.exec('COMMIT');return rows;}catch(e){sql.exec('ROLLBACK');throw e;}}};
try{
 const app=new URL('../app/',import.meta.url);
 const catalog=await loadTs(new URL('frame-calculation/catalog-store-server.ts',app),{[new URL('auth-server.ts',app).href]:'export const db=()=>globalThis.__frameMigrationDb;'});
 const before=await catalog.readFrameCatalog();
 await writeFile(join(out,'frame-catalog-before.json'),JSON.stringify(before,null,2));
 const imported=JSON.parse(await readFile(new URL('../data/frame-fasteners-import.json',import.meta.url),'utf8')).items;
 const items=new Map(before.items.map(i=>[i.id,i]));
 for(const item of imported){
   if(items.has(item.id)&&JSON.stringify(items.get(item.id))!==JSON.stringify(item)){
     const prior=items.get(item.id);
     if(!priceUnpriced||prior.prices.length||prior.family!==item.family)throw Error('Existing component differs: '+item.id);
     // Filling empty prices cannot change an existing technical attribute.
     for(const f of prior.fields){
       const next=item.fields.find(n=>n.column===f.column);
       if(f.column==='FRAME_RIVET'){
         if(!next||Object.entries(f.value).some(([key,value])=>JSON.stringify(next.value[key])!==JSON.stringify(value)))throw Error('Rivet specification changed: '+item.id);
       }else if(!next||JSON.stringify(next.value)!==JSON.stringify(f.value))throw Error('Technical field changed: '+item.id+' '+f.column);
     }
   }
   items.set(item.id,item);
 }
 const published=await catalog.publishFrameCatalog([...items.values()],before.revision,priceUnpriced?'Цены по калькуляторам, стойки 1800 мм · 11.11.2026':'Стойки и крепёж насосов · 10.11.2026');
 await writeFile(join(out,'frame-catalog-after.json'),JSON.stringify(published,null,2));
 console.log(JSON.stringify({backup:backupPath,previous:before.version,version:published.version,items:published.items.length,revision:published.revision,added:published.items.length-before.items.length}));
}finally{delete globalThis.__frameMigrationDb;sql.close();}
