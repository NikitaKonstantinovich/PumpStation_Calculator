import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { connectStore,transaction } from '../services/local-storage/store.mjs';
import { resolve } from 'node:path';

if (!process.argv[2]) throw new Error('Укажите путь к согласованной копии SQLite');
const source=new DatabaseSync(resolve(process.argv[2]),{readOnly:true});
const pool=await connectStore();
try {
  const projects=source.prepare('SELECT id,user_id,name,created_at,updated_at,config_json FROM user_projects').all();
  await transaction(pool,async db=>{
    for (const p of projects) {
      const config=JSON.parse(p.config_json);
      assert.equal(config.project.id,p.id);
      const created=await db.query("INSERT INTO projects(id,owner_id,name,head,created_at,updated_at) VALUES($1,$2,$3,1,$4,$5) ON CONFLICT DO NOTHING",[p.id,p.user_id,p.name,p.created_at+'Z',p.updated_at+'Z']);
      if (created.rowCount) await db.query("INSERT INTO project_revisions(project_id,revision,author_id,kind,format,created_at,pinned,config) VALUES($1,1,$2,'migration',$3,$4,true,$5)",[p.id,p.user_id,config.schemaVersion,p.updated_at+'Z',p.config_json]);
      const {rows:[first]}=await db.query("SELECT p.owner_id,r.config FROM projects p JOIN project_revisions r ON r.project_id=p.id WHERE p.id=$1 AND r.revision=1 AND r.kind='migration'",[p.id]);
      assert.equal(first?.owner_id,p.user_id);
      assert.deepEqual(first.config,config);
    }
  });
  console.log('Сверены владельцы, ID и содержимое проектов:',projects.length);
} finally { source.close(); await pool.end(); }
