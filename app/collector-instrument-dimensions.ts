import type { BindingCatalog } from "./collector-catalog";
import reference from "../data/collector-instrument-dimensions.json";

/** Geometry review is independent of the DN15 pressure adoption. */
export function collectorInstrumentDimensions(item: BindingCatalog["items"][number], sourceSha256: string) {
  if (sourceSha256 !== reference.sourceSha256 || item.catalogId !== "сгоны-резьба") return;
  const value = (label: string) => item.fields.find(f => f.headerPath.at(-1) === label)?.value;
  return reference.rows.find(row => row.componentId === item.id && row.tableId === item.tableId && row.family === item.family
    && Number(String(value("DN")).replace(/^DN/i, "")) === row.dn && value("Резьба, дюйм") === row.thread
    && item.fields.every(f => !/^(?:Наружный )?Диаметр, мм$/i.test(f.headerPath.at(-1) ?? "") || Number(f.value) === row.outerDiameterMm)
    && item.fields.every(f => !/^Толщина(?: 1)?, мм$/i.test(f.headerPath.at(-1) ?? "") || Number(f.value) === row.wallThicknessMm));
}
