/** Supplier offers remain separate from the workbook and never replace its prices. */
export function mergeSupplierFlanges(input, reference) {
  const data = structuredClone(input);
  if (data.source.sha256 !== reference.sourceSha256) throw new Error("Supplier flange workbook mismatch");
  const catalog = data.catalogs.find(item => item.id === "фланцы");
  if (!catalog) throw new Error("Flange catalogue missing");
  const field = (column, label, value) => ({ column, headerPath: [label], value });
  const ids = new Set();
  const items = reference.rows.map((row, index) => {
    if (ids.has(row.id) || !(row.price > 0) || !row.url.startsWith("https://") || !row.compatiblePns.includes(row.pn)) throw new Error(`Invalid supplier flange: ${row.id}`);
    ids.add(row.id);
    return { id: row.id, catalogId: "фланцы", tableId: reference.id, family: reference.family,
      sourceSheet: row.supplier, sourceRow: index + 1,
      fields: [field("name", "Наименование", row.name), field("dn", "DN", row.dn), field("pn", "PN", row.pn),
        field("supplier", "Поставщик", row.supplier), field("supplierId", "ID товара поставщика", row.supplierProductId),
        field("material", "Материал", "AISI304"), field("compatiblePns", "Подтверждённые PN исполнения", row.compatiblePns.join("/")),
        field("priceDate", "Дата цены", reference.checkedAt), field("vat", "Условия цены", row.vat),
        field("sourceUrl", "Источник URL", row.url)],
      prices: [{ amount: row.price, currency: "RUB", sourceColumn: "price", label: row.priceLabel }],
      sourceUrls: [row.url],
    };
  });
  for (const item of items) {
    const row = reference.rows.find(row => row.id === item.id);
    if (row.geometryBasis) item.fields.push(field("geometryBasis", "Основание геометрии", row.geometryBasis));
    if (row.pressureSource) item.fields.push(field("pressureSource", "Основание применения PN", row.pressureSource));
  }
  data.items = [...data.items.filter(item => item.tableId !== reference.id), ...items];
  catalog.tables = [...catalog.tables.filter(table => table.id !== reference.id), {
    id: reference.id, title: reference.family, sourceRange: `Проверенный прайс ${reference.checkedAt}`,
    sourceUrls: [...new Set(reference.rows.map(row => row.url))], headerRows: [],
    columns: items[0].fields.map(({ column, headerPath }) => ({ column, headerPath })), recordIds: items.map(item => item.id),
  }];
  data.supplementarySources = [...(data.supplementarySources ?? []).filter(item => item.id !== reference.id), {
    id: reference.id, checkedAt: reference.checkedAt, urls: [...new Set(reference.rows.map(row => row.url))],
  }];
  Object.assign(data.statistics, { tables: data.catalogs.reduce((sum, item) => sum + item.tables.length, 0),
    componentRows: data.items.length, pricedComponentRows: data.items.filter(item => item.prices.length).length,
    priceEntries: data.items.reduce((sum, item) => sum + item.prices.length, 0) });
  data.quality.catalogRecordCounts["фланцы"] = data.items.filter(item => item.catalogId === "фланцы").length;
  return data;
}
