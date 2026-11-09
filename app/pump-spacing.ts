import type { AppliedBaseValues, SpacingRule } from "./base-values";

export type SpacingLink = { legacyId: string; scope: "model" | "execution"; relation: string; source: string };
export type SpacingGeometry = {
  status: "confirmed"; variantId: string; motorKey: string; orientation: string;
  leftMm: number; rightMm: number; covers: string[]; source: string; version: string;
};
export type SpacingReference = {
  variantId: string; modelId: string; motorKey: string; orientation: string;
  leftMm: number; rightMm: number; source: string; basis: string; version: string;
};
export type SpacingEvidence = { modelId: string; links: SpacingLink[]; motorKey: string; geometry?: SpacingGeometry; reference?: SpacingReference; issues: string[] };
export type PumpLayout = {
  pumpId: string; modelId: string; snapshotId: string; contour: "primary" | "secondary";
  powerKw: number | null; motorKey: string; orientation: string; installed: number;
  links: SpacingLink[]; geometry?: SpacingGeometry; reference?: SpacingReference; width?: { mm: number; source: string }; issues: string[];
};
export type SpacingStatus = "confirmed" | "conditional" | "missing" | "conflict" | "stale";
export type SpacingResult = {
  spacing: number | null; radius: number | null; gap: number | null; requiredGap: number | null;
  status: SpacingStatus; source: "rule" | "calculation" | "manual" | "none";
  ruleIds: string[]; ruleVersion: string | null; fingerprint: string; layout: PumpLayout;
  dimensions: { leftMm: number; rightMm: number; source: string } | null;
  message: string; missing: string[]; geometryCalculated: boolean; clearanceViolation: boolean;
  calculationRule?: "width-plus-150-ceil-50-v1";
};
export const spacingJson = (v: unknown): string => JSON.stringify(v, (_k, x) => x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
export function spacingFingerprint(value: unknown): string {
  const text = spacingJson(value); let a = 2166136261, b = 5381;
  for (const c of text) { a = Math.imul(a ^ c.charCodeAt(0), 16777619); b = Math.imul(b, 33) ^ c.charCodeAt(0); }
  return "spacing-v1:" + (a >>> 0).toString(16) + (b >>> 0).toString(16);
}
const positive = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;
export function layoutGeometry(layout: PumpLayout): SpacingResult["dimensions"] {
  const g = layout.geometry;
  if (!g || g.status !== "confirmed" || g.variantId !== layout.pumpId || g.motorKey !== layout.motorKey || g.orientation !== layout.orientation || !layout.orientation || layout.orientation === "unspecified" || !positive(g.leftMm) || !positive(g.rightMm) || !g.source || !g.version || !Array.isArray(g.covers) || !["body", "motor", "terminal_box", "protrusions"].every(key => g.covers.includes(key))) return null;
  return { leftMm: g.leftMm, rightMm: g.rightMm, source: g.source };
}
export function findSpacingRule(layout: PumpLayout, applied?: AppliedBaseValues): SpacingResult {
  const policy = applied?.values.spacing, version = applied?.versions.spacing ?? null;
  const fingerprint = spacingFingerprint({ layout, policy, version });
  const dimensions = layoutGeometry(layout);
  const empty: SpacingResult = { spacing: null, radius: null, gap: null, requiredGap: policy?.gap ?? null, status: "missing", source: "none", ruleIds: [], ruleVersion: version, fingerprint, layout, dimensions, message: "Недостаточно данных", missing: [], geometryCalculated: false, clearanceViolation: false };
  if (!policy || !version) return { ...empty, missing: ["Закреплённая версия правил межосевых расстояний"] };
  if (policy.legacy) return { ...empty, message: "Закреплена прежняя версия без правил для нового каталога", missing: ["Правило для выбранного исполнения в закреплённой версии"] };
  const ids = new Set(layout.links.map(l => l.legacyId));

  const matches = policy.rules.flatMap(rule => {
    const exact = rule.variantIds?.includes(layout.pumpId) === true;
    const legacyId = rule.modelId ? rule.modelId : [...ids].find(id => rule.modelIds.includes(id));
    const link = layout.links.find(l => l.legacyId === legacyId);
    if (!exact && !link) return [];
    if (rule.powerMin != null && (!positive(layout.powerKw) || layout.powerKw < rule.powerMin) || rule.powerMax != null && (!positive(layout.powerKw) || layout.powerKw > rule.powerMax)) return [];
    // A model link does not certify the dimensions of every motor execution.
    const scope = rule.applicability;
    const explicit = scope && scope.motorKeys.includes(layout.motorKey) && scope.orientations.includes(layout.orientation);
    const conventional = ["transverse_to_flow", "legacy-layout"].includes(layout.orientation);
    const applicable = Boolean(exact && (!scope ? conventional : explicit) || link?.scope === "execution" && (!scope ? conventional : explicit) || explicit);
    return [{ rule, exact: exact || Boolean(rule.modelId && link), applicable }];
  });
  const exact = matches.filter(m => m.exact), candidates = exact.length ? exact : matches;
  if (!exact.length && ids.size > 1) return { ...empty, status: "conflict", message: "Неоднозначное соответствие старому каталогу", missing: [...ids] };
  if (candidates.length > 1) return { ...empty, status: "conflict", ruleIds: candidates.map(m => m.rule.id), message: "Несколько подходящих правил межосевого расстояния; требуется устранить конфликт" };
  if (!candidates.length) return { ...empty, missing: [ids.size ? "Применимое правило для текущего двигателя" : "Подтверждённое соответствие каталогов или правило точного исполнения", ...layout.issues] };
  const { rule, applicable } = candidates[0];
  const ruleGeometry = layoutGeometry({ ...layout, geometry: rule.geometry });
  const status = rule.status === "missing" ? "missing" : applicable ? rule.status : "conditional";
  const confirmedRadius = applicable && rule.status === "confirmed" && positive(rule.radius) ? rule.radius : null;
  // Never shrink an existing group result using a smaller motor's envelope.
  return { ...empty, spacing: status === "missing" ? null : rule.spacing, radius: confirmedRadius, source: "rule", ruleIds: [rule.id], status,
    dimensions: dimensions ?? ruleGeometry ?? (confirmedRadius !== null ? { leftMm: confirmedRadius, rightMm: confirmedRadius, source: rule.source } : null),
    message: status === "missing" ? `В прежнем правиле ${rule.id} недостаточно данных. ${rule.execution}. ${rule.note}` : applicable ? `Существующее правило ${rule.id}: ${rule.execution}. ${rule.note}` : `Найдено прежнее правило ${rule.id}, но применимость к двигателю и ориентации выбранного исполнения не подтверждена. ${rule.execution}`,
    missing: [...(status === "missing" ? ["Подтверждённый результат прежнего правила"] : []), ...(!applicable ? ["Подтверждение применимости правила к текущему двигателю и ориентации"] : [])],
  };
}
export function calculateSpacingFallback(result: SpacingResult, applied?: AppliedBaseValues): SpacingResult {
  if (result.status === "conflict" || result.source === "rule" && result.status === "confirmed" && positive(result.spacing)) return result;
  const policy = applied?.values.spacing, g = result.dimensions;
  const ref = result.layout.reference;
  const referenceValid = ref && ref.variantId === result.layout.pumpId && ref.modelId === result.layout.modelId && ref.motorKey === result.layout.motorKey && ref.orientation === result.layout.orientation && ref.orientation === "transverse_to_flow" && positive(ref.leftMm) && positive(ref.rightMm) && ref.source && ref.version && ref.basis;
  if (!g && referenceValid && policy && !policy.legacy && positive(policy.minimum) && positive(policy.increment) && positive(policy.gap)) {
    const calculated = Math.max(policy.minimum, Math.ceil((ref.leftMm + ref.rightMm + policy.gap) / policy.increment) * policy.increment);
    // Historical standards remain the preferred result; a model reference cannot certify them.
    if (positive(result.spacing) && result.spacing >= calculated) return result;
    return {...result, spacing:Math.max(calculated,result.spacing ?? 0), status:"conditional", source:"calculation", geometryCalculated:true,
      message:`Предварительный расчёт по габаритам: ${ref.leftMm} + ${ref.rightMm} + зазор ${policy.gap} мм; минимум ${policy.minimum} мм, округление ${policy.increment} мм. ${ref.basis} Источник: ${ref.source}`,
      missing:["Подтверждение полного габарита текущего заводского исполнения перед изготовлением"]};
  }
  if (!policy || policy.legacy || !positive(policy.minimum) || !positive(policy.increment) || !positive(policy.gap) || !g) return { ...result, missing: [...new Set([...result.missing, ...(!g ? ["Подтверждённые левый и правый вылеты полного насоса с двигателем и клеммной коробкой в направлении соседнего насоса", "Ориентация и применимость геометрии к исполнению"] : [])])] };
  const calculated = Math.max(policy.minimum, Math.ceil((g.leftMm + g.rightMm + policy.gap) / policy.increment) * policy.increment);
  return { ...result, spacing: Math.max(calculated, result.spacing ?? 0), radius: g.leftMm === g.rightMm ? g.leftMm : null, status: "confirmed", source: "calculation", geometryCalculated: true, missing: [], message: `По подтверждённым обращённым вылетам; минимум ${policy.minimum} мм, зазор ${policy.gap} мм, округление ${policy.increment} мм. Политика приложения ${result.ruleVersion}.` };
}
export function checkSpacingClearance(result: SpacingResult, spacing = result.spacing): SpacingResult {
  const g = result.dimensions, gap = spacing != null && g ? spacing - g.leftMm - g.rightMm : null;
  const violation = gap != null && result.requiredGap != null && gap < result.requiredGap;
  return { ...result, spacing, gap, clearanceViolation: violation, ...(violation ? { status: "conflict" as const, message: `Свободный зазор ${gap} мм меньше требуемого ${result.requiredGap} мм` } : {}) };
}
/** Product rule. Uses the pinned pump width; never substitutes DN, base width or an old spacing. */
export function standardPumpSpacing(layout: PumpLayout): SpacingResult {
  const rule = "width-plus-150-ceil-50-v1" as const;
  const confirmed = layoutGeometry(layout), ref = layout.reference;
  const referenceValid = ref && ref.variantId === layout.pumpId && ref.modelId === layout.modelId && ref.motorKey === layout.motorKey && ref.orientation === "transverse_to_flow" && positive(ref.leftMm) && positive(ref.rightMm) && ref.source && ref.version;
  const width = positive(layout.width?.mm) ? layout.width : confirmed ? { mm: confirmed.leftMm + confirmed.rightMm, source: confirmed.source } : referenceValid ? { mm: ref.leftMm + ref.rightMm, source: ref.source } : undefined;
  const applicable = layout.orientation === "transverse_to_flow";
  const mm = applicable ? width?.mm : undefined;
  const result: SpacingResult = {
    calculationRule: rule, spacing: null, radius: null, gap: null, requiredGap: 150,
    status: "missing", source: "none", ruleIds: [], ruleVersion: rule,
    fingerprint: spacingFingerprint({ rule, layout }), layout, dimensions: null,
    message: !applicable ? "Расчёт по ширине применяется к размещению насосов поперёк потока." : "В закреплённом каталоге не задана ширина выбранного насоса.",
    missing: [!applicable ? "Размещение поперёк потока" : "Ширина насоса, мм"], geometryCalculated: false, clearanceViolation: false
  };
  if (!positive(mm) || !width) return result;
  const spacing = Math.ceil((mm + 150) / 50) * 50;
  return checkSpacingClearance({ ...result, spacing, radius: mm / 2, status: "confirmed", source: "calculation", geometryCalculated: true, missing: [],
    dimensions: { leftMm: mm / 2, rightMm: mm / 2, source: width.source },
    message: `Стандартное межосевое: ширина ${mm} мм + 150 мм, округление вверх до 50 мм = ${spacing} мм. Источник ширины: ${width.source}.`
  });
}
export function resolvePumpSpacing(layout: PumpLayout, applied?: AppliedBaseValues, previous?: SpacingResult): SpacingResult {
  if (previous?.calculationRule === "width-plus-150-ceil-50-v1") return standardPumpSpacing(layout);
  const rule = findSpacingRule(layout, applied);
  if (previous?.fingerprint === rule.fingerprint && previous.source !== "manual") return previous;
  return checkSpacingClearance(calculateSpacingFallback(rule, applied));
}
export function manualSpacing(result: SpacingResult, spacing: number, confirmed: boolean): SpacingResult {
  return checkSpacingClearance({ ...result, source: "manual", status: confirmed ? "confirmed" : "stale", message: confirmed ? "Ручное решение подтверждено пользователем; неизвестная геометрия остаётся неподтверждённой" : "Ручное расстояние требует подтверждения для текущих исходных данных" }, spacing);
}
export type SpacingApplicability = { motorKeys: string[]; orientations: string[] };
export type SpacingRuleReference = Pick<SpacingRule, "id" | "source" | "execution">;
