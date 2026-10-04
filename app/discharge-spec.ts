import type { DnEntity, InputEntity, ProjectConfig, SettingsEntity, SpecItem } from "./project-config";
import type { CollectorsEntity } from "./collector-project";
import { calculateCollector, secondaryAllowed, type CollectorCatalog } from "./collector-calculations";
import { checkInletPressure, dischargeHydraulics, pressureCheckWarning, type InletPressureCheck } from "./dn-defaults";
import { resolvePumpPortData } from "./pump-ports";
import { componentPressureLimit } from "./suction-pressure";
import { matingParts, suctionCatalogItems, type AssemblyComponent } from "./suction-catalog";
import { field, number, itemDn, itemName, lineSpecParts } from "./line-spec-parts";
import fastenerReference from "./suction-fasteners.json";
import { selectDischargeInstruments } from "./suction-instruments";

export function dischargeFingerprint(project: ProjectConfig) {
  const e = project.entities, settings = e["station-settings"] as SettingsEntity;
  return JSON.stringify(["discharge-v1", settings.inletHead ?? null, e["station-dn"], e["system-input"], secondaryAllowed({ stationType: settings.stationType, jockey: settings.jockeyPump }) ? e["system-input-2"] : null, (e["station-collectors"] as CollectorsEntity).discharge.configuration]);
}

export function dischargeHead(project: ProjectConfig, secondary = false): number | null {
  const settings = project.entities["station-settings"] as SettingsEntity;
  const input = project.entities[secondary ? "system-input-2" : "system-input"] as InputEntity;
  return input.calculated && typeof settings.inletHead === "number" && Number.isFinite(settings.inletHead) && typeof input.head === "number" && Number.isFinite(input.head)
    ? settings.inletHead + input.head : null;
}

export function commonDischargeHead(project: ProjectConfig): number | null {
  const collector = (project.entities["station-collectors"] as CollectorsEntity).discharge.configuration;
  const heads = [dischargeHead(project)];
  if (collector && secondaryAllowed(collector) && (project.entities["system-input-2"] as InputEntity).calculated) heads.push(dischargeHead(project, true));
  return heads.some(head => head === null) ? null : Math.max(...heads as number[]);
}

// Keep the PN16 table price when only material confirmation is missing. Never
// infer a material or a length from DN, and never extend the table to PN25.
export function selectDischargeInsertion(items: AssemblyComponent[], dn: number, pn: number, material: "st20" | "aisi304") {
  const part = [...items, ...suctionCatalogItems].find(item => item.id === `suction-table:ff-${dn}`);
  const rating = componentPressureLimit(part)?.bar;
  const requested = material === "aisi304" ? "AISI 304" : "Ст20";
  if (!part || !rating || rating < pn) return { description: `В таблице вставок нет исполнения DN${dn} PN${pn} · ${requested}. Исполнение, длину и цену уточнить.` };
  const text = String(field(part, /^Материал$/i) ?? "");
  const actual = /AISI\s*304/i.test(text) ? "aisi304" : /(?:сталь|ст)\s*20/i.test(text) ? "st20" : null;
  if (text && actual !== material) return { description: `Материал вставки в таблице (${text}) не соответствует ${requested}. Исполнение и цену уточнить.` };
  return { item: part, description: actual ? `База комплектующих: ${part.id}; фланцы отдельно.` : `Материал вставки в таблице не указан: применимость к ${requested} и длину уточнить. Цена тела вставки из таблицы; фланцы отдельно.`, status: actual ? undefined : "clarify" as const };
}

