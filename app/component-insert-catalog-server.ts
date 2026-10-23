import { db, sha256 } from "./auth-server";
import type { BindingCatalog } from "./collector-catalog";
import { makeInsertCatalog } from "./component-insert-catalog";
import { WELD_RATES } from "./collector-calculations";
import importedSource from "../public/component-insert-source.json";

type ItemRow = { id: number; sourceId: string; catalogId: string; tableId: string; family: string; sourceSheet: string; sourceRow: number };
type FieldRow = { componentId: number; column: string; headerPath: string; numericValue: number | null; textValue: string | null; booleanValue: number | null; jsonValue: string | null };
type PriceRow = { componentId: number; amount: number; currency: string; sourceColumn: string; label: string };

export type InsertSource = BindingCatalog & { databaseRevision: number };
async function readInsertSource(): Promise<BindingCatalog> {
  const database = db();
  const active = await database.prepare("SELECT id,source_sha256 AS sha256,imported_at AS importedAt FROM catalog_imports WHERE is_active=1 ORDER BY imported_at DESC,id DESC LIMIT 1").first<{ id: number; sha256: string; importedAt: string }>();
  const shipped = importedSource as BindingCatalog;
  // Only an absent import permits the shipped snapshot. SQL failures are errors.
  if (!active) return shipped;
  const [items, fields, prices] = await Promise.all([
    database.prepare("SELECT c.id,c.source_id AS sourceId,cat.source_id AS catalogId,f.source_id AS tableId,f.title AS family,cat.source_sheet AS sourceSheet,c.source_row AS sourceRow FROM components c JOIN component_families f ON f.id=c.family_id JOIN component_catalogs cat ON cat.id=f.catalog_id WHERE cat.import_id=? AND c.is_active=1 ORDER BY c.id").bind(active.id).all<ItemRow>(),
    database.prepare("SELECT v.component_id AS componentId,a.source_column AS column,a.header_path_json AS headerPath,v.numeric_value AS numericValue,v.text_value AS textValue,v.boolean_value AS booleanValue,v.json_value AS jsonValue FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id JOIN component_families f ON f.id=a.family_id JOIN component_catalogs cat ON cat.id=f.catalog_id WHERE cat.import_id=? ORDER BY v.component_id,a.sort_order,a.id").bind(active.id).all<FieldRow>(),
    database.prepare("SELECT p.component_id AS componentId,CAST(p.amount_microunits AS REAL)/p.scale AS amount,p.currency,p.source_column AS sourceColumn,p.label FROM component_prices p JOIN components c ON c.id=p.component_id JOIN component_families f ON f.id=c.family_id JOIN component_catalogs cat ON cat.id=f.catalog_id WHERE cat.import_id=? ORDER BY p.component_id,p.id").bind(active.id).all<PriceRow>(),
  ]);
  if ([items, fields, prices].some(result => !result.success)) throw new Error("Не удалось прочитать исходный каталог вставок.");
  const fieldMap = new Map<number, BindingCatalog["items"][number]["fields"]>();
  for (const value of fields.results ?? []) {
    const list = fieldMap.get(value.componentId) ?? [];
    list.push({ column: value.column, headerPath: JSON.parse(value.headerPath), value: value.numericValue ?? value.textValue ?? (value.booleanValue === null ? null : Boolean(value.booleanValue)) ?? (value.jsonValue ? JSON.parse(value.jsonValue) : null) });
    fieldMap.set(value.componentId, list);
  }
  const priceMap = new Map<number, BindingCatalog["items"][number]["prices"]>();
  for (const value of prices.results ?? []) {
    const list = priceMap.get(value.componentId) ?? [];
    list.push({ amount: value.amount, currency: value.currency, sourceColumn: value.sourceColumn, label: value.label });
    priceMap.set(value.componentId, list);
  }
  return {
    source: active,
    ...(active.sha256 === shipped.source.sha256 ? { collectorReference: shipped.collectorReference } : {}),
    items: (items.results ?? []).map(item => ({ id: item.sourceId, catalogId: item.catalogId, tableId: item.tableId, family: item.family, sourceSheet: item.sourceSheet, sourceRow: item.sourceRow, fields: fieldMap.get(item.id) ?? [], prices: priceMap.get(item.id) ?? [] })),
  };
}

async function sourceRevision() {
  const row = await db().prepare("SELECT revision FROM component_calculator_source_revision WHERE id=1").first<{ revision: number }>();
  if (!row) throw new Error("Отсутствует ревизия исходного каталога; примените миграцию 0009.");
  return row.revision;
}

export async function currentInsertSource(): Promise<InsertSource> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await sourceRevision(), source = await readInsertSource();
    if (before === await sourceRevision()) return { ...source, databaseRevision: before };
  }
  throw new Error("Исходный каталог изменяется во время чтения. Повторите расчёт.");
}

export async function currentInsertCatalog(source?: InsertSource) {
  const current = source ?? await currentInsertSource();
  const catalog = makeInsertCatalog(current);
  // Include all reference/engineering data and tariff values in the revision.
  catalog.version = await sha256(JSON.stringify({ algorithmVersion: 8, weldRates: WELD_RATES, databaseRevision: current.databaseRevision, catalog }));
  return catalog;
}
