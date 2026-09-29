import type { AssemblyComponent } from "./suction-catalog";

const field = (item: AssemblyComponent, label: string) => item.fields.find(f => f.headerPath.at(-1) === label)?.value;
const number = (value: unknown) => Number(String(value ?? "").match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(",","."));
export const sealingName = (item: AssemblyComponent) => String(field(item,"Наименование") ?? item.family);
export const sealingPrice = (item: AssemblyComponent) => {
  const values = item.prices.filter(p => p.currency === "RUB" && Number.isFinite(p.amount) && p.amount >= 0 && /цен[аы]/i.test(p.label)).map(p => p.amount);
  return values.length ? Math.max(...values) : null;
};
export const gasketPressures = (item: AssemblyComponent): number[] => {
  const compatible = field(item,"Совместимые PN");
  return (typeof compatible === "string" ? compatible.split("/").map(Number) : [number(field(item,"PN"))]).filter(pn => Number.isFinite(pn) && pn > 0);
};

export function selectGasket(items: AssemblyComponent[], dn: number, pn: number): AssemblyComponent | undefined {
  if (!(Number.isFinite(dn) && dn > 0 && Number.isFinite(pn) && pn > 0)) return undefined;
  const candidates = items.filter(item => item.catalogId === "прокладки" && /паронит/i.test(sealingName(item)) &&
    number(field(item,"DN")) === dn && gasketPressures(item).length > 0);
  const rank = (item: AssemblyComponent) => {
    const pressures = gasketPressures(item);
    if (pressures.includes(pn)) return [0,Math.max(...pressures)];
    const higher = pressures.filter(p => p > pn);
    return higher.length ? [1,Math.min(...higher)-pn] : [2,Math.min(...pressures.map(p => Math.abs(p-pn)))];
  };
  return candidates.sort((a,b) => rank(a)[0]-rank(b)[0] || rank(a)[1]-rank(b)[1] ||
    (sealingPrice(b) ?? -1)-(sealingPrice(a) ?? -1) || a.id.localeCompare(b.id))[0];
}

// Flax is a consumable priced per metre, rather than a sized gasket. The
// source's thread-size rows describe the same material; use its maximum price.
export function selectFlax(items: AssemblyComponent[]): AssemblyComponent | undefined {
  return items.filter(item => /^л[её]н для уплотнения труб$/i.test(sealingName(item)) && field(item,"Единица цены") === "м")
    .sort((a,b) => (sealingPrice(b) ?? -1)-(sealingPrice(a) ?? -1) || a.id.localeCompare(b.id))[0];
}
