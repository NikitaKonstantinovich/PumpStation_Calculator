import { makeField, type Field, type NodeType } from "../engineering/schema";
import type { Step } from "../engineering/engine";
import type { Pump } from "../pump-catalog";
import type { CatalogItem } from "./catalog-schema";
import type { Diagnostic, ToolContext, Values, View } from "./schema";

export type PumpDetailRow = { label: string; value: string };
export type PumpDetailSection = { id: string; title: string; rows: PumpDetailRow[] };
export type PumpDetailCurve = { id: string; title: string; unit: string; points: [number, number][] };
export type PumpDetailAsset = { kind: "image" | "drawing" | "model"; name: string; url: string; image: boolean };
export type PumpDetailData = {
  status: "ready" | "empty" | "stale";
  message: string;
  title: string;
  subtitle: string;
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
const LABELS: Record<string, string> = {
  powerKw: "Мощность, кВт", voltageV: "Напряжение, В", voltage_v: "Напряжение, В", currentA: "Ток, А", current_a: "Ток, А", phaseCount: "Число фаз", phase_count: "Число фаз", frequencyHz: "Частота, Гц", speedRpm: "Частота вращения, об/мин", protectionClass: "Степень защиты", insulationClass: "Класс изоляции", efficiencyClass: "Класс энергоэффективности",
  profileId: "ID материального профиля", scope: "Область применимости", description: "Описание", components: "Компоненты", component: "Деталь", material: "Материал", state: "Подтверждение материала", base: "Основание", body: "Корпус", casing: "Корпус", impeller: "Рабочее колесо", shaft: "Вал",
  medium: "Перекачиваемая среда", nominalNpshrM: "Номинальный NPSH, м", maxWorkingPressureBar: "Максимальное рабочее давление, бар", pressureTemperatureCondition: "Температурное условие давления", hasSensors: "Датчики", sensorStatus: "Подтверждение датчиков",
  id: "ID", variant_id: "ID исполнения", model_id: "ID модели", side: "Патрубок", dn: "DN", pn_designation: "Обозначение PN", pn_nominal_bar: "Номинальное PN, бар", connection_type: "Тип присоединения", connection_designation: "Обозначение присоединения", thread_designation: "Обозначение резьбы", standard: "Стандарт", connection_standard: "Стандарт присоединения", orientation: "Ориентация", applicability: "Применимость", source_id: "ID источника", source: "Источник", sources: "Источники",
  curveSet: "Набор характеристик", curveRecords: "Характеристики", priceSnapshot: "Снимок цены", pricePolicy: "Правило цены", availability: "Наличие", internalNumber: "Внутренний номер", materialScope: "Применимость материалов", articleKind: "Тип артикула", pumpType: "Тип насоса", archivePath: "Архив источника", jsonPointer: "Запись архива", sha256: "SHA-256", kind: "Вид", xUnit: "Единицы Q", yUnit: "Единицы характеристики",
  overall_length: "Общая длина, мм", overall_width: "Общая ширина, мм", overall_height: "Общая высота, мм", base_length: "Длина основания, мм", base_width: "Ширина основания, мм", construction_length: "Строительная длина, мм", flange_face_to_face: "Расстояние между плоскостями фланцев, мм", flange_center_height: "Высота оси фланцев, мм", pump_height_without_motor: "Высота насосной части без двигателя, мм",
  note: "Примечание", dimensionSetId: "ID набора размеров", declaredDesignation: "Обозначение из источника", bindingApplicability: "Применимость привязки", sourceValues: "Размеры из источника", key: "Исходный ключ", symbol: "Исходное обозначение", code: "Общий код размера", name: "Наименование", valueMm: "Значение, мм", mappingStatus: "Способ сопоставления", method: "Метод получения", baseGeometry: "Отдельная геометрия основания", axisDefinition: "Направления осей", sourceText: "Исходный текст размера", value: "Значение", unit: "Единица", selection: "Правило выбора набора", sourceScope: "Применимость по источнику", sourceId: "ID источника", bindingSourceId: "ID источника привязки", evidenceLevel: "Уровень подтверждения", document: "Документ", documentSha256: "SHA-256 документа", page: "Страница PDF", printedPage: "Печатная страница",
};
const VALUE_LABELS: Record<string, string> = { water: "Чистая вода", wastewater: "Сточная вода", unknown: "Не подтверждено", source_value: "Указано в источнике", catalog_model_default: "Каталожные данные модели", exact_variant: "Точное исполнение", confirmed_absent: "Отсутствие подтверждено", confirmed_present: "Наличие подтверждено", inlet: "Всасывающий", outlet: "Напорный", flange: "Фланцевое", flanged: "Фланцевое", thread: "Резьбовое", threaded: "Резьбовое", horizontal: "Горизонтальная", vertical: "Вертикальная", inline: "Соосная", model_reference: "Справочные данные модели, исполнение не подтверждено", designation: "Обозначение по источнику", designation_reference: "Справочные данные точного обозначения, без привязки к артикулу", variant_bound_designation: "Набор обозначения, явно выбранный для исполнения", variant_bound_family_geometry: "Геометрия основания типоразмера, явно связанная с исполнением", variant_preference: "Предпочтительный набор исполнения", explicit_model_selection: "Явно выбранный справочный набор модели", exact_designation_reference: "Совпадение точного обозначения", semantic_source_key: "Подтверждено значение общего размера", symbol_only: "Только исходный символ схемы", alternative_execution: "Альтернативное исполнение", mm: "мм", count: "шт." };
const record = (value: unknown): Values => value && typeof value === "object" && !Array.isArray(value) ? value as Values : {};
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export function pumpDetailValue(value: unknown): string {
  if (value == null || value === "") return "Не указано в источнике";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("ru-RU", { maximumFractionDigits: 6 }) : "Не указано в источнике";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "string") return VALUE_LABELS[value] ?? (value.trim() || "Не указано в источнике");
  return JSON.stringify(value);
}
function propertyRows(value: unknown, prefix = ""): PumpDetailRow[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, field]) => {
    const label = prefix + (Array.isArray(value) ? String(Number(key) + 1) : LABELS[key] ?? key);
    return field && typeof field === "object" ? propertyRows(field, label + " · ") : [{ label, value: pumpDetailValue(field) }];
  });
}

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
    if (url.pathname.startsWith("/api/")) return /^\/api\/pumps\/files\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(url.pathname) ? url.pathname : null;
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
export function buildPumpDetailData(value: unknown, selection: unknown, context: ToolContext): PumpDetailData {
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
  const p = item.pump, rows = (entries: [string, unknown][]) => entries.map(([label, value]) => ({ label, value: pumpDetailValue(value) }));
  const section = (id: string, title: string, entries: [string, unknown][], properties?: unknown): PumpDetailSection => ({ id, title, rows: [...rows(entries), ...propertyRows(properties)] });
  const sections = [
    section("identity", "Основные сведения", [["Производитель", p.manufacturer], ["Серия", p.series], ["Группа / типоразмер", p.group], ["Модель", p.model], ["Исполнение", p.execution], ["Артикул", p.article], ["Тип насоса", TYPE_LABELS[p.type] ?? p.type], ["Рабочая среда", p.medium], ["Описание", p.description]]),
    section("hydraulics", "Гидравлические характеристики одного насоса", [["Номинальный расход, м³/ч", p.nominalFlow], ["Номинальный напор, м", p.ratedHead], ["Минимальный расход по кривой, м³/ч", p.minFlow], ["Максимальный расход по кривой, м³/ч", p.maxFlow], ["Минимальный напор по кривой, м", p.minHead], ["Максимальный напор по кривой, м", p.maxHead], ["КПД, %", p.efficiency], ["Подтверждённая частота, Гц", item.frequencyHz]]),
    section("electric", "Двигатель и электрика", [["Мощность двигателя, кВт", p.power], ["Напряжение", p.voltage], ["Частота, Гц", p.frequencyHz], ["Частота вращения, об/мин", p.speedRpm]], p.electric),
    section("connections", "Подключения и монтаж", [["DN всасывающего патрубка", p.inletDn], ["DN напорного патрубка", p.outletDn]], { ...(p.inlet ? { "Всасывающий патрубок": p.inlet } : {}), ...(p.outlet ? { "Напорный патрубок": p.outlet } : {}), ...(p.connectionSourceValue ? { "Обозначения из источника": p.connectionSourceValue } : {}), ...(p.mounting ? { "Монтаж": p.mounting } : {}) }),
    section("materials", "Материалы", [], p.materials),
    section("fluid", "Условия эксплуатации", [], p.fluid),
    section("dimensions", "Габариты и масса", [["Масса, кг", p.weightKg], ["Примечание к массе и патрубкам", p.physicalNote]], p.dimensions),
    section("price", "Цена и наличие", [[p.priceKind === "net" ? "Закупочная цена из каталога" : "Прайсовая цена из каталога", p.price], ["Валюта", p.priceCurrency], ["Тип цены", p.priceKind === "net" ? "Готовая цена источника, повторная скидка не применяется" : p.priceKind === "list" ? "Прайсовая" : null], ["Скидка в источнике, %", p.discountPercent], ["Наличие по данным источника", p.availability], ["Источник цены", p.priceSource]]),
    section("source", "Источники и идентификаторы", [["ID исполнения", item.variantId], ["ID модели", item.modelId], ["ID набора характеристик", item.curveSetId], ["Снимок каталога", state.snapshotId], ["Условия подтверждения", state.requestKey], ["Технические характеристики", p.source], ["Источник чертежа", p.drawingSource]], p.physicalDataSources),
    section("provenance", "Происхождение и применимость данных", [], item.provenance),
  ];
  for (const s of sections) if (!s.rows.length) s.rows.push({ label: s.title, value: "Не указано в источнике" });
  const curves: PumpDetailCurve[] = [];
  for (const [id, title, unit, points] of [["qh", "Расход — напор (Q–H)", "H, м", p.curve], ["efficiency", "КПД", "η, %", p.efficiencyCurve], ["power", "Мощность по кривой", "P, кВт", p.powerCurve], ["npsh", "Кавитационный запас (NPSH)", "NPSH, м", p.npshCurve]] as const) {
    curves.push({ id, title, unit, points: points ?? [] });
  }
  const warnings = [...new Set([...(item.issues ?? []), ...(p.dataWarnings ?? []), ...(p.active === false || p.selectable === false ? ["Исполнение недоступно для подбора в источнике."] : [])])];
  return { status: "ready", message: "Данные одного насоса из подтверждённого исполнения и закреплённого снимка каталога.", title: p.execution || p.model, subtitle: [p.manufacturer, p.series, TYPE_LABELS[p.type] ?? p.type].filter(Boolean).join(" · "), identity: { variantId: item.variantId, modelId: item.modelId, curveSetId: item.curveSetId, snapshotId: state.snapshotId as string, frequencyHz: item.frequencyHz }, highlights: rows([["Мощность, кВт", p.power], ["Q ном., м³/ч", p.nominalFlow], ["H ном., м", p.ratedHead]]), sections, curves, assets: explicitAssets(p), warnings, record: item };
}

