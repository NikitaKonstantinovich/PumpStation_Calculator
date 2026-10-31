import seed from "../data/base-values-seed.json";
import pumpMetadata from "../data/base-values-pumps.json";
import { validateCollectorNippleRules, type CollectorNippleConfiguration } from "./collector-nipple-rules";
export { DEFAULT_COLLECTOR_NIPPLES, collectorNippleRules, collectorNippleCounts } from "./collector-nipple-rules";
export type { CollectorNippleRules, CollectorNippleConfiguration } from "./collector-nipple-rules";
import type { PipePaintingRate } from "./component-painting";
import { validateThreadCuttingRates, type ThreadCuttingRate } from "./thread-cutting";

export const BASE_SECTIONS = ["financial", "spacing", "welding", "velocity", "painting", "preferences"] as const;
export type BaseSection = typeof BASE_SECTIONS[number];
export const BASE_LABELS: Record<BaseSection, string> = { financial: "Курсы и скидки", spacing: "Межосевые расстояния", welding: "Сварка", velocity: "Скорости потока", painting: "Окраска", preferences: "Предпочтительные комплектующие" };
export type SpacingRule = { id: string; manufacturer: string; type: string; series: string; nominalFlow: number | null; inletDn: number | null; outletDn: number | null; modelId: string; modelIds: string[]; powerMin: number | null; powerMax: number | null; execution: string; radius: number | null; spacing: number | null; status: "confirmed" | "conditional" | "missing"; source: string; note: string };
export type VelocityRule = { fromDn: number; toDn: number | null; limit: number };
export type PreferenceRule = { id: string; stationType: "all" | "utility" | "fire" | "combined" | "smart"; side: "suction" | "discharge"; role: "tank" | "transducer" | "plug" | "separator"; productIds: string[] };
export type BaseValues = {
  financial: { usdRate: number; cnyRate: number; date: string; discounts: Record<string, number> };
  spacing: { legacy: boolean; minimum: number; increment: number; gap: number; rules: SpacingRule[] };
  welding: { aisi304: number; st20: number; date: string; note: string; threadCutting?: ThreadCuttingRate[] };
  velocity: VelocityRule[];
  painting: Array<PipePaintingRate & { date: string; note: string }>;
  preferences: { hoseLengthMm: 600 | 800 | 1000 | null; rules: PreferenceRule[]; collectorNipples?: CollectorNippleConfiguration };
};
export type BaseVersions = Record<BaseSection, string>;
export type AppliedBaseValues = { versions: BaseVersions; values: BaseValues };
export type BasePublication = { id: string; values: BaseValues; createdAt: string; author: string };
export const initialBaseValues = (): BaseValues => structuredClone(seed) as BaseValues;
export const legacyBaseValues = (): BaseValues => { const values = initialBaseValues(); values.financial.discounts=Object.fromEntries(Object.entries(values.financial.discounts).filter(([key])=>["cnp","aquastrong","onis","vandjord","wellmix"].includes(key)));values.spacing = { ...values.spacing, legacy: true, rules: [] }; return values; };
export const baseSnapshot = (id: string, values: BaseValues): AppliedBaseValues => ({ versions: Object.fromEntries(BASE_SECTIONS.map(k => [k, id])) as BaseVersions, values: structuredClone(values) });
export const legacyBaseSnapshot = () => baseSnapshot("legacy-v1", legacyBaseValues());
export const stableBaseJson = (value: unknown): string => JSON.stringify(value, (_k, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a],[b]) => a.localeCompare(b))) : v);
export const baseEqual = (a: unknown, b: unknown) => stableBaseJson(a) === stableBaseJson(b);
export const baseSettingsIdentity = <T extends {baseValues?:AppliedBaseValues;manufacturerDiscounts?:Record<string,number|undefined>}>(settings:T) => {
  if(!settings.baseValues)return settings;
  if(Object.values(settings.baseValues.versions).every(v=>v==="legacy-v1")){
    const copy={...settings};delete copy.baseValues;
    if(copy.manufacturerDiscounts)copy.manufacturerDiscounts=Object.fromEntries(Object.entries(copy.manufacturerDiscounts).filter(([key,value])=>["cnp","aquastrong","onis","vandjord","wellmix"].includes(key)||value!==0));
    return copy;
  }
  return {...settings,baseValues:{versions:settings.baseValues.versions}};
};
export function baseConfigurationIdentity<T extends {baseVersions?:BaseVersions;velocityRules?:VelocityRule[]}>(configuration:T):T {
  if(!configuration||!configuration.baseVersions||Object.values(configuration.baseVersions).some(v=>v!=="legacy-v1"))return configuration;
  const copy={...configuration};delete copy.baseVersions;delete copy.velocityRules;return copy;
}
export const validBaseNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
export const catalogManufacturers = () => [...new Set(Object.values(pumpMetadata).map(p=>p.manufacturer.toLowerCase()))].sort();

