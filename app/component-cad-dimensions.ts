import type { BindingCatalog } from "./collector-catalog";

type Item = BindingCatalog["items"][number];
export const CAD_COLUMNS = {
  lengthMm: "CALC_CAD_REDUCER_LENGTH", cylindricalLengthLargeMm: "CALC_CAD_CYLINDER_LARGE",
  cylindricalLengthSmallMm: "CALC_CAD_CYLINDER_SMALL", source: "CALC_CAD_SOURCE", review: "CALC_CAD_REVIEW",
} as const;
const labels = {
  lengthMm: "Полная осевая длина перехода по CAD, мм",
  cylindricalLengthLargeMm: "Длина цилиндрического участка большого конца, мм",
  cylindricalLengthSmallMm: "Длина цилиндрического участка малого конца, мм",
  source: "Источник размеров CAD", review: "Проверка размеров CAD",
} as const;
type Dimensions = { lengthMm: number; cylindricalLengthLargeMm: number; cylindricalLengthSmallMm: number };
export type CadReducerReference = {
  sourceSha256: string; version: number;
  rows: Array<{
    componentId: string; family: string; tableId: string;
    matchFields: Array<{ column: string; label: string; value: string | number }>;
    modelPath: string; modelSha256: string; units: string; method: string;
    geometry: string; outerDiameter: number; outerDiameterSmall: number;
    wallThickness: number; wallThicknessSmall: number;
    dimensions: Dimensions;
  }>;
};
const keys = ["lengthMm", "cylindricalLengthLargeMm", "cylindricalLengthSmallMm"] as const;
const managedColumns: string[] = Object.values(CAD_COLUMNS);
const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
export function validateCadReference(reference: CadReducerReference) {
  if (reference.version !== 1 || !/^[a-f0-9]{64}$/.test(reference.sourceSha256)) throw new Error("Invalid CAD reference version/source");
  const ids = new Set<string>();
  for (const row of reference.rows) {
    if (ids.has(row.componentId) || !row.componentId || row.geometry !== "concentric" || row.units !== "mm"
      || !row.modelPath.startsWith("Equipment/") || /(?:^|\/)\.\.(?:\/|$)|\\/.test(row.modelPath)
      || !/\.(?:step|stp)$/i.test(row.modelPath) || !/^[a-f0-9]{64}$/.test(row.modelSha256) || !row.method.trim()
      || !keys.every(key => positive(row.dimensions[key]))
      || row.dimensions.cylindricalLengthLargeMm + row.dimensions.cylindricalLengthSmallMm >= row.dimensions.lengthMm
      || ![row.outerDiameter, row.outerDiameterSmall, row.wallThickness, row.wallThicknessSmall].every(positive)
      || row.outerDiameter <= row.outerDiameterSmall || 2 * row.wallThickness >= row.outerDiameter || 2 * row.wallThicknessSmall >= row.outerDiameterSmall
      || !["DN", "PN", "Диаметр, мм", "Диаметр меньший, мм", "Толщина 1, мм", "Толщина 2, мм", "Наименование"].every(label => row.matchFields.some(field => field.label === label))) {
      throw new Error(`Invalid CAD reducer: ${row.componentId}`);
    }
    ids.add(row.componentId);
  }
}

function review(item: Item, sourceSha256: string, reference: CadReducerReference) {
  const row = reference.rows.find(row => row.componentId === item.id);
  if (!row) return null;
  const matches = sourceSha256 === reference.sourceSha256 && item.catalogId === "переходы" && item.family === row.family && item.tableId === row.tableId
    && row.matchFields.every(expected => {
      const fields = item.fields.filter(field => field.column === expected.column || field.headerPath.at(-1) === expected.label);
      return fields.length === 1 && fields[0].column === expected.column && fields[0].headerPath.at(-1) === expected.label && fields[0].value === expected.value;
    });
  const otherLengths = item.fields.filter(field => !managedColumns.includes(field.column) && /^(?:(?:Строительная |Полная осевая )?Длина(?: перехода| детали)?), мм$/i.test(field.headerPath.at(-1) ?? ""));
  const conflict = otherLengths.some(field => Number(field.value) !== row.dimensions.lengthMm)
    || keys.slice(1).some(key => item.fields.some(field => !managedColumns.includes(field.column) && field.headerPath.at(-1) === labels[key] && field.value !== row.dimensions[key]));
  const source = `3D-модель ${row.modelPath}; SHA-256 ${row.modelSha256}; ${row.method}; единицы мм. Привязка по DN, геометрии, обоим диаметрам и стенкам; материал и PN сохранены из каталога, модель не является сертификатом давления.`;
  return { row, source, valid: matches && !conflict, reason: !matches ? "Привязка CAD устарела: изменены исходная книга, исполнение, DN, PN, диаметры или стенки перехода; требуется повторное сопоставление модели" : conflict ? "Размер перехода из каталога противоречит 3D-модели; исходные размеры сохранены, требуется уточнение" : "Проверено совпадение исполнения; длина и цилиндрические участки измерены по аналитическим поверхностям STEP" };
}

/** Only reviewed geometric attributes are managed; prices, PN and native dimensions are preserved. */
export function mergeCadDimensions(input: BindingCatalog, reference: CadReducerReference): BindingCatalog {
  validateCadReference(reference);
  const data = structuredClone(input);
  for (const item of data.items) {
    const result = review(item, data.source.sha256, reference);
    if (!result && !item.fields.some(field => managedColumns.includes(field.column))) continue;
    item.fields = item.fields.filter(field => !managedColumns.includes(field.column));
    const add = (key: keyof typeof CAD_COLUMNS, value: number | string) => item.fields.push({ column: CAD_COLUMNS[key], headerPath: [labels[key]], value });
    if (result?.valid) {
      for (const key of keys) add(key, result.row.dimensions[key]);
      add("source", result.source);
    }
    add("review", result?.reason ?? "Нет подтверждённой привязки 3D-модели к этой позиции");
  }
  return data;
}

/** Runtime rechecks the source tuple and each saved dimension before calculation. */
export function readCadDimensions(item: Item, sourceSha256: string, reference: CadReducerReference) {
  const dimensions: Partial<Dimensions> = {}, warnings: string[] = [];
  if (!item.fields.some(field => managedColumns.includes(field.column))) return { dimensions, warnings, source: "" };
  const result = review(item, sourceSha256, reference);
  if (!result?.valid) return { dimensions, warnings: [result?.reason ?? "Нет подтверждённой привязки 3D-модели"], source: "" };
  for (const key of keys) {
    const fields = item.fields.filter(field => field.column === CAD_COLUMNS[key]);
    if (fields.length === 1 && fields[0].value === result.row.dimensions[key]) dimensions[key] = result.row.dimensions[key];
    else warnings.push(`Размер CAD «${labels[key]}» отсутствует или изменён; повторите импорт проверенной модели`);
  }
  return { dimensions, warnings, source: result.source };
}
