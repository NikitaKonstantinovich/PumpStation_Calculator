const value = (item, label) => item.fields.find(f => f.headerPath.at(-1) === label)?.value;
const numeric = v => Number(String(v ?? "").match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(",", "."));
const setField = (item, label, fieldValue) => {
  const index = item.fields.findIndex(f => f.headerPath.at(-1) === label);
  const field = { column: index < 0 ? label : item.fields[index].column, headerPath: [label], value: fieldValue };
  if (index < 0) item.fields.push(field); else item.fields[index] = field;
};
const prices = item => item.prices.filter(p => p.currency === "RUB" && Number.isFinite(p.amount) && p.amount >= 0).map(p => p.amount);
const pressureGroup = (dn, pn) => dn <= 80 && pn >= 10 && pn <= 40 ? [10,16,25,40]
  : dn >= 100 && dn <= 250 && [10,16].includes(pn) ? [10,16]
  : [100,125,150].includes(dn) && [25,40].includes(pn) ? [25,40] : [pn];

// Match the actual gasket execution, not just DN. Legacy PN10 rows had a
// formula-generated 10–40 label even for diameters with different dimensions.
function identity(item) {
  if (item.catalogId !== "прокладки") return null;
  const dn = numeric(value(item,"DN")), pn = numeric(value(item,"PN"));
  const name = String(value(item,"Наименование") ?? item.family);
  if (!Number.isFinite(dn) || !Number.isFinite(pn)) return null;
  if (/л[её]н /i.test(name)) return `flax:${dn}:${pn}`;
  if (!/паронит/i.test(name) || !/15180-86/.test(name) || !/[АA]\s*-\s*\d/.test(name)) return null;
  const thickness = numeric(value(item,"Толщина, мм"));
  if (Number.isFinite(thickness) && thickness !== 2) return null;
  const group = pressureGroup(dn,pn);
  return `gasket:${dn}:${group.join(",")}:A:2`;
}

export function mergeSealingSupplement(binding, supplement) {
  const data = structuredClone(binding);
  const catalog = data.catalogs.find(c => c.id === "прокладки");
  if (!catalog) throw new Error("Gasket catalogue missing");
  const sourceRows = [
    ...supplement.gaskets.map((row,index) => ({...row, kind:"gasket",sourceRow:index+2})),
    ...supplement.flax.map((row,index) => ({...row, kind:"flax",sourceRow:index+24})),
  ];
  const targets = sourceRows.map(row => {
    const item = {id:`${supplement.id}:${row.kind}-${row.dn}-${row.pn}`,catalogId:"прокладки",tableId:supplement.id,
      family:row.kind === "gasket" ? "Уплотнения паронитовые для фланцев" : "Лён для уплотнения труб",
      sourceSheet:supplement.source,sourceRow:row.sourceRow,fields:[],prices:[],sourceUrls:[]};
    setField(item,"DN",row.dn);setField(item,"PN",row.pn);
    setField(item,"Наименование",row.kind === "gasket" ? `Прокладка паронитовая А-${row.dn} Ру (${row.compatiblePn.join("/")}) ГОСТ 15180-86` : "Лён для уплотнения труб");
    return {row,item,key:identity(item)};
  });
  for (const {row,item:template,key} of targets) {
    const duplicates = data.items.filter(item => identity(item) === key);
    const item = duplicates[0] ?? template;
    const maxPrice = Math.max(row.price,...duplicates.flatMap(prices));
    const ids = new Set(duplicates.slice(1).map(v => v.id));
    data.items = data.items.filter(v => !ids.has(v.id));
    if (!duplicates.length) data.items.push(item);
    setField(item,"DN",row.dn);setField(item,"PN",row.pn);
    setField(item,"Наименование",value(template,"Наименование"));
    setField(item,"Источник дополнения",supplement.source);
    if (row.kind === "gasket") {
      setField(item,"Толщина, мм",2);
      setField(item,"Совместимые PN",row.compatiblePn.join("/"));
      setField(item,"Исполнение","А");
      setField(item,"Единица цены","шт.");
      setField(item,"Основание совместимости",`${supplement.standardUrl} · таблица 3`);
    } else {
      setField(item,"Размер резьбы",row.thread);
      setField(item,"Единица цены",row.priceUnit ?? "требует уточнения");
    }
    const priceLabel = row.kind === "gasket" ? "Цена, ₽/шт" : `Цена, ₽${row.priceUnit ? `/${row.priceUnit}` : " (единица требует уточнения)"}`;
    // Keep price cells consistent with the one effective maximum price.
    item.fields = item.fields.filter(f => !/^(?:цен[аы]|стоимость)(?:,|\s|$)/i.test(f.headerPath.at(-1) ?? ""));
    setField(item,priceLabel,maxPrice);
    item.prices = [{label:priceLabel,amount:maxPrice,currency:"RUB",sourceColumn:priceLabel}];
  }
  const newItems = data.items.filter(v => v.tableId === supplement.id);
  if (newItems.length) {
    const table = {id:supplement.id,title:"Уплотнения из таблицы пользователя",sourceRange:"Строки 2–25 изображения",headerRows:[],sourceUrls:[],columns:[],recordIds:[]};
    catalog.tables = [...catalog.tables.filter(t => t.id !== supplement.id),table];
  }
  for (const table of catalog.tables) {
    const rows = data.items.filter(v => v.tableId === table.id);
    table.recordIds = rows.map(v => v.id);
    const columns = new Map();
    for (const item of rows) for (const {column,headerPath} of item.fields) columns.set(column,{column,headerPath});
    table.columns = [...columns.values()];
  }
  data.supplementarySources = [...(data.supplementarySources ?? []).filter(v => v.id !== supplement.id),{id:supplement.id,source:supplement.source,sourceImage:supplement.sourceImage,documentUrl:supplement.standardUrl}];
  Object.assign(data.statistics,{
    tables:data.catalogs.reduce((n,c) => n+c.tables.length,0),componentRows:data.items.length,
    pricedComponentRows:data.items.filter(v => v.prices.length).length,priceEntries:data.items.reduce((n,v) => n+v.prices.length,0),
  });
  data.quality.catalogRecordCounts["прокладки"] = data.items.filter(v => v.catalogId === "прокладки").length;
  return data;
}
