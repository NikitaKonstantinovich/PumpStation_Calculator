import { spacingCardSection } from "./spacing-card";
import { makeField, type Field, type NodeType } from "../engineering/schema";
import type { Step } from "../engineering/engine";
import type { Pump } from "../pump-catalog";
import type { CatalogItem } from "./catalog-schema";
import type { Diagnostic, ToolContext, Values, View } from "./schema";

import { engineeringSections, cardPresentation, pumpDetailValue, type PumpDetailRow, type PumpDetailSection } from "./pump-card-presentation";
import { operatingPointSection } from "./pump-operating-point";
import type { SelectionState } from "./pump-nodes";
export { pumpDetailValue } from "./pump-card-presentation";
export type { PumpDetailRow, PumpDetailSection } from "./pump-card-presentation";
export type PumpDetailCurve = { id: string; title: string; unit: string; points: [number, number][] };
export type PumpDetailAsset = { kind: "image" | "drawing" | "model"; name: string; url: string; image: boolean; previewUrl?: string; scope?: string; note?: string; page?: number; source?: string };
export type PumpDetailData = {
  status: "ready" | "empty" | "stale";
  message: string;
  title: string;
  subtitle: string;
  article?: string;
  critical?: string[];
  identity?: { variantId: string; modelId: string; curveSetId: string | null; snapshotId: string; frequencyHz: number | null };
  highlights: PumpDetailRow[];
  sections: PumpDetailSection[];
  curves: PumpDetailCurve[];
  assets: PumpDetailAsset[];
  warnings: string[];
  /** The selected source record remains inspectable without discarding unrecognised attributes. */
  record?: CatalogItem;
};

