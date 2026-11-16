import { db } from "../auth-server";
import { stableBaseJson } from "../base-values";
import type { ComponentItem } from "../component-database-types";
import { ToolError } from "../node-tools/errors";

async function initialize() {
  await db().batch([
    db().prepare("CREATE TABLE IF NOT EXISTS frame_catalog_versions(id TEXT PRIMARY KEY,payload TEXT NOT NULL,author TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db().prepare("CREATE TABLE IF NOT EXISTS frame_catalog_state(id INTEGER PRIMARY KEY CHECK(id=1),version TEXT,revision INTEGER NOT NULL DEFAULT 0)"),
    db().prepare("INSERT OR IGNORE INTO frame_catalog_state(id) VALUES(1)"),
    db().prepare("CREATE TRIGGER IF NOT EXISTS frame_catalog_no_delete BEFORE DELETE ON frame_catalog_versions BEGIN SELECT RAISE(ABORT,'immutable frame catalogue'); END"),
    db().prepare("CREATE TRIGGER IF NOT EXISTS frame_catalog_immutable BEFORE UPDATE ON frame_catalog_versions BEGIN SELECT RAISE(ABORT,'immutable frame catalogue'); END")
  ]);
}
export function validateFrameCatalog(items: unknown): asserts items is ComponentItem[] {
  if (!Array.isArray(items) || items.length > 2000) throw new ToolError("Некорректный каталог рам");
  const ids = new Set<string>();
  for (const item of items) {
    if (!item || typeof item.id !== "string" || !/^(bent-frame-|frame-hardware-|frame-support-|frame-eyelet-|frame-mounting-)[a-zA-Z0-9_.-]+$/.test(item.id) || ids.has(item.id) || typeof item.catalogId !== "string" || typeof item.family !== "string" || !Array.isArray(item.fields) || !Array.isArray(item.prices)) throw new ToolError("Некорректная или повторяющаяся позиция рам");
    ids.add(item.id);
    if (item.fields.some((f: {column:unknown;headerPath:unknown}) => typeof f.column !== "string" || !Array.isArray(f.headerPath)) || item.prices.some((p: {amount:unknown;currency:unknown}) => typeof p.amount !== "number" || !Number.isFinite(p.amount) || p.amount < 0 || p.currency !== "RUB")) throw new ToolError("Некорректные атрибуты или цена позиции");
    const variant = item.fields.find((f: {column:string}) => f.column === "FRAME_VARIANT")?.value;
    if (item.id.startsWith("bent-frame-") && (!variant || variant.id !== item.id || ![3,4,5].includes(variant.thicknessMm) || variant.widthMm !== 410 || variant.lengthMm < 600 || variant.lengthMm > 2000 || variant.lengthMm % 100 || !["red","blue"].includes(variant.color) || !(variant.massKg > 0) || typeof variant.cad !== "string" || typeof variant.stl !== "string" || !/^[a-f0-9]{64}$/.test(variant.hash))) throw new ToolError("Рама не содержит проверенной геометрии и массы");
  }
}
export async function readFrameCatalog() {
  await initialize();
  const row = await db().prepare("SELECT s.revision,s.version,v.payload FROM frame_catalog_state s LEFT JOIN frame_catalog_versions v ON v.id=s.version WHERE s.id=1").first<{revision:number;version:string|null;payload:string|null}>();
  if (!row) throw new ToolError("Не удалось прочитать каталог рам",503);
  return {revision:row.revision,version:row.version,items:row.payload ? JSON.parse(row.payload) as ComponentItem[] : []};
}
export async function publishFrameCatalog(items:unknown, revision:number, author:string) {
  validateFrameCatalog(items);
  const current = await readFrameCatalog();
  if (!Number.isSafeInteger(revision) || current.revision !== revision) throw new ToolError("Каталог изменён. Загрузите актуальную ревизию.",409);
  const payload = stableBaseJson(items), bytes = new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(payload)));
  const version = Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
  if (version === current.version) return current;
  const result = await db().batch([
    db().prepare("INSERT OR IGNORE INTO frame_catalog_versions(id,payload,author) SELECT ?,?,? FROM frame_catalog_state WHERE id=1 AND revision=?").bind(version,payload,author,revision),
    db().prepare("UPDATE frame_catalog_state SET version=?,revision=revision+1 WHERE id=1 AND revision=? AND EXISTS(SELECT 1 FROM frame_catalog_versions WHERE id=?)").bind(version,revision,version)
  ]);
  if (result[1].meta?.changes !== 1) throw new ToolError("Каталог изменён одновременно в другом окне",409);
  return {revision:revision+1,version,items};
}
