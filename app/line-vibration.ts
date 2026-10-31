import type { CollectorCatalog, CollectorConfiguration } from "./collector-calculations";
import type { PumpPort } from "./pump-ports";
import type { SpecItem, ValveConnection } from "./project-config";
import { matingParts, suctionCatalogItems, type AssemblyComponent } from "./suction-catalog";
import { componentPressureLimit } from "./suction-pressure";
import { itemDn, price, lineSpecParts } from "./line-spec-parts";
import { equipmentFlangeThickness, flangeStack, insertionEndThickness } from "./line-joint-stack";
import { selectLineInsertion, selectLineReducer } from "./line-insertion";
import { vibrationExecution } from "./vibration-dimensions";

export function selectVibrationCompensator(items: AssemblyComponent[], dn: number, pn: number, connection: ValveConnection) {
  return items.filter(item => item.catalogId === "компенсаторы" && itemDn(item) === dn &&
    (connection === "flanged" ? /фланцев/i : /резьб|муфтов/i).test(item.family))
    .flatMap(item => {
      const pnPrices = item.prices.filter(entry => /\bPN\s*\d+/i.test(entry.label));
      const selectedPrice = pnPrices.length
        ? pnPrices.find(entry => new RegExp(`\\bPN\\s*${pn}(?!\\d)`, "i").test(entry.label) && entry.currency === "RUB" && entry.amount > 0 && Number.isFinite(entry.amount))?.amount
        : price(item);
      const rating = componentPressureLimit(item)?.bar;
      if (selectedPrice == null || !Number.isFinite(selectedPrice) || selectedPrice <= 0 || (!pnPrices.length && (!rating || rating < pn))) return [];
      return [{ item, price: selectedPrice, pn: pnPrices.length ? pn : rating! }];
    }).sort((a, b) => a.pn - b.pn || a.price - b.price || a.item.id.localeCompare(b.item.id))[0];
}

type Assembly = {
  parts: ReturnType<typeof lineSpecParts>;
  database: { items: AssemblyComponent[] };
  catalog: CollectorCatalog;
  collector: CollectorConfiguration;
  port: PumpPort;
  valveDn: number;
  connection: ValveConnection;
  pn: number;
  count: number;
  prefix: string;
  title: string;
};

