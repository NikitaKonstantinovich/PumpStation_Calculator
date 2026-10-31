import { baseConfigurationIdentity } from "./base-values";
import type { DnEntity, InputEntity, ProjectConfig, SettingsEntity, SpecItem } from "./project-config";
import type { CollectorsEntity } from "./collector-project";
import { collectorPressureChecks, secondaryAllowed, type CollectorCatalog } from "./collector-calculations";
import { checkInletPressure, suctionHydraulics } from "./dn-defaults";
import { resolvePumpPortData } from "./pump-ports";
import { componentPressureLimit, withInletPressureChecks } from "./suction-pressure";
import { suctionCatalogItems, type AssemblyComponent } from "./suction-catalog";
import { selectSuctionInstruments } from "./suction-instruments";
import { lineSpecParts, field, number, itemDn, itemName } from "./line-spec-parts";
import { addPumpConnectionAssembly } from "./line-vibration";
import { PUMP_LINE_RULES_REVISION } from "./line-insertion";
import { pressureChecksEnabled, withoutPressureChecks } from "./pressure-check-policy";
import { insertionEndThickness, flangeStack, equipmentFlangeThickness } from "./line-joint-stack";
import { jointFlangeThickness } from "./joint-flange-dimensions";
import fastenerReference from "./suction-fasteners.json";
import { addInstrumentSideConnection } from "./instrument-connection";
import { addValveLimitSwitches, VALVE_LIMIT_SWITCHES_REVISION } from "./valve-limit-switches";

export function suctionFingerprint(project:ProjectConfig) {
  const e=project.entities, settings=e["station-settings"] as SettingsEntity;
  return JSON.stringify([PUMP_LINE_RULES_REVISION,VALVE_LIMIT_SWITCHES_REVISION,"instruments-v2","seals-v2","instrument-valve-v1",settings.vibrationCompensators,settings.inletHead??null,e["station-dn"],e["system-input"],secondaryAllowed({stationType:settings.stationType,jockey:settings.jockeyPump})?e["system-input-2"]:null,settings.stationType,settings.jockeyPump,baseConfigurationIdentity((e["station-collectors"] as CollectorsEntity).suction.configuration!)]);
}

export function buildSuctionSpec(project:ProjectConfig, database:{items:AssemblyComponent[]}, catalog:CollectorCatalog, valves:SpecItem[]=(project.entities["station-spec"] as {items:SpecItem[]}).items):SpecItem[] {
  const e=project.entities, settings=e["station-settings"] as SettingsEntity, dn=e["station-dn"] as DnEntity;
  const collector=baseConfigurationIdentity((e["station-collectors"] as CollectorsEntity).suction.configuration!);
  if (!collector || !(e["system-input"] as InputEntity).calculated) return [];
  const rows:SpecItem[]=[], fingerprint=suctionFingerprint(project);
  const parts = lineSpecParts(rows, "suction", fingerprint, collector, database, catalog, dn.insertionDesigns);
  const { add, gasket, flax, fasteners } = parts;
  const circuits=[false,...(secondaryAllowed(collector)?[true]:[])];
  for(const secondary of circuits) {
    const input=e[secondary?"system-input-2":"system-input"] as InputEntity;
    if(!input.calculated) continue;
    const h=suctionHydraulics(dn,input,settings,secondary), prefix=secondary?"secondary":"primary", title=secondary?"Контур 2":"Контур 1", count=(input.workingPumpCount??0)+(input.reservePumpCount??0), branch=secondary?collector.secondary:collector.primary;
    const errors=[...h.errors];
    if(branch && (branch.dn!==h.dn || branch.connection!==h.connection || branch.pn!==h.pn)) errors.push("Параметры отвода коллектора не совпадают с арматурой. Исправьте переопределения в конструкторе коллекторов.");
    if(errors.length || !h.port) {add(`${prefix}-error`,`${title}: ошибка комплектации всасывающей линии`,1,errors.join(" "),undefined,"компл.");continue;}
    const p=h.port, v=h.dn, pn=h.pn;
    const threads = addPumpConnectionAssembly({ parts, database, catalog, collector, port: p, valveDn: v, connection: h.connection, pn, count, prefix, title, vibration: Boolean(settings.vibrationCompensators), terminal: "valve" });
    if(h.connection==="flanged") {
      gasket(`${prefix}-valve-gaskets`,v,pn,2*count);
      const outward=rows.find(row=>row.insertionRequirement&&row.assemblyRole?.startsWith(`${prefix}-`));
      const generic=jointFlangeThickness(database,collector.material,v,pn).thicknessMm;
      const before=outward?.insertionAssembly?insertionEndThickness(outward,"to",database):outward&&generic!==null?generic/2:null;
      const after=generic===null?null:generic/2;
      const valve=database.items.find(item=>item.id===valves.find(row=>row.option===`${prefix}SuctionValve`)?.equipmentId);
      const source="Стык всасывающей арматуры: нужен корпус выбранной арматуры и толщины обоих соседних фланцев; собственный фланец насоса не заменяется каталожным.";
      if(h.valveType==="butterfly"){
        const reference=fastenerReference.find(row=>row.dn===v&&row.pn===pn);
        const thickness=valve?number(field(valve,/^(?:Строительная длина|Толщина межфланцевого элемента|L), мм$/i))??(/\b017W\b/i.test(valve.family)?reference?.wafer017WLength??null:null):null;
        fasteners(`${prefix}-valve-fasteners`,v,pn,count,{gaskets:2,thickness,flangeThickness:flangeStack(before,after),source:[source,reference?.source].filter(Boolean).join(" ")});
      }else{
        const integral=equipmentFlangeThickness(valve);
        fasteners(`${prefix}-valve-inlet-fasteners`,v,pn,count,{gaskets:1,thickness:0,flangeThickness:flangeStack(before,integral),source});
        fasteners(`${prefix}-valve-fasteners`,v,pn,count,{gaskets:1,thickness:0,flangeThickness:flangeStack(after,integral),source});
      }
      if(!secondary&&(settings.stationType==="fire"||settings.stationType==="combined")&&h.valveType==="butterfly") addValveLimitSwitches(parts, database.items, prefix, count, v, valve);
    }
    if(threads) flax(`${prefix}-flax`,count*threads*.1,`${title} · ${count} нас. × ${threads} резьбовых соединения × 0,1 м`);
  }
  if(collector.dn) {
    if(collector.connection==="flanged") {gasket("network-gaskets",collector.dn,collector.pn,settings.collectorPlugs?1:2);fasteners("network-fasteners",collector.dn,collector.pn,settings.collectorPlugs?1:2);}
    else flax("network-flax",settings.collectorPlugs ? .1 : .2,"Два подключения коллектора к сети × 0,1 м, независимо от числа насосов");
  }
  const instruments=settings.stationType==="fire"||settings.stationType==="combined"?2:1;
  for (const instrument of selectSuctionInstruments(database.items,settings.inletHead)) {
    add(instrument.role,instrument.name,instruments,instrument.details,instrument.item,"шт.",undefined,instrument.description,instrument.warning?"confirmation":undefined);
  }
  const instrumentValve=database.items.find(x=>x.catalogId==="шаровые-краны"&&field(x,/^Артикул$/i)==="44.15.В-В.С.Б"&&itemDn(x)===15&&(number(field(x,/^PN$/i))??0)>=collector.pn);
  add("instrument-valve",instrumentValve?`${itemName(instrumentValve)} · DN15`:"Кран LD Pride 44.15.В-В.С.Б DN15",instruments,"DN15 · PN40 · арматура КИП · дренаж и воздухоотводчик",instrumentValve,"шт.",undefined,instrumentValve?"Модель и цена заданы пользователем: 650 ₽/шт.":"Указанная модель DN15 PN40 отсутствует в базе или не подходит по PN коллектора — требуется уточнение");
  addInstrumentSideConnection(parts, database.items, instruments, "реле");
  flax("instrument-seals", instruments * .5, "Коллектор → общий кран → манометр G1/2 напрямую; боковой порт → переходник → футорка → реле G1/4: 5 соединений × 0,1 м на комплект КИП");
  return rows;
}

