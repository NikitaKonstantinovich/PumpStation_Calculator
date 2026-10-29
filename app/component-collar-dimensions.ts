import type { BindingCatalog } from "./collector-catalog";
import type { InsertCollarSelection, InsertCollarAssembly } from "./component-insert-calculations";

type CollarExecutionDimensions = {
  componentId: string; tableId: string; family: string; name: string; pn: number;
  dn: number; a: number; b: number; c: number; d: number; e: number; source: string; innerDiameterMm?: number;
};
export type CollarDimensionReference = {
  sourceSha256: string; basis: string; product: string; source: string;
  lipThicknessPolicy?: { valueMm: number; source: string };
  insertSelections?: Array<Omit<InsertCollarSelection, "material"> & { material: string }>;
  assembly?: InsertCollarAssembly;
  rows: Array<{ dn: number; a: number | null; b: number | null; c: number; d: number | null; e: number; innerDiameterMm?: number; source: string }>;
  userRows?: CollarExecutionDimensions[];
  cadRows?: Array<CollarExecutionDimensions & {
    modelPath: string; modelSha256: string; nativePath: string; nativeSha256: string;
  }>;
};
type Item = BindingCatalog["items"][number];
export const COLLAR_COLUMNS = {
  length: "CALC_COLLAR_C", thickness: "CALC_COLLAR_A", diameter: "CALC_COLLAR_E",
  source: "CALC_COLLAR_SOURCE", review: "CALC_COLLAR_REVIEW",
  cadThickness: "CALC_COLLAR_CAD_A",
  insertSelection: "CALC_COLLAR_INSERT_SELECTION",
  assembly: "CALC_COLLAR_INSERT_ASSEMBLY",
} as const;
export const COLLAR_LABELS = {
  length: "Полная осевая длина воротника, мм", thickness: "Толщина борта, мм",
  diameter: "Наружный диаметр борта, мм", source: "Источник размеров воротника", review: "Проверка размеров воротника",
  cadThickness: "Толщина борта по CAD, мм",
  insertSelection: "Выбор воротника для расчёта вставок",
  assembly: "Схема соединения воротника во вставке",
} as const;
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const number = (value: unknown) => Number(String(value ?? "").replace(/^(?:DN|Ду)\s*/i, "").replace(",", "."));
const value = (item: Pick<Item, "fields">, pattern: RegExp) => item.fields.find(field => pattern.test(field.headerPath.at(-1) ?? ""))?.value;
export function validateCollarReference(reference: CollarDimensionReference) {
  if (!reference.sourceSha256 || !reference.source?.trim() || !reference.product?.trim() || reference.basis !== "user-supplied-product-geometry" || !Array.isArray(reference.rows)) throw new Error("Invalid collar reference source");
  const seen = new Set<number>();
  if (reference.assembly && (reference.assembly.insertionDepthMm !== 0 || reference.assembly.weldGapMm !== 0
    || !reference.assembly.source.trim() || !positive(reference.assembly.weldFactor) || !reference.assembly.weldSource.trim())) throw new Error("Invalid collar butt assembly");
  const selections = new Set<string>();
  for (const selection of reference.insertSelections ?? []) {
    const key = `${selection.dn}:${selection.material}`;
    if (selections.has(key) || !positive(selection.dn) || !Number.isInteger(selection.dn) || !["aisi304", "st20"].includes(selection.material)
      || !selection.componentId || !positive(selection.wallThicknessMm) || !positive(selection.partPn) || !selection.source?.trim()
      || !Array.isArray(selection.insertPns) || !selection.insertPns.length || new Set(selection.insertPns).size !== selection.insertPns.length
      || selection.insertPns.some(pn => !positive(pn) || pn > selection.partPn)) throw new Error("Invalid collar selection policy");
    selections.add(key);
  }
  if (reference.lipThicknessPolicy && (!positive(reference.lipThicknessPolicy.valueMm) || !reference.lipThicknessPolicy.source.trim())) throw new Error("Invalid collar lip thickness policy");
  for (const row of reference.rows) {
    if (![row.dn, row.c, row.e].every(positive) || !Number.isInteger(row.dn) || seen.has(row.dn)
      || [row.a, row.b, row.d].some(value => value !== null && !positive(value))
      || (row.innerDiameterMm !== undefined && !positive(row.innerDiameterMm))
      || !row.source || (row.d !== null && row.e <= row.d) || (row.a !== null && row.a >= row.c)
      || (row.b !== null && row.d !== null && 2 * row.b >= row.d)) throw new Error(`Invalid or duplicate collar dimensions: DN${row.dn}`);
    seen.add(row.dn);
  }
  const ids = new Set<string>();
  for (const row of reference.cadRows ?? []) {
    if (!row.componentId || ids.has(row.componentId) || !row.tableId || !row.family || !row.name || !row.source
      || ![row.dn, row.pn, row.a, row.b, row.c, row.d, row.e].every(positive) || row.a >= row.c || 2 * row.b >= row.d || row.e <= row.d
      || ![row.modelSha256, row.nativeSha256].every(hash => /^[a-f0-9]{64}$/.test(hash))
      || ![row.modelPath, row.nativePath].every(path => path.startsWith("Equipment/") && !/(?:^|\/)\.\.(?:\/|$)|\\/.test(path))
      || !/\.step$/i.test(row.modelPath) || !/\.sldprt$/i.test(row.nativePath)) throw new Error(`Invalid CAD collar reference: ${row.componentId}`);
    ids.add(row.componentId);
  }
  for (const row of reference.userRows ?? []) {
    if (!row.componentId || ids.has(row.componentId) || !row.tableId || !row.family || !row.name || !row.source.trim()
      || ![row.dn, row.pn, row.a, row.b, row.c, row.d, row.e].every(positive) || row.a >= row.c || 2 * row.b >= row.d || row.e <= row.d)
      throw new Error(`Invalid user collar reference: ${row.componentId}`);
    ids.add(row.componentId);
  }
}

