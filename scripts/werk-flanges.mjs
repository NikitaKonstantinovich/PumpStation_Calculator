import { mergeSupplierFlanges } from "./supplier-flanges.mjs";

/** Exact supplier SKUs; workbook parts, prices and CAD bindings remain separate. */
export function mergeWerkFlanges(input, reference) {
  const data = mergeSupplierFlanges(input, reference);
  for (const row of reference.rows) {
    const item = data.items.find(item => item.id === row.id);
    const field = (column, label, value) => ({ column, headerPath: [label], value });
    item.fields.push(
      field("article", "Артикул", row.supplierProductId),
      field("manufacturer", "Производитель", row.supplier),
      field("unit", "Единица измерения", "шт."),
      field("weight", "Масса по карточке, кг", row.weightKg),
      field("standard", "Стандарт по карточке", "DIN 2576 (C), PN16 — обозначение поставщика"),
      field("cadReview", "Проверка совместимости 3D", row.cadReview),
    );
    item.sourceUrls.push(reference.dimensionUrl);
  }
  const table = data.catalogs.find(c => c.id === "фланцы").tables.find(t => t.id === reference.id);
  table.sourceUrls.push(reference.dimensionUrl);
  table.columns = data.items.find(item => item.tableId === reference.id).fields.map(({ column, headerPath }) => ({ column, headerPath }));
  return data;
}
