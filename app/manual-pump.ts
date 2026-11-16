import { usablePump, type Pump } from "./pump-catalog";
import { PUMP_TYPE_LABELS } from "./pump-filters";

export type ManualPumpField = { key: string; label: string; group: string; kind?: "number" | "textarea" | "select"; path?: readonly string[]; min?: number; max?: number; options?: ReadonlyArray<readonly [string, string]>; maxLength?: number };
export const MANUAL_PUMP_GROUPS = [
  ["main", "Основные сведения"], ["hydraulics", "Гидравлические характеристики"], ["motor", "Двигатель и электрика"],
  ["connections", "Патрубки и монтаж"], ["materials", "Материалы и рабочая среда"], ["dimensions", "Габариты и масса"],
  ["price", "Цена и наличие"], ["files", "Изображения, чертежи и 3D-модели"],
] as const;
export const MANUAL_PUMP_FIELDS: readonly ManualPumpField[] = [
  { key: "model", label: "Модель / наименование *", group: "main" },
  { key: "manufacturer", label: "Производитель", group: "main" }, { key: "series", label: "Серия", group: "main" },
  { key: "type", label: "Тип насоса", group: "main", kind: "select", options: Object.entries(PUMP_TYPE_LABELS) },
  { key: "medium", label: "Рабочая среда", group: "main", kind: "select", options: [["water", "Чистая вода"], ["wastewater", "Сточная вода"]] },
  { key: "article", label: "Артикул", group: "main" }, { key: "execution", label: "Исполнение", group: "main" },
  { key: "group", label: "Группа / типоразмер", group: "main" }, { key: "description", label: "Описание", group: "main", kind: "textarea", maxLength: 4000 },
  ...[
    ["nominalFlow", "Номинальный расход, м³/ч"], ["ratedHead", "Номинальный напор, м"], ["minFlow", "Минимальный расход, м³/ч"],
    ["maxFlow", "Максимальный расход, м³/ч"], ["minHead", "Минимальный напор, м"], ["maxHead", "Максимальный напор, м"],
  ].map(([key, label]) => ({ key, label, group: "hydraulics", kind: "number" as const, min: 0 })),
  { key: "efficiency", label: "КПД, %", group: "hydraulics", kind: "number", min: 0, max: 100 },
  { key: "power", label: "Мощность двигателя, кВт", group: "motor", kind: "number", min: 0.001 },
  { key: "voltage", label: "Напряжение, В", group: "motor" },
  { key: "frequencyHz", label: "Частота, Гц", group: "motor", kind: "number", min: 0.001 },
  { key: "speedRpm", label: "Частота вращения, об/мин", group: "motor", kind: "number", min: 0.001 },
  { key: "current", label: "Ток, А", group: "motor", kind: "number", min: 0, path: ["electric", "current_a"] },
  { key: "protection", label: "Степень защиты IP", group: "motor", path: ["electric", "Степень защиты IP"] },
  ...(["inlet", "outlet"] as const).flatMap(side => [
    { key: `${side}Dn`, label: `${side === "inlet" ? "Всасывающий" : "Напорный"} патрубок, DN`, group: "connections", kind: "number" as const, min: 0.001 },
    { key: `${side}Type`, label: `${side === "inlet" ? "Вход" : "Выход"}: тип присоединения`, group: "connections", kind: "select" as const, path: [side, "type"], options: [["", "Не указан"], ["flange", "Фланцевое"], ["threaded", "Резьбовое"]] as const },
    { key: `${side}Pn`, label: `${side === "inlet" ? "Вход" : "Выход"}: PN, бар`, group: "connections", kind: "number" as const, min: 0.001, path: [side, "pressure_class"] },
    { key: `${side}Thread`, label: `${side === "inlet" ? "Вход" : "Выход"}: резьба`, group: "connections", path: [side, "thread"] },
  ]),
  { key: "mountingNote", label: "Монтаж и крепление", group: "connections", path: ["mounting", "Примечание"], kind: "textarea" },
  { key: "bodyMaterial", label: "Материал корпуса", group: "materials", path: ["materials", "Корпус"] },
  { key: "impellerMaterial", label: "Материал рабочего колеса", group: "materials", path: ["materials", "impeller"] },
  { key: "seal", label: "Уплотнение", group: "materials", path: ["materials", "Уплотнение"] },
  { key: "fluidNote", label: "Температура и условия эксплуатации", group: "materials", path: ["fluid", "Условия эксплуатации"], kind: "textarea" },
  ...[
    ["overallLength", "Габаритная длина, мм", "overall_length"], ["overallWidth", "Габаритная ширина, мм", "overall_width"],
    ["overallHeight", "Габаритная высота, мм", "overall_height"], ["baseLength", "Длина основания, мм", "base_length"],
    ["baseWidth", "Ширина основания, мм", "base_width"], ["constructionLength", "Монтажная длина, мм", "construction_length"],
  ].map(([key, label, property]) => ({ key, label, group: "dimensions", kind: "number" as const, min: 0.001, path: ["dimensions", property] })),
  { key: "weightKg", label: "Масса, кг", group: "dimensions", kind: "number", min: 0.001 },
  { key: "price", label: "Цена", group: "price", kind: "number", min: 0 },
  { key: "priceCurrency", label: "Валюта", group: "price", kind: "select", options: [["", "Не указана"], ["RUB", "RUB"], ["USD", "USD"], ["CNY", "CNY"]] },
  { key: "priceKind", label: "Тип цены", group: "price", kind: "select", options: [["list", "Прайсовая"], ["net", "Закупочная, без повторной скидки"]] },
  { key: "discountPercent", label: "Скидка, %", group: "price", kind: "number", min: 0, max: 100 },
  { key: "priceSource", label: "Источник цены", group: "price" }, { key: "availability", label: "Наличие", group: "price" },
  { key: "imagePath", label: "Путь к изображению насоса", group: "files", path: ["assets", "imagePath"], maxLength: 2048 },
  { key: "drawingPath", label: "Путь к чертежу", group: "files", path: ["assets", "drawingPath"], maxLength: 2048 },
  { key: "modelPath", label: "Путь к 3D-модели", group: "files", path: ["assets", "modelPath"], maxLength: 2048 },
  { key: "drawingSource", label: "Источник чертежа", group: "files" }, { key: "source", label: "Источник технических данных", group: "files" },
];
export const MANUAL_PUMP_CURVES = [
  { key: "curve", label: "Расход — напор (Q–H)", unit: "H, м", example: "0; 60\n10; 50\n20; 35" },
  { key: "efficiencyCurve", label: "КПД", unit: "η, %", example: "10; 70\n20; 75", max: 100 },
  { key: "powerCurve", label: "Мощность", unit: "P, кВт", example: "10; 2,5\n20; 3" },
  { key: "npshCurve", label: "Кавитационный запас (NPSH)", unit: "NPSH, м", example: "10; 2\n20; 3" },
] as const;
export type ManualPumpDraft = Record<string, string | boolean>;
export type ManualPumpRecord = { pump: Pump; revision: number; createdAt: string; updatedAt: string };
export class ManualPumpError extends Error { constructor(message: string, public status = 400) { super(message); } }

