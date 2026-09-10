import { db } from "./auth-server";
import { makeCollectorCatalog, type BindingCatalog } from "./collector-catalog";
import type { CollectorCatalog } from "./collector-calculations";
import importedCatalog from "../public/collector-catalog.json";

type ItemRow = { id: number; sourceId: string; catalogId: string; tableId: string; family: string; sourceSheet: string; sourceRow: number };
type FieldRow = { componentId: number; column: string; headerPath: string; numericValue: number | null; textValue: string | null };
type PriceRow = { componentId: number; amount: number; currency: string; sourceColumn: string; label: string };

export async function currentCollectorCatalog(): Promise<CollectorCatalog> {
  const database = db();
  const active = await database.prepare("SELECT id,source_sha256 AS sha256,imported_at AS importedAt FROM catalog_imports WHERE is_active=1 ORDER BY imported_at DESC,id DESC LIMIT 1").first<{ id: number; sha256: string; importedAt: string }>();
  // Existing installations can use the shipped workbook snapshot until the
  // normalized catalogue is imported into D1. Never fall back after a SQL error.
  if (!active) return importedCatalog as CollectorCatalog;
  const [items, fields, prices] = await Promise.all([
    database.prepare(`SELECT c.id,c.source_id AS sourceId,cat.source_id AS catalogId,f.source_id AS tableId,f.title AS family,cat.source_sheet AS sourceSheet,c.source_row AS sourceRow FROM components c JOIN component_families f ON f.id=c.family_id JOIN component_catalogs cat ON cat.id=f.catalog_id WHERE cat.import_id=? AND c.is_active=1`).bind(active.id).all<ItemRow>(),
    database.prepare(`SELECT v.component_id AS componentId,a.source_column AS column,a.header_path_json AS headerPath,v.numeric_value AS numericValue,v.text_value AS textValue FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id JOIN component_families f ON f.id=a.family_id JOIN component_catalogs cat ON cat.id=f.catalog_id WHERE cat.import_id=?`).bind(active.id).all<FieldRow>(),
    database.prepare(`SELECT p.component_id AS componentId,CAST(p.amount_microunits AS REAL)/p.scale AS amount,p.currency,p.source_column AS sourceColumn,p.label FROM component_prices p JOIN components c ON c.id=p.component_id JOIN component_families f ON f.id=c.family_id JOIN component_catalogs cat ON cat.id=f.catalog_id WHERE cat.import_id=?`).bind(active.id).all<PriceRow>(),
  ]);
  const data: BindingCatalog = { source: active, items: (items.results ?? []).map(item => ({ ...item, id: item.sourceId, fields: (fields.results ?? []).filter(v => v.componentId === item.id).map(v => ({ column: v.column, headerPath: JSON.parse(v.headerPath), value: v.numericValue ?? v.textValue })), prices: (prices.results ?? []).filter(v => v.componentId === item.id) })) };
  const result = makeCollectorCatalog(data);
  // Reference dimensions belong to the workbook revision, not to a price row.
  const shipped = importedCatalog as CollectorCatalog & { sourceSha256?: string };
  if (shipped.sourceSha256 === active.sha256) {
    result.bolts = shipped.bolts;
    for (const item of result.components) if (item.kind === "nipple") {
      const reference = shipped.components.find(v => v.kind === "nipple" && v.material === item.material && v.dn === item.dn);
      item.outerDiameter ??= reference?.outerDiameter ?? null;
    }
  }
  const bytes = new TextEncoder().encode(JSON.stringify(result));
  result.version = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), v => v.toString(16).padStart(2, "0")).join("");
  return result;
}
