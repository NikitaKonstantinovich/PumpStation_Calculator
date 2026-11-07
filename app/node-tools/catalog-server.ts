import { db } from "../auth-server";
import { catalogService } from "./catalog-binding-server";
import { catalogSnapshotId, PUMP_CATALOG_SOURCE, validateCatalogSnapshot, type CatalogItem, type CatalogSnapshot } from "./catalog-schema";

export class CatalogError extends Error {
  constructor(message: string, readonly status = 503) { super(message); }
}
type Header = Omit<CatalogSnapshot, "items">;

async function storedSnapshot(id: string): Promise<CatalogSnapshot | null> {
  try {
    const row = await db().prepare("SELECT header FROM node_catalog_snapshots WHERE id=? AND source=?").bind(id, PUMP_CATALOG_SOURCE).first<{ header: string }>();
    if (!row) return null;
    const chunks = await db().prepare("SELECT payload FROM node_catalog_chunks WHERE snapshot_id=? ORDER BY ordinal").bind(id).all<{ payload: string }>();
    const result = { ...JSON.parse(row.header) as Header, items: (chunks.results ?? []).flatMap(chunk => JSON.parse(chunk.payload) as CatalogItem[]) };
    validateCatalogSnapshot(result);
    return result;
  } catch {
    throw new CatalogError("Закреплённый снимок каталога повреждён или его хранилище недоступно", 503);
  }
}

/** A pinned ID is always read from immutable storage, never from the changing source. */
export async function catalogSnapshot(id?: string | null): Promise<CatalogSnapshot> {
  if (id) {
    if (!catalogSnapshotId(id)) throw new CatalogError("Некорректная версия каталога", 400);
    const stored = await storedSnapshot(id);
    if (!stored) throw new CatalogError("Закреплённый снимок каталога не найден. Обновление источника выполняется явно.", 404);
    return stored;
  }
  const service = catalogService();
  if (!service) throw new CatalogError("Зарегистрированный источник нового каталога не подключён к серверу");
  let snapshot: CatalogSnapshot;
  try {
    const response = await service.fetch("http://node-catalog.internal/snapshot?source=" + PUMP_CATALOG_SOURCE);
    if (!response.ok) {
      const body = await response.json() as { error?: string };
      throw new CatalogError(body.error || "Источник нового каталога недоступен", response.status === 400 ? 400 : 503);
    }
    const body = await response.json();
    validateCatalogSnapshot(body);
    snapshot = body;
  } catch (e) {
    if (e instanceof CatalogError) throw e;
    throw new CatalogError("Не удалось прочитать согласованный снимок нового каталога");
  }
  const previous = await storedSnapshot(snapshot.id);
  if (previous) return previous;
  const { items, ...header } = snapshot;
  const groups: CatalogItem[][] = [];
  let group: CatalogItem[] = [], size = 0;
  for (const item of items) {
    const length = JSON.stringify(item).length;
    if (length > 250000) throw new CatalogError("Запись каталога превышает допустимый размер снимка");
    if (group.length && size + length > 120000) { groups.push(group); group = []; size = 0; }
    group.push(item); size += length;
  }
  if (group.length) groups.push(group);
  // Each row is bounded; the complete snapshot may exceed a D1 row's string limit.
  await db().batch([
    db().prepare("INSERT OR IGNORE INTO node_catalog_snapshots(id,source,header) VALUES(?,?,?)").bind(snapshot.id, PUMP_CATALOG_SOURCE, JSON.stringify(header)),
    ...groups.map((items, ordinal) => db().prepare("INSERT OR IGNORE INTO node_catalog_chunks(snapshot_id,ordinal,payload) VALUES(?,?,?)").bind(snapshot.id, ordinal, JSON.stringify(items)))
  ]);
  const result = await storedSnapshot(snapshot.id);
  if (!result) throw new CatalogError("Не удалось сохранить снимок нового каталога");
  return result;
}
