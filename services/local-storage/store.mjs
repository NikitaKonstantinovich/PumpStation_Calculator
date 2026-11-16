import pg from 'pg';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

export class StorageError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function numberSetting(value, fallback) {
  const n = Number(value ?? fallback);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error('Ожидалось положительное целое число');
  return n;
}
export async function connectStore(url = process.env.PROJECT_DATABASE_URL) {
  if (!url) throw new Error('Задайте PROJECT_DATABASE_URL для локальной базы проектов');
  if (!['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname)) throw new Error('Локальный профиль требует PostgreSQL на loopback-адресе');
  const pool = new pg.Pool({connectionString:url, max:8, connectionTimeoutMillis:5000});
  pool.on('error',error=>console.error('PostgreSQL: соединение закрыто',error.code??error.name));
  try {
    const schema=new URL('./schema.sql',import.meta.url);
    await pool.query(await readFile(schema,'utf8'));
    return pool;
  } catch (error) { await pool.end(); throw error; }
}
export async function transaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await fn(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
const card = 'id,name,head AS revision,created_at AS "createdAt",updated_at AS "updatedAt"';
const missing = () => new StorageError(404,'Проект или версия не найдены');
export async function readProject(db, owner, id, revision = null) {
  const {rows} = await db.query('SELECT p.id,r.config #>> \'{project,name}\' AS name,r.revision,p.created_at AS "createdAt",r.created_at AS "updatedAt",r.config,r.model_release FROM projects p JOIN project_revisions r ON r.project_id=p.id AND r.revision=coalesce($3,p.head) WHERE p.id=$1 AND p.owner_id=$2 AND p.deleted_at IS NULL',[id,owner,revision]);
  if (!rows[0]) throw missing();
  const file=rows[0];
  if(file.model_release)file.config.project.modelLibraryVersion=file.model_release;
  return file;
}
export async function saveProject(pool, owner, {config, baseRevision, operation, restore}, opts={}) {
  if (!Number.isSafeInteger(baseRevision) || baseRevision < 0 || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(operation ?? '')) throw new StorageError(400,'Некорректная исходная ревизия или операция');
  const id = config.project.id, serialized = JSON.stringify(config);
  if (Buffer.byteLength(serialized)>numberSetting(opts.limit ?? process.env.PROJECT_LIMIT_BYTES,10000000)) throw new StorageError(413,'Превышен предел размера JSON проекта');
  const keep = numberSetting(opts.keep ?? process.env.PROJECT_AUTO_REVISIONS,20);
  const digest = createHash('sha256').update(JSON.stringify([baseRevision, restore ?? null, config])).digest('hex');
  return transaction(pool, async db => {
    if (!baseRevision) await db.query('INSERT INTO projects(id,owner_id,name) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,owner,config.project.name]);
    const {rows:[p]} = await db.query('SELECT head FROM projects WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL FOR UPDATE',[id,owner]);
    if (!p) throw missing();
    const {rows:[receipt]} = await db.query('SELECT revision,digest FROM project_save_receipts WHERE project_id=$1 AND operation=$2',[id,operation]);
    if (receipt) {
      if (receipt.digest!==digest) throw new StorageError(409,'ID операции уже использован для другого изменения');
      return {revision:receipt.revision};
    }
    if (p.head!==baseRevision) throw new StorageError(409,'Проект изменён в другой вкладке. Сохраните копию или откройте актуальную версию.');
    let revision=p.head;
    const {rows:[existing]}=await db.query("SELECT (config #- '{project,updatedAt}') = ($3::jsonb #- '{project,updatedAt}') AS same FROM project_revisions WHERE project_id=$1 AND revision=$2",[id,revision,serialized]);
    if (restore || !existing?.same) {
      revision++;
      await db.query('INSERT INTO project_revisions(project_id,revision,author_id,kind,format,config,model_release) VALUES($1,$2,$3,$4,$5,$6,(SELECT version FROM model_releases WHERE $7::text IS NULL OR version=$7 ORDER BY published_at DESC LIMIT 1))',[id,revision,owner,restore?'restore':'auto',config.schemaVersion,serialized,config.project.modelLibraryVersion??null]);
      await db.query('UPDATE projects SET head=$2,name=$3,updated_at=now() WHERE id=$1',[id,revision,config.project.name]);
      await db.query("DELETE FROM project_revisions WHERE project_id=$1 AND NOT pinned AND revision IN (SELECT revision FROM project_revisions WHERE project_id=$1 AND NOT pinned ORDER BY revision DESC OFFSET $2)",[id,keep]);
    }
    await db.query('INSERT INTO project_save_receipts VALUES($1,$2,$3,$4)',[id,operation,digest,revision]);
    return {revision};
  });
}
export function projectService(pool) {
  return async request => {
    try {
      const {action,owner,id,revision,offset=0,...input}=await request.json();
      if (!owner) throw new StorageError(401,'Требуется вход');
      switch(action) {
        case 'enqueue': {
          await pool.query("DELETE FROM calculation_jobs WHERE state IN ('done','error') AND created_at < now()-interval '1 day'");
          await pool.query("INSERT INTO calculation_jobs(id,owner_id,catalog_version,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",[id,owner,input.catalog.version,JSON.stringify(input)]);
          return Response.json({jobId:id},{status:202});
        }
        case 'poll': {
          const {rows:[job]}=await pool.query("SELECT state,progress,result,error,catalog_version FROM calculation_jobs WHERE id=$1 AND owner_id=$2",[id,owner]);
          if(!job)throw missing();
          return Response.json(job,{status:job.state==='error'?422:job.state==='done'?200:202});
        }
        case 'list': {
          if (!Number.isSafeInteger(offset)||offset<0) throw new StorageError(400,'Некорректная страница');
          const {rows}=await pool.query('SELECT '+card+' FROM projects WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY updated_at DESC,id LIMIT 26 OFFSET $2',[owner,offset]);
          const {rows:[latest]}=await pool.query('SELECT version FROM model_releases ORDER BY published_at DESC LIMIT 1');
          return Response.json({projects:rows.slice(0,25),next:rows.length>25?offset+25:null,modelLibraryVersion:latest?.version});
        }
        case 'load': return Response.json(await readProject(pool,owner,id,revision));
        case 'save': return Response.json(await saveProject(pool,owner,input));
        case 'history': {
          const {rows}=await pool.query('SELECT r.revision,r.kind,r.created_at AS "createdAt",r.pinned FROM project_revisions r JOIN projects p ON p.id=r.project_id WHERE p.id=$1 AND p.owner_id=$2 AND p.deleted_at IS NULL ORDER BY revision DESC',[id,owner]);
          if (!rows.length) throw missing();
          return Response.json({revisions:rows});
        }
        case 'pin': {
          const result=await pool.query('UPDATE project_revisions r SET pinned=$4 FROM projects p WHERE p.id=r.project_id AND p.id=$1 AND p.owner_id=$2 AND r.revision=$3 AND p.deleted_at IS NULL',[id,owner,revision,input.pinned===true]);
          if (!result.rowCount) throw missing();
          return Response.json({ok:true});
        }
        case 'delete': {
          const result=await pool.query('UPDATE projects SET deleted_at=now() WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL AND head=$3',[id,owner,input.baseRevision]);
          if (!result.rowCount) throw new StorageError(409,'Проект изменён или недоступен');
          return Response.json({ok:true});
        }
        default: throw new StorageError(400,'Неизвестная операция');
      }
    } catch (error) {
      if (!(error instanceof StorageError)) console.error('Project storage:',error.code ?? error.name);
      return Response.json({error:error instanceof StorageError?error.message:'Хранилище проектов временно недоступно'},{status:error.status ?? 503});
    }
  };
}
