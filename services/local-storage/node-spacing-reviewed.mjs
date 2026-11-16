import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const data = JSON.parse(readFileSync(new URL("../../data/pump-spacing-reviewed.json", import.meta.url), "utf8"));
const rows = new Map(data.rows.map(row => [row.variantId, row]));
const pending = new Map((data.pending ?? []).map(row => [row.variantId, row]));

function matchesExecution(row, { variant, model, motor, manufacturer, series }) {
  return row && row.modelId === String(model.id) && row.manufacturer === manufacturer && row.series === series && row.designation === variant.designation && row.article === variant.manufacturer_article && Object.entries(row.motor).every(([key, value]) => motor?.[key] === value);
}

export function reviewedSpacingIssues(args) {
  const row = pending.get(String(args.variant.id));
  return matchesExecution(row, args) ? [...row.issues] : [];
}

/** Explicitly reviewed execution bindings, never a fuzzy model/family lookup. */
export function reviewedSpacingBinding({ variant, model, motor, manufacturer, series, dimensions, evidence }) {
  const row = rows.get(String(variant.id));
  if (!matchesExecution(row, { variant, model, motor, manufacturer, series })) return undefined;
  if (row.dimensionGuard) {
    if (evidence?.dimensionSetId !== row.dimensionGuard.id) return undefined;
    for (const [symbol, value] of Object.entries(row.dimensionGuard.values)) {
      const assertions = new Set((dimensions?.sourceValues ?? []).filter(v => (v.symbol ?? v.key) === symbol && ["symbol_only", "semantic_source_key"].includes(v.mappingStatus)).map(v => v.valueMm));
      if (assertions.size !== 1 || !assertions.has(value)) return undefined;
    }
  }
  return row;
}

export function reviewedSpacingReference(row, motorKey) {
  if (!row || !(row.leftMm > 0 && row.rightMm > 0)) return undefined;
  return { variantId: row.variantId, modelId: row.modelId, motorKey, orientation: "transverse_to_flow", leftMm: row.leftMm, rightMm: row.rightMm,
    source: row.sources.map(s => [s.path ?? s.url, s.page ? `стр. ${s.page}` : ""].filter(Boolean).join(" · ")).join("; "),
    basis: row.basis + ". Справочная оценка по источнику; соответствие полного габарита текущему заводскому исполнению требует проверки.",
    version: createHash("sha256").update(JSON.stringify({ version: data.version, row })).digest("hex") };
}

export function reconcileReviewedAliases(links, row) {
  if (!row?.identity) return links;
  const expected = new Set(row.identity.aliases), actual = new Set(links.map(l => l.legacyId));
  if (expected.size !== actual.size || [...actual].some(id => !expected.has(id))) return links;
  const canonical = links.find(l => l.legacyId === row.identity.canonical);
  return canonical ? [{ ...canonical, source: canonical.source + "; reviewed aliases: " + [...expected].join(", ") }] : links;
}
