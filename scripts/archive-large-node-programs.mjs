// Run against a backed-up local database with its server stopped. Preserve every
// original immutable version; create a byte-equivalent, D1-readable side archive.
import {DatabaseSync} from 'node:sqlite';
import {loadTs} from '../tests/load-ts.mjs';
const path=process.argv[2];if(!path)throw Error('Database path is required');
const sql=new DatabaseSync(path);sql.exec('PRAGMA busy_timeout=5000');
try{
 const {PROGRAM_STORAGE_SCHEMA}=await loadTs(new URL('../app/node-tools/program-storage-server.ts',import.meta.url),{
  [new URL('../app/auth-server.ts',import.meta.url).href]:'export const db=()=>{throw Error("SQL only migration")};'
 });
 for(const statement of PROGRAM_STORAGE_SCHEMA)sql.exec(statement);
 const rows=sql.prepare('SELECT id,document,program FROM node_tool_versions WHERE length(cast(program AS blob))>1800000 AND NOT EXISTS(SELECT 1 FROM node_program_archives WHERE version=node_tool_versions.id)').all();
 sql.exec('BEGIN IMMEDIATE');
 try{
  for(const row of rows){
   const chunks=Array.from({length:Math.ceil(row.program.length/60000)},(_,i)=>JSON.stringify(row.program.slice(i*60000,(i+1)*60000)));
   const header=JSON.stringify({storage:'node-program-chunks-v1',chunks:chunks.length,length:row.program.length});
   chunks.forEach((chunk,i)=>sql.prepare('INSERT INTO node_program_chunks(version,ordinal,payload) VALUES(?,?,?)').run(row.id,i,chunk));
   sql.prepare('INSERT INTO node_program_archives(version,document,header) VALUES(?,?,?)').run(row.id,row.document,header);
   const read=sql.prepare('SELECT payload FROM node_program_chunks WHERE version=? ORDER BY ordinal').all(row.id).map(x=>JSON.parse(x.payload)).join('');
   if(read!==row.program)throw Error('Archive verification failed');
  }
  sql.exec('COMMIT');console.log({archivedVersions:rows.map(row=>row.id),originalsPreserved:true});
 }catch(error){sql.exec('ROLLBACK');throw error;}
}finally{sql.close();}