/** Product dimensions only: neither the drawing nor matching a tube certifies PN. */
export function reviewCollarDimensions(item: Item, sourceSha256: string, reference: CollarDimensionReference, effectivePn?: number | null) {
  if (sourceSha256 !== reference.sourceSha256 || item.catalogId !== "воротники" || !/AISI\s*304/i.test(item.family)) return null;
  const dn = number(value(item, /^DN$/i)), cad = reference.cadRows?.find(row => row.componentId === item.id);
  const adopted = reference.userRows?.find(row => row.componentId === item.id), exact = adopted ?? cad;
  const row = exact ?? reference.rows.find(row => row.dn === dn);
  if (!row) return null;
  const source = adopted ? adopted.source : cad ? `${cad.source}; SLDPRT ${cad.nativePath}; SHA-256 ${cad.nativeSha256}; STEP ${cad.modelPath}; SHA-256 ${cad.modelSha256}; PN и материал сохранены из каталога, геометрия не подтверждает давление` : `${reference.source}; ${reference.product}, DN${dn}; геометрия принята по данным пользователя, PN сохранён из каталога`;
  const explicitPn = value(item, /^(?:PN|Давление)$/i);
  if (exact && (item.tableId !== exact.tableId || item.family !== exact.family || dn !== exact.dn || value(item, /^Наименование$/i) !== exact.name
    || (effectivePn !== undefined && effectivePn !== exact.pn)
    || (explicitPn !== undefined && Number(String(explicitPn).replace(/^PN\s*/i, "")) !== exact.pn))) {
    return { approved: false, row, source, reason: `Привязка ${adopted ? "проектных размеров" : "CAD"} воротника устарела: изменены DN, PN, семейство или исполнение; требуется повторное сопоставление` };
  }
  if (row.a === null || row.b === null || row.d === null) return { approved: false, row, source, reason: `DN${dn}: получены c=${row.c} мм, наружный диаметр борта ${row.e} мм${row.innerDiameterMm ? `, внутренний диаметр ${row.innerDiameterMm} мм` : ""}; не подтверждены стенка b и соответствие конкретному исполнению. Внутренний диаметр не подставляется вместо наружного диаметра трубы.` };
  const name = String(value(item, /^Наименование$/i) ?? "");
  const parsed = name.match(/\(\s*(\d+(?:[.,]\d+)?)\s*[xх×]\s*(\d+(?:[.,]\d+)?)\s*(?:мм)?\s*\)/i);
  const nameDn = name.match(/DN\s*(\d+)/i);
  const explicitD = value(item, /^(?:Наружный )?Диаметр, мм$/i), explicitB = value(item, /^Толщина(?: 1)?, мм$/i);
  const ds = [explicitD, parsed?.[1]].filter(value => value !== undefined).map(number);
  const bs = [explicitB, parsed?.[2]].filter(value => value !== undefined).map(number);
  if (!ds.length || !bs.length || ds.some(d => Math.abs(d - row.d!) > 0.001 || !positive(d)) || bs.some(b => Math.abs(b - row.b!) > 0.001 || !positive(b)) || (nameDn && Number(nameDn[1]) !== dn)) {
    return { approved: false, row, source, reason: `Размеры ${adopted ? "по решению пользователя" : reference.product} DN${dn} относятся к трубе ${row.d}×${row.b} мм; наружный диаметр или стенка текущего исполнения не совпадают либо не подтверждены. Размеры a/c/e не перенесены.` };
  }
  const native = item.fields.filter(field => !Object.values(COLLAR_COLUMNS).includes(field.column as typeof COLLAR_COLUMNS[keyof typeof COLLAR_COLUMNS]));
  const conflicts = native.some(field => {
    const label = field.headerPath.at(-1) ?? "";
    const expected = /^(?:(?:Строительная |Полная осевая )?Длина(?: детали| воротника)?), мм$/i.test(label) ? row.c : /^Толщина борта, мм$/i.test(label) ? reference.lipThicknessPolicy?.valueMm ?? row.a : /^Наружный диаметр борта, мм$/i.test(label) ? row.e : undefined;
    return expected !== undefined && number(field.value) !== expected;
  });
  if (conflicts) return { approved: false, row, source, reason: "Размеры из другого источника сохранены; они противоречат предоставленному чертежу воротника. Требуется уточнение." };
  return { approved: true, row, source, cad: !!cad, reason: `Сопоставлены DN, наружный диаметр трубы ${row.d} мм и стенка ${row.b} мм; a=${row.a}, c=${row.c}, e=${row.e} мм. ${source}` };
}

