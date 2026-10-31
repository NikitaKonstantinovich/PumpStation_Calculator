import { baseConfigurationIdentity } from "./base-values";
import type { DnEntity, InputEntity, ProjectConfig, SettingsEntity, SpecItem } from "./project-config";
import type { CollectorsEntity } from "./collector-project";
import { calculateCollector, secondaryAllowed, type CollectorCatalog } from "./collector-calculations";
import { checkInletPressure, dischargeHydraulics, pressureCheckWarning, type InletPressureCheck } from "./dn-defaults";
import { pressureChecksEnabled, withoutPressureChecks } from "./pressure-check-policy";
import { resolvePumpPortData } from "./pump-ports";
import { componentPressureLimit } from "./suction-pressure";
import { suctionCatalogItems, type AssemblyComponent } from "./suction-catalog";
import { field, number, itemDn, itemName, lineSpecParts } from "./line-spec-parts";
import fastenerReference from "./suction-fasteners.json";
import { selectDischargeInstruments } from "./suction-instruments";
import { addPumpConnectionAssembly } from "./line-vibration";
import { PUMP_LINE_RULES_REVISION, selectLineInsertion as selectDischargeInsertion } from "./line-insertion";
import { insertionEndThickness, flangeStack, equipmentFlangeThickness } from "./line-joint-stack";
import { jointFlangeThickness } from "./joint-flange-dimensions";
import { addValveLimitSwitches, VALVE_LIMIT_SWITCHES_REVISION } from "./valve-limit-switches";
export { selectDischargeInsertion };

