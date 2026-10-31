import pumpMetadata from "../data/base-values-pumps.json";
import type { SpacingRule } from "./base-values";

export type SpacingPumpMetadata = {
  manufacturer: string; series: string; type: string; nominalFlow: number | null;
  inletDn: number | null; outletDn: number | null; active?: boolean; selectable?: boolean;
};
export type SpacingSeries = Pick<SpacingRule, "manufacturer" | "series" | "nominalFlow" | "inletDn" | "outletDn" | "modelIds"> & {
  key: string; type: "vertical_multistage" | "inline";
};
const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const normalize = (s: string) => s.trim().toLowerCase();
const seriesKey = (p: Pick<SpacingRule,"type"|"manufacturer"|"series"|"nominalFlow"|"inletDn"|"outletDn">) => JSON.stringify([
  p.type, normalize(p.manufacturer), normalize(p.series),
  ...(p.type === "inline" ? [p.inletDn,p.outletDn] : [p.nominalFlow]),
]);

export function spacingNominal(rule: Pick<SpacingRule,"type"|"nominalFlow"|"inletDn"|"outletDn">) {
  if (rule.type !== "inline") return rule.nominalFlow === null ? "—" : `${rule.nominalFlow.toLocaleString("ru-RU")} м³/ч`;
  if (rule.inletDn === null && rule.outletDn === null) return "—";
  return rule.inletDn === rule.outletDn ? `DN ${rule.inletDn}` : `DN ${rule.inletDn ?? "—"} / ${rule.outletDn ?? "—"}`;
}

// Freeze the selected models into the rule. A later catalogue import must not
// silently change the scope of an already published rule or an old project.
export function availableSpacingSeries(rules: SpacingRule[], catalog: Record<string,SpacingPumpMetadata> = pumpMetadata): SpacingSeries[] {
  const covered = new Set(rules.flatMap(r => r.modelId ? [r.modelId] : r.modelIds));
  const occupied = new Set(rules.map(seriesKey));
  const groups = new Map<string,SpacingSeries>();
  for (const [id,pump] of Object.entries(catalog)) {
    if (!["vertical_multistage","inline"].includes(pump.type) || pump.active === false || pump.selectable === false || !pump.manufacturer?.trim() || !pump.series?.trim()) continue;
    if (pump.type === "inline" ? !positive(pump.inletDn) || !positive(pump.outletDn) : !positive(pump.nominalFlow)) continue;
    const key = seriesKey(pump);
    const group = groups.get(key) ?? {key,type:pump.type as SpacingSeries["type"],manufacturer:pump.manufacturer.trim(),series:pump.series.trim(),nominalFlow:pump.type === "inline" ? null : pump.nominalFlow,inletDn:pump.type === "inline" ? pump.inletDn : null,outletDn:pump.type === "inline" ? pump.outletDn : null,modelIds:[]};
    group.modelIds.push(id); groups.set(key,group);
  }
  return [...groups.values()].filter(g => !occupied.has(g.key) && !g.modelIds.some(id => covered.has(id)))
    .sort((a,b) => a.type.localeCompare(b.type) || a.manufacturer.localeCompare(b.manufacturer,"ru") || a.series.localeCompare(b.series,"ru",{numeric:true}) || (a.nominalFlow??a.inletDn??0)-(b.nominalFlow??b.inletDn??0) || (a.outletDn??0)-(b.outletDn??0));
}

export function createSpacingRule(key: string, rules: SpacingRule[], input: {spacing: number; radius?: number | null; source?: string}, catalog: Record<string,SpacingPumpMetadata> = pumpMetadata): SpacingRule {
  const series = availableSpacingSeries(rules,catalog).find(s => s.key === key);
  if (!series) throw new Error("Серия отсутствует в актуальном каталоге или для неё уже есть правило.");
  if (!positive(input.spacing) || input.spacing < 400 || input.spacing % 50 !== 0) throw new Error("Межосевое расстояние — от 400 мм с шагом 50 мм.");
  const radius = input.radius ?? null, source = input.source?.trim() ?? "";
  if (radius !== null && !positive(radius)) throw new Error("Укажите положительный вылет от оси насоса.");
  if (radius !== null && input.spacing-2*radius < 150) throw new Error("Свободный зазор между насосами должен быть не менее 150 мм.");
  if ((radius !== null) !== Boolean(source)) throw new Error("Для подтверждения заполните и вылет от оси, и источник размеров.");
  return {id:crypto.randomUUID(),manufacturer:series.manufacturer,type:series.type,series:series.series,nominalFlow:series.nominalFlow,inletDn:series.inletDn,outletDn:series.outletDn,
    modelId:"",modelIds:[...series.modelIds],powerMin:null,powerMax:null,execution:`${series.manufacturer} ${series.series}, ${spacingNominal(series)}`,
    radius,spacing:input.spacing,status:radius === null ? "conditional" : "confirmed",source,
    note:radius === null ? "Расстояние задано администратором; габариты и свободный зазор требуют проверки." : "Габарит и источник указаны администратором для выбранных моделей серии."};
}