export function validateBaseValues(raw: unknown): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") return ["Не заполнены базовые значения."];
  const v = raw as BaseValues;
  if (!BASE_SECTIONS.every(s => Object.hasOwn(v, s))) return ["Не заполнены все шесть разделов."];
  if (!v.financial || !v.welding || !v.spacing || !v.preferences || !Array.isArray(v.velocity) || !Array.isArray(v.painting) || !Array.isArray(v.spacing.rules) || !Array.isArray(v.preferences.rules)) return ["Некорректная структура разделов."];
  const tables=[v.velocity,v.painting,v.spacing.rules,v.preferences.rules];
  if([v.financial,v.spacing,v.welding,v.preferences,v.financial.discounts].some(value=>!value||typeof value!=="object"||Array.isArray(value)))return ["Некорректная структура разделов."];
  if(tables.some(rows=>rows.length>5000||rows.some(row=>!row||typeof row!=="object"||Array.isArray(row))))return ["Некорректные строки таблиц."];
  for (const k of ["usdRate", "cnyRate"] as const) if (!validBaseNumber(v.financial[k]) || v.financial[k] > 10000) errors.push(`Курс ${k}: требуется число от 0 до 10000, исключая 0.`);
  if (!v.financial.discounts || typeof v.financial.discounts !== "object" || Object.entries(v.financial.discounts).some(([k,d]) => !k || typeof d !== "number" || !Number.isFinite(d) || d < 0 || d > 100)) errors.push("Скидки должны быть от 0 до 100%.");
  for (const k of ["aisi304", "st20"] as const) if (!validBaseNumber(v.welding[k])) errors.push(`Сварка ${k}: укажите положительный тариф ₽/м.`);
  errors.push(...validateThreadCuttingRates(v.welding.threadCutting));
  for (const date of [v.financial.date, v.welding.date, ...v.painting.map(r => r.date)]) if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) errors.push("Укажите корректную дату актуальности.");
  if (v.spacing.minimum !== 400 || v.spacing.increment !== 50 || v.spacing.gap !== 150 || typeof v.spacing.legacy !== "boolean") errors.push("Группировка: минимум 400 мм, интервал 50 мм, зазор 150 мм.");
  const ids = new Set<string>(), models = new Map<string,SpacingRule[]>();
  for (const r of v.spacing.rules) {
    if (!r || !r.id || ids.has(r.id)) { errors.push("Повтор или отсутствие ID правила расстояния."); continue; } ids.add(r.id);
    if (!Array.isArray(r.modelIds) || r.modelIds.some(id=>typeof id!=="string") || ![r.id,r.manufacturer,r.series,r.modelId,r.source,r.execution,r.note].every(s=>typeof s==="string") || !r.manufacturer || !r.series || !["vertical_multistage","inline"].includes(r.type) || !["confirmed","conditional","missing"].includes(r.status)) { errors.push(`${r.id}: неполное правило.`); continue; }
    if(!r.modelId&&!r.modelIds.length)errors.push(`${r.id}: укажите ID точного исполнения или список моделей.`);
    if((r.modelId?[r.modelId]:r.modelIds).some(id=>!Object.hasOwn(pumpMetadata,id)))errors.push(`${r.id}: ID исполнения отсутствует в действующем каталоге насосов.`);
    if([r.nominalFlow,r.inletDn,r.outletDn].some(n=>n!==null&&!validBaseNumber(n)))errors.push(`${r.id}: подача и DN должны быть положительными.`);
    if (r.spacing !== null && (!validBaseNumber(r.spacing) || r.spacing < 400 || r.spacing % 50 !== 0)) errors.push(`${r.id}: шаг от 400 мм с интервалом 50 мм.`);
    if (r.radius !== null && !validBaseNumber(r.radius)) errors.push(`${r.id}: некорректный вылет R.`);
    if (r.radius !== null && r.spacing !== null && r.spacing - 2*r.radius < 150) errors.push(`${r.id}: свободный зазор меньше 150 мм.`);
    if (r.status === "confirmed" && (!validBaseNumber(r.radius) || !validBaseNumber(r.spacing) || !r.source?.trim())) errors.push(`${r.id}: для подтверждения нужны габарит, шаг и источник.`);
    if ((r.powerMin !== null && !validBaseNumber(r.powerMin)) || (r.powerMax !== null && !validBaseNumber(r.powerMax)) || (r.powerMin !== null && r.powerMax !== null && r.powerMin > r.powerMax)) errors.push(`${r.id}: некорректный диапазон мощности.`);
    for (const id of r.modelId ? [`exact:${r.modelId}`] : r.modelIds) { const prior=models.get(id)??[];if(prior.some(p=>Math.max(p.powerMin??0,r.powerMin??0)<=Math.min(p.powerMax??Infinity,r.powerMax??Infinity)))errors.push(`Пересечение правил для ${id}.`);models.set(id,[...prior,r]); }
  }
  const sorted = [...v.velocity].sort((a,b) => a.fromDn-b.fromDn);
  let next = 1;
  if (!sorted.length) errors.push("Задайте диапазоны DN.");
  for (const [i,r] of sorted.entries()) {
    if (!Number.isInteger(r.fromDn) || r.fromDn !== next || !validBaseNumber(r.limit) || (r.toDn !== null && (!Number.isInteger(r.toDn) || r.toDn < r.fromDn)) || (r.toDn === null && i !== sorted.length-1)) errors.push("Диапазоны DN должны покрывать все DN от 1, без пересечений и пропусков.");
    next = r.toDn === null ? Infinity : r.toDn+1;
  }
  if (next !== Infinity) errors.push("Последний диапазон DN должен быть без верхней границы.");
  const paint = new Set<number>();
  for (const r of v.painting) { if (!Number.isInteger(r.dn) || r.dn <= 0 || paint.has(r.dn) || r.material !== "st20" || typeof r.id!=="string" || !r.id || (r.pricePerMeter !== null && !validBaseNumber(r.pricePerMeter)) || typeof r.source!=="string" || !r.source.trim()) errors.push(`Некорректный тариф окраски DN${r.dn}.`); paint.add(r.dn); }
  if (v.preferences.hoseLengthMm !== null && ![600,800,1000].includes(v.preferences.hoseLengthMm)) errors.push("Длина подводки: 600, 800 или 1000 мм.");
  errors.push(...validateCollectorNippleRules(v.preferences.collectorNipples));
  const pref = new Set<string>();
  for (const r of v.preferences.rules) { const key = `${r.stationType}:${r.side}:${r.role}`; if (pref.has(key) || !["all","utility","fire","combined","smart"].includes(r.stationType) || !["suction","discharge"].includes(r.side) || !["tank","transducer","plug","separator"].includes(r.role) || !Array.isArray(r.productIds) || new Set(r.productIds).size !== r.productIds.length || r.productIds.some(id => typeof id !== "string" || !id.trim())) errors.push(`Некорректное предпочтение ${key}.`); pref.add(key); }
  return [...new Set(errors)];
}

