import type { BindingCatalog } from "./collector-catalog";

type Item = BindingCatalog["items"][number];
export type SensorNippleReference = {
  sourceSha256: string;
  rows: Array<{ componentId: string; tableId: string; family: string; dn: number; thread: string; originalLink: string; outerDiameterMm: number; wallThicknessMm: number | null; standard: string; standardPressureBar: number; source: string; pressureReview: string }>;
};
export const SENSOR_FIELDS = {
  diameter: ["CALC_SENSOR_OD", "Диаметр, мм"], wall: ["CALC_SENSOR_WALL", "Толщина, мм"],
  gender: ["CALC_SENSOR_THREAD", "Исполнение резьбы"], standard: ["CALC_SENSOR_STANDARD", "Стандарт сгона"],
  pressure: ["CALC_SENSOR_STANDARD_PRESSURE", "Предельное давление по стандарту, бар"],
  source: ["CALC_SENSOR_SOURCE", "Источник проверки сгона"], review: ["CALC_SENSOR_REVIEW", "Проверка давления сгона"],
} as const;
export const sensorManagedColumns: string[] = Object.values(SENSOR_FIELDS).map(([column]) => column);
const value = (item: Item, label: string) => item.fields.find(field => field.headerPath.at(-1) === label)?.value;
export function sensorNippleReferenceFor(item: Item, sha: string, reference: SensorNippleReference) {
  if (sha !== reference.sourceSha256 || item.catalogId !== "сгоны-резьба") return null;
  return reference.rows.find(row => row.componentId === item.id && row.tableId === item.tableId && row.family === item.family
    && Number(String(value(item, "DN")).replace(/^DN/i, "")) === row.dn && value(item, "Резьба, дюйм") === row.thread && value(item, "Ссылка") === row.originalLink) ?? null;
}
export function mergeSensorNipples(input: BindingCatalog, reference: SensorNippleReference): BindingCatalog {
  const data = structuredClone(input);
  for (const item of data.items) {
    const row = sensorNippleReferenceFor(item, data.source.sha256, reference);
    if (!row) continue;
    const native = item.fields.filter(field => !sensorManagedColumns.includes(field.column));
    item.fields = native;
    const values = { diameter: row.outerDiameterMm, wall: row.wallThicknessMm, gender: "НР", standard: row.standard, pressure: row.standardPressureBar, source: row.source, review: row.pressureReview };
    for (const key of Object.keys(values) as Array<keyof typeof values>) {
      const [column, label] = SENSOR_FIELDS[key], numericOrText = values[key];
      if (numericOrText !== null && !native.some(field => field.headerPath.at(-1) === label)) item.fields.push({ column, headerPath: [label], value: numericOrText });
    }
  }
  return data;
}
