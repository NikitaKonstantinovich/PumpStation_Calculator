import type { Pump } from "../pump-catalog";

export const PUMP_CATALOG_SOURCE = "pump_catalog_v2" as const;
export type CatalogIssue = { code: string; message: string; modelId?: string; variantId?: string };
export type CatalogItem = {
  modelId: string;
  variantId: string;
  curveSetId: string | null;
  frequencyHz: number | null;
  pump: Pump;
  issues: string[];
  provenance: Record<string, unknown>;
};
export type CatalogSnapshot = {
  sourceId: typeof PUMP_CATALOG_SOURCE;
  id: string;
  schemaVersion: string;
  sourceStatus: string;
  status: "ready" | "empty";
  created: string;
  items: CatalogItem[];
  issues: CatalogIssue[];
  metadata?: Record<string, string>;
};
export type CatalogResource = {
  status: "loading" | "ready" | "empty" | "error" | "stale";
  snapshot?: CatalogSnapshot;
  error?: string;
};
export const catalogSnapshotId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{64}$/.test(id);

/** Validate the registered service boundary before freezing its response. */
export function validateCatalogSnapshot(value: unknown): asserts value is CatalogSnapshot {
  if (!value || typeof value !== "object") throw Error("Некорректный снимок каталога");
  const s = value as CatalogSnapshot;
  if (s.sourceId !== PUMP_CATALOG_SOURCE || !catalogSnapshotId(s.id) || typeof s.schemaVersion !== "string" || !s.schemaVersion || typeof s.sourceStatus !== "string" || !["ready", "empty"].includes(s.status) || !Number.isFinite(Date.parse(s.created)) || !Array.isArray(s.items) || s.items.length > 50000 || !Array.isArray(s.issues) || s.issues.length > 100000 || (s.status === "empty") !== (s.items.length === 0)) throw Error("Неверный контракт снимка каталога");
  const ids = new Set<string>();
  for (const item of s.items) {
    if (!item || typeof item.modelId !== "string" || !item.modelId || typeof item.variantId !== "string" || !item.variantId || ids.has(item.variantId) || item.pump?.id !== item.variantId || !Array.isArray(item.issues) || item.issues.some(i => typeof i !== "string") || !Array.isArray(item.pump.curve) || item.pump.curve.length > 10000 || item.pump.curve.some(p => !Array.isArray(p) || p.length !== 2 || p.some(v => typeof v !== "number" || !Number.isFinite(v)))) throw Error("Неверная запись исполнения в снимке каталога");
    ids.add(item.variantId);
  }
}
