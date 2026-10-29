import type { InsertCalculation, InsertConfiguration, InsertConnection, InsertGeometry, InsertMaterial } from "./component-insert-calculations";
import { finitePositive, insertionBomIssues, insertionPhysicalKey, insertionPrice } from "./calculated-insertion";
import type { AssemblyComponent } from "./suction-catalog";
import type { SpecTechnicalStatus } from "./project-config";

export type InsertionEnd = { dn: number; connection: InsertConnection; thread?: string | null; gender?: string | null };
export type InsertionDesign = { configuration: InsertConfiguration; totalLengthMm: number; threadLeft: string | null; threadRight: string | null };
export type InsertionRequirement = {
  location: string;
  purpose: "between-valves" | "pump-transition" | "after-vibration";
  material: InsertMaterial; pn: number; from: InsertionEnd; to: InsertionEnd;
  geometry: InsertGeometry;
  design?: InsertionDesign;
};
export type InsertionFinding = { code: "missing-product" | "missing-price" | "missing-dimensions" | "incompatible" | "stale" | "engineering-decision" | "incomplete-bom"; message: string };
export type InsertionSelection = { item?: AssemblyComponent; reversed: boolean; exact: boolean; technicalStatus: SpecTechnicalStatus; findings: InsertionFinding[]; explanation: string; candidates: string[] };
const threadGender = (physical: string | null | undefined) => {
  try { const value: unknown = JSON.parse(physical ?? "null"); return Array.isArray(value) ? value[16] : null; } catch { return null; }
};
const end = (c: InsertCalculation, side: "left" | "right"): InsertionEnd => ({
  dn: side === "left" ? c.dnLarge : c.dnSmall ?? c.dnLarge,
  connection: side === "left" ? c.leftConnection : c.rightConnection,
  thread: side === "left" ? c.threadLeft : c.threadRight,
  gender: threadGender(c.configuration?.[side]?.part),
});
const sameEnd = (actual: InsertionEnd, required: InsertionEnd, checkThread: boolean) => actual.dn === required.dn && actual.connection === required.connection &&
  (!checkThread || actual.connection !== "threaded" || Boolean(required.thread && required.gender && actual.thread === required.thread && actual.gender === required.gender));

/** Direction always runs away from the pump; a reducer's stored left side is its larger DN. */
export function insertionOrientations(item: AssemblyComponent, r: InsertionRequirement): boolean[] {
  const c = item.calculatedInsertion?.calculation;
  if (!c?.configuration || c.material !== r.material || c.pn !== r.pn || c.geometry !== r.geometry) return [];
  if (r.purpose === "between-valves" && (c.geometry !== "straight" || c.leftConnection === "threaded" || c.rightConnection === "threaded")) return [];
  if (!["between-valves", "pump-transition", "after-vibration"].includes(r.purpose) || !r.location) return [];
  return [false, true].filter(reversed => sameEnd(end(c, reversed ? "right" : "left"), r.from, false) && sameEnd(end(c, reversed ? "left" : "right"), r.to, false));
}
export function insertionDesign(c: InsertCalculation): InsertionDesign | undefined {
  return finitePositive(c.totalLengthMm) ? { configuration: c.configuration, totalLengthMm: c.totalLengthMm, threadLeft: c.threadLeft, threadRight: c.threadRight } : undefined;
}

