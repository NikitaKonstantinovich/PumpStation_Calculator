import { mergeSupplierFlanges } from "./supplier-flanges.mjs";

/** Retire exact supplier series, retaining their historical records in the database. */
export function mergeStandardStainlessFlanges(input, reference) {
  const clean = structuredClone(input);
  for (const retired of reference.replaces) {
    const ids = new Set(retired.componentIds);
    for (const item of clean.items) {
      if ((item.tableId === retired.tableId || ids.has(item.id)) &&
          !(item.tableId === retired.tableId && item.family === retired.family && ids.has(item.id))) {
        throw new Error(`Unexpected retired flange record: ${item.id}`);
      }
    }
    clean.items = clean.items.filter(item => !ids.has(item.id));
    for (const catalog of clean.catalogs) catalog.tables = catalog.tables.filter(table => table.id !== retired.tableId);
    clean.supplementarySources = (clean.supplementarySources ?? []).filter(source => source.id !== retired.tableId);
  }
  const data = mergeSupplierFlanges(clean, reference);
  for (const row of reference.rows) {
    const item = data.items.find(item => item.id === row.id);
    for (const [column, label, value] of [
      ["unit", "Единица измерения", "шт."],
      ["standard", "Стандарт по карточке", row.standard],
      ["geometryDonor", "Исходная позиция геометрии СТ20", row.geometryDonorId ?? "Общий шаблон фланца типа 01"],
      ["modelStatus", "Статус 3D", "Параметрическая геометрия, общий шаблон СТ20; не STEP изготовителя"],
      ["priceSource", "Источник цены", row.priceUrl ?? row.url],
      ["priceNote", "Примечание к цене", row.priceNote],
    ]) item.fields.push({ column, headerPath: [label], value });
    item.sourceUrls = [...new Set([row.url, row.priceUrl ?? row.url, reference.dimensionUrl])];
    if (row.requiredPipeOuterDiameterMm) item.fields.push({ column: "fitPipeOuter", headerPath: ["Наружный диаметр трубы для проверки посадки, мм"], value: row.requiredPipeOuterDiameterMm });
  }
  const table = data.catalogs.find(c => c.id === "фланцы").tables.find(t => t.id === reference.id);
  table.columns = data.items.find(i => i.tableId === reference.id).fields.map(({ column, headerPath }) => ({ column, headerPath }));
  table.sourceUrls = [...new Set(data.items.filter(i => i.tableId === reference.id).flatMap(i => i.sourceUrls))];
  return data;
}
