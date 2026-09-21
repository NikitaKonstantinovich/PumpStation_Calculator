// Transcribed from the user's mating-parts table. PN16 only; no inferred PN25 prices.
export type AssemblyComponent = { id: string; catalogId: string; family: string; fields: Array<{ column: string; headerPath: string[]; value: unknown }>; prices: Array<{ label: string; amount: number; currency: string }> };
export const matingParts = [
  { dn:20, threadDn:15, price:920 }, { dn:25, threadDn:25, price:920 },
  { dn:32, threadDn:32, price:920 }, { dn:40, threadDn:40, price:1300 }, { dn:50, threadDn:50, price:1300 },
];
export const insertionPrices: Record<number, number> = {65:4140,80:4140,100:4140,125:8000,150:16000,200:32000,250:50000};
export const unionPrices: Record<number, number> = {25:655.14,32:1223.66,40:1512.8,50:2381.44};
const component = (id: string, family: string, dn: number, price: number, extra: Record<string, unknown> = {}): AssemblyComponent => ({
  id:`suction-table:${id}`, catalogId:"ответные-части", family,
  fields:Object.entries({DN:`DN${dn}`,PN:"PN16",Источник:"Таблица ответных частей пользователя",...extra}).map(([key,value])=>({column:key,headerPath:[key],value})),
  prices:[{label:"Цена из таблицы, ₽",amount:price,currency:"RUB"}],
});
export const suctionCatalogItems: AssemblyComponent[] = [
  ...matingParts.map(p=>component(`rf-${p.dn}`,`Ответная часть РФ DN${p.dn} — резьба DN${p.threadDn}`,p.dn,p.price,{"DN резьбы":p.threadDn})),
  ...Object.entries(insertionPrices).map(([dn,price])=>component(`ff-${dn}`,`Вставка ФФ DN${dn}–${dn}`,Number(dn),price)),
  ...Object.entries(unionPrices).map(([dn,price])=>component(`union-${dn}`,`Американка НР-НР DN${dn}${dn==="50"?", нержавеющая":", никелированная Gappo"}`,Number(dn),price)),
];
