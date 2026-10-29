import type { BindingCatalog } from "./collector-catalog";
type Item = BindingCatalog["items"][number];
export type InsertAnalogReference = { sourceSha256: string; source: string; rows: Array<{
  componentId: string; targetNative: string; targetIdentity: string; donorId: string; donorNative: string; donorIdentity: string;
  lengthMm: number; source: string;
}> };
export const ANALOG_FIELDS = {
  length: ["CALC_ANALOG_LENGTH_MM", "Длина по аналогу, мм"],
  donor: ["CALC_ANALOG_DONOR", "ID аналога для длины"],
  source: ["CALC_ANALOG_SOURCE", "Основание длины по аналогу"],
  review: ["CALC_ANALOG_REVIEW", "Проверка переноса из аналога"],
} as const;
export const analogColumns: string[] = Object.values(ANALOG_FIELDS).map(([column]) => column);
export function analogNativeIdentity(item: Item): string {
  return JSON.stringify([item.tableId, item.family, item.sourceRow,
    item.fields.filter(field => !field.column.startsWith("CALC_")).map(field => [field.column, field.headerPath, field.value]).sort((a,b) => String(a[0]).localeCompare(String(b[0])))]);
}
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

/** Only empty lengths are supplemented; native values, pressure, walls and prices are untouched. */
export function mergeInsertAnalogs(input: BindingCatalog, reference: InsertAnalogReference): BindingCatalog {
  const data = structuredClone(input);
  if (data.source.sha256 !== reference.sourceSha256) return data;
  const items = new Map(data.items.map(item => [item.id, item]));
  const seen = new Set<string>();
  for (const rule of reference.rows) {
    if (seen.has(rule.componentId) || !positive(rule.lengthMm) || !rule.source.trim() || rule.componentId === rule.donorId) throw new Error(`Invalid analog rule: ${rule.componentId}`);
    seen.add(rule.componentId);
    const target = items.get(rule.componentId), donor = items.get(rule.donorId);
    if (!target) continue;
    const nativeLength = target.fields.some(field => !field.column.startsWith("CALC_") && /^(?:Строительная )?Длина(?: перехода| детали)?, мм$/i.test(field.headerPath.at(-1) ?? ""));
    const match = donor && analogNativeIdentity(target) === rule.targetNative && analogNativeIdentity(donor) === rule.donorNative && !nativeLength;
    target.fields = target.fields.filter(field => !analogColumns.includes(field.column));
    const add = (key: keyof typeof ANALOG_FIELDS, value: string | number) => target.fields.push({ column: ANALOG_FIELDS[key][0], headerPath: [ANALOG_FIELDS[key][1]], value });
    if (match) { add("length", rule.lengthMm); add("donor", rule.donorId); add("source", rule.source); }
    add("review", match ? "Принята только длина из аналога; PN, стенки и цена исходной позиции сохранены." : "Перенос длины не применён: исходная позиция или аналог изменены либо появилась собственная длина.");
  }
  return data;
}
