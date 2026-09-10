import type { CollectorCatalog, CollectorComponent, ComponentKind } from "./collector-calculations";

type Field = { column: string; headerPath: string[]; value: unknown };
type Item = { id: string; catalogId: string; tableId: string; family: string; sourceSheet: string; sourceRow: number; fields: Field[]; prices: Array<{ amount: number; currency: string; sourceColumn: string; label: string }> };
export type BindingCatalog = { source: { sha256: string; importedAt: string }; items: Item[]; collectorReference?: { bolts: CollectorCatalog["bolts"]; nippleDiameters: Array<{ dn: number; material: "st20" | "aisi304"; outerDiameter: number; source: string }> } };
const number = (value: unknown) => { const match = String(value ?? "").replace(",", ".").match(/\d+(?:\.\d+)?/); return match ? Number(match[0]) : null; };
const field = (item: Item, pattern: RegExp) => item.fields.find(v => pattern.test(v.headerPath.at(-1) ?? ""))?.value;
export function makeCollectorCatalog(data: BindingCatalog): CollectorCatalog {
  const components: CollectorComponent[] = [];
  for (const item of data.items) {
    const material = /AISI\s*304/i.test(item.family) ? "aisi304" : /(?:сталь|ст[.\s]*)\s*20/i.test(item.family) ? "st20" : null;
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
    const pn = directPn ?? inheritedPn;
    const price = item.prices.find(v => v.currency === "RUB" && (kind === "pipe" ? /₽\/м|руб.*\/м/.test(v.label) : /цен/i.test(v.label)));
    const outer = number(field(item, /^(?:Наружный )?Диаметр, мм$/i)), thickness = number(field(item, /^Толщина, мм$/i));
    const nippleRef = kind === "nipple" ? data.collectorReference?.nippleDiameters.find(v => v.dn === dn && v.material === material) : null;
    components.push({ id: item.id, kind, name: String(field(item, /^Наименование$/i) ?? `${item.family} DN${dn}`), dn, pn, material, price: price?.amount ?? null, outerDiameter: outer ?? nippleRef?.outerDiameter ?? null, innerDiameter: outer && thickness ? outer - 2 * thickness : null, source: `${item.sourceSheet}!строка ${item.sourceRow}${price ? `, цена ${price.sourceColumn}${item.sourceRow}` : ""}${nippleRef ? `; Ø: ${nippleRef.source}` : ""}` });
  }
  return { version: `${data.source.sha256}:${data.source.importedAt}`, components, bolts: data.collectorReference?.bolts ?? [] };
}