export function spacingForPump(values: BaseValues | undefined, pumpId: string | undefined, secondary = false) {
  if (!values || values.spacing.legacy) return { spacing: secondary ? 400 : 500, radius: null, gap: null, status: "legacy", message: "Сохранённое стандартное исполнение", rule: undefined };
  const pump = (pumpMetadata as Record<string,{power: number | null}>)[pumpId ?? ""];
  const matches = values.spacing.rules.filter(r => (r.modelId ? r.modelId === pumpId : r.modelIds.includes(pumpId ?? "")) && (r.powerMin === null || pump?.power != null && pump.power >= r.powerMin) && (r.powerMax === null || pump?.power != null && pump.power <= r.powerMax));
  const exact = matches.filter(r => r.modelId); const candidates = exact.length ? exact : matches;
  if (candidates.length !== 1) return { spacing: null, radius: null, gap: null, status: "missing", message: candidates.length ? "Пересечение правил расстояния" : "Требуется уточнение межосевого расстояния: нет правила для исполнения", rule: undefined };
  const rule = candidates[0], gap = rule.spacing !== null && rule.radius !== null ? rule.spacing-2*rule.radius : null;
  return { spacing: rule.spacing, radius: rule.radius, gap, status: rule.status, rule, message: rule.status === "confirmed" ? "По подтверждённым размерам" : `${rule.status === "missing" ? "Требуется уточнение" : "Условное расстояние"}: ${rule.execution}. ${rule.note}` };
}
export const baseVelocityLimit = (dn: number, rules?: VelocityRule[]) => rules ? rules.find(r => dn >= r.fromDn && (r.toDn === null || dn <= r.toDn))?.limit ?? NaN : dn <= 250 ? 2 : 3;
export function paintingItemForBase<T extends {id:string;prices:Array<{label:string;amount:number;currency:string}>}>(item:T,applied?:AppliedBaseValues):T {
  const tariff=applied?.values.painting.find(row=>row.id===item.id);
  if(!tariff)return item;
  return {...item,prices:tariff.pricePerMeter===null?[]:[{label:"Тариф окраски по версии проекта, ₽/м",amount:tariff.pricePerMeter,currency:"RUB"}]};
}
export function applyBaseTariffs<T extends {version:string; paintingRates?: PipePaintingRate[]}>(catalog:T, applied?:AppliedBaseValues):T & {weldRates?: {aisi304:number; st20:number}} {
  if (!applied) return catalog;
  const legacy=applied.versions.welding==="legacy-v1"&&applied.versions.painting==="legacy-v1";
  return { ...catalog, version: legacy?catalog.version:`${catalog.version}:base:${applied.versions.welding}:${applied.versions.painting}`, weldRates: { aisi304: applied.values.welding.aisi304, st20: applied.values.welding.st20 }, paintingRates: applied.values.painting.map(r => ({...r, warnings: r.pricePerMeter === null ? [`Нет тарифа окраски DN${r.dn}`] : []})) };
}
