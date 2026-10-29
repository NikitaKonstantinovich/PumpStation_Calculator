export const LEGACY_NOMENCLATURE_CATALOG_ID = "старая-номенклатура";
export const LEGACY_NOMENCLATURE_LABEL = "Старая номенклатура";
export const NOMENCLATURE_STATUS_COLUMN = "NOMENCLATURE_STATUS";

type CatalogItem = {
  catalogId: string;
  fields: Array<{ column: string; headerPath: string[]; value: unknown }>;
};

/** Only an explicit source attribute exempts an old item from conflict matching. */
export function isLegacyNomenclature(item: CatalogItem): boolean {
  return item.fields.some(field => field.column === NOMENCLATURE_STATUS_COLUMN && field.value === LEGACY_NOMENCLATURE_LABEL);
}

export function markLegacyNomenclature<T extends CatalogItem>(item: T): T {
  return {
    ...item,
    catalogId: LEGACY_NOMENCLATURE_CATALOG_ID,
    fields: [
      ...item.fields.filter(field => field.column !== NOMENCLATURE_STATUS_COLUMN),
      { column: NOMENCLATURE_STATUS_COLUMN, headerPath: ["Номенклатура"], value: LEGACY_NOMENCLATURE_LABEL },
    ],
  };
}

/** Keep identity and prices so saved project references remain valid. */
export function routeNomenclature<T extends CatalogItem>(item: T): T {
  return isLegacyNomenclature(item) ? { ...item, catalogId: LEGACY_NOMENCLATURE_CATALOG_ID } : item;
}
