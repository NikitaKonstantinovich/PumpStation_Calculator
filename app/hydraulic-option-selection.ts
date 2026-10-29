import type { AssemblyComponent } from "./suction-catalog";
import type { CollectorMaterial, SpecTechnicalStatus } from "./project-config";
import { componentPressureLimit } from "./suction-pressure";
import { field, itemDn, itemName } from "./line-spec-parts";
import { pressureRange } from "./suction-instruments";

export type HydraulicProductKind = "tank" | "transducer" | "flange-plug" | "isolating-valve";
export type HydraulicProductRequirement = {
  kind: HydraulicProductKind;
  pressureBar: number | null;
  volumeLitres?: number;
  dn?: number | null;
  pn?: number;
  material?: CollectorMaterial;
  thread?: string;
  threadGender?: "male" | "female";
  range?: { min: number; max: number };
  signal?: string;
  supplyVoltage?: number;
  overloadBar?: number;
  color?: "red" | "blue";
  actuator?: "handle" | "gear" | "bare";
};
export type HydraulicProductAssessment = {
  item: AssemblyComponent;
  missing: string[];
  incompatible: string[];
  technicalStatus: SpecTechnicalStatus;
};

const text = (value: unknown) => String(value ?? "").trim();
const scalar = (value: unknown) => {
  const string = text(value).replace(",", ".");
  return /^\d+(?:\.\d+)?$/.test(string) && Number(string) > 0 ? Number(string) : null;
};
export const hydraulicProductName = (item: AssemblyComponent) => {
  const name = itemName(item);
  return name && name !== "0" ? name : item.family;
};
export const hydraulicSignal = (value: unknown) => text(value).toLowerCase().replace(/[–—−…]/g, "-").replace(/\s/g, "").replace(/ма/g, "ma").replace(/в/g, "v");
export function hydraulicThread(value: unknown): string | null {
  const v = text(value).replace(/[″”]/g, '"').replace(/,/g, ".").replace(/\s+/g, "");
  const match = v.match(/^(G|Rp|Rc|R|M|NPT)(\d+(?:\/\d+|\.\d+)?(?:[xх×]\d+(?:\.\d+)?)?)(?:"|НР|ВР)?$/i);
  return match ? `${match[1].toUpperCase()}${match[2].replace(/[х×]/g, "x")}` : null;
}
function voltageRange(value: unknown): { min: number; max: number } | null {
  const match = text(value).replace(/,/g, ".").match(/^\s*(\d+(?:\.\d+)?)\s*(?:[-–—…]\s*(\d+(?:\.\d+)?))?\s*(?:В|V)?\s*(?:DC|пост\.?|постоянного тока)?\s*$/i);
  return match ? { min: Number(match[1]), max: Number(match[2] ?? match[1]) } : null;
}
export function hydraulicProductKind(item: AssemblyComponent): HydraulicProductKind | undefined {
  const name = hydraulicProductName(item);
  // The tank catalogue also contains flexible hoses. Its ID alone is insufficient.
  if (item.catalogId === "мембранный-бак" && /бак|гидроаккумулятор/i.test(name) && !/подводк|шланг/i.test(name)) return "tank";
  if (/преобразоват.*давлен/i.test(item.family)) return "transducer";
  if (/заглушк.*фланц|фланц.*(?:глух|заглуш)/i.test(item.family)) return "flange-plug";
  if (item.catalogId === "затворы") return "isolating-valve";
  return undefined;
}
export function hydraulicProductFacts(item: AssemblyComponent) {
  const name = hydraulicProductName(item);
  const volume = scalar(field(item, /^(?:Объ[её]м|Номинальный объ[её]м),\s*л$/i));
  // A specific model designation identifies volume, not pressure or connection compatibility.
  const wavVolume = name.match(/\bWAV\s+(\d+)\b/i);
  const rawThread = field(item, /^(?:Присоединительная резьба|Стандарт и размер резьбы)$/i) ?? field(item, /^Резьба(?:, дюйм)?$/i);
  const familyThread = item.family.match(/\b(G|Rp|Rc|R|M|NPT)\s*\d+(?:\/\d+|[.,]\d+)?(?:[xх×]\d+(?:[.,]\d+)?)?/i)?.[0];
  const gender = text(field(item, /^(?:Исполнение резьбы|Тип резьбы)$/i));
  const pressureText = text(field(item, /^(?:PN|Ру|Давление)$/i)) || item.family;
  const pn = [...pressureText.matchAll(/(?:PN|Ру)\s*(\d+(?:\s*\/\s*\d+)*)/gi)].flatMap(m => m[1].split("/").map(Number));
  const explicitPn = scalar(field(item, /^(?:PN|Ру)$/i));
  if (explicitPn) pn.push(explicitPn);
  const pressureBar = componentPressureLimit(item)?.bar ?? (pn.length ? Math.max(...pn) : null);
  const materialText = `${text(field(item, /^Материал$/i))} ${item.family}`;
  return {
    volumeLitres: volume ?? (wavVolume ? Number(wavVolume[1]) : null),
    pressureBar, dn: itemDn(item), pn: [...new Set(pn)],
    material: /AISI\s*304/i.test(materialText) ? "aisi304" : /Ст(?:аль)?\s*20|СТ20/i.test(materialText) ? "st20" : null,
    thread: hydraulicThread(rawThread ?? familyThread),
    threadGender: /^(?:НР|наружная|male)$/i.test(gender) ? "male" : /^(?:ВР|внутренняя|female)$/i.test(gender) ? "female" : null,
    range: pressureRange(item),
    signal: hydraulicSignal(field(item, /^(?:Выходной сигнал|Сигнал)$/i)) || null,
    supply: voltageRange(field(item, /^(?:Питание|Напряжение питания)(?:,\s*В)?$/i)),
    overloadBar: scalar(field(item, /^(?:Допустимая перегрузка|Давление перегрузки),\s*бар$/i)),
  };
}
export function hydraulicProductSummary(item: AssemblyComponent): string {
  const facts = hydraulicProductFacts(item);
  return [
    facts.volumeLitres ? `${facts.volumeLitres} л` : "",
    facts.dn ? `DN${facts.dn}` : "",
    facts.pn.length ? `PN${facts.pn.join("/")}` : "",
    facts.pressureBar !== null ? `допустимое рабочее давление ${facts.pressureBar} бар` : "допустимое рабочее давление не подтверждено",
    facts.thread ? `${facts.thread} ${facts.threadGender === "male" ? "НР" : facts.threadGender === "female" ? "ВР" : "(исполнение не подтверждено)"}` : "",
    facts.range ? `диапазон ${facts.range.min}…${facts.range.max} МПа` : "",
    facts.signal === "4-20ma" ? "4–20 мА" : facts.signal,
    facts.supply ? `${facts.supply.min}–${facts.supply.max} В DC` : "",
  ].filter(Boolean).join(" · ");
}
export function assessHydraulicProduct(item: AssemblyComponent, need: HydraulicProductRequirement): HydraulicProductAssessment {
  const facts = hydraulicProductFacts(item), missing: string[] = [], incompatible: string[] = [];
  const equal = (label: string, actual: unknown, required: unknown) => {
    if (required === undefined || required === null || required === "") { missing.push(`Не задано требование: ${label}.`); return; }
    if (actual === undefined || actual === null || actual === "") missing.push(`В каталоге не указано: ${label}.`);
    else if (actual !== required) incompatible.push(`${label}: требуется ${required}, у изделия ${actual}.`);
  };
  if (hydraulicProductKind(item) !== need.kind) incompatible.push("Изделие другого назначения.");
  if (!(typeof need.pressureBar === "number" && Number.isFinite(need.pressureBar) && need.pressureBar >= 0)) missing.push("Не подтверждено требуемое рабочее давление.");
  if (facts.pressureBar === null) missing.push("Не указано допустимое рабочее давление изделия; измерительный диапазон его не заменяет.");
  else if (need.pressureBar !== null && facts.pressureBar < need.pressureBar) incompatible.push(`Допустимое давление ${facts.pressureBar} бар ниже требуемого ${need.pressureBar} бар.`);
  if (need.kind === "tank") equal("объём, л", facts.volumeLitres, need.volumeLitres);
  if (need.kind === "tank" || need.kind === "transducer") {
    if (need.thread) equal("резьба", facts.thread, hydraulicThread(need.thread));
    else if (!facts.thread) missing.push("Не указаны стандарт и размер присоединительной резьбы изделия.");
    if (need.threadGender) equal("исполнение резьбы", facts.threadGender, need.threadGender);
    else if (!facts.threadGender) missing.push("Не указано внутреннее/наружное исполнение присоединительной резьбы.");
  }
  if (need.kind === "transducer") {
    if (!need.range || !Number.isFinite(need.range.min) || !Number.isFinite(need.range.max) || need.range.min >= need.range.max) missing.push("Не подтверждён требуемый диапазон измерения.");
    else if (!facts.range) missing.push("Не указан измерительный диапазон изделия.");
    else if (facts.range.min > need.range.min || facts.range.max < need.range.max) incompatible.push("Измерительный диапазон не покрывает требуемый диапазон.");
    equal("выходной сигнал", facts.signal, hydraulicSignal(need.signal));
    if (!need.supplyVoltage || !Number.isFinite(need.supplyVoltage)) missing.push("Не подтверждено питание от шкафа управления.");
    else if (!facts.supply) missing.push("Не указано напряжение питания изделия.");
    else if (need.supplyVoltage < facts.supply.min || need.supplyVoltage > facts.supply.max) incompatible.push("Питание шкафа вне допустимого диапазона преобразователя.");
    if (need.overloadBar !== undefined) {
      if (facts.overloadBar === null) missing.push("Не указано допустимое давление перегрузки.");
      else if (facts.overloadBar < need.overloadBar) incompatible.push("Допустимая перегрузка ниже требуемой.");
    }
  }
  if (need.kind === "flange-plug" || need.kind === "isolating-valve") {
    equal("DN", facts.dn, need.dn);
    if (!need.pn) missing.push("Не задан PN соединения.");
    else if (!facts.pn.length) missing.push("Не подтверждено исполнение соединения по PN.");
    else if (!facts.pn.includes(need.pn)) incompatible.push(`Нет подтверждённого соединения PN${need.pn}; повышенный PN сам по себе не подтверждает совместимость.`);
    if (need.kind === "flange-plug") equal("материал", facts.material, need.material);
    if (need.kind === "isolating-valve" && need.color && !(need.color === "red" ? /Красный/i : /Синий/i).test(item.family)) incompatible.push("Исполнение затвора не соответствует цвету принятой арматуры станции.");
    if (need.kind === "isolating-valve" && !need.actuator) missing.push("Не выбрано исполнение затвора: рукоятка, редуктор или шток.");
  }
  return { item, missing, incompatible, technicalStatus: incompatible.length ? "error" : missing.length ? "unverified" : "ready" };
}
/** Price never participates in compatibility or candidate ordering. Explicit choices survive catalogue changes. */
export function selectHydraulicProduct(items: AssemblyComponent[], need: HydraulicProductRequirement, selectedId?: string) {
  const candidates = items.filter(item => hydraulicProductKind(item) === need.kind).map(item => assessHydraulicProduct(item, need));
  const compatible = candidates.filter(candidate => !candidate.incompatible.length).sort((a, b) => a.missing.length - b.missing.length || a.item.id.localeCompare(b.item.id));
  const selected = selectedId ? candidates.find(candidate => candidate.item.id === selectedId) : compatible[0];
  return { selected, candidates, missingSelection: Boolean(selectedId && !selected), explanation: selectedId && !selected
    ? `Выбранное изделие ${selectedId} отсутствует в каталоге этого назначения.`
    : !selected ? "Подходящего изделия нет. Проверьте требования и доступные исполнения."
    : [...selected.incompatible, ...selected.missing].join(" ") || "Исполнение соответствует заданным требованиям." };
}
export function hydraulicProductPrice(item: AssemblyComponent, need: Pick<HydraulicProductRequirement, "kind" | "actuator">): number | null {
  const variant = need.kind === "isolating-valve" ? ({ handle: /рукоятк/i, gear: /редуктор/i, bare: /шток/i } as const)[need.actuator ?? "bare"] : null;
  if (need.kind === "isolating-valve" && !need.actuator) return null;
  const prices = item.prices.filter(p => p.currency === "RUB" && /цен[аы]/i.test(p.label) && !/\/кг|\/м\b/i.test(p.label) && (!variant || variant.test(p.label)) && Number.isFinite(p.amount) && p.amount > 0);
  return prices.length === 1 ? prices[0].amount : null;
}
