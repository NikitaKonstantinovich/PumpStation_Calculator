// Legacy mating parts are transcribed from the user's PN16 table.
import { markLegacyNomenclature } from "./component-nomenclature";
export type AssemblyComponent = { tableId?: string; sourceSheet?: string; sourceRow?: number; id: string; catalogId: string; family: string; fields: Array<{ column: string; headerPath: string[]; value: unknown }>; prices: Array<{ label: string; amount: number; currency: string }>; calculatedInsertion?: import("./calculated-insertion").CalculatedInsertion };
export const matingParts = [
  { dn:20, threadDn:15, price:920 }, { dn:25, threadDn:25, price:920 },
  { dn:32, threadDn:32, price:920 }, { dn:40, threadDn:40, price:1300 }, { dn:50, threadDn:50, price:1300 },
];
export const insertionPrices: Record<number, number> = {65:4140,80:4140,100:4140,125:8000,150:16000,200:32000,250:50000};
export const unionPrices: Record<number, number> = {25:655.14,32:1223.66,40:1512.8,50:2381.44};
const valtecUnionSource = "https://valtec.ru/catalog/rezbovye_i_remontnye_soedineniya_dlya_truboprovodov/rezbovye_fitingi/fiting_rezbovoj_sgon_razemnyj_vtr341n.html";
const valtecUnionPassport = "https://valtec.ru/document/technical/VTr.098-340-340C-341-728-0924.pdf";
const valtecCheckSource = "https://valtec.ru/catalog/reguliruyuschaya_armatura/obratnye_klapany/obratnyj_klapan_s_latunnym_zolotnikom_vt151n.html";
const valtecCheckPassport = "https://valtec.ru/document/technical/VT.151-0525.pdf";
// Catalogue price (RUB), size, PN and body length for VTr.341.N, checked 13.11.2026.
const valtecUnions = [
  [15, "1/2", 40, 44, 331], [20, "3/4", 40, 50, 543], [25, "1", 40, 60, 1060],
  [32, "1 1/4", 25, 67, 1635], [40, "1 1/2", 25, 78, 2334], [50, "2", 25, 98, 5101],
] as const;
// Use the lower pressure rating where the product card and passport differ.
const valtecChecks = [[15, 25, 582], [20, 25, 830], [25, 25, 1321], [32, 16, 2019], [40, 16, 2787], [50, 16, 4158]] as const;
const component = (id: string, family: string, dn: number, price: number, extra: Record<string, unknown> = {}): AssemblyComponent => ({
  id:`suction-table:${id}`, catalogId:"ответные-части", family,
  fields:Object.entries({DN:`DN${dn}`,PN:"PN16",Источник:"Таблица ответных частей пользователя",...extra}).map(([key,value])=>({column:key,headerPath:[key],value})),
  prices:[{label:"Цена из таблицы, ₽",amount:price,currency:"RUB"}],
});
export const suctionCatalogItems: AssemblyComponent[] = [
  ...matingParts.map(p=>component(`rf-${p.dn}`,`Ответная часть РФ DN${p.dn} — резьба DN${p.threadDn}`,p.dn,p.price,{"DN резьбы":p.threadDn})),
  ...Object.entries(insertionPrices).map(([dn,price])=>markLegacyNomenclature(component(`ff-${dn}`,`Вставка ФФ DN${dn}–${dn}`,Number(dn),price))),
  ...Object.entries(unionPrices).map(([dn,price])=>component(`union-${dn}`,`Американка НР-НР DN${dn}${dn==="50"?", нержавеющая":", никелированная Gappo"}`,Number(dn),price)),
  ...valtecUnions.map(([dn, thread, pn, length, amount], index) => {
    const article = `VTr.341.N.000${index + 4}`;
    return { ...component(`union-valtec-${dn}`, `Сгон разъёмный (американка) VALTEC ${article} НР/ВР DN${dn}`, dn, amount, {
      PN: `PN${pn}`, Артикул: article, "Резьба": `G${thread}`, "Резьба со стороны насоса": "НР", "Резьба со стороны ниппеля": "ВР",
      "Габаритная длина, мм": length, Источник: `${valtecUnionSource}; паспорт ${valtecUnionPassport}`,
    }), prices: [{ label: "Цена рекомендованная VALTEC, ₽ (13.11.2026)", amount, currency: "RUB" }] };
  }),
  ...valtecChecks.map(([dn, pn, amount], index) => {
    const article = `VT.151.N.0${index + 4}`;
    return { ...component(`check-valtec-${dn}`, `Обратный клапан с латунным сердечником VALTEC ${article} ВР/ВР`, dn, amount, {
      PN: `PN${pn}`, Артикул: article, "Резьбовое соединение": "ВР/ВР", Источник: `${valtecCheckSource}; паспорт ${valtecCheckPassport}`,
    }), catalogId: "обратные-клапаны", prices: [{ label: "Латунь / Цена рекомендованная VALTEC, ₽ (13.11.2026)", amount, currency: "RUB" }] };
  }),
];
