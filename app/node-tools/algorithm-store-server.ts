import { db } from "../auth-server";
import { compileTools } from "./compiler";
import { ToolError } from "./errors";
import { DEFAULT_ALGORITHM, emptyAlgorithm, type Algorithm, type AlgorithmVersion } from "./algorithm-schema";
import type { ToolDocument, ToolProgram } from "./schema";

// Documents own all their type/diagram IDs. No mutable definition is resolved outside a snapshot.
export const ALGORITHM_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS node_algorithms (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE,
    connected INTEGER NOT NULL DEFAULT 0 CHECK(connected IN (0,1)),
    revision INTEGER NOT NULL DEFAULT 0, active TEXT REFERENCES node_tool_versions(id),
    next_number INTEGER NOT NULL DEFAULT 1, draft TEXT, draft_dirty INTEGER NOT NULL DEFAULT 0,
    created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS node_algorithm_versions (
    id TEXT PRIMARY KEY REFERENCES node_tool_versions(id), algorithm_id TEXT NOT NULL REFERENCES node_algorithms(id),
    number INTEGER NOT NULL, reason TEXT NOT NULL, source_algorithm TEXT, source_version TEXT,
    UNIQUE(algorithm_id,number))`,
  `CREATE TRIGGER IF NOT EXISTS node_algorithm_versions_immutable BEFORE UPDATE ON node_algorithm_versions
    BEGIN SELECT RAISE(ABORT,'Algorithm versions are immutable'); END`,
  `CREATE TABLE IF NOT EXISTS node_algorithm_migration_backup (
    id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, active TEXT, draft TEXT, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS node_algorithm_legacy_versions_backup (
    id TEXT PRIMARY KEY, document TEXT NOT NULL, program TEXT NOT NULL, author TEXT NOT NULL, created TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS node_algorithm_draft_backups (
    id TEXT PRIMARY KEY, algorithm_id TEXT NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL,
    created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`
];

/** Called after legacy seeding. Backup, mapping and first product insertion share one transaction. */
const migrations = new WeakMap<ReturnType<typeof db>,Promise<void>>();
export function ensureAlgorithmLibrary() {
  const database=db();let pending=migrations.get(database);
  if(!pending){pending=migrateAlgorithmLibrary().catch(error=>{migrations.delete(database);throw error;});migrations.set(database,pending);}
  return pending;
}
async function migrateAlgorithmLibrary() {
  await db().batch(ALGORITHM_SCHEMA.map(sql => db().prepare(sql)));
  await db().batch([
    db().prepare("INSERT OR IGNORE INTO node_algorithm_migration_backup(id,revision,active,draft) SELECT id,revision,active,draft FROM node_tool_state WHERE NOT EXISTS(SELECT 1 FROM node_algorithms WHERE id=?)").bind(DEFAULT_ALGORITHM),
    db().prepare("INSERT OR IGNORE INTO node_algorithm_legacy_versions_backup SELECT * FROM node_tool_versions WHERE NOT EXISTS(SELECT 1 FROM node_algorithms WHERE id=?)").bind(DEFAULT_ALGORITHM),
    db().prepare(`INSERT OR IGNORE INTO node_algorithms(id,name,name_key,connected,revision,active,next_number,draft,draft_dirty)
      SELECT ?,'Насосная установка','насосная установка',1,revision,active,(SELECT COUNT(*)+1 FROM node_tool_versions),draft,
      CASE WHEN draft IS NOT NULL AND draft != COALESCE((SELECT document FROM node_tool_versions WHERE id=active),'') THEN 1 ELSE 0 END
      FROM node_tool_state WHERE id=1`).bind(DEFAULT_ALGORITHM),
    db().prepare(`INSERT OR IGNORE INTO node_algorithm_versions(id,algorithm_id,number,reason)
      SELECT v.id,?,ROW_NUMBER() OVER(ORDER BY CASE WHEN v.id=b.active THEN 1 ELSE 0 END,v.rowid),'migration'
      FROM node_algorithm_legacy_versions_backup v CROSS JOIN node_algorithm_migration_backup b WHERE b.id=1`).bind(DEFAULT_ALGORITHM)
  ]);
}
type Row = { id: string; name: string; connected: number; revision: number; active: string; next_number: number; draft: string | null; draft_dirty: number; created: string; updated: string };
export async function algorithmRow(id = DEFAULT_ALGORITHM): Promise<Row> {
  const row = await db().prepare("SELECT * FROM node_algorithms WHERE id=?").bind(id).first<Row>();
  if (!row) throw new ToolError("Алгоритм не найден", 404);
  return row;
}
export async function listAlgorithms(connectedOnly = false): Promise<Algorithm[]> {
  const rows = await db().prepare(`SELECT a.*,v.number,s.created AS saved FROM node_algorithms a
    JOIN node_algorithm_versions v ON v.id=a.active JOIN node_tool_versions s ON s.id=v.id
    ${connectedOnly ? "WHERE a.connected=1" : ""} ORDER BY a.created,a.rowid`).all<Row & {number:number;saved:string}>();
  return (rows.results ?? []).map(row => ({ id:row.id, name:row.name, connected:!!row.connected, revision:row.revision,
    active:row.active, number:row.number, created:row.created, updated:row.updated, saved:row.saved, hasDraft:!!row.draft_dirty }));
}
export async function algorithmHistory(id: string): Promise<AlgorithmVersion[]> {
  await algorithmRow(id);
  const rows = await db().prepare(`SELECT v.id,v.algorithm_id AS algorithmId,v.number,v.reason,
    v.source_algorithm AS sourceAlgorithm,v.source_version AS sourceVersion,s.author,s.created
    FROM node_algorithm_versions v JOIN node_tool_versions s ON s.id=v.id WHERE v.algorithm_id=? ORDER BY v.number DESC LIMIT 5`).bind(id).all<AlgorithmVersion>();
  return rows.results ?? [];
}
export async function algorithmSnapshot(id: string, version: string) {
  const row = await db().prepare(`SELECT s.document,s.program FROM node_tool_versions s JOIN node_algorithm_versions v ON v.id=s.id
    WHERE v.algorithm_id=? AND s.id=?`).bind(id,version).first<{document:string;program:string}>();
  if (!row) throw new ToolError("Версия не принадлежит выбранному алгоритму или отсутствует", 404);
  return row;
}
export function checkRevision(row: Row, revision: number) {
  if (!Number.isSafeInteger(revision) || row.revision !== revision) throw new ToolError("Алгоритм изменён в другом окне. Загрузите актуальную ревизию.",409);
}
export async function saveAlgorithmDraft(id: string, revision: number, document: ToolDocument) {
  const result = await db().prepare(`UPDATE node_algorithms SET draft=?,draft_dirty=1,revision=revision+1,updated=CURRENT_TIMESTAMP
    WHERE id=? AND revision=?`).bind(JSON.stringify(document),id,revision).run();
  if (result.meta?.changes !== 1) throw new ToolError("Черновик изменён в другом окне",409);
}
function versionStatements(id: string, revision: number, document: ToolDocument, program: ToolProgram, author: string,
  reason: AlgorithmVersion["reason"] = "save", sourceVersion: string | null = null, expectedActive: string | null = null) {
  const version = crypto.randomUUID(), json = JSON.stringify(document), compiled = JSON.stringify({...program,version,algorithmId:id});
  const statements = [
    db().prepare(`INSERT INTO node_tool_versions(id,document,program,author) SELECT ?,?,?,? FROM node_algorithms WHERE id=? AND revision=? AND (? IS NULL OR active=?)`).bind(version,json,compiled,author,id,revision,expectedActive,expectedActive),
    db().prepare(`INSERT INTO node_algorithm_versions(id,algorithm_id,number,reason,source_algorithm,source_version)
      SELECT ?,id,next_number,?,?,? FROM node_algorithms WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM node_tool_versions WHERE id=?) AND (? IS NULL OR active=?)`).bind(version,reason,sourceVersion ? id : null,sourceVersion,id,revision,version,expectedActive,expectedActive),
    db().prepare(`INSERT INTO node_algorithm_draft_backups(id,algorithm_id,revision,document)
      SELECT ?,id,revision,draft FROM node_algorithms WHERE id=? AND revision=? AND draft IS NOT NULL AND draft_dirty=1 AND (? IS NULL OR active=?)`).bind(version,id,revision,expectedActive,expectedActive),
    db().prepare(`UPDATE node_algorithms SET active=?,draft=?,draft_dirty=0,next_number=next_number+1,revision=revision+1,updated=CURRENT_TIMESTAMP
      WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM node_algorithm_versions WHERE id=?) AND (? IS NULL OR active=?)`).bind(version,json,id,revision,version,expectedActive,expectedActive)
  ];
  return {version,statements};
}
export async function saveAlgorithmVersion(id:string,revision:number,document:ToolDocument,program:ToolProgram,author:string,reason:AlgorithmVersion["reason"]="save",sourceVersion:string|null=null) {
  const prepared=versionStatements(id,revision,document,program,author,reason,sourceVersion);
  const [result]=await db().batch(prepared.statements);
  if(result.meta?.changes!==1)throw new ToolError("Алгоритм изменён в другом окне",409);
  return prepared.version;
}
export async function restoreAlgorithm(id: string, revision: number, version: string, author: string, discardDraft = false, preserve?:{document:ToolDocument;program:ToolProgram}) {
  const row = await algorithmRow(id); checkRevision(row,revision);
  if (row.draft_dirty && !discardDraft && !preserve) throw new ToolError("Сначала сохраните версию черновика или явно разрешите его замену",409);
  if (!(await algorithmHistory(id)).some(v => v.id === version)) throw new ToolError("Эта версия уже вне доступной истории",409);
  const saved = await algorithmSnapshot(id,version), document = JSON.parse(saved.document) as ToolDocument;
  compileTools(document,"restore");
  if(!preserve)return saveAlgorithmVersion(id,revision,document,JSON.parse(saved.program),author,"restore",version);
  const draft=versionStatements(id,revision,preserve.document,preserve.program,author);
  const restored=versionStatements(id,revision+1,document,JSON.parse(saved.program),author,"restore",version,draft.version);
  // Both commits and the head change are one transaction, including the oldest visible backup.
  const [result]=await db().batch([...draft.statements,...restored.statements]);
  if(result.meta?.changes!==1)throw new ToolError("Алгоритм изменён в другом окне",409);
  return restored.version;
}
export async function setAlgorithmConnected(id: string, revision: number, connected: boolean) {
  const row = await algorithmRow(id); checkRevision(row,revision);
  if (typeof connected !== "boolean") throw new ToolError("Укажите статус подключения");
  const result = await db().prepare("UPDATE node_algorithms SET connected=?,revision=revision+1,updated=CURRENT_TIMESTAMP WHERE id=? AND revision=?").bind(connected?1:0,id,revision).run();
  if (result.meta?.changes !== 1) throw new ToolError("Алгоритм изменён в другом окне",409);
}
export async function createAlgorithm(name: string, author: string, source?: {algorithmId:string;version:string}) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 160) throw new ToolError("Введите название продукта от 1 до 160 символов");
  name = name.trim(); const key = name.normalize("NFKC").toLocaleLowerCase("ru-RU");
  if (await db().prepare("SELECT id FROM node_algorithms WHERE name_key=?").bind(key).first()) throw new ToolError("Алгоритм с таким названием уже существует",409);
  let document = emptyAlgorithm();
  if (source) {
    if (!(await algorithmHistory(source.algorithmId)).some(v => v.id === source.version)) throw new ToolError("Выберите доступную сохранённую версию",404);
    document = JSON.parse((await algorithmSnapshot(source.algorithmId,source.version)).document);
  }
  const id = "algorithm-"+crypto.randomUUID(), version = crypto.randomUUID(), program = compileTools(document,version);
  const json = JSON.stringify(document);
  try {
    await db().batch([
      db().prepare("INSERT INTO node_tool_versions(id,document,program,author) VALUES(?,?,?,?)").bind(version,json,JSON.stringify({...program,algorithmId:id}),author),
      db().prepare("INSERT INTO node_algorithms(id,name,name_key,active,next_number,draft) VALUES(?,?,?,?,2,?)").bind(id,name,key,version,json),
      db().prepare("INSERT INTO node_algorithm_versions(id,algorithm_id,number,reason,source_algorithm,source_version) VALUES(?,?,1,?,?,?)").bind(version,id,source?"copy":"create",source?.algorithmId??null,source?.version??null)
    ]);
  } catch(error) { if (/UNIQUE.*name_key/i.test(String(error))) throw new ToolError("Алгоритм с таким названием уже существует",409); throw error; }
  return id;
}