export function replaceSuctionSpec(items:SpecItem[],generated:SpecItem[]):SpecItem[] {
  return [...items.filter(item=>item.generatedBy!=="suction-line"&&item.assemblyRole!=="template-suction-instrument"),...generated];
}

export function checkSuctionSpecPressure(project: ProjectConfig, items: SpecItem[], database?: { items: AssemblyComponent[] }, catalog?: CollectorCatalog): SpecItem[] {
  const settings = project.entities["station-settings"] as SettingsEntity;
  if (!pressureChecksEnabled(settings)) return items.map(withoutPressureChecks);
  const dn = project.entities["station-dn"] as DnEntity;
  const collector = (project.entities["station-collectors"] as CollectorsEntity).suction.configuration;
  const components = new Map([...suctionCatalogItems, ...(database?.items ?? [])].map(item => [item.id, item]));
  return items.map(item => {
    if (item.option === "suctionCollector" && collector) return withInletPressureChecks(item, collectorPressureChecks(collector, settings.inletHead, catalog));
    if (item.section === "pump") {
      const secondary = item.option === "secondaryPump";
      if (secondary && (!collector || !secondaryAllowed(collector))) return item;
      const input = project.entities[secondary ? "system-input-2" : "system-input"] as InputEntity;
      const port = resolvePumpPortData(dn, { ...input, selectedPumpId: item.equipmentId ?? input.selectedPumpId }, secondary);
      return withInletPressureChecks(item, [checkInletPressure(settings.inletHead, `${item.name}: допустимое давление на входе`, port?.maxInletPressure)]);
    }
    // Fasteners and limit switches have no independent hydraulic pressure rating.
    if (item.section !== "suction" || /(?:fasteners|limit-switches|error)/.test(item.assemblyRole ?? "")) return item;
    const component = components.get(item.equipmentId ?? "");
    const componentRating = componentPressureLimit(component);
    const rating = item.selectedPn && item.selectedPn > 0
      ? { bar: Math.min(item.selectedPn, componentRating?.bar ?? Infinity), label: `PN${item.selectedPn}` } : componentRating;
    const catalogPart = catalog?.components.find(part => part.id === item.equipmentId);
    const limit = rating ?? (catalogPart?.pn ? { bar: catalogPart.pn, label: `PN${catalogPart.pn}` } : null);
    return withInletPressureChecks(item, [checkInletPressure(settings.inletHead, item.name, limit?.bar, limit?.label)]);
  });
}
