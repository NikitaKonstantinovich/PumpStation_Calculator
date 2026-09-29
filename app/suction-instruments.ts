import type { AssemblyComponent } from "./suction-catalog";

// Project selection policy, not a calculated suction-line loss.
export const LOW_INLET_HEAD_M = 5;
const MPA_PER_METRE_WATER = 0.00980665;
const GAUGE_MARGIN = 1.5;
type Range = { min: number; max: number };
type Candidate = { item: AssemblyComponent; range: Range };
export type InstrumentSelection = {
  role: "gauge" | "pressure-switch";
  name: string;
  details: string;
  description: string;
  item?: AssemblyComponent;
  warning?: string;
};

export function pressureRange(item: AssemblyComponent): Range | null {
  const field = item.fields.find(f => /^Давление,\s*МПа$/i.test(f.headerPath.at(-1) ?? ""));
  const match = String(field?.value ?? "").replace(/,/g, ".").replace(/−/g, "-")
    .match(/^\s*(-?\d+(?:\.\d+)?)\s*(?:…|\.{2,3}|[–—]|-)\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const min = Number(match[1]), max = Number(match[2]);
  // Imported row has a minus typo. Do not qualify it for vacuum service.
  // https://rosma.spb.ru/rele_davleniya/rd_2r_rele_davleniya_dlya_zhidkih_i_gazoobraznyh_neagressivnyh_sred/
  if (/РД-2Р/i.test(item.family) && min === -0.1 && max === 1) return { min: 0.1, max: 1 };
  return Number.isFinite(min) && Number.isFinite(max) && min < max ? { min, max } : null;
}

const format = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
const rangeText = (r: Range) => `${format(r.min)}…${format(r.max)} МПа`;
const model = (item: AssemblyComponent) => item.family.replace(/[,\s]+$/, "");

export function selectSuctionInstruments(items: AssemblyComponent[], inletHead?: number | null): InstrumentSelection[] {
  const head = typeof inletHead === "number" && Number.isFinite(inletHead) ? inletHead : null;
  const vacuum = head === null || head <= LOW_INLET_HEAD_M;
  const pressure = (head ?? 0) * MPA_PER_METRE_WATER;
  const upper = Math.max(0, pressure) * GAUGE_MARGIN;
  const basis = head === null ? "Напор на входе не указан" : `Напор на входе ${format(head)} м (${format(pressure)} МПа)`;
  const reason = vacuum ? `учтено разрежение: напор не указан или ≤ ${LOW_INLET_HEAD_M} м` : "положительный подпор";
  const candidates: Candidate[] = items.flatMap(item => {
    const range = pressureRange(item);
    return range ? [{ item, range }] : [];
  }).sort((a, b) => a.range.max - b.range.max || (a.range.max - a.range.min) - (b.range.max - b.range.min) || a.item.id.localeCompare(b.item.id));
  // More negative than -0.1 MPa cannot be represented by these gauge ranges.
  const validPressure = pressure >= -0.1;
  const gauges = candidates.filter(({item,range}) => /манометр|мановакуумметр/i.test(item.family) && range.max > 0);
  const matchingGauge = validPressure ? gauges.find(({ range }) =>
    (vacuum ? range.min <= -0.1 : range.min === 0) && range.max > 0 && range.max >= upper) : undefined;
  const standardUpper = (vacuum ? [0.15, 0.3, 0.5, 0.9, 1.5, 2.4] : [0.06, 0.1, 0.16, 0.25, 0.4, 0.6, 1, 1.6, 2.5, 4, 6, 10, 16, 25, 40, 60, 100]).find(value => value >= upper);
  const requiredGauge = standardUpper === undefined ? `верхний предел не менее ${format(upper)} МПа` : rangeText({ min: vacuum ? -0.1 : 0, max: standardUpper });
  // Prefer a compliant range. Otherwise minimize the sum of deviations of
  // both endpoints from the required range; catalogue ordering breaks ties.
  const distance = ({range}: Candidate) => Math.abs(range.min - (vacuum ? -0.1 : 0)) + Math.abs(range.max - (standardUpper ?? upper));
  const gauge = matchingGauge ?? (validPressure ? [...gauges].sort((a,b) => distance(a)-distance(b))[0] : undefined);
  const mismatch = gauge && !matchingGauge;
  const limitations = gauge ? [
    vacuum && gauge.range.min > -0.1 ? "разрежение до −0,1 МПа не измеряется" : "",
    gauge.range.max < upper ? "запас верхнего предела 1,5 не обеспечен" : "",
    pressure < gauge.range.min || pressure > gauge.range.max ? "входное давление вне шкалы прибора" : "",
  ].filter(Boolean) : [];
  const warning = mismatch ? `Предупреждение: выбран ближайший манометр из базы. Требуется ${requiredGauge}, выбран ${rangeText(gauge.range)}.${limitations.length ? ` ${limitations.join("; ")}.` : ""} Требуется проверка применимости.` : undefined;
  const gaugeDetails = gauge ? `${model(gauge.item)} · ${rangeText(gauge.range)}` : `${requiredGauge} · исполнение и цена требуют уточнения`;

  // Select a switch range covering inlet pressure, with a negative lower limit
  // in vacuum mode. Trip/reset settings require dynamic pressure and NPSH data.
  const relay = validPressure ? candidates.find(({ item, range }) =>
    /реле давления/i.test(item.family) && range.max >= Math.max(0, pressure) &&
    range.min < pressure && (!vacuum || range.min < 0)) : undefined;
  const invalid = validPressure ? "" : "Расчётное давление ниже −0,1 МПа: проверьте напор на входе. ";
  return [
    {
      role: "gauge", name: (gauge ? gauge.range.min < 0 : vacuum) ? "Мановакуумметр" : "Манометр", item: gauge?.item, warning,
      details: `${gaugeDetails} · ${basis} · ${reason}${warning ? ` · ⚠ ${warning}` : ""}${invalid ? ` · ${invalid}` : ""}`,
      description: `${warning ? `${warning} ` : ""}${invalid}${basis}. Требуемый запас верхнего предела шкалы 1,5. ${gauge ? `База комплектующих: ${gauge.item.id}.` : "Подходящего прибора в базе нет; указано требуемое исполнение без цены."}`,
    },
    {
      role: "pressure-switch", name: "Реле давления", item: relay?.item,
      details: `${relay ? `${model(relay.item)} · ${rangeText(relay.range)}` : "Подходящего диапазона в базе нет · требуется уточнение"} · ${basis} · ${reason} · уставки отключения и возврата — при наладке`,
      description: `${invalid}Предварительный подбор диапазона для защиты по снижению давления. Уставки и дифференциал определяют по минимальному рабочему давлению и условиям всасывания.${head === null ? " Максимальный подпор требуется проверить, поскольку напор на входе не указан." : ""}${relay ? ` База комплектующих: ${relay.item.id}.` : " Исполнение и цена требуют уточнения."}`,
    },
  ];
}
