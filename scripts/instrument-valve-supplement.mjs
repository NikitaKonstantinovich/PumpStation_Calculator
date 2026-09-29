// User-confirmed replacement for the workbook's unnamed DN15 drain/vent valve.
export function mergeInstrumentValve(binding, valve) {
  const data = structuredClone(binding);
  const value = (item,label) => item.fields.find(f => f.headerPath.at(-1) === label)?.value;
  const matches = data.items.filter(item => item.id === valve.legacyId ||
    (item.catalogId === valve.catalogId && value(item,"Артикул") === valve.article));
  const item = matches.find(v => v.id === valve.legacyId) ?? matches[0] ?? {
    id:valve.legacyId,catalogId:valve.catalogId,tableId:valve.tableId,
    sourceSheet:"Обвязка",sourceRow:203,fields:[],prices:[],sourceUrls:[],
  };
  const duplicateIds = new Set(matches.filter(v => v !== item).map(v => v.id));
  data.items = data.items.filter(v => !duplicateIds.has(v.id));
  if (!matches.length) data.items.push(item);
  item.family = valve.name;
  const set = (label,newValue) => {
    const index = item.fields.findIndex(f => f.headerPath.at(-1) === label);
    const field = {column:index < 0 ? label : item.fields[index].column,headerPath:[label],value:newValue};
    if (index < 0) item.fields.push(field); else item.fields[index] = field;
  };
  set("Наименование",valve.name);set("Производитель",valve.manufacturer);set("Артикул",valve.article);
  set("DN",valve.dn);set("PN",valve.pn);set("Материал","Латунь");set("Источник уточнения",valve.source);
  item.fields = item.fields.filter(f => !/^Цена(?:,|\s)/i.test(f.headerPath.at(-1) ?? ""));
  set("Цена, ₽/шт",valve.price);
  item.prices = [{label:"Цена, ₽/шт",amount:valve.price,currency:"RUB",sourceColumn:"Цена, ₽/шт"}];
  const catalog = data.catalogs.find(c => c.id === valve.catalogId);
  if (!catalog) throw new Error("Ball valve catalogue missing");
  if (!catalog.tables.some(t => t.id === item.tableId)) catalog.tables.push({
    id:item.tableId,title:valve.name,sourceRange:valve.source,sourceUrls:[],headerRows:[],columns:[],recordIds:[],
  });
  for (const table of catalog.tables) {
    const rows = data.items.filter(v => v.tableId === table.id);
    table.recordIds = rows.map(v => v.id);
    if (table.id === item.tableId) {
      const columns = new Map(table.columns.map(c => [c.column,c]));
      for (const {column,headerPath} of item.fields) columns.set(column,{column,headerPath});
      table.columns = [...columns.values()];
    }
  }
  data.supplementarySources = [...(data.supplementarySources ?? []).filter(s => s.id !== valve.id),{id:valve.id,source:valve.source}];
  Object.assign(data.statistics,{
    tables:data.catalogs.reduce((n,c) => n+c.tables.length,0),componentRows:data.items.length,
    pricedComponentRows:data.items.filter(v => v.prices.length).length,priceEntries:data.items.reduce((n,v) => n+v.prices.length,0),
  });
  data.quality.catalogRecordCounts[valve.catalogId] = data.items.filter(v => v.catalogId === valve.catalogId).length;
  return data;
}
