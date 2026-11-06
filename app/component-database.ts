import { makeCollectorCatalog, type BindingCatalog } from "./collector-catalog";
import { suctionCatalogItems } from "./suction-catalog";
import { pressureTransducerCatalog } from "./pressure-transducers";
import { LEGACY_NOMENCLATURE_CATALOG_ID, LEGACY_NOMENCLATURE_LABEL, routeNomenclature } from "./component-nomenclature";
import type { ComponentCatalog, ComponentGroupId, ComponentItem, ComponentsDatabase } from "./component-database-types";
export type RawBindingDatabase = BindingCatalog & {
  catalogs: Array<{
    id: string;
    name: string;
  }>;
  items: ComponentItem[];
  statistics: {
    componentRows: number;
    pricedComponentRows: number;
  };
};
export type RawControlDatabase = {
  components: Array<{
    id: string;
    category: string;
    manufacturer: string | null;
    article: string | null;
    name: string;
    componentType: string | null;
    attributes: Record<string, unknown>;
    currentPrice: number | null;
    currency: string;
  }>;
  statistics: {
    components: number;
    pricedComponents: number;
  };
};
const METAL_CATALOGS = new Set(["металл", "метизы", "опоры", "кронштейны", "рама"]);
const bindingGroupFor = (catalogId: string): ComponentGroupId => catalogId === "работы" ? "services" : METAL_CATALOGS.has(catalogId) ? "metal" : "hydraulic";
export function assembleComponentDatabase(binding: RawBindingDatabase, control: RawControlDatabase, savedInsertions: ComponentItem[]): ComponentsDatabase {
  const categories = [...new Set(control.components.map(item => item.category))].sort((a, b) => a.localeCompare(b, "ru"));
  const controlCatalogs: ComponentCatalog[] = categories.map(category => ({
    id: `control:${category}`,
    name: category.replaceAll("_", " "),
    groupId: category === "Работы" ? "services" : "control"
  }));
  const controlItems: ComponentItem[] = control.components.map(item => ({
    id: item.id,
    catalogId: `control:${item.category}`,
    family: item.name,
    fields: [{
      column: "manufacturer",
      headerPath: ["Производитель"],
      value: item.manufacturer
    }, {
      column: "article",
      headerPath: ["Артикул"],
      value: item.article
    }, {
      column: "componentType",
      headerPath: ["Тип"],
      value: item.componentType
    }, ...Object.entries(item.attributes).map(([key, value]) => ({
      column: key,
      headerPath: [key],
      value
    }))],
    prices: typeof item.currentPrice === "number" && item.currentPrice > 0 ? [{
      label: "Актуальная цена",
      amount: item.currentPrice,
      currency: item.currency
    }] : []
  }));
  const items = pressureTransducerCatalog([...binding.items, ...suctionCatalogItems, ...savedInsertions, ...controlItems]).map(routeNomenclature);
  return {
    collectorCatalog: makeCollectorCatalog(binding),
    catalogs: [...binding.catalogs.map(catalog => ({
      ...catalog,
      groupId: bindingGroupFor(catalog.id)
    })), {
      id: "ответные-части",
      name: "Ответные части и американки",
      groupId: "hydraulic"
    }, {
      id: LEGACY_NOMENCLATURE_CATALOG_ID,
      name: LEGACY_NOMENCLATURE_LABEL,
      groupId: "hydraulic"
    }, ...controlCatalogs],
    items,
    statistics: {
      componentRows: items.length,
      pricedComponentRows: items.filter(item => item.prices.length).length
    }
  };
}
