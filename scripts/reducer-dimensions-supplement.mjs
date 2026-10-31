export const INSERT_LENGTH_COLUMN = "CALC_INSERT_LENGTH_MM";
export const INSERT_LENGTH_SOURCE_COLUMN = "CALC_INSERT_LENGTH_SOURCE";
export const INSERT_LENGTH_REVIEW_COLUMNS = {
  status: "CALC_INSERT_LENGTH_STATUS", reason: "CALC_INSERT_LENGTH_REVIEW", options: "CALC_INSERT_LENGTH_OPTIONS",
  source: "CALC_INSERT_LENGTH_REVIEW_SOURCE", checkedAt: "CALC_INSERT_LENGTH_CHECKED_AT",
};
const numericColumns = new Set([INSERT_LENGTH_COLUMN, INSERT_LENGTH_SOURCE_COLUMN]);
const statuses = new Set(["confirmed", "ambiguous", "unconfirmed", "invalid"]);
const number = value => typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.replace(",", ".")) : NaN;
const field = (item, label) => item.fields.find(field => field.headerPath.at(-1) === label)?.value;
const lengthField = field => /^(?:Строительная )?Длина(?: перехода| детали)?, мм$/i.test(field.headerPath.at(-1) ?? "");
const positive = value => typeof value === "number" && Number.isFinite(value) && value > 0;
const material = item => /AISI\s*304/i.test(item.family) ? "aisi304" : /(?:сталь|ст[.\s]*)\s*20/i.test(item.family) ? "st20" : null;
const geometry = item => /эксцентр/i.test(item.family) ? "eccentric" : /концентр/i.test(item.family) ? "concentric" : null;
const normalizeStandard = value => value.toUpperCase().replace(/\s+/g, "");

export function reducerPhysicalMatch(item, reference) {
  if (item.catalogId !== "переходы" || material(item) !== reference.material || (reference.geometry && geometry(item) !== reference.geometry)) return false;
  return [["Диаметр, мм", reference.outerDiameter], ["Диаметр меньший, мм", reference.outerDiameterSmall], ["Толщина 1, мм", reference.wallThickness], ["Толщина 2, мм", reference.wallThicknessSmall]]
    .every(([label, expected]) => positive(expected) && Math.abs(number(field(item, label)) - expected) < 0.001);
}

export function reducerDimensionsMatch(item, reference) {
  if (!reducerPhysicalMatch(item, reference)) return false;
  const name = String(field(item, "Наименование") ?? item.family);
  if (reference.basis === "project-analogue-length") return reference.material === "aisi304" && Boolean(reference.geometry) && Boolean(reference.adoptionId);
  // Explicitly adopted geometry defines L only; it does not certify the alloy or PN.
  if (reference.basis === "adopted-standard-geometry") return reference.standard === "ГОСТ 17378-2001" && Boolean(reference.geometry) && !/12Х18Н10Т/i.test(name);
  if (reference.material === "st20") return /ГОСТ\s*17378(?:[-\s]|$)/i.test(name);
  // A stainless standard must already identify the actual catalogue execution.
  // A newly supplied length or similar diameters cannot establish that standard.
  if (reference.material !== "aisi304" || !reference.geometry || typeof reference.standard !== "string" || !reference.standard.trim() || /12Х18Н10Т/i.test(name)) return false;
  const nativeStandards = `${name} ${String(field(item, "Стандарт") ?? "")}`.match(/(?:ГОСТ|DIN|EN|ISO)\s*\d+(?:[-.]\d+)*/gi) ?? [];
  return nativeStandards.some(value => normalizeStandard(value) === normalizeStandard(reference.standard));
}