export function selectStationInsertion(items: AssemblyComponent[], r: InsertionRequirement): InsertionSelection {
  const finding = (code: InsertionFinding["code"], message: string): InsertionFinding => ({ code, message });
  const candidates = items.filter(item => item.calculatedInsertion).flatMap(item => insertionOrientations(item, r).map(reversed => ({ item, reversed })));
  const design = r.design;
  const missing = !design || !finitePositive(design.totalLengthMm) || !finitePositive(design.configuration?.baseLengthMm) ||
    !Number.isFinite(design.configuration?.axialLeftMm) || design.configuration?.axialLeftMm == null || !Number.isFinite(design.configuration?.axialRightMm) || design.configuration?.axialRightMm == null;
  const exact = missing ? [] : candidates.filter(({ item, reversed }) => {
    const c = item.calculatedInsertion!.calculation;
    const expected = design!.configuration;
    const expectedEnd = (side: "left" | "right", base: InsertionEnd): InsertionEnd => ({ ...base,
      thread: base.thread ?? (side === "left" ? design!.threadLeft : design!.threadRight), gender: base.gender ?? threadGender(expected[side]?.part) });
    return c.totalLengthMm === design!.totalLengthMm && insertionPhysicalKey(c.configuration) === insertionPhysicalKey(expected) &&
      c.withSensorNipple === expected.sensor?.requested && c.leftConnection === expected.left?.connection && c.rightConnection === expected.right?.connection &&
      sameEnd(end(c, reversed ? "right" : "left"), expectedEnd(reversed ? "right" : "left", r.from), true) &&
      sameEnd(end(c, reversed ? "left" : "right"), expectedEnd(reversed ? "left" : "right", r.to), true) &&
      (!expected.sensor.requested || Boolean(expected.sensor.part && finitePositive(expected.sensor.dn) && expected.sensor.gender));
  });
  // Price is deliberately absent from the ordering. A missing price never authorizes substitution.
  const fresh = (item: AssemblyComponent) => Boolean(item.calculatedInsertion!.currentCatalogVersion && item.calculatedInsertion!.catalogVersion === item.calculatedInsertion!.currentCatalogVersion);
  exact.sort((a, b) => Number(fresh(b.item)) - Number(fresh(a.item)) || Number(b.item.calculatedInsertion!.calculation.complete) - Number(a.item.calculatedInsertion!.calculation.complete) || b.item.calculatedInsertion!.revision - a.item.calculatedInsertion!.revision || a.item.id.localeCompare(b.item.id) || Number(a.reversed) - Number(b.reversed));
  const selected = exact[0];
  if (!selected) return { reversed: false, exact: false, technicalStatus: "unverified", candidates: [...new Set(candidates.map(c => c.item.id))],
    findings: [...(missing ? [finding("missing-dimensions", "Не подтверждены монтажная длина, геометрия концов и состав вставки для этого места. Выберите исполнение в спецификации.")] : []),
      ...(!candidates.length ? [finding("missing-product", "Нет расчётного изделия с требуемыми материалом, PN, обоими DN, соединениями и геометрией.")] : missing ? [] : [finding("incompatible", "Расчётные вставки не соответствуют подтверждённой длине, соединениям, сгону или конфигурации.")])],
    explanation: "Точное рассчитанное исполнение не выбрано." };
  const s = selected.item.calculatedInsertion!, c = s.calculation, findings: InsertionFinding[] = [];
  if (!fresh(selected.item)) findings.push(finding("stale", s.currentCatalogVersion ? "Расчёт вставки устарел относительно текущего каталога." : "Актуальность расчёта вставки не проверена: текущая версия каталога недоступна."));
  for (const message of insertionBomIssues(c)) findings.push(finding("incomplete-bom", message));
  if (!c.complete) findings.push(finding("engineering-decision", `Расчёт вставки не завершён. ${(c.warnings ?? []).join("; ")}`));
  if (c.assumptions?.length) findings.push(finding("engineering-decision", c.assumptions.map(a => `${a.message} Основание: ${a.source}`).join("; ")));
  if (insertionPrice(s) === null) findings.push(finding("missing-price", "Полная актуальная стоимость вставки не подтверждена; частичный итог BOM не учитывается."));
  const technical = findings.filter(f => f.code !== "missing-price");
  return { ...selected, exact: fresh(selected.item) && !technical.length, candidates: [...new Set(exact.map(c => c.item.id))], findings,
    technicalStatus: !fresh(selected.item) ? "stale" : technical.length ? "incomplete" : "ready",
    explanation: `Выбрана расчётная вставка ${s.id}, ревизия ${s.revision}. Совпадений: ${new Set(exact.map(c => c.item.id)).size}. Приоритет: актуальность, завершённость, ревизия, стабильный ID; цена не влияет. ${selected.reversed ? "Концы развёрнуты: правый к насосу." : "Левый конец — начало участка."}` };
}