export function buildDischargeSpec(project: ProjectConfig, database: { items: AssemblyComponent[] }, catalog: CollectorCatalog, valves: SpecItem[] = (project.entities["station-spec"] as { items: SpecItem[] }).items): SpecItem[] {
  const e = project.entities, settings = e["station-settings"] as SettingsEntity, dn = e["station-dn"] as DnEntity;
  const collector = (e["station-collectors"] as CollectorsEntity).discharge.configuration;
  if (!collector || !(e["system-input"] as InputEntity).calculated) return [];
  const rows: SpecItem[] = [];
  const { add, gasket, flax, flanges, fasteners } = lineSpecParts(rows, "discharge", dischargeFingerprint(project), collector, database, catalog);
  const insert = (role: string, size: number, pn: number, count: number, location: string) => {
    const selected = selectDischargeInsertion(database.items, size, pn, collector.material);
    add(role, `Вставка ФФ DN${size}–${size}`, count, `${location} · PN${pn} · ${collector.material === "aisi304" ? "AISI 304" : "Ст20"} · фланцы отдельными позициями`, selected.item, "шт.", undefined, selected.description, selected.status);
  };
  // Each wafer gets its OWN bolt stack. Integral flanges require two independent
  // joints and their actual flange thickness, not the wafer's face-to-face size.
  const valveJoints = (role: string, size: number, pn: number, count: number, item?: AssemblyComponent) => {
    const wafer = Boolean(item && /межфланц|\b017W\b/i.test(item.family));
    const flanged = Boolean(item && !wafer && /фланц/i.test(item.family));
    gasket(`${role}-gaskets`, size, pn, 2 * count);
    if (!wafer && !flanged) {
      for (const [key, name] of [["bolts", "Болты"], ["nuts", "Гайки"], ["washers", "Шайбы"]]) {
        add(`${role}-fasteners-${key}`, `${name} для арматуры DN${size}`, count, `PN${pn} · исполнение арматуры не подтверждено; число стыков и длину крепежа уточнить`, undefined, "компл.");
      }
      return;
    }
    const reference = fastenerReference.find(row => row.dn === size && row.pn === pn);
    const check010 = /0?10[СC](?:\.Y)?/i.test(item!.family);
    const thickness = number(field(item!, /^(?:Строительная длина|Толщина межфланцевого элемента|L), мм$/i))
      ?? (/\b017W\b/i.test(item!.family) ? reference?.wafer017WLength ?? null : check010 ? reference?.wafer010CLength ?? null : null);
    const integral = number(field(item!, /^Толщина фланца, мм$/i)) ?? (/\b012F\b/i.test(item!.family) ? reference?.flange012FThickness ?? null : null);
    fasteners(`${role}-fasteners`, size, pn, (wafer ? 1 : 2) * count, wafer
      ? { gaskets: 2, thickness, fastener: check010 ? "stud" : "bolt", source: check010 ? reference?.checkValveSource : undefined }
      : { gaskets: 1, thickness: 0, flangeThickness: collector.material === "st20" && integral && reference ? reference.steelFlangeThickness + integral : null, source: reference?.checkValveSource });
  };
  for (const secondary of [false, ...(secondaryAllowed(collector) ? [true] : [])]) {
    const input = e[secondary ? "system-input-2" : "system-input"] as InputEntity;
    if (!input.calculated) continue;
    const h = dischargeHydraulics(dn, input, settings, secondary), prefix = secondary ? "secondary" : "primary", title = secondary ? "Контур 2" : "Контур 1";
    const count = (input.workingPumpCount ?? 0) + (input.reservePumpCount ?? 0), branch = secondary ? collector.secondary : collector.primary;
    const errors = [...h.errors];
    if (!branch || branch.dn !== h.dn || branch.connection !== h.connection || branch.pn !== h.pn) errors.push("Параметры отвода напорного коллектора не совпадают с арматурой. Исправьте переопределения в конструкторе коллекторов.");
    if (errors.length || !h.port) {
      add(`${prefix}-error`, `${title}: ошибка комплектации напорной линии`, 1, errors.join(" "), undefined, "компл.");
      continue;
    }
    const p = h.port, v = h.dn, pn = h.pn;
    let threads = 0;
    if (p.connection === "threaded" && h.connection === "threaded") {
      const part = pn <= 16 ? suctionCatalogItems.find(item => item.id === `suction-table:union-${v}`) : undefined;
      add(`${prefix}-union`, part?.family ?? `Американка НР-НР DN${v}`, count, `${title} · насос → обратный клапан · DN${v} · PN${pn}`, part);
      threads = 3;
    } else if (p.connection !== h.connection) {
      const flangeDn = p.connection === "flanged" ? p.dn : v, threadDn = p.connection === "threaded" ? p.dn : v;
      const matching = matingParts.find(item => item.dn === flangeDn && item.threadDn === threadDn);
      const part = pn <= 16 && matching ? suctionCatalogItems.find(item => item.id === `suction-table:rf-${flangeDn}`) : undefined;
      add(`${prefix}-adapter`, `Ответная часть РФ DN${flangeDn} — резьба DN${threadDn}`, count, `${title} · насос → обратный клапан · PN${pn} · ${p.connection === "threaded" ? "развёрнута резьбой к насосу" : "фланцем к насосу"}`, part);
      flanges(`${prefix}-adapter-flange`, flangeDn, pn, count);
      if (p.connection === "flanged") {
        gasket(`${prefix}-pump-gasket`, p.dn, pn, count);
        fasteners(`${prefix}-pump-fasteners`, p.dn, pn, count);
        threads = 2;
      } else threads = 1;
    } else {
      if (p.dn === v) insert(`${prefix}-pump-insertion`, v, pn, count, `${title} · насос → обратный клапан`);
      else {
        const outer = (size: number) => catalog.components.find(item => item.kind === "pipe" && item.dn === size && item.material === collector.material)?.outerDiameter;
        const large = outer(v), small = outer(p.dn);
        const reducer = database.items.find(item => item.catalogId === "переходы" && /эксцентр/i.test(item.family) && itemDn(item) === v && number(field(item, /^PN$/i)) === pn && (collector.material === "aisi304" ? /AISI\s*304/i : /Сталь\s*20/i).test(item.family) && large !== undefined && small !== undefined && number(field(item, /^Диаметр, мм$/i)) === large && number(field(item, /^Диаметр меньший, мм$/i)) === small);
        add(`${prefix}-reducer`, `Переход с фланцами DN${v}–${p.dn}`, count, `${title} · насос → обратный клапан · PN${pn} · ${collector.material} · цена тела перехода, фланцы отдельно`, reducer);
      }
      flanges(`${prefix}-pump-flange`, p.dn, pn, count);
      flanges(`${prefix}-check-flange`, v, pn, count);
      gasket(`${prefix}-pump-gasket`, p.dn, pn, count);
      fasteners(`${prefix}-pump-fasteners`, p.dn, pn, count);
    }
    if (h.connection === "flanged") {
      insert(`${prefix}-between-valves-insertion`, v, pn, count, `${title} · обратный клапан → вставка → затвор`);
      flanges(`${prefix}-between-valves-flanges`, v, pn, 2 * count);
      const selected = (option: string) => database.items.find(item => item.id === valves.find(row => row.option === option)?.equipmentId);
      valveJoints(`${prefix}-check`, v, pn, count, selected(`${prefix}CheckValve`));
      valveJoints(`${prefix}-valve`, v, pn, count, selected(`${prefix}DischargeValve`));
      if (!secondary && (settings.stationType === "fire" || settings.stationType === "combined") && h.valveType === "butterfly") add(`${prefix}-limit-switches`, "Комплект концевых выключателей на затвор", count, `${title} · 1 комплект на 1 затвор`, undefined, "компл.", 3000, "Стоимость комплекта задана пользователем: 3000 ₽");
    } else {
      const nipple = database.items.find(item => item.catalogId === "резьбовые-фитинги" && /Ниппель латунный НР\/НР/i.test(item.family) && itemDn(item) === v && (componentPressureLimit(item)?.bar ?? Infinity) >= pn);
      add(`${prefix}-between-valves-nipple`, `Ниппель латунный НР/НР DN${v}`, count, `${title} · обратный клапан → шаровой кран · PN${pn}`, nipple);
      threads += 2;
    }
    if (threads) flax(`${prefix}-flax`, count * threads * .1, `${title} · ${count} нас. × ${threads} резьбовых соединений × 0,1 м`);
  }
  if (collector.dn) {
    if (collector.connection === "flanged") {
      gasket("network-gaskets", collector.dn, collector.pn, 2);
      fasteners("network-fasteners", collector.dn, collector.pn, 2);
    } else flax("network-flax", .2, "Два подключения коллектора к сети × 0,1 м, независимо от числа насосов");
  }
  const instruments = settings.stationType === "fire" || settings.stationType === "combined" ? 2 : 1;
  for (const instrument of selectDischargeInstruments(database.items, commonDischargeHead(project))) {
    add(instrument.role, instrument.name, instruments, instrument.details, instrument.item, "шт.", undefined, instrument.description, instrument.warning ? "confirmation" : undefined);
  }
  const instrumentValve = database.items.find(item => item.catalogId === "шаровые-краны" && field(item, /^Артикул$/i) === "44.15.В-В.С.Б" && itemDn(item) === 15 && (number(field(item, /^PN$/i)) ?? 0) >= collector.pn);
  add("instrument-valve", instrumentValve ? `${itemName(instrumentValve)} · DN15` : "Кран LD Pride 44.15.В-В.С.Б DN15", instruments, "DN15 · PN40 · арматура КИП напорной линии", instrumentValve);
  return rows;
}