export function reducerReferenceMaps(standards) {
  const lengths = new Map(), reviews = new Map();
  for (const reference of standards.reducerLengths ?? []) {
    if (!reference || typeof reference.componentId !== "string" || !reference.componentId || lengths.has(reference.componentId)
      || !["st20", "aisi304"].includes(reference.material) || (reference.geometry && !["eccentric", "concentric"].includes(reference.geometry))
      || ![reference.outerDiameter, reference.outerDiameterSmall, reference.wallThickness, reference.wallThicknessSmall, reference.lengthMm].every(positive)
      || typeof reference.source !== "string" || !reference.source.trim()) throw new Error(`Invalid or duplicate sourced reducer length: ${reference?.componentId}`);
    lengths.set(reference.componentId, reference);
    if (reference.basis === "project-analogue-length") {
      const policy = standards.reducerAnalogueLengthPolicy;
      const keys = ["componentId", "material", "geometry", "outerDiameter", "outerDiameterSmall", "wallThickness", "wallThicknessSmall", "lengthMm"];
      if (!policy?.source?.trim() || !policy.id || reference.adoptionId !== policy.id || !reference.source.trim()
        || !policy.rows?.some(row => keys.every(key => row[key] === reference[key]))) throw new Error(`Invalid project analogue length: ${reference.componentId}`);
    }
    if (reference.basis === "adopted-standard-geometry") {
      const policy = standards.reducerLengthPolicy;
      const groups = standards.referenceGroups ?? [];
      if (!policy?.id || reference.adoptionId !== policy.id || policy.standard !== reference.standard || !policy.materials?.includes(reference.material)
        || !policy.source || !groups.some(group => group.execution === reference.execution && group.outerDiameter === reference.outerDiameter
          && group.outerDiameterSmall === reference.outerDiameterSmall && group.lengthMm === reference.lengthMm
          && group.wallPairs.some(([large, small]) => large === reference.wallThickness && small === reference.wallThicknessSmall))) {
        throw new Error(`Invalid adopted reducer geometry: ${reference.componentId}`);
      }
    }
  }
  for (const review of standards.reducerLengthReviews ?? []) {
    if (!review || typeof review.componentId !== "string" || !review.componentId || reviews.has(review.componentId)
      || !["st20", "aisi304"].includes(review.material) || !["eccentric", "concentric"].includes(review.geometry)
      || ![review.outerDiameter, review.outerDiameterSmall, review.wallThickness, review.wallThicknessSmall].every(positive)
      || !statuses.has(review.status) || !Array.isArray(review.candidateLengthsMm) || !review.candidateLengthsMm.every(positive)
      || new Set(review.candidateLengthsMm).size !== review.candidateLengthsMm.length
      || (review.status === "confirmed" && review.candidateLengthsMm.length !== 1)
      || (review.status === "ambiguous" && review.candidateLengthsMm.length < 2)
      || typeof review.reason !== "string" || !review.reason.trim() || typeof review.source !== "string" || !review.source.trim()
      || typeof review.verifiedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(review.verifiedAt)) throw new Error(`Invalid or duplicate reducer review: ${review?.componentId}`);
    const length = lengths.get(review.componentId);
    if (review.status === "confirmed" && (!length || !review.candidateLengthsMm.includes(length.lengthMm)
      || ["material", "outerDiameter", "outerDiameterSmall", "wallThickness", "wallThicknessSmall"].some(key => review[key] !== length[key])
      || (length.geometry && review.geometry !== length.geometry))) throw new Error(`Reducer review contradicts or lacks verified length: ${review.componentId}`);
    reviews.set(review.componentId, review);
  }
  return { lengths, reviews };
}

const reviewFields = review => [
  [INSERT_LENGTH_REVIEW_COLUMNS.status, "Статус длины", review.status],
  [INSERT_LENGTH_REVIEW_COLUMNS.reason, "Проверка длины", review.reason],
  [INSERT_LENGTH_REVIEW_COLUMNS.options, "Варианты длины по источнику, мм", JSON.stringify([...review.candidateLengthsMm].sort((a, b) => a - b))],
  [INSERT_LENGTH_REVIEW_COLUMNS.source, "Источник проверки длины", review.source],
  [INSERT_LENGTH_REVIEW_COLUMNS.checkedAt, "Дата проверки длины", review.verifiedAt],
];
const setField = (item, column, label, value) => {
  const index = item.fields.findIndex(field => field.column === column), result = { column, headerPath: [label], value };
  if (index < 0) item.fields.push(result); else item.fields[index] = result;
};

/** Persist single sourced lengths and review evidence; alternatives never become an actual length. */
export function mergeReducerDimensions(input, standards) {
  const data = structuredClone(input), { lengths, reviews } = reducerReferenceMaps(standards);
  // A different workbook is outside the reviewed scope; do not mutate its data.
  if (data.source.sha256 !== standards.sourceSha256) return data;
  const byId = new Map(data.items.map(item => [item.id, item]));
  for (const id of new Set([...lengths.keys(), ...reviews.keys()])) {
    const item = byId.get(id), reference = lengths.get(id), review = reviews.get(id);
    if (!item || (review && !reducerPhysicalMatch(item, review))) continue;
    const approved = reference && reducerDimensionsMatch(item, reference) && (!review || review.status === "confirmed") ? reference : null;
    if (!review && !approved) continue;
    const nativeLengths = item.fields.filter(value => value.column !== INSERT_LENGTH_COLUMN && lengthField(value));
    let effectiveReview = review;
    if (review && nativeLengths.length && (review.status !== "confirmed" || nativeLengths.some(value => !review.candidateLengthsMm.includes(number(value.value))))) {
      effectiveReview = { ...review, status: "invalid", reason: `Сохранена длина другого источника (${nativeLengths.map(value => String(value.value)).join(", ")} мм); она не подтверждается этой проверкой. Требуется уточнение. ${review.reason}` };
    } else if (review && !nativeLengths.length && review.status === "confirmed" && !approved) {
      effectiveReview = { ...review, status: "invalid", reason: `Подтверждение длины не прошло проверку исходного исполнения и числового справочника. Требуется уточнение. ${review.reason}` };
    }
    // Revoke only our numeric enrichment, only inside an exactly reviewed scope.
    if (review && (!approved || nativeLengths.length)) item.fields = item.fields.filter(value => !numericColumns.has(value.column));
    if (approved && !nativeLengths.length) {
      setField(item, INSERT_LENGTH_COLUMN, "Длина, мм", approved.lengthMm);
      setField(item, INSERT_LENGTH_SOURCE_COLUMN, "Источник длины", approved.source);
    }
    if (effectiveReview) for (const [column, label, value] of reviewFields(effectiveReview)) setField(item, column, label, value);
  }
  return data;
}
