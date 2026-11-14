import type { SpecItem } from "./project-config";
import type { AssemblyComponent } from "./suction-catalog";
import { jointFlangeThickness } from "./joint-flange-dimensions";
import type { CollectorConfiguration } from "./collector-calculations";

function matchesSavedThickness(identity: string | null, current: number | undefined): boolean {
  if (!identity || current === undefined) return false;
  try {
    const part: unknown = JSON.parse(identity);
    // The published insertPartIdentity tuple stores nominal thickness after length.
    const saved = Array.isArray(part) ? part[11] : null;
    return typeof saved === "number" && Number.isFinite(saved) && Math.abs(saved - current) < .001;
  } catch {
    return false;
  }
}

export function insertionEndThickness(row: SpecItem | undefined, end: "from" | "to", database: { items: AssemblyComponent[] }, { useStampedSeat = false, revalidateParts = false } = {}): number | null {
  const assembly = row?.insertionAssembly;
  if (!assembly?.snapshot.catalogVersion || !assembly.snapshot.currentCatalogVersion) return null;
  const changedCatalog = assembly.snapshot.catalogVersion !== assembly.snapshot.currentCatalogVersion;
  if (changedCatalog && !revalidateParts) return null;
  const side = (end === "from") !== assembly.reversed ? "left" : "right";
  const c = assembly.snapshot.calculation;
  const dn = side === "left" ? c.dnLarge : c.dnSmall ?? c.dnLarge;
  const configuration = c.configuration[side];
  const { connection } = configuration;
  if (connection === "threaded" || c.pn === null) return null;
  const component = (kind: string, role = kind) => c.bom.find(part => part.role === `${side}-${role}` && part.kind === kind)?.componentId ?? undefined;
  const collar = connection === "collar" ? component("collar") : undefined;
  const flange = connection === "flanged" ? component("weldFlange", "flanged") : undefined;
  const loose = connection === "collar"
    ? component("looseFlange") ?? (configuration.looseFlange ? undefined : assembly.externalFlanges?.[end])
    : undefined;
  if (connection === "flanged" && !flange || connection === "collar" && (!collar || !loose)) return null;
  const result = jointFlangeThickness(database, c.material, dn, c.pn, collar, flange, loose, useStampedSeat);
  if (result.thicknessMm === null || result.warnings.length) return null;
  // A catalogue revision also includes prices and tariffs. Check the grip
  // against the exact parts and the published thickness of the installed end.
  if (changedCatalog) {
    const primary = flange ?? collar;
    if (!primary || !matchesSavedThickness(configuration.part, result.partThicknesses.get(primary))) return null;
    if (loose && !result.partThicknesses.has(loose)) return null;
    if (configuration.looseFlange && (!loose || !matchesSavedThickness(configuration.looseFlange, result.partThicknesses.get(loose)))) return null;
  }
  return result.thicknessMm / 2;
}

/** Project allowance for bolt sizing at a pump port. This is a single side of the grip. */
export function pumpFlangeReference(database: { items: AssemblyComponent[] }, material: CollectorConfiguration["material"], dn: number, pn: number, insertion?: SpecItem, revalidateParts = false) {
  let thickness: number | null = null;
  if (insertion?.insertionAssembly) {
    thickness = insertionEndThickness(insertion, "from", database, { revalidateParts });
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