export function browserAssetPath(path?: string | null): string | null {
  if (!path || path.includes("\\") || [...path].some(character => character.charCodeAt(0) < 32)) return null;
  if (path.startsWith("/") && !path.startsWith("//")) return path;
  try { const url = new URL(path); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}

export function manualPumpDraft(pump?: Pump): ManualPumpDraft {
  const draft: ManualPumpDraft = { active: pump?.active !== false, selectable: pump?.selectable !== false };
  for (const field of MANUAL_PUMP_FIELDS) {
    let value: unknown = pump;
    for (const part of field.path ?? [field.key]) value = value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined;
    draft[field.key] = value == null ? "" : String(value);
  }
  draft.type ||= "unknown"; draft.medium ||= "water"; draft.priceKind ||= "list";
  for (const field of MANUAL_PUMP_CURVES) draft[field.key] = pump?.[field.key]?.map(pair => pair.join("; ")).join("\n") ?? "";
  return draft;
}

function curvePoints(raw: unknown, label: string, maximum?: number): Array<[number, number]> {
  if (raw == null || raw === "") return [];
  if (typeof raw !== "string" || raw.length > 40_000) throw new ManualPumpError(`${label}: неверный формат точек.`);
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 500) throw new ManualPumpError(`${label}: не более 500 точек.`);
  const points = lines.map((line, index): [number, number] => {
    const tokens = line.split(/[;\t ]+/), values = tokens.map(value => Number(value.replace(",", ".")));
    if (tokens.some(value => !value) || values.length !== 2 || values.some(value => !Number.isFinite(value) || value < 0) || (maximum !== undefined && values[1] > maximum)) throw new ManualPumpError(`${label}, строка ${index + 1}: укажите Q и значение через точку с запятой, без отрицательных значений${maximum ? `; максимум ${maximum}%` : ""}.`);
    return [values[0], values[1]];
  }).sort((a, b) => a[0] - b[0]);
  if (points.some((point, index) => index > 0 && point[0] === points[index - 1][0])) throw new ManualPumpError(`${label}: расход Q не должен повторяться.`);
  return points;
}

