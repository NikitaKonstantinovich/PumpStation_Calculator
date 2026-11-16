// Offline administrative migration. Stop the local server and take a SQLite
// backup first; normal online imports use /api/admin/frame-catalog.
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadTs} from '../tests/load-ts.mjs';
const [databasePath,preparedPath,receiptPath]=process.argv.slice(2);
if(!databasePath||!preparedPath||!receiptPath)throw Error('Usage: install-bent-frame-local.mjs <existing database> <prepared algorithm> <receipt>');
const sql=new DatabaseSync(resolve(databasePath));sql.exec('PRAGMA busy_timeout=5000');
class Statement {
 constructor(query,params=[]){this.query=query;this.params=params;}
 bind(...args){return new Statement(this.query,args);}
 async first(){return sql.prepare(this.query).get(...this.params)??null;}
 async all(){return {success:true,results:sql.prepare(this.query).all(...this.params)};}
 async run(){return {success:true,meta:{changes:sql.prepare(this.query).run(...this.params).changes}};}
}
const db={prepare:query=>new Statement(query),async batch(statements){sql.exec('BEGIN IMMEDIATE');try{const rows=[];for(const st of statements)rows.push(await st.run());sql.exec('COMMIT');return rows;}catch(e){sql.exec('ROLLBACK');throw e;}}};
globalThis.__frameMigrationDb=db;
const app=new URL('../app/',import.meta.url),replace={[new URL('auth-server.ts',app).href]:'export const db=()=>globalThis.__frameMigrationDb;'};
try{
 const prepared=JSON.parse(await readFile(preparedPath,'utf8'));
 const algorithms=await loadTs(new URL('node-tools/algorithm-store-server.ts',app),replace);
 const row=await algorithms.algorithmRow(prepared.id);
 if(row.revision!==prepared.revision||row.active!==prepared.active)throw Error('Algorithm changed since preparation; merge again before installing');
 const {compileTools}=await loadTs(new URL('node-tools/compiler.ts',app),replace);
 const program=compileTools(prepared.document,prepared.version);
 const catalog=await loadTs(new URL('frame-calculation/catalog-store-server.ts',app),replace);
 const items=JSON.parse(await readFile(new URL('../data/frame-catalog-import.json',import.meta.url),'utf8')).items;
 const before=await catalog.readFrameCatalog();
 const published=await catalog.publishFrameCatalog(items,before.revision,'Административная подготовка гнутых рам 10.11.2026');
 const version=await algorithms.saveAlgorithmVersion(prepared.id,prepared.revision,prepared.document,program,'Скрытый расчёт гнутой рамы · 10.11.2026');
 const receipt={algorithmId:prepared.id,previousVersion:prepared.active,version,frameToolId:prepared.frameId,catalogVersion:published.version,catalogItems:published.items.length,created:new Date().toISOString()};
 await writeFile(receiptPath,JSON.stringify(receipt,null,2));console.log(receipt);
}finally{delete globalThis.__frameMigrationDb;sql.close();}
