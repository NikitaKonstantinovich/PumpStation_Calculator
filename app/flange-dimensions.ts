import type { BindingCatalog } from "./collector-catalog";

type Item = Pick<BindingCatalog["items"][number], "id" | "catalogId" | "family" | "fields"> & Partial<Pick<BindingCatalog["items"][number], "tableId" | "sourceRow">>;
export type FlangeDimensions = Partial<Record<"thicknessMm" | "boreDiameterMm" | "radialChamferMm" | "pipeOuterDiameterMm" | "outerDiameterMm" | "boltCircleMm" | "boltHoleDiameterMm" | "holes", number>>;
export type FlangeDimensionReference = { sourceSha256: string; rows: Array<{ componentId: string; tableId: string; family: string; name: string; dn: number; pn: number; dimensions: FlangeDimensions; source: string; reason: string }> };
export const FLANGE_FIELDS = {
  thicknessMm: ["CALC_FLANGE_B", "Толщина фланца, мм"],
  boreDiameterMm: ["CALC_FLANGE_BORE", "Посадочный диаметр фланца, мм"],
  radialChamferMm: ["CALC_FLANGE_CHAMFER", "Радиальная фаска фланца, мм"],
  pipeOuterDiameterMm: ["CALC_FLANGE_PIPE_OD", "Диаметр трубы под фланец, мм"],
  outerDiameterMm: ["CALC_FLANGE_OD", "Наружный диаметр фланца, мм"],
  boltCircleMm: ["CALC_FLANGE_PCD", "Диаметр окружности отверстий фланца, мм"],
  boltHoleDiameterMm: ["CALC_FLANGE_HOLE", "Диаметр отверстия фланца, мм"],
  holes: ["CALC_FLANGE_HOLES", "Количество отверстий фланца"],
} as const;
export const FLANGE_SOURCE = "CALC_FLANGE_SOURCE", FLANGE_REVIEW = "CALC_FLANGE_REVIEW";
export const flangeManagedColumns: string[] = [...Object.values(FLANGE_FIELDS).map(([column]) => column), FLANGE_SOURCE, FLANGE_REVIEW];
const value = (item: Item, label: string) => item.fields.find(field => field.headerPath.at(-1) === label)?.value;
const number = (value: unknown) => Number(String(value ?? "").replace(/^(?:DN|PN)\s*/i, "").replace(",", "."));
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

export function catalogPressures(items: Item[]) {
  const result = new Map<string, number>(), tables = new Map<string, number>();
  for (const item of [...items].sort((a, b) => (a.tableId ?? a.id).localeCompare(b.tableId ?? b.id) || (a.sourceRow ?? 0) - (b.sourceRow ?? 0))) {
    const pn = number(value(item, "PN") ?? value(item, "Давление"));
    if (positive(pn)) tables.set(item.tableId ?? item.id, pn);
    const inherited = tables.get(item.tableId ?? item.id);
    if (inherited) result.set(item.id, inherited);
  }
  return result;
}

export function flangeReferenceFor(item: Item, pn: number | null, reference: FlangeDimensionReference, sourceSha256?: string) {
  if (item.catalogId !== "фланцы" || (sourceSha256 !== undefined && sourceSha256 !== reference.sourceSha256)) return null;
  return reference.rows.find(row => row.componentId === item.id && row.tableId === item.tableId && row.family === item.family && row.name === value(item, "Наименование") && row.dn === number(value(item, "DN")) && row.pn === pn) ?? null;
}

/** A managed dimension is usable only while its original execution and value still match. */
export function readFlangeDimensions(item: Item, pn: number | null, reference: FlangeDimensionReference, sourceSha256?: string) {
  const row = flangeReferenceFor(item, pn, reference, sourceSha256);
  const dimensions: FlangeDimensions = {};
  const warnings: string[] = [];
  const review = String(value(item, "Проверка размеров фланца") ?? "");
  if (review.startsWith("Конфликт")) warnings.push(review);
  const source = String(value(item, "Источник размеров фланца") ?? "");
  for (const [key, [column, label]] of Object.entries(FLANGE_FIELDS) as Array<[keyof FlangeDimensions, readonly [string, string]]>) {
    const field = item.fields.find(field => field.headerPath.at(-1) === label);
    if (!field) continue;
    const numeric = number(field.value);
    if (!positive(numeric) || !source || (field.column === column && (!row || row.dimensions[key] !== numeric))) {
      warnings.push(`Размер фланца «${label}» не подтверждён для текущего DN/PN/исполнения: ${item.id}`); continue;
    }
    dimensions[key] = numeric;
  }
  if (!dimensions.thicknessMm) warnings.push(row?.reason ?? `Нет проверенной толщины фланца ${item.id}`);
  return { dimensions, source: row && item.fields.some(field => field.column === FLANGE_SOURCE) ? row.source : source, warnings };
}

export function mergeFlangeDimensions(input: BindingCatalog, reference: FlangeDimensionReference): BindingCatalog {
  const ids = new Set<string>();
  for (const row of reference.rows) {
    if (!row.componentId || ids.has(row.componentId) || !row.name || !row.family || !row.source || !row.reason || !positive(row.dn) || !positive(row.pn)
      || Object.values(row.dimensions).some(value => !positive(value)) || Object.keys(row.dimensions).some(key => !(key in FLANGE_FIELDS))) throw new Error(`Invalid flange reference: ${row.componentId}`);
    ids.add(row.componentId);
  }
  const data = structuredClone(input), pressures = catalogPressures(data.items);
  if (data.source.sha256 !== reference.sourceSha256) return data;
  for (const item of data.items) {
    const row = flangeReferenceFor(item, pressures.get(item.id) ?? null, reference, data.source.sha256);
    if (!row) continue;
    const native = item.fields.filter(field => !flangeManagedColumns.includes(field.column));
    const conflict = Object.entries(row.dimensions).some(([key, expected]) => native.some(field => field.headerPath.at(-1) === FLANGE_FIELDS[key as keyof FlangeDimensions][1] && number(field.value) !== expected));
    item.fields = native;
    const add = (column: string, label: string, value: string | number) => item.fields.push({ column, headerPath: [label], value });
    if (!conflict) {
      for (const [key, value] of Object.entries(row.dimensions)) {
        const [column, label] = FLANGE_FIELDS[key as keyof FlangeDimensions];
        // Preserve an explicit user dimension and its source without duplicating it.
        if (!native.some(field => field.headerPath.at(-1) === label)) add(column, label, value!);
      }
      if (Object.keys(row.dimensions).length && !native.some(field => field.headerPath.at(-1) === "Источник размеров фланца")) add(FLANGE_SOURCE, "Источник размеров фланца", row.source);
    }
    add(FLANGE_REVIEW, "Проверка размеров фланца", conflict ? `Конфликт с размером другого источника; исходные значения сохранены. ${row.reason}` : row.reason);
  }
  return data;
}
