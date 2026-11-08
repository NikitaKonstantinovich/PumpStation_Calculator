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
async function stored(id: string): Promise<StationCatalogResources | null> {
  const row = await db().prepare("SELECT header FROM node_catalog_snapshots WHERE id=? AND source='station_catalog'").bind(id).first<{ header: string }>();
  if (!row) return null;
  const chunks = await db().prepare("SELECT payload FROM node_catalog_chunks WHERE snapshot_id=? ORDER BY ordinal").bind(id).all<{ payload: string }>();
  const payload = (chunks.results ?? []).map(chunk => JSON.parse(chunk.payload) as string).join("");
  if (await hash(payload) !== id) throw new CatalogError("Закреплённые справочники повреждены", 503);
  const result = { ...JSON.parse(payload), id };
  validateStationCatalog(result);
  return result;
}
const pending = new Map<string, Promise<StationCatalogResources>>();
export async function stationCatalogSnapshot(id?: string, versions?: Record<string, string>): Promise<StationCatalogResources> {
  if (id) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new CatalogError("Некорректная версия справочников", 400);
    const snapshot = await stored(id);
    if (!snapshot) throw new CatalogError("Закреплённые справочники не найдены. Обновите источники явно.", 404);
    if (versions && stableBaseJson(snapshot.baseSettings.versions) !== stableBaseJson(versions)) throw new CatalogError("Версии базовых правил и справочников различаются. Примените согласованную версию продукта.", 409);
    return snapshot;
  }
  const key = stableBaseJson(versions ?? {});
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
