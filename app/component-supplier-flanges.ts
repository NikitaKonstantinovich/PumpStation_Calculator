import reference from "../data/supplier-flanges.json";
import newkeyReference from "../data/newkey-flanges.json";
import type { BindingCatalog } from "./collector-catalog";

/** A dual PN label is permission for this exact SKU, not a general PN downgrade. */
type Item = Pick<BindingCatalog["items"][number], "id" | "catalogId" | "family" | "fields"> & { tableId?: string };
export function supplierFlangeFor(item: Item, sourceSha256?: string) {
  const source = [reference, newkeyReference].find(source => sourceSha256 === source.sourceSha256 && item.catalogId === "фланцы" && item.tableId === source.id && item.family === source.family);
  if (!source) return null;
  const row = source.rows.find(row => row.id === item.id);
  if (!row) return null;
  for (const [label, expected] of [["Наименование", row.name], ["DN", row.dn], ["PN", row.pn],
    ["Материал", "AISI304"], ["Подтверждённые PN исполнения", row.compatiblePns.join("/")], ["ID товара поставщика", row.supplierProductId],
    ["Основание геометрии", "geometryBasis" in row ? row.geometryBasis : undefined],
    ["Основание применения PN", "pressureSource" in row ? row.pressureSource : undefined]] as const) {
    if (expected === undefined) continue;
    const fields = item.fields.filter(field => field.headerPath.at(-1) === label);
    if (fields.length !== 1 || fields[0].value !== expected) return null;
  }
  return row;
}