export function replaceDischargeSpec(items: SpecItem[], generated: SpecItem[]): SpecItem[] {
  return [...items.filter(item => item.generatedBy !== "discharge-line"), ...generated];
}

const checkDischargePressure = (head: number | null, name: string, limit?: number | null, label?: string): InletPressureCheck => {
  const check = checkInletPressure(head, name, limit, label);
  return { ...check, message: check.message.replaceAll("на входе", "на выходе (напор на входе + напор насоса)") };
};
export function checkDischargeSpecPressure(project: ProjectConfig, items: SpecItem[], database?: { items: AssemblyComponent[] }, catalog?: CollectorCatalog): SpecItem[] {
  const e = project.entities, dn = e["station-dn"] as DnEntity, collector = (e["station-collectors"] as CollectorsEntity).discharge.configuration;
  const components = new Map([...suctionCatalogItems, ...(database?.items ?? [])].map(item => [item.id, item]));
  const common = commonDischargeHead(project);
  return items.map(item => {
    let checks: InletPressureCheck[];
    if (item.option === "dischargeCollector" && collector) {
      checks = [checkDischargePressure(common, "Напорный коллектор", collector.pn, `PN${collector.pn}`)];
      if (catalog) for (const row of calculateCollector(collector, catalog).bom) {
        if (row.kind !== "welding") checks.push(checkDischargePressure(common, row.name, catalog.components.find(part => part.id === row.componentId)?.pn));
      }
    } else if (item.section === "pump") {
      const secondary = item.option === "secondaryPump";
      if (secondary && (!collector || !secondaryAllowed(collector))) return item;
      const input = e[secondary ? "system-input-2" : "system-input"] as InputEntity;
      const port = resolvePumpPortData(dn, { ...input, selectedPumpId: item.equipmentId ?? input.selectedPumpId }, secondary, "outlet");
      checks = [checkDischargePressure(dischargeHead(project, secondary), `${item.name}: допустимое давление на выходе`, port?.maxPressure)];
    } else {
      if (item.section !== "discharge" || /(?:fasteners|limit-switches|error)/.test(item.assemblyRole ?? "") || (!item.generatedBy && !/^(?:primary|secondary)(?:Check|Discharge)Valve$/.test(item.option ?? ""))) return item;
      const role = item.assemblyRole ?? item.option ?? "";
      const head = role.startsWith("primary") ? dischargeHead(project) : role.startsWith("secondary") ? dischargeHead(project, true) : common;
      const rating = componentPressureLimit(components.get(item.equipmentId ?? ""));
      const part = catalog?.components.find(part => part.id === item.equipmentId);
      checks = [checkDischargePressure(head, item.name, rating?.bar ?? part?.pn, rating?.label)];
    }
    const baseStatus = item.dischargePressureCheck?.baseStatus ?? item.inletPressureCheck?.baseStatus ?? item.status;
    const warning = [...checks, ...(item.inletPressureCheck?.checks ?? [])].some(pressureCheckWarning);
    return { ...item, status: warning && baseStatus !== "clarify" ? "confirmation" : baseStatus, dischargePressureCheck: { baseStatus, checks } };
  });
}
