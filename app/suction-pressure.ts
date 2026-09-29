import type { SpecItem } from "./project-config";
import type { AssemblyComponent } from "./suction-catalog";
import { pressureCheckWarning, type InletPressureCheck } from "./dn-defaults";

export type PressureLimit = { bar: number; label: string };
const positive = (value: number) => Number.isFinite(value) && value > 0;
const values = (value: unknown): number[] => {
  const parts = String(value ?? "").replace(/,/g, ".").split("/").map(part => part.trim().replace(/^(?:PN|Ру)\s*/i, ""));
  return parts.every(part => /^\d+(?:\.\d+)?$/.test(part) && positive(Number(part))) ? parts.map(Number) : [];
};

// Read only explicit ratings, not required PN from a specification row or an
// instrument's measuring range. Unknown units and ambiguous ranges stay unknown.
export function componentPressureLimit(item?: AssemblyComponent): PressureLimit | null {
  if (!item) return null;
  const limits: PressureLimit[] = [];
  for (const field of item.fields) {
    const label = field.headerPath.at(-1) ?? "";
    if (/^(?:PN|Ру)$/i.test(label)) {
      const ratings = values(field.value);
      if (ratings.length) limits.push({ bar: Math.max(...ratings), label: `PN${Math.max(...ratings)}` });
    }
    if (/^(?:Максимальное|Допустимое|Макс\.) (?:рабочее )?давление,\s*(бар|МПа)$/i.test(label)) {
      const ratings = values(field.value);
      if (ratings.length === 1) {
        const bar = ratings[0] * (/МПа$/i.test(label) ? 10 : 1);
        limits.push({ bar, label: `${bar.toLocaleString("ru-RU")} бар` });
      }
    }
  }
  // Some source tables keep PN in the family/header instead of a separate cell.
  if (!limits.length) {
    const text = [item.family, ...item.fields.flatMap(field => field.headerPath)].join(" ");
    const ratings = [...text.matchAll(/\bPN\s*(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)*)/gi)].flatMap(match => values(match[1]));
    if (ratings.length) limits.push({ bar: Math.max(...ratings), label: `PN${Math.max(...ratings)}` });
  }
  return limits.sort((a, b) => a.bar - b.bar)[0] ?? null;
}

export function withInletPressureChecks(item: SpecItem, checks: InletPressureCheck[]): SpecItem {
  const baseStatus = item.inletPressureCheck?.baseStatus ?? item.status;
  return { ...item, status: checks.some(pressureCheckWarning) ? "confirmation" : baseStatus, inletPressureCheck: { baseStatus, checks } };
}
