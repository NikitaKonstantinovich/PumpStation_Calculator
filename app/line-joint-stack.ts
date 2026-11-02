import type { SpecItem } from "./project-config";
import type { AssemblyComponent } from "./suction-catalog";
import { jointFlangeThickness } from "./joint-flange-dimensions";
import type { CollectorConfiguration } from "./collector-calculations";

export function insertionEndThickness(row: SpecItem | undefined, end: "from" | "to", database: { items: AssemblyComponent[] }, useStampedSeat = false): number | null {
  const assembly = row?.insertionAssembly;
  if (!assembly || !assembly.snapshot.currentCatalogVersion || assembly.snapshot.catalogVersion !== assembly.snapshot.currentCatalogVersion) return null;
  const side = (end === "from") !== assembly.reversed ? "left" : "right";
  const c = assembly.snapshot.calculation;
  const dn = side === "left" ? c.dnLarge : c.dnSmall ?? c.dnLarge;
  const connection = c.configuration[side].connection;
  if (connection === "threaded" || c.pn === null) return null;
  const component = (kind: string) => c.bom.find(part => part.role.startsWith(`${side}-`) && part.kind === kind)?.componentId ?? undefined;
  const collar = component("collar"), flange = component("weldFlange"), loose = component("looseFlange") ?? assembly.externalFlanges?.[end];
  if (connection === "flanged" && !flange || connection === "collar" && (!collar || !loose)) return null;
  const result = jointFlangeThickness(database, c.material, dn, c.pn, collar, flange, loose, useStampedSeat);
  return result.thicknessMm !== null && !result.warnings.length ? result.thicknessMm / 2 : null;
}

/** Project allowance for bolt sizing at a pump port. This is a single side of the grip. */
export function pumpFlangeReference(database: { items: AssemblyComponent[] }, material: CollectorConfiguration["material"], dn: number, pn: number, insertion?: SpecItem) {
  let thickness: number | null = null;
  if (insertion?.insertionAssembly) {
    thickness = insertionEndThickness(insertion, "from", database);
  } else if (!insertion?.insertionRequirement?.design) {
    const reference = jointFlangeThickness(database, material, dn, pn);
    if (!reference.warnings.length && reference.thicknessMm !== null) thickness = reference.thicknessMm / 2;
  }
  const end = insertion?.insertionAssembly ? "концу выбранной вставки со стороны насоса" : "каталожному концу вставки";
  const size = `DN${dn} PN${pn} ${material === "aisi304" ? "AISI304" : "СТ20"}`;
  const source = thickness === null ? `Не подтверждена толщина конца вставки ${size} для расчёта фланца насоса.`
    : `По проектному правилу толщина фланца насоса принята равной ${thickness} мм по ${end} ${size}.`;
  return { thickness, source };
}

/** Equipment dimensions must identify their source and verification date. */
export function equipmentFlangeThickness(item?: AssemblyComponent): number | null {
  const value = (label: string) => item?.fields.find(field => field.headerPath.at(-1) === label)?.value;
  const thickness = value("Толщина фланца, мм");
  return typeof thickness === "number" && Number.isFinite(thickness) && thickness > 0 && value("Источник толщины фланца") && /^\d{4}-\d{2}-\d{2}$/.test(String(value("Дата проверки толщины фланца"))) ? thickness : null;
}
export const flangeStack = (a: number | null, b: number | null): number | null => a !== null && b !== null ? a + b : null;
