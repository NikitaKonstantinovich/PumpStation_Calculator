import type { InsertCalculation, InsertConfiguration } from "./component-insert-calculations";

/** Persisted audit snapshot; BOM is explanatory and never a second set of priced rows. */
export type CalculatedInsertion = {
  version: 1;
  id: string;
  identityKey: string;
  revision: number;
  catalogVersion: string;
  currentCatalogVersion: string | null;
  pricedAt: string;
  calculation: InsertCalculation;
};
export const finitePositive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

export function insertionBomIssues(c: InsertCalculation): string[] {
  if (!c?.configuration || !Array.isArray(c.bom)) return ["Нет конфигурации или вложенного состава вставки"];
  const required = ["base", `left-${c.leftConnection}`, `right-${c.rightConnection}`, "welding",
    ...(c.material === "st20" ? ["painting"] : []), ...(c.withSensorNipple ? ["sensor-nipple"] : []),
    ...(["left", "right"] as const).flatMap(side => c.configuration[side]?.looseFlange ? [`${side}-looseFlange`] : []),
    ...(c.configuration.sensor?.plug ? ["sensor-plug"] : []), ...(c.configuration.extension ? ["extension-pipe"] : [])];
  const issues = required.filter(role => !c.bom.some(row => row.role === role && finitePositive(row.quantity))).map(role => `Неполный BOM: ${role}`);
  if (!c.configuration.base || !c.configuration.left?.part || !c.configuration.right?.part ||
    c.configuration.material !== c.material || c.configuration.pn !== c.pn || c.configuration.dnLarge !== c.dnLarge || c.configuration.dnSmall !== c.dnSmall ||
    c.configuration.geometry !== c.geometry || c.configuration.left.connection !== c.leftConnection || c.configuration.right.connection !== c.rightConnection ||
    c.configuration.sensor?.requested !== c.withSensorNipple) issues.push("Состав и конфигурация расчёта не согласованы");
  if (new Set(c.bom.map(row => row.role)).size !== c.bom.length) issues.push("Повторяющиеся роли во вложенном составе");
  if (c.bom.some(row => !nonnegative(row.quantity))) issues.push("Не определено количество вложенной детали");
  return issues;
}

export function insertionPrice(snapshot: CalculatedInsertion): number | null {
  const c = snapshot.calculation;
  if (!snapshot.currentCatalogVersion || snapshot.catalogVersion !== snapshot.currentCatalogVersion || insertionBomIssues(c).length || !c.complete || !finitePositive(c.price)) return null;
  if (c.bom.some(row => !nonnegative(row.unitPrice) || !nonnegative(row.quantity) || !nonnegative(row.cost) || Math.abs(row.unitPrice * row.quantity - row.cost) > .01)) return null;
  return Math.abs(c.bom.reduce((sum, row) => sum + row.cost!, 0) - c.price) <= .01 ? c.price : null;
}

/** Seating UI choices are audit data, while actual axial dimensions define identity. */
export function insertionPhysicalKey(config: InsertConfiguration) {
  const end = (side: InsertConfiguration["left"]) => [side.connection, side.part, side.looseFlange];
  return JSON.stringify([config.version, config.dnLarge, config.dnSmall, config.pn, config.material, config.geometry, config.base,
    end(config.left), end(config.right), [config.sensor.requested, config.sensor.dn, config.sensor.gender, config.sensor.part, config.sensor.plug],
    config.baseLengthMm, config.axialLeftMm, config.axialRightMm,
    config.extension ? [config.extension.side, config.extension.part, config.extension.lengthMm] : null,
    (config.flangeBores ?? []).map(bore => [bore.side, bore.targetBoreMm]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))]);
}
