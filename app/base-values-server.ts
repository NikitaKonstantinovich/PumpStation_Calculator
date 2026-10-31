import { db } from "./auth-server";
import { BASE_SECTIONS, baseEqual, baseSnapshot, catalogManufacturers, initialBaseValues, legacyBaseValues, validateBaseValues, type AppliedBaseValues, type BasePublication, type BaseValues, type BaseVersions } from "./base-values";

export class BaseValuesError extends Error { constructor(message:string, public status=400) { super(message); } }
export async function ensureBaseValues() {
  const database=db();
  await database.batch([
    database.prepare("CREATE TABLE IF NOT EXISTS base_value_versions (id TEXT PRIMARY KEY NOT NULL,values_json TEXT NOT NULL,author TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE TABLE IF NOT EXISTS base_value_state (id INTEGER PRIMARY KEY CHECK(id=1),active_id TEXT NOT NULL REFERENCES base_value_versions(id),revision INTEGER NOT NULL DEFAULT 0,draft_json TEXT NOT NULL,draft_author TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE TRIGGER IF NOT EXISTS base_versions_immutable_update BEFORE UPDATE ON base_value_versions BEGIN SELECT RAISE(ABORT, 'Published base values are immutable'); END"),
    database.prepare("CREATE TRIGGER IF NOT EXISTS base_versions_immutable_delete BEFORE DELETE ON base_value_versions BEGIN SELECT RAISE(ABORT, 'Published base values are immutable'); END"),
    database.prepare("INSERT OR IGNORE INTO base_value_versions(id,values_json,author) VALUES ('legacy-v1',?,'Миграция прежних значений')").bind(JSON.stringify(legacyBaseValues())),
    database.prepare("INSERT OR IGNORE INTO base_value_versions(id,values_json,author) VALUES ('initial-v1',?,'Начальное заполнение из проекта и исследования')").bind(JSON.stringify(initialBaseValues())),
    database.prepare("INSERT OR IGNORE INTO base_value_state(id,active_id,revision,draft_json,draft_author) VALUES(1,'initial-v1',0,?,'Начальное заполнение')").bind(JSON.stringify(initialBaseValues())),
  ]);
}
export async function readBasePublication(id:string):Promise<BasePublication> {
  const row=await db().prepare("SELECT id,values_json AS json,author,created_at AS createdAt FROM base_value_versions WHERE id=?").bind(id).first<{id:string;json:string;author:string;createdAt:string}>();
  if(!row)throw new BaseValuesError("Версия базовых значений не найдена. Проект не изменён.",422);
  return {id:row.id,values:JSON.parse(row.json),author:row.author,createdAt:row.createdAt};
}
export async function currentBasePublication() { await ensureBaseValues(); const state=await db().prepare("SELECT active_id AS id FROM base_value_state WHERE id=1").first<{id:string}>(); if(!state)throw new Error("Не инициализирован справочник");return readBasePublication(state.id); }
export async function resolveBaseVersions(raw?:unknown):Promise<AppliedBaseValues> {
  await ensureBaseValues();
  if(raw===undefined||raw===null)return baseSnapshot("legacy-v1",(await readBasePublication("legacy-v1")).values);
  if(typeof raw!=="object"||Array.isArray(raw))throw new BaseValuesError("Некорректные версии базовых значений.");
  const versions=raw as BaseVersions;
  if(Object.keys(versions).length!==BASE_SECTIONS.length||BASE_SECTIONS.some(k=>typeof versions[k]!=="string"||versions[k].length>100))throw new BaseValuesError("Не указаны версии всех разделов.");
  const publications=new Map(await Promise.all([...new Set(BASE_SECTIONS.map(k=>versions[k]))].map(async id=>[id,await readBasePublication(id)] as const)));
  const values=Object.fromEntries(BASE_SECTIONS.map(k=>[k,publications.get(versions[k])!.values[k]])) as BaseValues;
  return {versions:{...versions},values};
}
export async function verifyAppliedBaseValues(applied?:AppliedBaseValues) {
  const trusted=await resolveBaseVersions(applied?.versions);
  if(applied&&!baseEqual(applied.values,trusted.values))throw new BaseValuesError("Значения справочника не соответствуют опубликованным версиям. Подмена параметров не допускается.",403);
  return trusted;
}
export async function baseAdminState() {
  await ensureBaseValues();
  const state=await db().prepare("SELECT active_id AS activeId,revision,draft_json AS json,draft_author AS draftAuthor,updated_at AS updatedAt FROM base_value_state WHERE id=1").first<{activeId:string;revision:number;json:string;draftAuthor:string;updatedAt:string}>();
  if(!state)throw new Error("Справочник недоступен");
  const history=await db().prepare("SELECT id,author,created_at AS createdAt FROM base_value_versions ORDER BY created_at DESC,id DESC").all<{id:string;author:string;createdAt:string}>();
  return {revision:state.revision,draft:JSON.parse(state.json) as BaseValues,manufacturers:catalogManufacturers(),draftAuthor:state.draftAuthor,updatedAt:state.updatedAt,active:await readBasePublication(state.activeId),history:history.results??[]};
}
export async function writeBaseValues(actor:{id:string;name:string}, body:{action?:string;revision?:number;values?:unknown}) {
  await ensureBaseValues();
  if(!["save","publish"].includes(body.action??"")||!Number.isInteger(body.revision))throw new BaseValuesError("Укажите действие и ревизию черновика.");
  const errors=validateBaseValues(body.values);if(errors.length)throw new BaseValuesError(errors.join("\n"));
  const values=body.values as BaseValues;
  for(const manufacturer of catalogManufacturers())if(!Object.hasOwn(values.financial.discounts,manufacturer))throw new BaseValuesError(`Задайте скидку для производителя ${manufacturer} из действующего каталога.`);
  if(values.spacing.legacy)throw new BaseValuesError("Режим прежних расстояний предназначен только для миграции старых проектов.");
  // Painting edits retain the catalogue's source row identities.
  const initial=(await readBasePublication("initial-v1")).values.painting;
  if(values.painting.length!==initial.length||values.painting.some(r=>!initial.some(p=>p.id===r.id&&p.dn===r.dn&&p.material===r.material)))throw new BaseValuesError("Окраска редактируется по существующим строкам каталога. ID, DN и материал записи менять нельзя.");
  const revision=body.revision!,author=`${actor.name} (${actor.id})`,json=JSON.stringify(values),database=db();
  if(body.action==="publish") {
    const id=crypto.randomUUID();
    await database.batch([
      database.prepare("INSERT INTO base_value_versions(id,values_json,author) SELECT ?,?,? FROM base_value_state WHERE id=1 AND revision=?").bind(id,json,author,revision),
      database.prepare("UPDATE base_value_state SET active_id=?,draft_json=?,draft_author=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=? AND EXISTS(SELECT 1 FROM base_value_versions WHERE id=?)").bind(id,json,author,revision,id),
    ]);
    const created=await database.prepare("SELECT id FROM base_value_versions WHERE id=?").bind(id).first();
    if(!created)throw new BaseValuesError("Черновик изменён другим администратором. Обновите данные и сравните изменения.",409);
  } else {
    const result=await database.prepare("UPDATE base_value_state SET draft_json=?,draft_author=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?").bind(json,author,revision).run();
    if(result.meta?.changes!==1)throw new BaseValuesError("Черновик изменён другим администратором. Обновите данные и сравните изменения.",409);
  }
  return baseAdminState();
}