/** Connections are described outward from the pump on either side, not by flow direction. */
export function addPumpVibrationAssembly({ parts, database, catalog, collector, port: p, valveDn: v, connection, pn, count, prefix, title }: Assembly): number {
  const { add, gasket, flanges, fasteners } = parts;
  const selected = selectVibrationCompensator(database.items, p.dn, pn, p.connection);
  const detail = `${title} · DN${p.dn} · PN${pn} · непосредственно на патрубке насоса · от насоса: насос → виброкомпенсатор → ${p.dn === v ? "прямая" : "переходная"} вставка → арматура`;
  const row = add(`${prefix}-vibration-compensator`, selected?.item.family ?? `Виброкомпенсатор ${p.connection === "flanged" ? "фланцевый" : "резьбовой"} DN${p.dn}`, count,
    detail, selected?.item, "шт.", selected?.price, selected ? `База комплектующих: ${selected.item.id}; выбрано исполнение PN${selected.pn}.` : `Нет подходящего виброкомпенсатора DN${p.dn} PN${pn} с ${p.connection === "flanged" ? "фланцевым" : "резьбовым"} присоединением к насосу. Исполнение и цену уточнить.`);
  row.option = "vibrationCompensators";
  row.selectedPn = selected?.pn;
  const mounting = selected && vibrationExecution(selected.item, selected.pn);
  if (mounting) {
    row.details += mounting.status === "confirmed" ? ` · монтажная длина ${mounting.lengthMm} мм` : " · монтажная длина требует уточнения";
    row.description += ` ${mounting.reason} ${mounting.source}`;
    if (mounting.status !== "confirmed") row.status = "clarify";
  }

  const mountingJoints = (insertion: SpecItem) => { if (p.connection === "flanged") {
    const gasketCount = mounting?.separateGasket === false ? 0 : 1;
    if (gasketCount) {
      gasket(`${prefix}-vibration-pump-gasket`, p.dn, pn, count);
      gasket(`${prefix}-vibration-insertion-gasket`, p.dn, pn, count);
    } else row.description += ` ${mounting?.sealingSource}`;
    // Neither a generic pipe flange nor the compensator face-to-face length is
    // evidence for the pump's flange thickness. Keep that bolt length unresolved.
    fasteners(`${prefix}-vibration-pump-fasteners`, p.dn, pn, count,
      { gaskets: gasketCount, thickness: 0, flangeThickness: null, source: "Стык насос — виброкомпенсатор: уточнить толщины фланцев насоса и виброкомпенсатора." });
    fasteners(`${prefix}-vibration-insertion-fasteners`, p.dn, pn, count,
      { gaskets: gasketCount, thickness: 0, flangeThickness: flangeStack(equipmentFlangeThickness(selected?.item), insertionEndThickness(insertion,"from",database)),
        source: "Стык виброкомпенсатор — вставка: нужны подтверждённая толщина собственного фланца компенсатора (источник и дата) и фланец выбранной вставки." });
  } };
  const need={fromDn:p.dn,toDn:v,fromConnection:p.connection,toConnection:connection,pn,purpose:"after-vibration" as const};

  if (p.connection !== connection) {
    // A rigid RF insertion bridges unlike connections after the compensator.
    const flangeDn = p.connection === "flanged" ? p.dn : v, threadDn = p.connection === "threaded" ? p.dn : v;
    const match = matingParts.find(item => item.dn === flangeDn && item.threadDn === threadDn);
    const part = pn <= 16 && match ? suctionCatalogItems.find(item => item.id === `suction-table:rf-${flangeDn}`) : undefined;
    const insertion=parts.insertion(`${prefix}-after-vibration-insertion`, `Вставка РФ DN${flangeDn} — резьба DN${threadDn}`, count,
      `${title} · виброкомпенсатор → вставка РФ → арматура · PN${pn}`,need,part);
    flanges(`${prefix}-after-vibration-insertion-flange`, flangeDn, pn, count,insertion,p.connection==="flanged"?"from":"to");
    mountingJoints(insertion);
    // Threaded pump: pump/compensator + compensator/RF.
    // Flanged pump: RF/valve + valve/collector (check/ball connections added by discharge).
    return 2;
  }

  if (p.connection === "threaded") {
    const part = database.items.find(item => item.catalogId === "сгоны-резьба" && itemDn(item) === p.dn &&
      !item.fields.some(f => f.headerPath.at(-1) === "Назначение" && f.value === "Резьбовой конец вставки") &&
      (collector.material === "aisi304" ? /AISI\s*304/i : /(?:Сталь|Ст)\s*20/i).test(item.family) &&
      (componentPressureLimit(item)?.bar ?? Infinity) >= pn);
    parts.insertion(`${prefix}-after-vibration-insertion`, `Вставка резьбовая НР-НР DN${p.dn}`, count,
      `${title} · виброкомпенсатор → вставка → арматура · PN${pn}`,need,part);
    return 4; // pump/compensator, compensator/insertion, insertion/valve, valve/collector
  }

  if (p.dn !== v) {
    const reducer = selectLineReducer(database.items, catalog, collector.material, p.dn, v, pn, parts.reducerGeometry);
    const insertion=parts.insertion(`${prefix}-reducer`, `Переходная вставка с фланцами DN${v}–${p.dn}`, count,
      `${title} · виброкомпенсатор → переходная вставка → арматура · PN${pn}`,need,reducer);
    flanges(`${prefix}-reducer-small-flange`, p.dn, pn, count,insertion,"from");
    flanges(`${prefix}-reducer-large-flange`, v, pn, count,insertion,"to");
    mountingJoints(insertion);
  } else {
    const insertion = selectLineInsertion(database.items, p.dn, pn, collector.material);
    const selectedInsertion=parts.insertion(`${prefix}-after-vibration-insertion`, `Вставка ФФ DN${p.dn}–${p.dn}`, count,
      `${title} · виброкомпенсатор → прямая вставка → арматура · PN${pn}`,need,insertion.item);
    flanges(`${prefix}-after-vibration-insertion-flanges`, p.dn, pn, 2 * count,selectedInsertion);
    mountingJoints(selectedInsertion);
  }
  return 0;
}

