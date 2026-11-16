import type { InsertCalculation, InsertConfiguration, InsertConnection, InsertGeometry, InsertMaterial } from "./component-insert-calculations";
import { finitePositive, insertionBomIssues, insertionPhysicalKey, insertionPrice } from "./calculated-insertion";
import { isLegacyNomenclature, LEGACY_NOMENCLATURE_CATALOG_ID } from "./component-nomenclature";
import type { AssemblyComponent } from "./suction-catalog";
import type { SpecTechnicalStatus } from "./project-config";

export type InsertionEnd = { dn: number; connection: InsertConnection; thread?: string | null; gender?: string | null };
export type InsertionDesign = { configuration: InsertConfiguration; totalLengthMm: number; threadLeft: string | null; threadRight: string | null };
export type InsertionRequirement = {
  location: string;
  purpose: "between-valves" | "pump-transition" | "after-vibration";
  material: InsertMaterial; pn: number; from: InsertionEnd; to: InsertionEnd;
  geometry: InsertGeometry;
  withSensorNipple?: boolean;
  checkPressure?: boolean;
  design?: InsertionDesign;
};
export type InsertionFinding = { code: "missing-product" | "missing-price" | "missing-dimensions" | "incompatible" | "engineering-decision" | "incomplete-bom"; message: string };
export type InsertionSelection = { item?: AssemblyComponent; reversed: boolean; exact: boolean; technicalStatus: SpecTechnicalStatus; findings: InsertionFinding[]; explanation: string; candidates: string[] };
const finding = (code: InsertionFinding["code"], message: string): InsertionFinding => ({ code, message });
const missingPrice = () => finding("missing-price", "В сохранённой ревизии нет подтверждённой цены готовой вставки.");
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
  if (r.withSensorNipple !== undefined && (c.withSensorNipple !== r.withSensorNipple || c.configuration.sensor?.requested !== r.withSensorNipple)) return [];
  if (r.withSensorNipple && c.configuration.sensor?.dn !== 15) return [];
  if (r.purpose === "between-valves" && (c.geometry !== "straight" || c.leftConnection === "threaded" || c.rightConnection === "threaded")) return [];
  if (!["between-valves", "pump-transition", "after-vibration"].includes(r.purpose) || !r.location) return [];
  return [false, true].filter(reversed => sameEnd(end(c, reversed ? "right" : "left"), r.from, false) && sameEnd(end(c, reversed ? "left" : "right"), r.to, false));
}
export function insertionDesign(c: InsertCalculation): InsertionDesign | undefined {
  return finitePositive(c.totalLengthMm) ? { configuration: c.configuration, totalLengthMm: c.totalLengthMm, threadLeft: c.threadLeft, threadRight: c.threadRight } : undefined;
}

// Revision numbers belong to one product. Compare publication dates across products.
export function latestInsertionFirst(a: AssemblyComponent, b: AssemblyComponent): number {
  const left = a.calculatedInsertion!, right = b.calculatedInsertion!;
  return right.pricedAt.localeCompare(left.pricedAt) || right.revision - left.revision || a.id.localeCompare(b.id);
}

function technicalFindings(c: InsertCalculation, checkPressure = true): InsertionFinding[] {
  const findings = insertionBomIssues(c).map(message => finding("incomplete-bom", message));
  if (!c.complete) findings.push(finding("engineering-decision", `Расчёт вставки не завершён. ${(c.warnings ?? []).join("; ")}`));
  const assumptions = c.assumptions?.filter(a => checkPressure || a.code !== "sensor-pn25-pressure");
  if (assumptions?.length) findings.push(finding("engineering-decision", assumptions.map(a => `${a.message} Основание: ${a.source}`).join("; ")));
  return findings;
}

