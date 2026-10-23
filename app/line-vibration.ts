import type { CollectorCatalog, CollectorConfiguration } from "./collector-calculations";
import type { PumpPort } from "./pump-ports";
import type { ValveConnection } from "./project-config";
import { matingParts, suctionCatalogItems, type AssemblyComponent } from "./suction-catalog";
import { componentPressureLimit } from "./suction-pressure";
import { field, itemDn, number, price, lineSpecParts } from "./line-spec-parts";
import { jointFlangeThickness } from "./joint-flange-dimensions";
import { selectLineInsertion } from "./line-insertion";

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
  const detail = `${title} · DN${p.dn} · PN${pn} · непосредственно на патрубке насоса · от насоса: насос → виброкомпенсатор → обычная вставка → арматура`;
  const row = add(`${prefix}-vibration-compensator`, selected?.item.family ?? `Виброкомпенсатор ${p.connection === "flanged" ? "фланцевый" : "резьбовой"} DN${p.dn}`, count,
    detail, selected?.item, "шт.", selected?.price, selected ? `База комплектующих: ${selected.item.id}; выбрано исполнение PN${selected.pn}.` : `Нет подходящего виброкомпенсатора DN${p.dn} PN${pn} с ${p.connection === "flanged" ? "фланцевым" : "резьбовым"} присоединением к насосу. Исполнение и цену уточнить.`);
  row.option = "vibrationCompensators";
  row.selectedPn = selected?.pn;

  if (p.connection === "flanged") {
    gasket(`${prefix}-vibration-pump-gasket`, p.dn, pn, count);
    gasket(`${prefix}-vibration-insertion-gasket`, p.dn, pn, count);
    const thickness = selected && number(field(selected.item, /^Толщина фланца, мм$/i));
    const flange = jointFlangeThickness(database, collector.material, p.dn, pn);
    // Neither a generic pipe flange nor the compensator face-to-face length is
    // evidence for the pump's flange thickness. Keep that bolt length unresolved.
    fasteners(`${prefix}-vibration-pump-fasteners`, p.dn, pn, count,
      { gaskets: 1, thickness: 0, flangeThickness: null, source: "Стык насос — виброкомпенсатор: уточнить толщины фланцев насоса и виброкомпенсатора." });
    fasteners(`${prefix}-vibration-insertion-fasteners`, p.dn, pn, count,
      { gaskets: 1, thickness: 0, flangeThickness: thickness && flange.thicknessMm ? thickness + flange.thicknessMm / 2 : null,
        source: ["Стык виброкомпенсатор — вставка: толщина собственного фланца виброкомпенсатора требуется для выбора длины крепежа.", flange.source].filter(Boolean).join(" ") });
  }

  if (p.connection !== connection) {
    // A rigid RF insertion bridges unlike connections after the compensator.
    const flangeDn = p.connection === "flanged" ? p.dn : v, threadDn = p.connection === "threaded" ? p.dn : v;
    const match = matingParts.find(item => item.dn === flangeDn && item.threadDn === threadDn);
    const part = pn <= 16 && match ? suctionCatalogItems.find(item => item.id === `suction-table:rf-${flangeDn}`) : undefined;
    add(`${prefix}-after-vibration-insertion`, `Вставка РФ DN${flangeDn} — резьба DN${threadDn}`, count,
      `${title} · виброкомпенсатор → обычная вставка РФ → арматура · PN${pn}`, part);
    flanges(`${prefix}-after-vibration-insertion-flange`, flangeDn, pn, count);
    // Threaded pump: pump/compensator + compensator/RF.
    // Flanged pump: RF/valve + valve/collector (check/ball connections added by discharge).
    return 2;
  }

  if (p.connection === "threaded") {
    const part = database.items.find(item => item.catalogId === "сгоны-резьба" && itemDn(item) === p.dn &&
      (collector.material === "aisi304" ? /AISI\s*304/i : /(?:Сталь|Ст)\s*20/i).test(item.family) &&
      (componentPressureLimit(item)?.bar ?? Infinity) >= pn);
    add(`${prefix}-after-vibration-insertion`, `Вставка резьбовая НР-НР DN${p.dn}`, count,
      `${title} · виброкомпенсатор → обычная вставка → арматура · PN${pn}`, part, "шт.", undefined,
      "Прямая вставка из сгона после виброкомпенсатора. Длину, ответные резьбы и допустимое давление уточнить.", "clarify");
    return 4; // pump/compensator, compensator/insertion, insertion/valve, valve/collector
  }

  const insertion = selectLineInsertion(database.items, p.dn, pn, collector.material);
  add(`${prefix}-after-vibration-insertion`, `Вставка ФФ DN${p.dn}–${p.dn}`, count,
    `${title} · виброкомпенсатор → обычная вставка → ${p.dn === v ? "арматура" : "переход → арматура"} · PN${pn} · фланцы отдельно`,
    insertion.item, "шт.", undefined, insertion.description, insertion.status);
  flanges(`${prefix}-after-vibration-insertion-flanges`, p.dn, pn, 2 * count);
  if (p.dn !== v) {
    const outer = (size: number) => catalog.components.find(item => item.kind === "pipe" && item.dn === size && item.material === collector.material)?.outerDiameter;
    const large = outer(v), small = outer(p.dn);
    const reducer = database.items.find(item => item.catalogId === "переходы" && /эксцентр/i.test(item.family) && itemDn(item) === v && number(field(item, /^PN$/i)) === pn &&
      (collector.material === "aisi304" ? /AISI\s*304/i : /Сталь\s*20/i).test(item.family) && large !== undefined && small !== undefined &&
      number(field(item, /^Диаметр, мм$/i)) === large && number(field(item, /^Диаметр меньший, мм$/i)) === small);
    add(`${prefix}-reducer`, `Переход с фланцами DN${v}–${p.dn}`, count, `${title} · после обычной вставки перед арматурой · PN${pn} · фланцы отдельно`, reducer);
    flanges(`${prefix}-reducer-small-flange`, p.dn, pn, count);
    flanges(`${prefix}-reducer-large-flange`, v, pn, count);
    gasket(`${prefix}-insertion-reducer-gasket`, p.dn, pn, count);
    fasteners(`${prefix}-insertion-reducer-fasteners`, p.dn, pn, count);
  }
  return 0;
}