/** Pump-to-first-valve composition is shared by suction and discharge specifications.
 * Their rows are also the sole input to the 3D mounting chain. */
export function addPumpConnectionAssembly(args: Assembly & { vibration: boolean; terminal: "valve" | "check" }): number {
  if (args.vibration) return addPumpVibrationAssembly(args);
  const { parts, database, catalog, collector, port: p, valveDn: v, connection, pn, count, prefix, title, terminal } = args;
  const { add, gasket, flanges, fasteners } = parts;
  const need={fromDn:p.dn,toDn:v,fromConnection:p.connection,toConnection:connection,pn,purpose:"pump-transition" as const};
  if (p.connection === "threaded" && connection === "threaded") {
    const part = pn <= 16 ? suctionCatalogItems.find(item => item.id === `suction-table:union-${v}`) : undefined;
    add(`${prefix}-union`, part?.family ?? `Американка НР-НР DN${v}`, count, `${title} · DN${v} · PN${pn} · ответные резьбы`, part);
    return 3;
  }
  if (p.connection !== connection) {
    const flangeDn = p.connection === "flanged" ? p.dn : v, threadDn = p.connection === "threaded" ? p.dn : v;
    const matching = matingParts.find(item => item.dn === flangeDn && item.threadDn === threadDn);
    const part = pn <= 16 && matching ? suctionCatalogItems.find(item => item.id === `suction-table:rf-${flangeDn}`) : undefined;
    const insertion=parts.insertion(`${prefix}-adapter`, `Ответная часть РФ DN${flangeDn} — резьба DN${threadDn}`, count,
      `${title} · PN${pn} · ${p.connection === "threaded" ? "развёрнута резьбой к насосу" : "фланцем к насосу"}`,need,part);
    flanges(`${prefix}-adapter-flange`, flangeDn, pn, count,insertion,p.connection==="flanged"?"from":"to");
    if (p.connection === "flanged") {
      gasket(`${prefix}-pump-gasket`, p.dn, pn, count);
      fasteners(`${prefix}-pump-fasteners`, p.dn, pn, count,{gaskets:1,thickness:0,flangeThickness:null,source:"Стык насос — вставка РФ: толщина собственного фланца насоса не подтверждена."});
      return 2;
    }
    return 1;
  }
  // Matching flanged faces are joined directly; the pump supplies its own flange.
  // Valve gaskets and its bolt stack are emitted once by the caller.
  if (p.dn === v) return 0;
  const reducer = selectLineReducer(database.items, catalog, collector.material, p.dn, v, pn, parts.reducerGeometry);
  const insertion=parts.insertion(`${prefix}-reducer`, `Переход с фланцами DN${v}–${p.dn}`, count,
    `${title} · насос → переход → арматура · PN${pn} · ${collector.material}`,need,reducer);
  flanges(`${prefix}-pump-flange`, p.dn, pn, count,insertion,"from");
  flanges(`${prefix}-${terminal}-flange`, v, pn, count,insertion,"to");
  gasket(`${prefix}-pump-gasket`, p.dn, pn, count);
  fasteners(`${prefix}-pump-fasteners`, p.dn, pn, count,{gaskets:1,thickness:0,flangeThickness:null,source:"Стык насос — переход: толщина собственного фланца насоса не подтверждена."});
  return 0;
}