const TYPE_LABELS: Record<string, string> = { vertical_multistage: "Вертикальный многоступенчатый", horizontal_multistage: "Горизонтальный многоступенчатый", end_suction: "Консольный", inline: "Инлайн", submersible: "Погружной", unknown: "Не указан" };
const record = (value: unknown): Values => value && typeof value === "object" && !Array.isArray(value) ? value as Values : {};
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Only explicit local file references are links; filesystem paths and inferred family assets never are. */
export function safePumpDetailAssetUrl(value: unknown): string | null {
  const unsafeCharacters = (text: string) => text.includes("\\") || [...text].some(character => character.charCodeAt(0) <= 32);
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || unsafeCharacters(value)) return null;
  try {
    let decoded = value;
    for (let i = 0; i < 4; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
      if (i === 3) return null;
    }
    if (decoded.startsWith("//") || unsafeCharacters(decoded) || decoded.split(/[/?#]/).some(part => part === "." || part === "..")) return null;
    const url = new URL(value, "https://pumpstation.invalid");
    if (url.origin !== "https://pumpstation.invalid" || url.hash || url.search) return null;
    if (url.pathname.startsWith("/api/")) return /^\/api\/pumps\/files\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(url.pathname) || /^\/api\/pumps\/catalog-drawings\/[a-f0-9]{64}\.(png|jpe?g|webp|pdf|dwg|dxf)$/.test(url.pathname) ? url.pathname : null;
    return /\.(png|jpe?g|webp|gif|bmp|pdf|dwg|dxf|step|stp|stl|iges|igs|sldprt|sldasm|x_t|x_b|obj|glb|gltf|eprt|easm)$/i.test(url.pathname) ? url.pathname : null;
  } catch { return null; }
}
function explicitAssets(pump: Pump): PumpDetailAsset[] {
  const files = pump.assets?.files, result: PumpDetailAsset[] = [];
  for (const kind of ["image", "drawing", "model"] as const) {
    const file = files?.[kind], candidate = file?.url ?? pump.assets?.[`${kind}Path`] ?? (kind === "drawing" ? pump.drawing : null), url = safePumpDetailAssetUrl(candidate);
    if (!url) continue;
    result.push({ kind, name: file?.name || decodeURIComponent(url.split("/").at(-1)!), url, image: kind !== "model" && (file?.contentType ? /^image\/(png|jpeg|webp|gif|bmp)$/i.test(file.contentType) : /\.(png|jpe?g|webp|gif|bmp)$/i.test(url)) });
  }
  for (const drawing of pump.drawings ?? []) {
    const url = safePumpDetailAssetUrl(drawing.url), previewUrl = safePumpDetailAssetUrl(drawing.previewUrl);
    if (!url || result.some(asset => asset.url === url && asset.page === drawing.page)) continue;
    result.push({ kind: "drawing", name: drawing.name, url, image: /^image\/(png|jpeg|webp)$/i.test(drawing.contentType),
      ...(previewUrl && /\.(png|jpe?g|webp)$/i.test(previewUrl) ? { previewUrl } : {}), scope: drawing.scope, note: drawing.note, page: drawing.page, source: drawing.source });
  }
  return result;
}
const empty = (status: "empty" | "stale", message: string): PumpDetailData => ({ status, message, title: "Карточка насоса", subtitle: "", highlights: [], sections: [], curves: [], assets: [], warnings: [] });
function identityIssue(item: CatalogItem, state: Values): string | null {
  if (!item.pump || !item.variantId || !item.modelId || item.pump.id !== item.variantId || state.variantId !== item.variantId || state.modelId !== item.modelId || state.curveSetId !== item.curveSetId) return "Исполнение, модель или набор характеристик не совпадают с подтверждённым выбором. Выберите насос заново.";
  if (!((item.frequencyHz === null || finite(item.frequencyHz) && item.frequencyHz > 0) && (item.pump.frequencyHz ?? null) === item.frequencyHz)) return "Частота исполнения не согласована с выбранной характеристикой.";
  const curve = record(item.provenance?.curveSet);
  if (curve.id != null && curve.id !== item.curveSetId || curve.model_id != null && curve.model_id !== item.modelId || curve.frequency_hz != null && curve.frequency_hz !== item.frequencyHz) return "Источник набора характеристик не совпадает с исполнением насоса.";
  return null;
}
export function buildPumpDetailData(value: unknown, selection: unknown, context: ToolContext, operatingPoint?: unknown, collectors?: unknown): PumpDetailData {
  const state = record(selection);
  if (state.valid !== true || state.stale === true) return empty(state.stale === true ? "stale" : "empty", typeof state.message === "string" && state.message || "Выберите и подтвердите исполнение в инструменте подбора насосов.");
  let item = record(value) as unknown as CatalogItem;
  if (typeof state.snapshotId !== "string" || !state.snapshotId || typeof state.requestKey !== "string" || !state.requestKey) return empty("stale", "Не указаны снимок каталога или условия подтверждения выбора.");
  const issue = identityIssue(item, state);
  if (issue) return empty("stale", issue);
  const snapshot = context.resources?.pump_catalog_v2;
  if (snapshot) {
    const source = snapshot.items.find(candidate => candidate.variantId === item.variantId);
    if (snapshot.id !== state.snapshotId || !source || identityIssue(source, state) || source.frequencyHz !== item.frequencyHz) return empty("stale", "Выбранное исполнение не соответствует закреплённому снимку каталога. Требуется повторное подтверждение.");
    item = source;
  }
  const p = item.pump, sections = [operatingPointSection(operatingPoint, item, state as unknown as SelectionState), spacingCardSection(collectors, item, state as unknown as SelectionState), ...engineeringSections(item)];
  if (finite(state.purchasePriceRub) && !(p.priceKind === "net" && p.priceCurrency === "RUB" && p.price === state.purchasePriceRub)) sections.find(section => section.id === "price")!.rows.push({ key: "selectionPrice", label: "Закупочная цена в подборе", value: pumpDetailValue(state.purchasePriceRub) + " ₽", origin: "Подтверждённый подбор; курс и скидки проекта" });
  const curves: PumpDetailCurve[] = [];
  for (const [id, title, unit, points] of [["qh", "Расход — напор (Q–H)", "H, м", p.curve], ["efficiency", "КПД", "η, %", p.efficiencyCurve], ["power", "Мощность по кривой (назначение P1/P2 не подтверждено)", "P, кВт", p.powerCurve], ["npsh", "NPSHr насоса", "NPSHr, м", p.npshCurve]] as const) {
    curves.push({ id, title, unit, points: points ?? [] });
  }
  const warnings = [...new Set([...(item.issues ?? []), ...(p.dataWarnings ?? []), ...(p.active === false || p.selectable === false ? ["Исполнение недоступно для подбора в источнике."] : [])])];
  return { status: "ready", message: "", title: p.execution || p.model, subtitle: [p.manufacturer, p.series, TYPE_LABELS[p.type] ?? p.type].filter(Boolean).join(" · "), ...(p.article && !/^(null|undefined|nan)$/i.test(p.article) ? { article: p.article } : {}), identity: { variantId: item.variantId, modelId: item.modelId, curveSetId: item.curveSetId, snapshotId: state.snapshotId as string, frequencyHz: item.frequencyHz }, highlights: [], sections, curves, assets: explicitAssets(p), warnings, critical: p.active === false || p.selectable === false ? ["Исполнение недоступно для подбора в источнике."] : [], record: item };
}

export const DETAIL_OPERATIONS = ["pump.detailData", "ui.pumpDetail"] as const;
const field = (key: string, name: string, meaning: string, direction: Field["direction"] = "input") => makeField(key, name, "object", meaning, "", direction);
const diagnostics = (): Field => makeField("issues", "Проверки", "array", "diagnostics", "", "output");
export function detailNodeTypes(): NodeType[] {
  return [
    { id: "pump.detailData", name: "Полные данные выбранного насоса", category: "Карточка насоса", description: "Проверяет точное исполнение и собирает характеристики, исходные кривые и происхождение данных. Использует только выбранный снимок нового каталога.", fields: [field("item", "Выбранное исполнение", "pumpCatalogItem"), field("selection", "Статус подтверждения", "pumpSelectionState"), field("operatingPoint", "Рабочая точка с условиями расчёта", "pumpOperatingPoint"), field("collectors", "Текущая компоновка коллекторов", "stationCollectorResult"), field("value", "Данные карточки", "pumpCardData", "output"), diagnostics()], operation: "pump.detailData", formulas: {} },
    { id: "ui.pumpDetail", name: "Инженерная карточка насоса", category: "Интерфейс подбора", description: "Компактные инженерные разделы. Скрытые атрибуты и источники остаются доступны в инспекторе.", fields: [field("data", "Данные карточки", "pumpCardData"),
      ...[["showPassport", "Показывать паспортные характеристики", true], ["showPrice", "Показывать цену", true], ["expandedDetails", "Раскрывать дополнительные разделы", false], ["showOrigin", "Показывать источник значения", true]].map(([key, name, initial]) => ({ ...makeField(key as string, name as string, "boolean", "flag"), initial })),
      ...[["sectionOrder", "Порядок разделов"], ["hiddenSections", "Скрытые разделы"], ["mainFields", "Основные поля"]].map(([key, name]) => makeField(key, name, "array", "list")),
      field("value", "Интерфейс", "view", "output"), diagnostics()], operation: "ui.pumpDetail", formulas: {} },
  ];
}
export function executeDetailOperation(step: Step, values: Values, context: ToolContext): Values | undefined {
  if (!DETAIL_OPERATIONS.includes(step.operation as typeof DETAIL_OPERATIONS[number])) return undefined;
  const data = step.operation === "pump.detailData" ? buildPumpDetailData(values.item, values.selection, context, values.operatingPoint, values.collectors) : values.data as PumpDetailData | null;
  const detail = data && ["ready", "empty", "stale"].includes(data.status) && Array.isArray(data.sections) && Array.isArray(data.curves) && Array.isArray(data.assets) && Array.isArray(data.warnings) ? data : empty("empty", "Подключите данные карточки выбранного насоса.");
  const issues: Diagnostic[] = detail.status === "stale" ? [{ node: step.id, key: "selection", severity: "warning", message: detail.message }] : [];
  return step.operation === "pump.detailData" ? { value: detail, issues } : { value: { kind: "pump-detail", node: step.id, label: "Карточка насоса", detail, cardPresentation: cardPresentation(values), showOrigin: values.showOrigin !== false, hint: detail.message } as View, issues };
}
