import type { Pump, PumpProperties, PumpPropertyValue, PumpType } from "./pump-catalog";
import supplement from "./pump-card-supplement.json";

export type PumpCardRow = { label: string; value: string };
export type PumpCardSection = { title: string; rows: PumpCardRow[] };

export const PUMP_TYPE_LABELS: Record<PumpType, string> = {
  vertical_multistage: "Вертикальный многоступенчатый",
  horizontal_multistage: "Горизонтальный многоступенчатый",
  end_suction: "Консольный", inline: "Инлайн", submersible: "Погружной", unknown: "Не указан",
};

const PROPERTY_LABELS: Record<string, string> = {
  base: "Основание", impeller: "Рабочее колесо", dn: "DN", type: "Тип соединения",
  orientation: "Ориентация", pressure_class: "Класс давления", standard: "Стандарт",
  inlet: "Всасывающий патрубок", outlet: "Напорный патрубок",
  voltage_v: "Напряжение, В", current_a: "Ток, А", poles: "Число полюсов",
  overall_length: "Габаритная длина, мм", overall_width: "Габаритная ширина, мм",
  overall_height: "Габаритная высота, мм", base_length: "Длина основания, мм",
  base_width: "Ширина основания, мм", construction_length: "Монтажная длина, мм",
  flange_face_to_face: "Расстояние между торцами фланцев, мм",
  flange_center_height: "Высота оси фланца, мм", other_connection_height: "Высота дополнительного присоединения, мм",
  h1: "H1, мм", h2: "H2, мм", d1: "D1, мм", d2: "D2, мм",
};
const CONNECTION_LABELS: Record<string, string> = {
  flange: "Фланцевое", flanged: "Фланцевое", threaded: "Резьбовое", thread: "Резьбовое",
  horizontal: "Горизонтальная", vertical: "Вертикальная", inline: "Соосная",
  horizontal_inline: "Горизонтальная, соосная",
};

export function pumpCardValue(value: PumpPropertyValue | undefined): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("ru-RU", { maximumFractionDigits: 6 }) : "—";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "string") return value.trim() || "—";
  if (Array.isArray(value)) return value.map(pumpCardValue).filter(v => v !== "—").join("; ") || "—";
  return Object.entries(value).map(([key, v]) => `${PROPERTY_LABELS[key] ?? key}: ${pumpCardValue(v)}`).join("; ") || "—";
}

function propertyRows(properties?: PumpProperties, prefix = ""): PumpCardRow[] {
  return Object.entries(properties ?? {}).flatMap(([key, value]) => {
    const label = `${prefix}${PROPERTY_LABELS[key] ?? key}`;
    if (value && typeof value === "object" && !Array.isArray(value)) return propertyRows(value, `${label} · `);
    const formatted = pumpCardValue(value);
    if (formatted === "—") return [];
    const translated = ["type", "orientation"].includes(key) ? CONNECTION_LABELS[formatted] ?? formatted : formatted;
    return [{ label, value: translated }];
  });
}

type CardSupplement = {
  weightKg?: number; inletDn?: number; outletDn?: number;
  weightVariants?: Array<{ execution: string; kg: number }>; connectionVariants?: string[];
};

