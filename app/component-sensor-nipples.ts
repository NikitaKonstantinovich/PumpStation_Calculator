import type { BindingCatalog } from "./collector-catalog";

type Item = BindingCatalog["items"][number];
export type SensorPressureAcceptance = { pressureBar: number; maxTemperatureC: number; source: string };
export type SensorNippleReference = {
  sourceSha256: string;
  verifiedAt?: string;
  rows: Array<{ componentId: string; tableId: string; family: string; dn: number; thread: string; originalLink: string; outerDiameterMm: number; wallThicknessMm: number | null; standard: string; standardPressureBar: number; source: string; pressureReview: string;
    reviewedProductLink?: string; supplierArticle?: string; standardPressureTemperature?: string; pressureConditions?: string; pressureStatus?: string;
    adoptedPressure?: SensorPressureAcceptance;
  }>;
};
export const SENSOR_FIELDS = {
  diameter: ["CALC_SENSOR_OD", "Диаметр, мм"], wall: ["CALC_SENSOR_WALL", "Толщина, мм"],
  gender: ["CALC_SENSOR_THREAD", "Исполнение резьбы"], standard: ["CALC_SENSOR_STANDARD", "Стандарт сгона"],
  pressure: ["CALC_SENSOR_STANDARD_PRESSURE", "Предельное давление по стандарту, бар"],
  source: ["CALC_SENSOR_SOURCE", "Источник проверки сгона"], review: ["CALC_SENSOR_REVIEW", "Проверка давления сгона"],
  productLink: ["CALC_SENSOR_PRODUCT_LINK", "Проверенная карточка DN15"], article: ["CALC_SENSOR_ARTICLE", "Артикул проверенной карточки"],
  temperature: ["CALC_SENSOR_PRESSURE_TEMPERATURE", "Нормативное давление при температуре среды"],
  conditions: ["CALC_SENSOR_PRESSURE_CONDITIONS", "Условия нормативного давления"], status: ["CALC_SENSOR_PRESSURE_STATUS", "Статус подтверждения PN изделия"],
  checkedAt: ["CALC_SENSOR_VERIFIED_AT", "Дата проверки сгона"],
  adoptedPressure: ["CALC_SENSOR_ADOPTED_PRESSURE", "Принятое давление сгона, бар"],
  maxTemperature: ["CALC_SENSOR_MAX_TEMPERATURE", "Максимальная температура принятого давления, °C"],
  acceptance: ["CALC_SENSOR_PRESSURE_ACCEPTANCE", "Основание принятого давления сгона"],
} as const;
export const sensorManagedColumns: string[] = Object.values(SENSOR_FIELDS).map(([column]) => column);
const value = (item: Item, label: string) => item.fields.find(field => field.headerPath.at(-1) === label)?.value;
export function sensorNippleReferenceFor(item: Item, sha: string, reference: SensorNippleReference) {
  if (sha !== reference.sourceSha256 || item.catalogId !== "сгоны-резьба") return null;
  return reference.rows.find(row => row.componentId === item.id && row.tableId === item.tableId && row.family === item.family
    && Number(String(value(item, "DN")).replace(/^DN/i, "")) === row.dn && value(item, "Резьба, дюйм") === row.thread && value(item, "Ссылка") === row.originalLink) ?? null;
}
/** Project adoption is separate from the normative limit and requires intact persisted inputs. */
export function adoptedSensorPressure(item: Item, sha: string, reference: SensorNippleReference): SensorPressureAcceptance | null {
  const row = sensorNippleReferenceFor(item, sha, reference), adopted = row?.adoptedPressure;
  if (!row || !adopted || !Number.isFinite(adopted.pressureBar) || adopted.pressureBar <= 0 || adopted.pressureBar > row.standardPressureBar
    || !Number.isFinite(adopted.maxTemperatureC) || !adopted.source.trim()) return null;
  const expected = { adoptedPressure: adopted.pressureBar, maxTemperature: adopted.maxTemperatureC, acceptance: adopted.source,
    diameter: row.outerDiameterMm, wall: row.wallThicknessMm, gender: "НР", standard: row.standard, pressure: row.standardPressureBar };
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    const [column, label] = SENSOR_FIELDS[key], fields = item.fields.filter(field => field.column === column || field.headerPath.at(-1) === label);
    if (expected[key] === null ? fields.length > 0 : fields.length !== 1 || fields[0].column !== column || fields[0].value !== expected[key]) return null;
  }
  // A conflicting manual PN must never turn the accepted 16/20 bar into PN25.
  if (item.fields.some(field => field.headerPath.at(-1) === "PN" && Number(field.value) !== adopted.pressureBar)) return null;
  return { ...adopted };
}
export function mergeSensorNipples(input: BindingCatalog, reference: SensorNippleReference): BindingCatalog {
  const data = structuredClone(input);
  for (const item of data.items) {
    const row = sensorNippleReferenceFor(item, data.source.sha256, reference);
    if (!row) continue;
    const native = item.fields.filter(field => !sensorManagedColumns.includes(field.column));
    item.fields = native;
    const values = { diameter: row.outerDiameterMm, wall: row.wallThicknessMm, gender: "НР", standard: row.standard, pressure: row.standardPressureBar, source: row.source, review: row.pressureReview,
      productLink: row.reviewedProductLink ?? null, article: row.supplierArticle ?? null, temperature: row.standardPressureTemperature ?? null,
      conditions: row.pressureConditions ?? null, status: row.pressureStatus ?? null, checkedAt: reference.verifiedAt ?? null,
      adoptedPressure: row.adoptedPressure?.pressureBar ?? null, maxTemperature: row.adoptedPressure?.maxTemperatureC ?? null, acceptance: row.adoptedPressure?.source ?? null };
    for (const key of Object.keys(values) as Array<keyof typeof values>) {
      const [column, label] = SENSOR_FIELDS[key], numericOrText = values[key];
      if (numericOrText !== null && !native.some(field => field.headerPath.at(-1) === label)) item.fields.push({ column, headerPath: [label], value: numericOrText });
    }
  }
  return data;
}