export const DETAIL_OPERATIONS = ["pump.detailData", "ui.pumpDetail"] as const;
const field = (key: string, name: string, meaning: string, direction: Field["direction"] = "input") => makeField(key, name, "object", meaning, "", direction);
const diagnostics = (): Field => makeField("issues", "Проверки", "array", "diagnostics", "", "output");
export function detailNodeTypes(): NodeType[] {
  return [
    { id: "pump.detailData", name: "Полные данные выбранного насоса", category: "Карточка насоса", description: "Проверяет точное исполнение и собирает характеристики, исходные кривые и происхождение данных. Использует только выбранный снимок нового каталога.", fields: [field("item", "Выбранное исполнение", "pumpCatalogItem"), field("selection", "Статус подтверждения", "pumpSelectionState"), field("value", "Данные карточки", "pumpCardData", "output"), diagnostics()], operation: "pump.detailData", formulas: {} },
    { id: "ui.pumpDetail", name: "Полная карточка насоса", category: "Интерфейс подбора", description: "Показывает все доступные характеристики и точки кривых. Отсутствующие сведения не заменяются данными старого каталога.", fields: [field("data", "Данные карточки", "pumpCardData"), field("value", "Интерфейс", "view", "output"), diagnostics()], operation: "ui.pumpDetail", formulas: {} },
  ];
}
export function executeDetailOperation(step: Step, values: Values, context: ToolContext): Values | undefined {
  if (!DETAIL_OPERATIONS.includes(step.operation as typeof DETAIL_OPERATIONS[number])) return undefined;
  const data = step.operation === "pump.detailData" ? buildPumpDetailData(values.item, values.selection, context) : values.data as PumpDetailData | null;
  const detail = data && ["ready", "empty", "stale"].includes(data.status) && Array.isArray(data.sections) && Array.isArray(data.curves) && Array.isArray(data.assets) && Array.isArray(data.warnings) ? data : empty("empty", "Подключите данные карточки выбранного насоса.");
  const issues: Diagnostic[] = detail.status === "stale" ? [{ node: step.id, key: "selection", severity: "warning", message: detail.message }] : [];
  return step.operation === "pump.detailData" ? { value: detail, issues } : { value: { kind: "pump-detail", node: step.id, label: "Карточка насоса", detail, hint: detail.message } as View, issues };
}