export function parseManualPump(raw: unknown, id: string): Pump {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ManualPumpError("Некорректные данные насоса.");
  const input = raw as Record<string, unknown>;
  const result: Record<string, unknown> = { id, manualEntry: true };
  for (const field of MANUAL_PUMP_FIELDS) {
    const value = input[field.key];
    if (value != null && typeof value !== "string" && typeof value !== "number") throw new ManualPumpError(`${field.label}: неверный формат.`);
    const text = value == null ? "" : String(value).trim();
    if (text.length > (field.maxLength ?? 512) || [...text].some(character => character.charCodeAt(0) < 32 && !"\t\r\n".includes(character))) throw new ManualPumpError(`${field.label}: слишком длинное или некорректное значение.`);
    let parsed: string | number | null = text || null;
    if (field.kind === "number" && text) {
      parsed = Number(text.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < (field.min ?? 0) || (field.max !== undefined && parsed > field.max)) throw new ManualPumpError(`${field.label}: значение вне допустимого диапазона.`);
    }
    if (field.options && !field.options.some(([option]) => option === text)) {
      if (text) throw new ManualPumpError(`${field.label}: выберите значение из списка.`);
      parsed = field.key === "type" ? "unknown" : field.key === "medium" ? "water" : field.key === "priceKind" ? "list" : null;
    }
    if (field.group === "files" && field.path && text && /^(?:javascript|data|vbscript):/i.test(text)) throw new ManualPumpError(`${field.label}: укажите путь к файлу или HTTP(S)-ссылку.`);
    if (field.path) {
      if (parsed !== null) {
        const group = (result[field.path[0]] ?? {}) as Record<string, unknown>;
        group[field.path[1]] = parsed;
        result[field.path[0]] = group;
      }
    } else result[field.key] = parsed;
  }
  if (!result.model) throw new ManualPumpError("Укажите модель / наименование насоса.");
  for (const key of ["manufacturer", "series", "group"]) result[key] ??= "";
  for (const key of ["active", "selectable"]) {
    if (input[key] !== undefined && typeof input[key] !== "boolean") throw new ManualPumpError("Некорректный статус насоса.");
    result[key] = input[key] !== false;
  }
  for (const [minimum, maximum, label] of [["minFlow", "maxFlow", "Расход"], ["minHead", "maxHead", "Напор"]]) {
    if (typeof result[minimum] === "number" && typeof result[maximum] === "number" && result[minimum] > result[maximum]) throw new ManualPumpError(`${label}: минимум не может превышать максимум.`);
  }
  for (const field of MANUAL_PUMP_CURVES) result[field.key] = curvePoints(input[field.key], field.label, "max" in field ? field.max : undefined);
  const pump = result as unknown as Pump;
  pump.drawing = browserAssetPath(pump.assets?.drawingPath);
  if (pump.drawing && !pump.drawingSource) pump.drawingSource = "Ручное заполнение";
  pump.catalogSource = "Ручное заполнение";
  pump.dataWarnings = pump.curve.length < 2 ? ["Для подбора заполните минимум две точки характеристики Q–H."] : [];
  if (pump.price !== null && pump.priceCurrency === null) pump.dataWarnings.push("Для расчёта стоимости укажите валюту цены.");
  return pump;
}

export const manualPumpIdentity = (pump: Pump) => JSON.stringify([pump.manufacturer, pump.model, pump.execution ?? ""].map(value => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU")));
export const manualPumpStatus = (pump: Pump) => usablePump(pump, pump.medium) ? "Доступен в подборе" : pump.active === false || pump.selectable === false ? "Подбор отключён" : "Нет кривой для подбора";
