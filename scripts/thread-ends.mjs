/** Add separate ready-made ends; full sensor sgons keep their original identity. */
export function mergeThreadEnds(input, reference) {
  if (input.source.sha256 !== reference.sourceSha256) throw new Error("Thread ends workbook mismatch");
  const data = structuredClone(input), catalog = data.catalogs.find(c => c.id === "сгоны-резьба");
  if (!catalog) throw new Error("Thread catalogue missing");
  const field = (column, label, value) => ({ column, headerPath: [label], value });
  for (const material of ["st20", "aisi304"]) {
    const tableId = `ready-thread-ends-${material}-20261030`, family = `Готовые приварные резьбовые концы ${material === "st20" ? "Ст20" : "AISI304"}`;
    const items = reference.rows.filter(r => r.material === material).map((r, i) => ({
      id: r.id, catalogId: catalog.id, tableId, family, sourceSheet: "Подтверждённые резьбовые концы 30.10.2026", sourceRow: i + 1,
      fields: [field("NAME", "Наименование", `Резьбовой патрубок DN${r.dn} ${r.thread} ${material === "st20" ? "СТ20" : "AISI304"} PN${r.pn} L=${r.lengthMm} ${r.article}`),
        field("PURPOSE", "Назначение", "Резьбовой конец вставки"), field("DN", "DN", r.dn), field("PN", "PN", r.pn), field("THREAD", "Резьба, дюйм", r.thread), field("GENDER", "Исполнение резьбы", "НР"),
        field("OD", "Диаметр, мм", r.outerDiameter), field("WALL", "Толщина, мм", r.wallThickness), field("L", "Длина, мм", r.lengthMm),
        field("DIM_SOURCE", "Источник размеров", r.dimensionsSource), field("L_SOURCE", "Источник длины", r.dimensionsSource), field("PRICE_SOURCE", "Источник цены", r.priceSource),
        field("CHECKED", "Дата проверки", reference.checkedAt), field("ARTICLE", "Артикул", r.article), field("MAKER", "Производитель", r.manufacturer), field("NOTE", "Примечание", r.note), field("ISSUES", "Неподтверждённые данные", r.warnings.join(" "))],
      prices: r.price === null ? [] : [{ label: "Цена, ₽/шт.", amount: r.price, currency: "RUB", sourceColumn: "PRICE" }],
      sourceUrls: [...new Set([r.dimensionsSource, r.priceSource])],
    }));
    for (const item of items) {
      // A rebuild must never reset edits made to a previously added source row.
      if (!data.items.some(old => old.id === item.id)) data.items.push(item);
    }
    const table = catalog.tables.find(t => t.id === tableId);
    if (!table) catalog.tables.push({ id: tableId, title: family, sourceRange: `1:${items.length}`, sourceUrls: [...new Set(items.flatMap(i => i.sourceUrls))], headerRows: [], columns: items[0].fields.map(f => ({ column: f.column, headerPath: f.headerPath })), recordIds: items.map(i => i.id) });
    else {
      table.recordIds = [...new Set([...table.recordIds, ...items.map(i => i.id)])];
      table.sourceUrls = [...new Set([...table.sourceUrls, ...items.flatMap(i => i.sourceUrls)])];
    }
  }
  Object.assign(data.statistics, { tables: data.catalogs.reduce((n,c) => n+c.tables.length,0), componentRows: data.items.length, pricedComponentRows: data.items.filter(i => i.prices.length).length, priceEntries: data.items.reduce((n,i) => n+i.prices.length,0) });
  data.quality.catalogRecordCounts[catalog.id] = data.items.filter(i => i.catalogId === catalog.id).length;
  return data;
}
