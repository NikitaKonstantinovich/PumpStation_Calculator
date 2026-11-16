import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../../data/pump-mountings-reviewed.json", import.meta.url), "utf8"));
const bindings = new Map(manifest.rows.map(row => [row.variantId, row]));
const fasteners = JSON.parse(readFileSync(new URL("../../data/pump-fasteners-reviewed.json", import.meta.url), "utf8"));
const fastenerBindings = new Map(fasteners.rows.map(row => [row.variantId, row]));
const horizontal = JSON.parse(readFileSync(new URL("../../data/horizontal-frame-mounts.json", import.meta.url), "utf8"));
const horizontalBindings = new Map(horizontal.rows.map(row => [row.variantId, row]));
const vertical = JSON.parse(readFileSync(new URL("../../data/vertical-pump-mountings-reviewed.json", import.meta.url), "utf8"));
const verticalBindings = new Map(vertical.rows.map(row => [row.variantId, row]));
const foundationPlates = JSON.parse(readFileSync(new URL("../../data/pump-optional-foundation-plates.json", import.meta.url), "utf8"));
const plateTypesByModel = new Map(Object.entries(foundationPlates.models));
const positive = n => typeof n === "number" && Number.isFinite(n) && n > 0;
const matches = (row, {variant,model,motor,manufacturer,series}) => row && row.modelId === String(model.id) && row.designation === variant.designation && row.article === variant.manufacturer_article && row.manufacturer === manufacturer && row.series === series && Object.entries(row.motor).every(([key,value]) => (motor?.[key]??null) === value);
function validMounting(m, evidence) {
  const b=m?.bounds;
  return m?.verified===true && evidence?.sha256 && m.source && b &&
    [b.minX,b.maxX,b.minY,b.maxY].every(Number.isFinite) && b.minX<b.maxX && b.minY<b.maxY &&
    Array.isArray(m.holes) && m.holes.length>=2 && m.holes.every(h=>Number.isFinite(h.x)&&Number.isFinite(h.y)&&(positive(h.diameterMm)||m.scope==="catalogue_layout"&&h.diameterMm===null)&&h.x>=b.minX&&h.x<=b.maxX&&h.y>=b.minY&&h.y<=b.maxY) &&
    new Set(m.holes.map(h=>`${h.x}/${h.y}`)).size===m.holes.length;
}

/** Match the complete execution identity. Catalogue layout does not approve fasteners or lifting. */
export function catalogMounting({ variant, model, motor, manufacturer, series }, rows = bindings, supplements = fastenerBindings, verticalRows = verticalBindings) {
  const row = rows.get(String(variant.id));
  const identity={variant,model,motor,manufacturer,series};
  if (!matches(row,identity)) return undefined;
  const candidate=supplements.get(String(variant.id));
  const supplement=matches(candidate,identity)&&candidate.evidence?.sha256 ? candidate : null;
  const horizontalCandidate=horizontalBindings.get(String(variant.id));
  const horizontalMount=matches(horizontalCandidate,identity)&&validMounting(horizontalCandidate.mounting,horizontalCandidate.evidence)
    ? horizontalCandidate : undefined;
  const supplementValid=supplement&&validMounting(supplement.mounting,supplement.evidence);
  const priorValid = row.status === "catalogue_grid" && validMounting(row.mounting,row.evidence);
  const verticalCandidate=verticalRows.get(String(variant.id));
  const verticalValid=matches(verticalCandidate,identity)&&validMounting(verticalCandidate.mounting,verticalCandidate.evidence);
  // Preserve existing exact CAD/user-reviewed placement. A new grid is a
  // fallback for this complete execution, never an inferred family substitution.
  const verticalMount=!horizontalMount&&!supplementValid&&!priorValid&&verticalValid
    ? verticalCandidate : undefined;
  let m = horizontalMount?.mounting ?? (supplementValid ? supplement.mounting : priorValid ? row.mounting : verticalMount?.mounting);
  const enrichment=!horizontalMount&&supplementValid&&verticalValid&&verticalCandidate.mode==="fill_missing_fastener_dimensions"&&
    JSON.stringify(m.bounds)===JSON.stringify(verticalCandidate.mounting.bounds)&&m.holes.length===verticalCandidate.mounting.holes.length&&
    m.holes.every((h,i)=>h.x===verticalCandidate.mounting.holes[i].x&&h.y===verticalCandidate.mounting.holes[i].y&&h.diameterMm===null)
    ? verticalCandidate : undefined;
  if(enrichment)m={...m,holes:m.holes.map((h,i)=>({...h,diameterMm:enrichment.mounting.holes[i].diameterMm})),
    footThicknessMm:m.footThicknessMm??enrichment.mounting.footThicknessMm,clampHeightMm:m.clampHeightMm??enrichment.mounting.clampHeightMm,
    boltDiameterMm:m.boltDiameterMm??enrichment.mounting.boltDiameterMm,fastenerSource:enrichment.mounting.fastenerSource};
  const valid = !!horizontalMount || supplementValid || priorValid || !!verticalMount;
  const facts=verticalMount??enrichment??supplement;
  const plateType = manufacturer === foundationPlates.manufacturer && series === foundationPlates.series
    ? plateTypesByModel.get(model.designation) : undefined;
  return {
    ...(valid ? { frameV1: structuredClone(m) } : {}),
    ...(facts?.fasteners ? {fastenersV1:structuredClone(facts.fasteners)} : {}),
    ...(plateType ? {optionalFoundationPlate: structuredClone({
      type: plateType, ...foundationPlates.plates[plateType], source: foundationPlates.source,
    })} : {}),
    frameAssessment: { status: valid ? "catalogue_grid" : row.status === "catalogue_grid" ? "invalid" : row.status, missing: facts?.missing??row.missing, version:horizontalMount?horizontal.version:verticalMount||enrichment?vertical.version:fasteners.version, fastenerStatus:verticalMount?(facts.fasteners?.boltDiameterMm&&facts.fasteners?.clampHeightMm?"dimensions_ready":"partial"):supplement?.status??"missing", ...(verticalMount?.mounting.note?{note:verticalMount.mounting.note}:{}), ...(horizontalMount?.evidence||facts?.evidence||row.evidence ? { evidence:structuredClone(horizontalMount?.evidence??facts?.evidence??row.evidence) } : {}) },
  };
}