/** Repeatable enrichment, confined to the reviewed workbook and collar variants. */
export function mergeCollarDimensions(input: BindingCatalog, reference: CollarDimensionReference): BindingCatalog {
  validateCollarReference(reference);
  const data = structuredClone(input);
  const tablePressures = new Map<string, Set<number>>();
  for (const item of data.items.filter(item => item.catalogId === "воротники")) {
    const pressure = value(item, /^(?:PN|Давление)$/i);
    if (pressure === undefined) continue;
    const values = tablePressures.get(item.tableId) ?? new Set<number>();
    values.add(Number(String(pressure).replace(/^PN\s*/i, ""))); tablePressures.set(item.tableId, values);
  }
  for (const item of data.items) {
    const pressures = [...(tablePressures.get(item.tableId) ?? [])];
    const review = reviewCollarDimensions(item, data.source.sha256, reference, pressures.length === 1 ? pressures[0] : null);
    const policy = collarLipThickness(item, data.source.sha256, reference);
    if (!review && !policy) continue;
    item.fields = item.fields.filter(field => !Object.values(COLLAR_COLUMNS).includes(field.column as typeof COLLAR_COLUMNS[keyof typeof COLLAR_COLUMNS]));
    const add = (key: keyof typeof COLLAR_COLUMNS, value: string | number) => item.fields.push({ column: COLLAR_COLUMNS[key], headerPath: [COLLAR_LABELS[key]], value });
    if (review?.approved) {
      add("length", review.row.c); add("diameter", review.row.e); add("source", review.source);
      if ("cad" in review && review.cad) add("cadThickness", review.row.a!);
    }
    if (policy) add("thickness", policy.valueMm);
    else if (review?.approved) add("thickness", review.row.a!);
    item.fields = item.fields.filter(field => field.column !== "CALC_COLLAR_A_SOURCE");
    if (policy) item.fields.push({ column: "CALC_COLLAR_A_SOURCE", headerPath: ["Источник толщины борта"], value: policy.source });
    add("review", [review?.reason, policy?.source].filter(Boolean).join(" "));
    const selection = data.source.sha256 === reference.sourceSha256 && /AISI\s*304/i.test(item.family)
      ? reference.insertSelections?.find(row => row.dn === number(value(item, /^DN$/i)) && row.material === "aisi304") : undefined;
    if (selection) add("insertSelection", JSON.stringify(selection));
    if (policy && reference.assembly) add("assembly", JSON.stringify(reference.assembly));
  }
  return data;
}

/** The user-approved lip thickness is independent of tube wall and unknown collar height. */
export function collarLipThickness(item: Pick<Item, "catalogId" | "family" | "fields">, sourceSha256: string, reference: CollarDimensionReference) {
  if (sourceSha256 !== reference.sourceSha256 || item.catalogId !== "воротники" || !/AISI\s*304/i.test(item.family) || !positive(number(value(item, /^DN$/i)))) return null;
  return reference.lipThicknessPolicy ?? null;
}
