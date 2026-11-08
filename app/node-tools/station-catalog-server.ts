import { db } from "../auth-server";
import { applyBaseTariffs, baseSnapshot, stableBaseJson } from "../base-values";
import { currentBasePublication, resolveBaseVersions } from "../base-values-server";
import { assembleComponentDatabase, type RawBindingDatabase, type RawControlDatabase } from "../component-database";
import { readSavedInsertions, savedInsertionComponent } from "../component-insert-store-server";
import { currentInsertCatalog } from "../component-insert-catalog-server";
import { currentCollectorCatalog } from "../collector-catalog-server";
import binding from "../../public/binding-components.json";
import control from "../../public/control-cabinet-database.json";
import cabinets from "../../public/control-cabinets.json";
import { CatalogError } from "./catalog-server";
import { validateStationCatalog, type StationCatalogResources } from "./station-catalog";

const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), v => v.toString(16).padStart(2, "0")).join("");
type DatabaseCache = {
  snapshots: Map<string, { header: string; count: number; snapshot: StationCatalogResources }>;
  reads: Map<string, Promise<StationCatalogResources>>;
  latest: Map<string, Promise<StationCatalogResources>>;
};
// A binding can differ between environments/tests. Never reuse another database's pin.
const caches = new WeakMap<ReturnType<typeof db>, DatabaseCache>();
function cacheFor(database: ReturnType<typeof db>): DatabaseCache {
  let cache = caches.get(database);
  if (!cache) { cache = { snapshots: new Map(), reads: new Map(), latest: new Map() }; caches.set(database, cache); }
  return cache;
}
function freezeSnapshot(value: StationCatalogResources): StationCatalogResources {
  const pending: object[] = [value];
  while (pending.length) {
    const item = pending.pop()!;
    if (Object.isFrozen(item)) continue;
    Object.freeze(item);
    for (const child of Object.values(item)) if (child && typeof child === "object") pending.push(child);
  }
  return value;
}
async function stored(id: string): Promise<StationCatalogResources | null> {
  const database = db(), cache = cacheFor(database);
  // Updates/deletes are forbidden by the immutable-storage triggers; count also
  // detects an unexpected appended chunk. A missing/unavailable DB still fails.
  const row = await database.prepare("SELECT header,(SELECT COUNT(*) FROM node_catalog_chunks WHERE snapshot_id=?) AS chunk_count FROM node_catalog_snapshots WHERE id=? AND source='station_catalog'").bind(id, id).first<{ header: string; chunk_count: number }>();
  if (!row) { cache.snapshots.delete(id); return null; }
  let expected: number;
  try { expected = JSON.parse(row.header).chunks; } catch { throw new CatalogError("Закреплённые справочники повреждены", 503); }
  if (!Number.isInteger(expected) || expected < 1 || expected !== row.chunk_count) { cache.snapshots.delete(id); throw new CatalogError("Закреплённые справочники повреждены", 503); }
  const cached = cache.snapshots.get(id);
  if (cached?.header === row.header && cached.count === row.chunk_count) {
    cache.snapshots.delete(id); cache.snapshots.set(id, cached);
    return cached.snapshot;
  }
  let pending = cache.reads.get(id);
  if (!pending) {
    pending = (async () => {
      const chunks = await database.prepare("SELECT payload FROM node_catalog_chunks WHERE snapshot_id=? ORDER BY ordinal").bind(id).all<{ payload: string }>();
      if (chunks.success === false || chunks.results?.length !== expected) throw new CatalogError("Закреплённые справочники повреждены", 503);
      const payload = (chunks.results ?? []).map(chunk => JSON.parse(chunk.payload) as string).join("");
      if (await hash(payload) !== id) throw new CatalogError("Закреплённые справочники повреждены", 503);
      const result = { ...JSON.parse(payload), id };
      validateStationCatalog(result);
      cache.snapshots.set(id, { header: row.header, count: expected, snapshot: freezeSnapshot(result) });
      while (cache.snapshots.size > 2) cache.snapshots.delete(cache.snapshots.keys().next().value!);
      return result;
    })().finally(() => cache.reads.delete(id));
    cache.reads.set(id, pending);
  }
  return pending;
}
export async function stationCatalogSnapshot(id?: string, versions?: Record<string, string>): Promise<StationCatalogResources> {
  if (id) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new CatalogError("Некорректная версия справочников", 400);
    const snapshot = await stored(id);
    if (!snapshot) throw new CatalogError("Закреплённые справочники не найдены. Обновите источники явно.", 404);
    if (versions && stableBaseJson(snapshot.baseSettings.versions) !== stableBaseJson(versions)) throw new CatalogError("Версии базовых правил и справочников различаются. Примените согласованную версию продукта.", 409);
    return snapshot;
  }
  const key = stableBaseJson(versions ?? {}), pending = cacheFor(db()).latest;
  if (!pending.has(key)) pending.set(key, capture(versions).finally(() => pending.delete(key)));
  return pending.get(key)!;
}
async function capture(versions?: Record<string, string>): Promise<StationCatalogResources> {
  const baseSettings = versions ? await resolveBaseVersions(versions) : await currentBasePublication().then(p => baseSnapshot(p.id, p.values));
  const marker = async () => stableBaseJson(await db().prepare("SELECT revision,(SELECT source_sha256 FROM catalog_imports WHERE is_active=1 ORDER BY imported_at DESC,id DESC LIMIT 1) AS source FROM component_calculator_source_revision WHERE id=1").first());
  let captured: { saved: Awaited<ReturnType<typeof readSavedInsertions>>; insert: Awaited<ReturnType<typeof currentInsertCatalog>>; collector: Awaited<ReturnType<typeof currentCollectorCatalog>> } | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await marker();
    const [saved, insert, collector] = await Promise.all([readSavedInsertions(), currentInsertCatalog(undefined, baseSettings), currentCollectorCatalog()]);
    const after = await marker(), savedAfter = await readSavedInsertions();
    if (before === after && stableBaseJson(saved) === stableBaseJson(savedAfter)) { captured = {saved, insert, collector}; break; }
  }
  if (!captured) throw new CatalogError("Справочники изменяются во время чтения. Повторите обновление.", 409);
  const {saved, insert, collector} = captured;
  const components = assembleComponentDatabase(binding as unknown as RawBindingDatabase, control as unknown as RawControlDatabase, saved.map(row => savedInsertionComponent(row, insert.version)));
  const collectorCatalog = applyBaseTariffs(collector, baseSettings);
  components.collectorCatalog = collectorCatalog;
  // Match Workspace 1's sources; never substitute an unrelated pump catalogue.
  const payload = stableBaseJson({ sourceId: "station_catalog", components, cabinets, smartCabinets: control.cabinets, collectorCatalog, baseSettings });
  const id = await hash(payload), previous = await stored(id);
  if (previous) return previous;
  const chunks = Array.from({ length: Math.ceil(payload.length / 60000) }, (_, ordinal) => ({ ordinal, payload: JSON.stringify(payload.slice(ordinal * 60000, (ordinal + 1) * 60000)) }));
  await db().batch([
    db().prepare("INSERT OR IGNORE INTO node_catalog_snapshots(id,source,header) VALUES(?,'station_catalog',?)").bind(id, JSON.stringify({ chunks: chunks.length, baseVersions: baseSettings.versions })),
    ...chunks.map(chunk => db().prepare("INSERT OR IGNORE INTO node_catalog_chunks(snapshot_id,ordinal,payload) VALUES(?,?,?)").bind(id, chunk.ordinal, chunk.payload))
  ]);
  const result = await stored(id);
  if (!result) throw new CatalogError("Не удалось закрепить справочники комплектации", 503);
  return result;
}
