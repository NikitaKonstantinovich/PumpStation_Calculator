import type { ComponentItem } from "./component-database-types";
import { geometricComponentMass } from "./component-mass-geometry";

export type ComponentMass = { kg: number; source: string; estimated: boolean };
export type MassSelection = { description?: string; pn?: number };
const value = (v: unknown): number | null => {
  if (v === null || v === undefined || typeof v === "boolean" || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  // Zero is valid for work/accounting interfaces, handled separately below.
  // A physical catalogue item with an imported zero has no known mass.
  return Number.isFinite(n) && n > 0 ? n : null;
};
const last = (f: ComponentItem["fields"][number]) => f.headerPath.at(-1)?.trim() ?? f.column;
export const isLinearMassUnit = (unit: string) => ["м", "м.", "м.п.", "м.п", "пог.м", "пог. м"].includes(unit.trim());

/** Read the mass of the selected execution, never the first actuator/PN column. */
export function readComponentMass(item: ComponentItem | undefined, unit = "шт.", selection: MassSelection = {}): ComponentMass | null {
  if (!item) return null;
  if (item.catalogId === "работы" || item.catalogId === "control:Работы") return { kg: 0, source: "Работа, не отдельная физическая деталь", estimated: false };
  if (unit === "кг") return { kg: 1, source: "Количество материала задано в килограммах", estimated: false };
  const linear = isLinearMassUnit(unit), description = selection.description ?? "";
  let labels = linear ? ["Масса 1 м, кг", "Масса, кг/м", "Вес 1 кг/метр"] : ["Масса, кг", "Вес, кг", "Масса по каталогу, кг", "Масса нетто, кг", "Вес нетто, кг", "weightKg"];
  if (!linear) {
    if (/рукоятк/i.test(description)) labels = ["Вес с рукояткой, кг", ...labels];
    else if (/редуктор/i.test(description)) labels = ["Вес с редуктором, кг", ...labels];
    else if (/маховик/i.test(description)) labels = ["Вес с маховиком, кг", ...labels];
    else if (/электропривод/i.test(description) && !/под электропривод/i.test(description)) labels = ["Вес с электроприводом, кг", ...labels];
    else if (/шток|под электропривод/i.test(description)) labels = ["Вес с штоком, кг", ...labels];
  }
  const pressureText = String(item.fields.find(f=>last(f)==="PN")?.value ?? "");
  const pn = selection.pn ?? Number(description.match(/PN\s*(\d+)/i)?.[1] ?? pressureText.match(/(?:PN\s*)?(\d+)/i)?.[1] ?? 0);
  for (const label of labels) {
    const fields = item.fields.filter(f => last(f) === label || f.column === label).filter(f => {
      const pressure = f.headerPath.join(" / ").match(/PN\s*(\d+)/i);
      return !pressure || pn > 0 && Number(pressure[1]) === pn;
    });
    const masses = fields.map(f => ({ f, kg: value(f.value) })).filter((r): r is { f: ComponentItem["fields"][number]; kg: number } => r.kg !== null);
    if (masses.length && new Set(masses.map(r => r.kg)).size === 1) {
      const provenance = item.fields.find(f => last(f) === "Источник массы")?.value;
      const estimated = item.fields.some(f => last(f) === "Тип массы" && f.value === "расчётная");
      return { kg: masses[0].kg, source: String(provenance ?? `База комплектующих: ${masses[0].f.headerPath.join(" / ")}`), estimated };
    }
  }
  return geometricComponentMass(item,unit);
}
