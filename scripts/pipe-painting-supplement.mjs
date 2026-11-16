const fieldValue = (item, label) => item.fields.find(field => field.headerPath.at(-1) === label)?.value;
const positive = value => typeof value === "number" && Number.isFinite(value) && value > 0;
const numericDn = value => Number(String(value).replace(/^DN\s*/i, ""));
const field = (column, label, value) => ({ column, headerPath: [label], value });

/** Linear continuation of the nearest source segment; reserve applies only to estimates. */
export function paintingPrice(diameterMm, reference) {
  const rows = [...reference.rows].sort((a, b) => a.diameterMm - b.diameterMm);
  if (!positive(diameterMm) || rows.length < 2 || rows.some(row => !positive(row.diameterMm) || !positive(row.pricePerMeter)) || new Set(rows.map(row => row.diameterMm)).size !== rows.length) throw new Error("Invalid painting price source");
  if (!Number.isFinite(reference.reservePercent) || reference.reservePercent < 0) throw new Error("Invalid painting reserve");
  const exact = rows.find(row => row.diameterMm === diameterMm);
  if (exact) return { price: exact.pricePerMeter, basePrice: exact.pricePerMeter, method: "Прайс", reservePercent: 0, anchors: [exact], formula: `Цена B${exact.row} без дополнительного запаса` };
  const upper = rows.findIndex(row => row.diameterMm > diameterMm);
  const index = upper < 0 ? rows.length - 2 : Math.max(0, upper - 1);
  const [a, b] = rows.slice(index, index + 2);
  const basePrice = a.pricePerMeter + (diameterMm - a.diameterMm) * (b.pricePerMeter - a.pricePerMeter) / (b.diameterMm - a.diameterMm);
  const price = Math.round(basePrice * (1 + reference.reservePercent / 100) * 100) / 100;
  if (!positive(price)) throw new Error(`Painting estimate is not positive for Ø${diameterMm}`);
  const method = diameterMm < rows[0].diameterMm || diameterMm > rows.at(-1).diameterMm ? "Экстраполяция" : "Интерполяция";
  return { price, basePrice, method, reservePercent: reference.reservePercent, anchors: [a, b], formula: `(${a.pricePerMeter} + (${diameterMm} − ${a.diameterMm}) × (${b.pricePerMeter} − ${a.pricePerMeter}) / (${b.diameterMm} − ${a.diameterMm})) × (1 + ${reference.reservePercent}/100); округление до 0,01 ₽/м` };
}

export function mergePipePainting(binding, reference) {
  if (reference.source.unit !== "RUB/m") throw new Error("Painting prices must be RUB/m");
  const data = structuredClone(binding);
  const catalog = data.catalogs.find(catalog => catalog.id === "работы");
  if (!catalog) throw new Error("Works catalogue missing");
  const byDn = new Map();
  for (const pipe of data.items.filter(item => item.catalogId === "трубы" && /(?:сталь|ст[.\s]*)\s*20/i.test(item.family))) {
    const dn = numericDn(fieldValue(pipe, "DN")), diameter = fieldValue(pipe, "Диаметр, мм");
    if (!Number.isInteger(dn) || !positive(dn) || !positive(diameter)) throw new Error(`Missing pipe DN/diameter: ${pipe.id}`);
    const existing = byDn.get(dn);
    if (existing && existing.diameter !== diameter) throw new Error(`Ambiguous painting diameter for DN${dn}: ${existing.diameter}/${diameter}`);
    byDn.set(dn, { diameter, pipeId: pipe.id });
  }
  if (!byDn.size) throw new Error("No St20 pipes for painting rates");
  const items = [...byDn].sort(([a], [b]) => a - b).map(([dn, { diameter, pipeId }], index) => {
    // Explicit DN mappings preserve the supplier's small-size labels; no fuzzy diameter matching.
    const alias = reference.diameterAliases.find(row => row.dn === dn && row.catalogDiameterMm === diameter);
    const sourceDiameter = alias?.sourceDiameterMm ?? diameter;
    const rate = paintingPrice(sourceDiameter, reference);
    const cells = rate.anchors.map(row => `A${row.row}:B${row.row}`).join(", ");
    const provenance = `${reference.source.file}; ${reference.source.sheet}!${cells}; SHA256 ${reference.source.sha256}`;
    const mapping = `DN${dn} → Ø${diameter} мм (${pipeId})${alias ? `; размер прайса Ø${sourceDiameter} мм сопоставлен тому же DN` : ""}`;
    return { id: `${reference.id}:dn${dn}`, catalogId: "работы", tableId: reference.id, family: "Окраска труб Ст20 по DN",
      sourceSheet: reference.source.sheet, sourceRow: index + 1, sourceUrls: [],
      fields: [field("NAME", "Наименование", `Окраска трубы DN${dn} СТ20`), field("DN", "DN", dn), field("MATERIAL", "Материал", "СТ20"),
        field("OD", "Наружный диаметр трубы, мм", diameter), field("PRICE_UNIT", "Единица цены", "м"),
        field("METHOD", "Метод цены", rate.method), field("RESERVE", "Запас, %", rate.reservePercent),
        field("BASE_PRICE", "Цена до запаса, ₽/м", rate.basePrice), field("FORMULA", "Расчёт тарифа", rate.formula),
        field("MAPPING", "Соответствие DN", mapping), field("SOURCE", "Источник тарифа", provenance)],
      prices: [{ label: "Цена, ₽/м", amount: rate.price, currency: "RUB", sourceColumn: "PAINTING_PRICE" }],
    };
  });
  data.items = [...data.items.filter(item => item.tableId !== reference.id), ...items];
  catalog.tables = [...catalog.tables.filter(table => table.id !== reference.id), {
    id: reference.id, title: "Окраска труб Ст20 по DN", sourceRange: reference.source.range, headerRows: [4], sourceUrls: [],
    columns: items[0].fields.map(({ column, headerPath }) => ({ column, headerPath })), recordIds: items.map(item => item.id),
  }];
  data.supplementarySources = [...(data.supplementarySources ?? []).filter(source => source.id !== reference.id), { id: reference.id, ...reference.source }];
  Object.assign(data.statistics, { tables: data.catalogs.reduce((sum, catalog) => sum + catalog.tables.length, 0), componentRows: data.items.length,
    pricedComponentRows: data.items.filter(item => item.prices.length).length, priceEntries: data.items.reduce((sum, item) => sum + item.prices.length, 0) });
  data.quality.catalogRecordCounts["работы"] = data.items.filter(item => item.catalogId === "работы").length;
  return data;
}
