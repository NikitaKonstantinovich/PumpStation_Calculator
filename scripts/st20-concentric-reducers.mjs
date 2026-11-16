/** Reviewed ST20 additions. Supplier/material substitution never changes the source rows. */
export function mergeSt20ConcentricReducers(input, reference, standards) {
  if (input.source.sha256 !== reference.sourceSha256) throw new Error("ST20 reducer workbook mismatch");
  const data = structuredClone(input), byId = new Map(data.items.map(item => [item.id, item]));
  const catalog = data.catalogs.find(item => item.id === "переходы");
  if (!catalog) throw new Error("Reducer catalogue missing");
  const field = (column, label, value) => ({ column, headerPath: [label], value });
  const values = item => ["D", "E", "F", "G"].map(column => item?.fields.find(f => f.column === column)?.value);
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const seen = new Set(), slots = new Set();
  const items = reference.rows.map((row, index) => {
    const origin = byId.get(row.sourceId), slot = JSON.stringify([row.dn, row.pn, ...row.dims]);
    if (seen.has(row.id) || slots.has(slot) || !row.id.startsWith("st20-concentric:")
      || origin?.tableId !== "переходы-001" || !equal(values(origin), row.dims)
      || !row.matchFields.every(f => origin.fields.some(v => v.column === f.column && v.value === f.value))
      || ![row.dn, row.pn, ...row.dims, row.price.amount].every(v => Number.isFinite(v) && v > 0)
      || !(row.dims[0] > row.dims[1]) || (row.lengthMm !== null && !(row.lengthMm > 0))) throw new Error(`Invalid ST20 reducer: ${row.id}`);
    seen.add(row.id); slots.add(slot);
    if (row.geometryDonorId) {
      const donor = byId.get(row.geometryDonorId);
      if (donor?.tableId !== "переходы-005" || !equal(values(donor), row.dims)) throw new Error(`Different AISI geometry: ${row.id}`);
    }
    if (row.lengthBasis === "standard" && !standards.referenceGroups.some(g => equal([g.outerDiameter, g.outerDiameterSmall], row.dims.slice(0, 2))
      && g.lengthMm === row.lengthMm && g.wallPairs.some(w => equal(w, row.dims.slice(2))))) throw new Error(`Unverified standard length: ${row.id}`);
    const quote = reference.offers.find(q => q.id === row.price.quoteId);
    if (row.price.basis === "supplier") {
      if (!quote || quote.material !== "st20" || quote.geometry !== "concentric" || !equal(quote.dims, row.dims)
        || quote.amount !== row.price.amount || !quote.url.startsWith("https://")) throw new Error(`Mismatched price offer: ${row.id}`);
    } else if (row.price.basis !== "eccentric-fallback" || row.price.donorId !== origin.id
      || !origin.prices.some(p => /Цена/i.test(p.label) && p.currency === "RUB" && p.amount === row.price.amount)) throw new Error(`Changed fallback price: ${row.id}`);
    const [D, d, T, t] = row.dims;
    const name = `Переход концентрический ${D}×${T}–${d}×${t} СТ20`;
    const fields = [...structuredClone(row.matchFields), field("H", "Наименование", name),
      field("material", "Материал", "СТ20"), field("geometry", "Исполнение", "Концентрическое"),
      field("origin", "ID исходного исполнения СТ20", row.sourceId),
      field("lengthBasis", "Основание геометрии", row.lengthSource),
      field("priceBasis", "Способ определения цены", row.price.basis === "supplier" ? "Прайс поставщика" : "Принята как у эксцентрического"),
      field("priceSource", "Источник цены", row.price.source), field("priceDate", "Дата проверки цены", reference.checkedAt),
      field("I", "Цена, ₽/шт", row.price.amount)];
    if (row.dnSmall) fields.push(field("dnSmall", "DN меньший", row.dnSmall), field("dnSmallSource", "Источник меньшего DN", row.dnSmallSource));
    if (row.lengthMm !== null) fields.push(field("CALC_ST20_LENGTH_MM", "Длина перехода, мм", row.lengthMm), field("CALC_ST20_LENGTH_SOURCE", "Источник длины", row.lengthSource));
    if (row.geometryDonorId) fields.push(field("geometryDonor", "ID геометрического аналога AISI304", row.geometryDonorId));
    return { id: row.id, catalogId: "переходы", tableId: reference.id, family: reference.family,
      sourceSheet: catalog.sourceSheet, sourceRow: index + 1, fields,
      prices: [{ amount: row.price.amount, currency: "RUB", sourceColumn: "I", label: "Цена, ₽/шт" }],
      sourceUrls: [reference.standardUrl, ...(quote ? [quote.url] : [])] };
  });
  data.items = [...data.items.filter(item => item.tableId !== reference.id), ...items];
  catalog.tables = [...catalog.tables.filter(t => t.id !== reference.id), { id: reference.id, title: reference.family,
    sourceRange: `Дополнение ${reference.checkedAt}`, sourceUrls: [reference.standardUrl, reference.standardRegistry], headerRows: [],
    columns: [...new Map(items.flatMap(i => i.fields).map(f => [f.column, { column: f.column, headerPath: f.headerPath }])).values()],
    recordIds: items.map(item => item.id) }];
  Object.assign(data.statistics, { tables: data.catalogs.reduce((sum, item) => sum + item.tables.length, 0), componentRows: data.items.length,
    pricedComponentRows: data.items.filter(i => i.prices.length).length, priceEntries: data.items.reduce((sum, i) => sum + i.prices.length, 0) });
  data.quality.catalogRecordCounts["переходы"] = data.items.filter(i => i.catalogId === "переходы").length;
  return data;
}
