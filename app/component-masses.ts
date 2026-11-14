import supplement from "../data/component-masses.json";
import electricalMasses from "../data/component-mass-electrical.json";

type MassEntry = {
  value: number;
  unit: "kg" | "kg/m";
  method: "catalog" | "calculated" | "estimated";
  source: string;
  variant?: string;
  alternatives?: Array<{ value: number; source: string }>;
};

type CatalogField = { column: string; headerPath: string[]; value: unknown };
type BillOfMaterialsLine = { kind?: string; componentId?: string; quantity?: number; unit?: string };

const massEntries = supplement.items as Record<string, MassEntry[]>;
const methods = {
  catalog: "По документации",
  calculated: "Расчётная масса",
  estimated: "Оценочная масса",
};

export const componentMassSourceSha256 = supplement.sourceSha256;

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

export function withComponentMass(data: Record<string, unknown>, electrical = false): Record<string, unknown> {
  const entries = electrical ? electricalMasses as Record<string, MassEntry[]> : massEntries;
  if (typeof data.id !== "string" || !Object.hasOwn(entries, data.id)) return data;
  const fields = Array.isArray(data.fields) ? data.fields as CatalogField[] : [];
  const columns = new Set(fields.map(field => field.column));
  const additions = entries[data.id].flatMap(entry => {
    const column = `${entry.unit === "kg" ? "MASS_KG" : "MASS_KG_PER_M"}${entry.variant ? `:${entry.variant}` : ""}`;
    if (columns.has(column)) return [];
    const label = entry.unit === "kg" ? "Масса, кг" : "Линейная масса, кг/м";
    const symbol = entry.unit === "kg" ? "кг" : "кг/м";
    const others = entry.alternatives?.map(item => `${item.value} ${symbol} (${item.source})`).join(" | ");
    const known = entry.unit === "kg" && !entry.variant && positive(data.weightKg) ? data.weightKg : undefined;
    if (known !== undefined && known > entry.value) return [];
    const compared = known !== undefined && known < entry.value ? `${known} кг (значение из действующего каталога)` : undefined;
    const otherValues = [others, compared].filter(Boolean).join(" | ");
    return [{
      column,
      headerPath: entry.variant ? [entry.variant, label] : [label],
      value: entry.value,
      comment: `${methods[entry.method]}. ${entry.source}${otherValues ? ` Другие значения: ${otherValues}` : ""}`,
    }];
  });
  return additions.length ? { ...data, fields: [...fields, ...additions] } : data;
}

export function componentMassByUnit(data: Record<string, unknown>) {
  const values = new Map<string, Set<number>>();
  const preferred = new Map<string, number>();
  for (const field of Array.isArray(data.fields) ? data.fields as CatalogField[] : []) {
    if (!positive(field.value) || /^MASS_KG(?:_PER_M)?:/.test(field.column)) continue;
    if (field.headerPath.some(label => /^PN\s*\d+$/i.test(label))) continue;
    const label = field.headerPath.at(-1) ?? "";
    const unit = /^(?:линейная масса|вес).*кг\s*\/\s*м/i.test(label) ? "м"
      : /^(?:масса(?: по (?:карточке|каталогу))?|вес),\s*кг$/i.test(label) ? "шт." : undefined;
    if (!unit) continue;
    if (field.column === "MASS_KG" || field.column === "MASS_KG_PER_M") preferred.set(unit, field.value);
    const masses = values.get(unit) ?? new Set<number>();
    masses.add(field.value);
    values.set(unit, masses);
  }
  for (const [unit, masses] of values) {
    if (masses.size === 1 && !preferred.has(unit)) preferred.set(unit, [...masses][0]);
  }
  return preferred;
}

export function withAssemblyMass(data: Record<string, unknown>, masses: ReadonlyMap<unknown, ReadonlyMap<string, number>>) {
  const calculation = data.calculation as { bom?: BillOfMaterialsLine[] } | undefined;
  if (!Array.isArray(calculation?.bom)) return data;
  const parts = calculation.bom.filter(line => !["welding", "painting", "machining", "threadCutting"].includes(line.kind ?? ""));
  if (!parts.length) return data;
  let total = 0;
  const missing = new Set<string>();
  for (const part of parts) {
    const mass = part.unit && masses.get(part.componentId)?.get(part.unit);
    if (positive(part.quantity) && positive(mass)) total += part.quantity * mass;
    else missing.add(part.componentId ?? "Позиция без каталожного ID");
  }
  if (missing.size) return { ...data, "Позиции без однозначной массы": [...missing] };
  return { ...data, "Расчётная масса деталей, кг": Number(total.toFixed(6)) };
}