export function pumpCardPhysicalData(pump: Pump) {
  const extra: CardSupplement = (supplement as Record<string, CardSupplement>)[pump.id] ?? {};
  const meaningful = (value: PumpPropertyValue | undefined) => value != null && !["", "—", "-", "не указан", "не указано"].includes(String(value).trim().toLowerCase());
  const first = (...values: Array<PumpPropertyValue | undefined>) => values.find(meaningful);
  const positive = (value: PumpPropertyValue | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
  const diameter = (side: "inlet" | "outlet") => {
    const dn = [pump[side]?.dn, pump[side === "inlet" ? "inletDn" : "outletDn"]].find(positive);
    const raw = first(pump.connectionSourceValue?.[side], pump.mounting?.[side === "inlet" ? "Размер всасывающего патрубка" : "Размер напорного патрубка"], side === "outlet" ? pump.mounting?.["Напорный патрубок"] : undefined);
    // Keep G threads and multi-DN alternatives exactly as supplied, not as millimetres.
    if (raw !== undefined) {
      const text = pumpCardValue(raw);
      return dn && !text.replace(/\s/g, "").toUpperCase().includes(`DN${dn}`) ? `DN ${pumpCardValue(dn)} · ${text}` : text;
    }
    const number = dn ?? extra[side === "inlet" ? "inletDn" : "outletDn"];
    return positive(number) ? `DN ${pumpCardValue(number)}` : "Не указано в базе";
  };
  const weight = first(positive(pump.weightKg) ? pump.weightKg : undefined, pump.dimensions?.["Нетто, кг"], pump.dimensions?.["Масса, кг"], pump.dimensions?.["weight_kg"], extra.weightKg);
  return {
    inlet: diameter("inlet"), outlet: diameter("outlet"),
    weight: weight !== undefined ? pumpCardValue(weight) : extra.weightVariants?.length
      ? extra.weightVariants.map(v => `${v.execution}: ${pumpCardValue(v.kg)} кг`).join("; ") + " (зависит от исполнения)"
      : "Не указано в базе",
    connectionVariants: extra.connectionVariants?.join("; "),
  };
}

export function pumpCardSections(pump: Pump): PumpCardSection[] {
  const physical = pumpCardPhysicalData(pump);
  const row = (label: string, value: PumpPropertyValue | undefined): PumpCardRow => ({ label, value: pumpCardValue(value) });
  const optional = (label: string, value: PumpPropertyValue | undefined): PumpCardRow[] => {
    const result = row(label, value);
    return result.value === "—" ? [] : [result];
  };
  return [
    { title: "Основные сведения", rows: [
      row("Производитель", pump.manufacturer), row("Модель", pump.model),
      row("Серия", pump.series), row("Группа / типоразмер", pump.group),
      row("Тип насоса", PUMP_TYPE_LABELS[pump.type]), row("Рабочая среда", pump.medium === "wastewater" ? "Сточная вода" : "Чистая вода"),
      row("Артикул", pump.article), ...optional("Исполнение", pump.execution), ...optional("Описание", pump.description),
    ] },
    { title: "Гидравлические характеристики", rows: [
      row("Номинальный расход, м³/ч", pump.nominalFlow), row("Номинальный напор, м", pump.ratedHead),
      row("Минимальный расход по кривой, м³/ч", pump.minFlow), row("Максимальный расход по кривой, м³/ч", pump.maxFlow),
      row("Минимальный напор по кривой, м", pump.minHead), row("Максимальный напор по кривой, м", pump.maxHead),
      row("КПД, %", pump.efficiency),
    ] },
    { title: "Двигатель и электрика", rows: [
      row("Мощность двигателя, кВт", pump.power), ...optional("Напряжение", pump.voltage),
      ...optional("Частота, Гц", pump.frequencyHz), ...optional("Частота вращения, об/мин", pump.speedRpm),
      ...propertyRows(pump.electric),
    ] },
    { title: "Подключения и монтаж", rows: [
      row("Диаметр всасывающего патрубка", physical.inlet), row("Диаметр напорного патрубка", physical.outlet),
      ...optional("Варианты присоединения по каталогу", physical.connectionVariants),
      ...propertyRows(pump.inlet, "Всасывающий патрубок · "), ...propertyRows(pump.outlet, "Напорный патрубок · "),
      ...propertyRows(pump.connectionSourceValue), ...propertyRows(pump.mounting),
    ] },
    { title: "Материалы", rows: propertyRows(pump.materials) },
    { title: "Условия эксплуатации", rows: propertyRows(pump.fluid) },
    { title: "Габариты и масса", rows: [row("Масса, кг", physical.weight), ...optional("Примечание к массе и патрубкам", pump.physicalNote), ...propertyRows(pump.dimensions)] },
    { title: "Цена и наличие", rows: [
      row(pump.priceKind === "net" ? "Закупочная цена из каталога" : "Прайсовая цена из каталога", pump.price == null ? null : `${pumpCardValue(pump.price)}${pump.priceCurrency ? ` ${pump.priceCurrency}` : ""}`),
      ...optional("Скидка в источнике, %", pump.discountPercent), ...optional("Наличие по данным источника", pump.availability),
      ...optional("Источник цены", pump.priceSource),
    ] },
    { title: "Источники данных", rows: [
      ...optional("Технические характеристики", pump.source), ...optional("Чертёж", pump.drawingSource),
      ...propertyRows(pump.physicalDataSources),
    ] },
  ].filter(section => section.rows.length > 0);
}

export function pumpCardCurves(pump: Pump) {
  return [
    { title: "Расход — напор (Q–H)", unit: "H, м", points: pump.curve },
    { title: "КПД", unit: "η, %", points: pump.efficiencyCurve },
    { title: "Мощность по кривой", unit: "P, кВт", points: pump.powerCurve },
    { title: "Кавитационный запас (NPSH)", unit: "NPSH, м", points: pump.npshCurve },
  ].filter((curve): curve is { title: string; unit: string; points: Array<[number, number]> } => Boolean(curve.points?.length));
}
