// Kept separately from the workbook so a repeat XLSM import cannot lose supplier data.
export function mergeBindingSupplement(binding, supplier) {
  const data = structuredClone(binding);
  const catalog = data.catalogs.find(v => v.id === supplier.catalogId);
  if (!catalog) throw new Error(`Unknown supplement category: ${supplier.catalogId}`);
  const field = (column, label, value) => ({ column, headerPath: [label], value });
  const items = supplier.items.map((item, index) => ({
    id: `${supplier.id}:${item.article}`, catalogId: supplier.catalogId, tableId: supplier.id,
    family: supplier.family, sourceSheet: "Lunda", sourceRow: index + 1,
    fields: [
      field("name", "Наименование", `Заглушка ${item.thread} ВР, латунь никелированная, ${item.article}`),
      field("manufacturer", "Производитель", supplier.manufacturer),
      field("article", "Артикул", item.article), field("supplierArticle", "Артикул Lunda", item.supplierArticle),
      field("dn", "DN", item.dn), field("thread", "Размер резьбы", item.thread),
      field("threadGender", "Резьба", supplier.threadGender), field("pn", "PN", item.pn),
      field("material", "Материал", supplier.material), field("alloy", "Сплав", supplier.alloy),
      field("pressureNote", "Данные давления", supplier.pressureNote),
      field("priceUpdatedAt", "Дата цены", supplier.priceUpdatedAt),
      field("sourceUrl", "Источник URL", supplier.sourceUrl), field("documentUrl", "Паспорт URL", supplier.documentUrl),
    ],
    prices: [{ amount: item.price, currency: supplier.currency, sourceColumn: "price", label: "Цена с НДС, ₽/шт." }],
    sourceUrls: [supplier.sourceUrl, supplier.documentUrl],
  }));
  data.items = [...data.items.filter(v => v.tableId !== supplier.id), ...items];
  catalog.tables = [...catalog.tables.filter(v => v.id !== supplier.id), {
    id: supplier.id, title: supplier.family, sourceRange: "Карточка товара: 6 исполнений",
    sourceUrls: [supplier.sourceUrl, supplier.documentUrl], headerRows: [],
    columns: items[0].fields.map(({ column, headerPath }) => ({ column, headerPath })),
    recordIds: items.map(v => v.id),
  }];
  data.supplementarySources = [...(data.supplementarySources ?? []).filter(v => v.id !== supplier.id), {
    id: supplier.id, url: supplier.sourceUrl, documentUrl: supplier.documentUrl,
    priceUpdatedAt: supplier.priceUpdatedAt, checkedAt: supplier.checkedAt,
  }];
  Object.assign(data.statistics, {
    tables: data.catalogs.reduce((sum, v) => sum + v.tables.length, 0),
    componentRows: data.items.length,
    pricedComponentRows: data.items.filter(v => v.prices.length).length,
    priceEntries: data.items.reduce((sum, v) => sum + v.prices.length, 0),
  });
  data.quality.catalogRecordCounts[supplier.catalogId] = data.items.filter(v => v.catalogId === supplier.catalogId).length;
  return data;
}