export function dischargeFingerprint(project: ProjectConfig) {
  const e = project.entities, settings = e["station-settings"] as SettingsEntity;
  return JSON.stringify([PUMP_LINE_RULES_REVISION,VALVE_LIMIT_SWITCHES_REVISION,"discharge-v1", settings.vibrationCompensators, settings.inletHead ?? null, e["station-dn"], e["system-input"], secondaryAllowed({ stationType: settings.stationType, jockey: settings.jockeyPump }) ? e["system-input-2"] : null, baseConfigurationIdentity((e["station-collectors"] as CollectorsEntity).discharge.configuration!)]);
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

export function buildDischargeSpec(project: ProjectConfig, database: { items: AssemblyComponent[] }, catalog: CollectorCatalog, valves: SpecItem[] = (project.entities["station-spec"] as { items: SpecItem[] }).items): SpecItem[] {
  const e = project.entities, settings = e["station-settings"] as SettingsEntity, dn = e["station-dn"] as DnEntity;
  const collector = baseConfigurationIdentity((e["station-collectors"] as CollectorsEntity).discharge.configuration!);
  if (!collector || !(e["system-input"] as InputEntity).calculated) return [];
  const rows: SpecItem[] = [];
  const primaryInput = e["system-input"] as InputEntity;
  const fireSensor = (settings.stationType === "fire" || settings.stationType === "combined") &&
    (primaryInput.workingPumpCount ?? 0) >= 2;
  const parts = lineSpecParts(rows, "discharge", dischargeFingerprint(project), collector, database, catalog, dn.insertionDesigns, fireSensor ? ["primary"] : []);
  const { add, gasket, flax, flanges, fasteners } = parts;
  const insert = (role: string, size: number, pn: number, count: number, location: string) => {
    const selected = selectDischargeInsertion(database.items, size, pn, collector.material);
    return parts.insertion(role, `Вставка ФФ DN${size}–${size}`, count, `${location} · PN${pn} · ${collector.material === "aisi304" ? "AISI 304" : "Ст20"}`,
      {fromDn:size,toDn:size,fromConnection:"flanged",toConnection:"flanged",pn,purpose:"between-valves"},selected.item);
  };
  // Each wafer gets its OWN bolt stack. Integral flanges require two independent
  // joints and their actual flange thickness, not the wafer's face-to-face size.
  const valveJoints = (role: string, size: number, pn: number, count: number, item: AssemblyComponent | undefined, before: number | null, after: number | null, directPump = false) => {
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
    const integral = equipmentFlangeThickness(item) ?? (/\b012F\b/i.test(item!.family) ? reference?.flange012FThickness ?? null : null);
    const pumpSource = "Прямой стык насос — обратный клапан: толщина собственного фланца насоса не подтверждена; длину крепежа уточнить.";
    const source=directPump?pumpSource:`${reference?.checkValveSource??reference?.source??"Источник межфланцевого корпуса не подтверждён"}; учитываются фактические концы соседних вставок. Неизвестная толщина не заменяется типовой.`;
    if(wafer) fasteners(`${role}-fasteners`,size,pn,count,{gaskets:2,thickness,flangeThickness:flangeStack(before,after),fastener:check010?"stud":"bolt",source});
    else {
      fasteners(`${role}-pump-fasteners`,size,pn,count,{gaskets:1,thickness:0,flangeThickness:flangeStack(before,integral),source});
      fasteners(`${role}-fasteners`,size,pn,count,{gaskets:1,thickness:0,flangeThickness:flangeStack(after,integral),source});
    }
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
    let threads = addPumpConnectionAssembly({ parts, database, catalog, collector, port: p, valveDn: v, connection: h.connection, pn, count, prefix, title, vibration: Boolean(settings.vibrationCompensators), terminal: "check" });
    if (h.connection === "flanged") {
      const between=insert(`${prefix}-between-valves-insertion`, v, pn, count, `${title} · обратный клапан → вставка → затвор`);
      flanges(`${prefix}-between-valves-flanges`, v, pn, 2 * count, between);
      const selected = (option: string) => database.items.find(item => item.id === valves.find(row => row.option === option)?.equipmentId);
      const generic=jointFlangeThickness(database,collector.material,v,pn).thicknessMm;
      const outward=rows.find(row=>row.insertionRequirement&&row.assemblyRole?.startsWith(`${prefix}-`)&&row!==between);
      const end=(row:SpecItem|undefined,side:"from"|"to")=>row?.insertionAssembly?insertionEndThickness(row,side,database):row&&generic!==null?generic/2:null;
      const directPump=!settings.vibrationCompensators && p.connection === "flanged" && p.dn === v;
      valveJoints(`${prefix}-check`, v, pn, count, selected(`${prefix}CheckValve`),end(outward,"to"),end(between,"from"),directPump);
      valveJoints(`${prefix}-valve`, v, pn, count, selected(`${prefix}DischargeValve`),end(between,"to"),generic===null?null:generic/2);
      if (!secondary && (settings.stationType === "fire" || settings.stationType === "combined") && h.valveType === "butterfly") addValveLimitSwitches(parts, database.items, prefix, count, v, selected(`${prefix}DischargeValve`));
    } else {
      const nipple = database.items.find(item => item.catalogId === "резьбовые-фитинги" && /Ниппель латунный НР\/НР/i.test(item.family) && itemDn(item) === v && (componentPressureLimit(item)?.bar ?? Infinity) >= pn);
      add(`${prefix}-between-valves-nipple`, `Ниппель латунный НР/НР DN${v}`, count, `${title} · обратный клапан → шаровой кран · PN${pn}`, nipple);
      threads += 2;
    }
    if (threads) flax(`${prefix}-flax`, count * threads * .1, `${title} · ${count} нас. × ${threads} резьбовых соединений × 0,1 м`);
  }
  if (collector.dn) {
    if (collector.connection === "flanged") {
      gasket("network-gaskets", collector.dn, collector.pn, settings.collectorPlugs ? 1 : 2);
      fasteners("network-fasteners", collector.dn, collector.pn, settings.collectorPlugs ? 1 : 2);
    } else flax("network-flax", settings.collectorPlugs ? .1 : .2, "Два подключения коллектора к сети × 0,1 м, независимо от числа насосов");
  }
  const instruments = settings.stationType === "fire" || settings.stationType === "combined" ? 2 : 1;
  for (const instrument of selectDischargeInstruments(database.items, commonDischargeHead(project)).filter(item => item.role === "gauge")) {
    add(instrument.role, instrument.name, instruments, instrument.details, instrument.item, "шт.", undefined, instrument.description, instrument.warning ? "confirmation" : undefined);
  }
  const instrumentValve = database.items.find(item => item.catalogId === "шаровые-краны" && field(item, /^Артикул$/i) === "44.15.В-В.С.Б" && itemDn(item) === 15 && (number(field(item, /^PN$/i)) ?? 0) >= collector.pn);
  add("instrument-valve", instrumentValve ? `${itemName(instrumentValve)} · DN15` : "Кран LD Pride 44.15.В-В.С.Б DN15", instruments, "DN15 · PN40 · арматура КИП напорной линии", instrumentValve);
  flax("instrument-seals", instruments * .2, "Коллектор → общий кран → манометр G1/2 напрямую: 2 стыка × 0,1 м; боковые переходники и их уплотнения учтены в комплекте преобразователя");
  return rows;
}

export function replaceDischargeSpec(items: SpecItem[], generated: SpecItem[]): SpecItem[] {
  const legacyVibration = (item: SpecItem) => item.assemblyRole === "template-vibration";
  return [...items.filter(item => item.generatedBy !== "discharge-line" && !legacyVibration(item)), ...generated];
}

const checkDischargePressure = (head: number | null, name: string, limit?: number | null, label?: string): InletPressureCheck => {
  const check = checkInletPressure(head, name, limit, label);
  return { ...check, message: check.message.replaceAll("на входе", "на выходе (напор на входе + напор насоса)") };
};
export function checkDischargeSpecPressure(project: ProjectConfig, items: SpecItem[], database?: { items: AssemblyComponent[] }, catalog?: CollectorCatalog): SpecItem[] {
  if (!pressureChecksEnabled(project.entities["station-settings"] as SettingsEntity)) return items.map(withoutPressureChecks);
  const e = project.entities, dn = e["station-dn"] as DnEntity, collector = baseConfigurationIdentity((e["station-collectors"] as CollectorsEntity).discharge.configuration!);
  const components = new Map([...suctionCatalogItems, ...(database?.items ?? [])].map(item => [item.id, item]));
  const common = commonDischargeHead(project);
  return items.map(item => {
    let checks: InletPressureCheck[];
    if (item.option === "dischargeCollector" && collector) {
      checks = [checkDischargePressure(common, "Напорный коллектор", collector.pn, `PN${collector.pn}`)];
      if (catalog) for (const row of calculateCollector(collector, catalog).bom) {
        if (row.kind !== "welding" && row.kind !== "painting") checks.push(checkDischargePressure(common, row.name, catalog.components.find(part => part.id === row.componentId)?.pn));
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
      const componentRating = componentPressureLimit(components.get(item.equipmentId ?? ""));
      const rating = item.selectedPn && item.selectedPn > 0
        ? { bar: Math.min(item.selectedPn, componentRating?.bar ?? Infinity), label: `PN${item.selectedPn}` } : componentRating;
      const part = catalog?.components.find(part => part.id === item.equipmentId);
      checks = [checkDischargePressure(head, item.name, rating?.bar ?? part?.pn, rating?.label)];
    }
    const baseStatus = item.dischargePressureCheck?.baseStatus ?? item.inletPressureCheck?.baseStatus ?? item.status;
    const warning = [...checks, ...(item.inletPressureCheck?.checks ?? [])].some(pressureCheckWarning);
    return { ...item, status: warning && baseStatus !== "clarify" ? "confirmation" : baseStatus, dischargePressureCheck: { baseStatus, checks } };
  });
}
