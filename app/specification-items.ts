import type { SpecItem, SpecOption } from "./project-config";

const valveOptions = new Set<SpecOption>([
  "primarySuctionValve", "secondarySuctionValve", "primaryDischargeValve",
  "secondaryDischargeValve", "primaryCheckValve", "secondaryCheckValve",
]);

// Legacy templates had no option. Resolve their role before restoring defaults
// or replacing an automatically selected valve, regardless of its model name.
function legacySpecificationOption(item: SpecItem): SpecOption | undefined {
  if (item.option) return item.option;
  const legacyValve = !item.equipmentId && item.price == null && (!item.description || /На (?:подводящей|напорной) линии каждого насоса/i.test(item.description));
  if (legacyValve && /^(?:клапан обратный|обратный клапан)(?: · DN\d+)?$/i.test(item.name)) {
    return /контур 2|второго контура/i.test(item.description ?? "") ? "secondaryCheckValve" : "primaryCheckValve";
  }
  if (legacyValve && item.name === "Затвор дисковый") return item.section === "discharge" ? "primaryDischargeValve" : "primarySuctionValve";
  if (item.name === "Коллектор подводящий") return "suctionCollector";
  if (item.name === "Коллектор напорный") return "dischargeCollector";
  return undefined;
}

export const specificationOption = (item: SpecItem) => item.option;

/** Name/position heuristics run only while importing a pre-identity project. */
export function migrateSpecificationItems(items: SpecItem[]): SpecItem[] {
  let primaryAssigned = items.some(item => item.option === "primaryPump");
  let secondaryAssigned = items.some(item => item.option === "secondaryPump");
  const namedRoles: Record<string, SpecOption> = {
    "Рама насосной установки": "frame", "Стойка шкафа управления": "cabinetStand",
    "Комплект крепежа": "mountingKit", "Виброопора": "vibrationMounts",
    "Преобразователь давления": "pressureTransducer", "Бак мембранный": "membraneTank",
    "Заглушка коллектора": "collectorPlugs", "Затвор разделительный": "isolatingValves",
  };
  const migrated = items.filter(item => !(item.name === "Насос CNP CDM 32-4" &&
    item.details === "22 кВт · 2900 об/мин" && !item.equipmentId && item.price == null)).map(source => {
    const item = { ...source, unit: source.unit ?? "шт.", price: source.price ?? null, description: source.description ?? "" };
    let option = legacySpecificationOption(item) ?? namedRoles[item.name];
    const section = item.section ?? (/стойк|рам|виброопор|крепеж/i.test(item.name) ? "frame" :
      /^Насос(?:\s|$)/i.test(item.name) ? "pump" : /шкаф/i.test(item.name) ? "control" :
      /кабел|электр|клем|наконечн|провод|гофр|лоток/i.test(item.name) ? "electrical" :
      /подвод|манометр|реле|затвор/i.test(item.name) ? "suction" : "discharge");
    if (!option && section === "pump") {
      if (item.position === "02" && !secondaryAssigned) { option = "secondaryPump"; secondaryAssigned = true; }
      else if (!primaryAssigned) { option = "primaryPump"; primaryAssigned = true; }
    }
    if (!option && section === "control" && (item.name === "Шкаф управления" ||
      /автоматически подобран|Шкаф (?:BP|FP|FPJ)|точного ШУ|стоимость по актуальным комплектующим/i.test(item.description))) option = "controlCabinet";
    const managed = option === "primaryPump" || option === "secondaryPump" || option === "controlCabinet";
    const manualCabinet = option === "controlCabinet" && ((source.option === "controlCabinet" && source.generatedBy !== "station") || /стоимость по актуальным комплектующим/i.test(item.description));
    const placeholder = managed && !item.equipmentId && item.price == null;
    const legacyInstrument = section === "suction" && !item.equipmentId && item.price == null && (
      (["Манометр", "Мановакуумметр"].includes(item.name) && item.details === "С комплектом подключения") ||
      (item.name === "Реле давления" && item.details === "Защита от сухого хода"));
    const legacyVibration = !item.generatedBy && !item.equipmentId && item.price == null && option === "vibrationCompensators" &&
      item.name === "Вставка гибкая" && item.details === "Виброкомпенсатор, фланцевая" && item.description === "Компенсация вибраций";
    return { ...item, section, option, ...(legacyInstrument ? { assemblyRole: "template-suction-instrument" } : {}),
      ...(legacyVibration ? { assemblyRole: "template-vibration" } : {}), ...(managed && !manualCabinet ? { generatedBy: "station" as const } : {}),
      ...(placeholder ? { status: "clarify" as const, technicalStatus: "unverified" as const } : {}) };
  });
  return normalizeSpecificationItems(migrated);
}

/** Replace exactly one managed role; manual and unrelated rows survive. */
export function replaceSpecificationRole(items: SpecItem[], option: SpecOption, replacement?: SpecItem): SpecItem[] {
  const remaining = items.filter(item => item.option !== option);
  return normalizeSpecificationItems(replacement ? [...remaining, { ...replacement, option }] : remaining);
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
