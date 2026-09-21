import type { SpecItem, SpecOption } from "./project-config";

const valveOptions = new Set<SpecOption>([
  "primarySuctionValve", "secondarySuctionValve", "primaryDischargeValve",
  "secondaryDischargeValve", "primaryCheckValve", "secondaryCheckValve",
]);

// Legacy templates had no option. Resolve their role before restoring defaults
// or replacing an automatically selected valve, regardless of its model name.
export function specificationOption(item: SpecItem): SpecOption | undefined {
  if (item.option) return item.option;
  if (/^(?:клапан обратный|обратный клапан)/i.test(item.name)) {
    return /контур 2|второго контура/i.test(item.description ?? "") ? "secondaryCheckValve" : "primaryCheckValve";
  }
  if (item.name === "Затвор дисковый") return item.section === "discharge" ? "primaryDischargeValve" : "primarySuctionValve";
  if (item.name === "Коллектор подводящий") return "suctionCollector";
  if (item.name === "Коллектор напорный") return "dischargeCollector";
  return undefined;
}

export function normalizeSpecificationItems(items: SpecItem[]): SpecItem[] {
  const valves = new Map<SpecOption, SpecItem>();
  const remaining: SpecItem[] = [];
  const quality = (item: SpecItem) => (item.equipmentId ? 4 : 0) + (item.status === "selected" ? 2 : 0) + (typeof item.price === "number" ? 1 : 0);
  for (const source of items) {
    const option = specificationOption(source);
    const section = option === "primaryCheckValve" || option === "secondaryCheckValve" || option === "primaryDischargeValve" || option === "secondaryDischargeValve"
      ? "discharge" : option === "primarySuctionValve" || option === "secondarySuctionValve" ? "suction" : source.section;
    const isValve = (option && valveOptions.has(option)) || option === "isolatingValves" || /^(?:затвор|задвижка|кран|шаровой кран|клапан|обратный клапан)/i.test(source.name);
    const dn = source.details.match(/(?:DN|Ду)\s*(\d+)/i)?.[1];
    const name = isValve && dn && !/(?:DN|Ду)\s*\d+/i.test(source.name) ? `${source.name} · DN${dn}` : source.name;
    const item = { ...source, name, option, section };
    if (option && valveOptions.has(option)) {
      const previous = valves.get(option);
      if (!previous || quality(item) > quality(previous)) valves.set(option, item);
    } else remaining.push(item);
  }
  const result = [...remaining, ...valves.values()];
  const rank = (item: SpecItem) => {
    if (item.option === "suctionCollector" || item.option === "dischargeCollector") return 0;
    if (item.option && /(?:Suction|Discharge)Valve$/.test(item.option)) return 1;
    if (item.option === "primaryCheckValve" || item.option === "secondaryCheckValve") return 2;
    return 3;
  };
  for (const [section, prefix] of [["suction", "03"], ["discharge", "04"]] as const) {
    result.filter(item => item.section === section)
      .sort((a, b) => rank(a) - rank(b) || Number(a.option?.startsWith("secondary") ?? false) - Number(b.option?.startsWith("secondary") ?? false) || a.position.localeCompare(b.position, "ru", { numeric: true }))
      .forEach((item, index) => { item.position = `${prefix}.${String(index + 1).padStart(2, "0")}`; });
  }
  return result.sort((a, b) => a.position.localeCompare(b.position, "ru", { numeric: true }));
}
