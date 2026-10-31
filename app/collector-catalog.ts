import type { CollectorCatalog, CollectorComponent, ComponentKind } from "./collector-calculations";
import { selectJointFasteners } from "./line-spec-parts";
import fastenerReference from "./suction-fasteners.json";
import { readPipePaintingRates } from "./component-painting.ts";

type Field = { column: string; headerPath: string[]; value: unknown };
type Item = { id: string; catalogId: string; tableId: string; family: string; sourceSheet: string; sourceRow: number; fields: Field[]; prices: Array<{ amount: number; currency: string; sourceColumn: string; label: string }> };
export type BindingCatalog = { source: { sha256: string; importedAt: string }; items: Item[]; collectorReference?: { bolts: CollectorCatalog["bolts"]; nippleDiameters: Array<{ dn: number; material: "st20" | "aisi304"; outerDiameter: number; source: string }> } };
const number = (value: unknown) => { const match = String(value ?? "").replace(",", ".").match(/\d+(?:\.\d+)?/); return match ? Number(match[0]) : null; };
const field = (item: Item, pattern: RegExp) => item.fields.find(v => pattern.test(v.headerPath.at(-1) ?? ""))?.value;
export function makeCollectorCatalog(data: BindingCatalog): CollectorCatalog {
  const components: CollectorComponent[] = [];
  for (const item of data.items) {
    // Compact insertion ends are purchased one-thread stubs, not the existing collector sgons.
    if (field(item, /^Назначение$/i) === "Резьбовой конец вставки") continue;
    const material = /AISI\s*304/i.test(item.family) ? "aisi304" : /(?:сталь|ст[.\s]*)\s*20/i.test(item.family) ? "st20" : /латун/i.test(item.family) ? "brass" : null;
    if (!material) continue;
    let kind: ComponentKind | null = null;
    if (item.catalogId === "трубы") kind = "pipe";
    else if (item.catalogId === "сгоны-резьба") kind = "nipple";
    else if (item.catalogId === "воротники") kind = "collar";
    else if (item.catalogId === "фланцы" && /свободн|воротник/i.test(item.family)) kind = "looseFlange";
    else if (item.catalogId === "фланцы" && /плоск|приварн/i.test(item.family)) kind = "weldFlange";
    else if (/заглушк/i.test(item.family) && /резьб/i.test(item.family)) kind = "plug";
    if (!kind) continue;
    const dn = number(field(item, /^DN$/i));
    if (!dn) continue;
    // Merged PN cells are only present on the first source row of a table.
    const directPn = number(field(item, /^PN$|^Давление$/i));
    const inheritedPn = data.items.filter(v => v.tableId === item.tableId && v.sourceRow <= item.sourceRow).sort((a,b) => b.sourceRow-a.sourceRow).map(v => number(field(v, /^PN$|^Давление$/i))).find(v => v !== null) ?? null;
    // Supplier PN is explicit per SKU; an unknown larger size must not inherit PN40.
    const pn = kind === "plug" ? directPn : directPn ?? inheritedPn;
    const price = item.prices.find(v => v.currency === "RUB" && (kind === "pipe" ? /₽\/м|руб.*\/м/.test(v.label) : /цен/i.test(v.label)));
    const outer = number(field(item, /^(?:Наружный )?Диаметр, мм$/i)), thickness = number(field(item, /^Толщина, мм$/i));
    const nippleRef = kind === "nipple" ? data.collectorReference?.nippleDiameters.find(v => v.dn === dn && v.material === material) : null;
    const thread = field(item, /^Резьба$/i);
    const supplierUrl = field(item, /^Источник URL$/i), priceDate = field(item, /^Дата цены$/i), documentUrl = field(item, /^Паспорт URL$/i);
    components.push({ id: item.id, kind, name: String(field(item, /^Наименование$/i) ?? `${item.family} DN${dn}`), dn, pn, material,
      ...(thread === "ВР" ? { threadGender: "female" as const } : thread === "НР" ? { threadGender: "male" as const } : {}),
      price: price?.amount ?? null, outerDiameter: outer ?? nippleRef?.outerDiameter ?? null, innerDiameter: outer && thickness ? outer - 2 * thickness : null,
      requiredPipeOuterDiameterMm: number(field(item, /^Наружный диаметр трубы для проверки посадки, мм$/i)) ?? undefined,
      source: supplierUrl ? `${supplierUrl}; ${field(item, /^Условия цены$/i) ?? "цена с НДС"}; дата ${priceDate ?? "неизвестна"}${documentUrl ? `; паспорт: ${documentUrl}` : ""}` : `${item.sourceSheet}!строка ${item.sourceRow}${price ? `, цена ${price.sourceColumn}${item.sourceRow}` : ""}${nippleRef ? `; Ø: ${nippleRef.source}` : ""}` });
  }
  // Same standard bolt selection as the station's 017W joints, using live catalogue dimensions and hardware.
  const valveBolts: NonNullable<CollectorCatalog["valveBolts"]> = [];
  for (const material of ["st20", "aisi304"] as const) for (const { dn, pn } of fastenerReference) {
    const selected = selectJointFasteners(data, material, dn, pn, true);
    if (!selected) continue;
    const warnings = [...selected.warnings], label = `Затвор 017W DN${dn} PN${pn} ${material === "st20" ? "СТ20" : "AISI304"}`;
    if (!selected.stack.thickness || selected.stack.thickness <= 0) warnings.push(`${label}: отсутствует длина корпуса затвора`);
    if (!selected.nutWidth) warnings.push(`${label}: нет размера гайки М${selected.diameter}`);
    if (!selected.washerWidth) warnings.push(`${label}: нет толщины шайбы М${selected.diameter}`);
    if (!selected.flangeThickness) warnings.push(`${label}: не подтверждена толщина фланцевого пакета`);
    if (!selected.standardLength) warnings.push(`${label}: нет стандартного болта М${selected.diameter}${selected.length ? ` длиной не менее ${selected.length} мм` : " с подтверждённой длиной"}`);
    valveBolts.push({ dn, pn, material, model: "017W", length: selected.standardLength, minimumLengthMm: selected.length, componentId: selected.bolt?.id ?? null, diameter: selected.diameter,
      source: `${label}; ${selected.source}; две прокладки по 2 мм, гайка, шайба, выступ резьбы 5 мм; выбранный болт: ${selected.bolt?.id ?? "не найден"}`, warnings: [...new Set(warnings)] });
  }
  return { version: `collector:v3:017W:${data.source.sha256}:${data.source.importedAt}`, components, valveBolts, bolts: data.collectorReference?.bolts ?? [], paintingRates: readPipePaintingRates(data) };
}
