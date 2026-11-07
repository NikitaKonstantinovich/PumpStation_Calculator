import { PUMP_CATALOG_SOURCE, validateCatalogSnapshot, type CatalogSnapshot } from "./catalog-schema";

export async function loadCatalog(snapshotId?: string, signal?: AbortSignal): Promise<CatalogSnapshot> {
  const params = new URLSearchParams({ source: PUMP_CATALOG_SOURCE });
  if (snapshotId) params.set("snapshot", snapshotId);
  const response = await fetch("/api/node-catalog?" + params, { cache: "no-store", signal });
  const body = await response.json();
  if (!response.ok) throw Error(body.error || "Новый каталог насосов недоступен");
  validateCatalogSnapshot(body.snapshot);
  return body.snapshot;
}