export function selectStationInsertion(items: AssemblyComponent[], r: InsertionRequirement): InsertionSelection {
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
  exact.sort((a, b) => latestInsertionFirst(a.item, b.item) || Number(a.reversed) - Number(b.reversed));
  const selected = exact[0];
  if (!selected) return { reversed: false, exact: false, technicalStatus: "unverified", candidates: [...new Set(candidates.map(c => c.item.id))],
    findings: [...(missing ? [finding("missing-dimensions", "Не подтверждены монтажная длина, геометрия концов и состав вставки для этого места. Выберите исполнение в спецификации.")] : []),
      ...(!candidates.length ? [finding("missing-product", `Нет расчётного изделия с требуемыми материалом, PN, обоими DN, соединениями и геометрией${r.withSensorNipple === undefined ? "" : r.withSensorNipple ? ", со сгоном DN15 под реле давления" : ", без сгона"}.`)] : missing ? [] : [finding("incompatible", "Расчётные вставки не соответствуют подтверждённой длине, соединениям, сгону или конфигурации.")])],
    explanation: "Точное рассчитанное исполнение не выбрано." };
  const s = selected.item.calculatedInsertion!, findings = technicalFindings(s.calculation, r.checkPressure);
  const ready = !findings.length;
  if (insertionPrice(s) === null) findings.push(missingPrice());
  return { ...selected, exact: ready, candidates: [...new Set(exact.map(c => c.item.id))], findings,
    technicalStatus: ready ? "ready" : "incomplete",
    explanation: `Выбрана последняя выгруженная вставка для этого исполнения, ревизия ${s.revision}. ${selected.reversed ? "Правый конец обращён к насосу." : "Левый конец обращён к насосу."}` };
}

function matchesThread(actual: InsertionEnd, required: InsertionEnd): boolean {
  if (required.connection !== "threaded") return true;
  return Boolean(typeof actual.thread === "string" && actual.thread.trim() && (actual.gender === "male" || actual.gender === "female") &&
    (!required.thread || actual.thread === required.thread) && (!required.gender || actual.gender === required.gender));
}

function automaticFindings(c: InsertCalculation, checkPressure: boolean | undefined): InsertionFinding[] {
  const findings = technicalFindings(c, checkPressure);
  const { baseLengthMm, axialLeftMm, axialRightMm, sensor, extension } = c.configuration;
  if (!finitePositive(c.totalLengthMm) || !finitePositive(baseLengthMm) || c.baseLengthMm !== baseLengthMm ||
    axialLeftMm == null || axialRightMm == null || !Number.isFinite(axialLeftMm + axialRightMm) ||
    Math.abs(c.totalLengthMm - (baseLengthMm + axialLeftMm + axialRightMm)) >= .001) {
    findings.push(finding("missing-dimensions", "У расчётной вставки не подтверждена монтажная длина или размеры концов."));
  }
  if (extension || c.extension) findings.push(finding("incompatible", "В каталоге сохранено устаревшее исполнение вставки с удлиняющей трубой."));
  if (c.withSensorNipple && (!sensor?.part || sensor.dn !== 15 || sensor.gender !== "male")) {
    findings.push(finding("incompatible", "В расчёте не подтверждён сгон DN15 с наружной резьбой для подключения реле давления."));
  }
  return findings;
}

/** Uses a published assembly for the current station connection, regardless of saved design overrides. */
export function selectAutomaticStationInsertion(items: AssemblyComponent[], r: InsertionRequirement): InsertionSelection {
  const candidates = items.flatMap(item => {
    const c = item.calculatedInsertion?.calculation;
    if (!c || item.catalogId === LEGACY_NOMENCLATURE_CATALOG_ID || /^suction-table:ff-\d+$/.test(item.id) || isLegacyNomenclature(item)) return [];
    const reversed = insertionOrientations(item, r).find(reversed =>
      matchesThread(end(c, reversed ? "right" : "left"), r.from) && matchesThread(end(c, reversed ? "left" : "right"), r.to));
    return reversed === undefined ? [] : [{ item, reversed, findings: automaticFindings(c, r.checkPressure) }];
  }).sort((a, b) => latestInsertionFirst(a.item, b.item));
  const eligible = candidates.filter(candidate => !candidate.findings.length);
  const selected = eligible[0];
  if (!selected) return {
    reversed: false, exact: false, technicalStatus: "unverified", candidates: candidates.map(candidate => candidate.item.id),
    findings: candidates[0]?.findings ?? [finding("missing-product", `В каталоге нет расчётной вставки с требуемыми материалом, PN, DN, соединениями и геометрией${r.withSensorNipple === undefined ? "" : r.withSensorNipple ? ", со сгоном DN15 под реле давления" : ", без сгона"}.`)],
    explanation: "Автоматический подбор не нашёл подходящего расчётного исполнения вставки.",
  };
  const snapshot = selected.item.calculatedInsertion!;
  return {
    item: selected.item, reversed: selected.reversed, exact: true, technicalStatus: "ready",
    candidates: eligible.map(candidate => candidate.item.id), findings: insertionPrice(snapshot) === null ? [missingPrice()] : [],
    explanation: `Вставка подобрана автоматически по параметрам соединения, ревизия ${snapshot.revision}. ${selected.reversed ? "Правый конец обращён к насосу." : "Левый конец обращён к насосу."}`,
  };
}
