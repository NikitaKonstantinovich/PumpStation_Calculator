import { mergeSupplierFlanges } from "./supplier-flanges.mjs";

/** Retire only the five approved WERK SKUs; keep historical evidence outside the active catalogue. */
export function mergeBeneFlanges(input, reference) {
  const clean = structuredClone(input);
  const retired = reference.replaces;
  const ids = new Set(retired.componentIds);
  for (const item of clean.items) {
    if ((item.tableId === retired.tableId || ids.has(item.id)) &&
        !(item.tableId === retired.tableId && item.family === retired.family && ids.has(item.id))) {
      throw new Error(`Unexpected WERK record, replacement aborted: ${item.id}`);
    }
  }
  clean.items = clean.items.filter(item => !ids.has(item.id));
  for (const catalog of clean.catalogs) catalog.tables = catalog.tables.filter(table => table.id !== retired.tableId);
  clean.supplementarySources = (clean.supplementarySources ?? []).filter(source => source.id !== retired.tableId);
  const data = mergeSupplierFlanges(clean, reference);
  const field = (column, label, value) => ({ column, headerPath: [label], value });
  for (const row of reference.rows) {
    const item = data.items.find(item => item.id === row.id);
    item.fields.push(
      field("article", "Артикул", row.supplierProductId),
      field("manufacturer", "Производитель", row.supplier),
      field("unit", "Единица измерения", "шт."),
      field("weight", "Масса по каталогу, кг", row.weightKg),
      field("standard", "Стандарт по карточке", row.standard),
      field("priceStatus", "Статус цены", row.priceStatus === "on-request" ? "По запросу; цена отсутствует" : "Справочная цена PDF 2020 года; требуется актуальное предложение"),
      field("originalPrice", "Исходная цена, EUR/шт. без НДС", row.originalPriceEur),
      field("fxRate", "Курс EUR/RUB", reference.exchangeRate.rubPerEur),
      field("fxDate", "Дата курса", reference.exchangeRate.date),
      field("priceCheckedAt", "Дата проверки источника", reference.checkedAt),
      field("priceSource", "Источник цены", reference.priceUrl),
      field("fxSource", "Источник курса", reference.exchangeRate.url),
      field("cadUrl", "CAD производителя URL", row.cadUrl),
      field("cadStatus", "Статус CAD", row.cadStatus),
    );
    item.sourceUrls = [...new Set([...item.sourceUrls, reference.priceUrl, reference.exchangeRate.url, row.cadUrl])];
  }
  const table = data.catalogs.find(c => c.id === "фланцы").tables.find(t => t.id === reference.id);
  table.sourceRange = "Каталог 5714; PDF создан 22.06.2020, проверен 30.10.2026; цены справочные";
  table.sourceUrls = [...new Set(data.items.filter(item => item.tableId === reference.id).flatMap(item => item.sourceUrls))];
  table.columns = data.items.find(item => item.tableId === reference.id).fields.map(({ column, headerPath }) => ({ column, headerPath }));
  return data;
}
