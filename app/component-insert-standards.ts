import standards from "../data/component-insert-standards.json";

export type StandardFlatFlangeDimensions = (typeof standards.flangeDimensions)[number];

/**
 * Resolve only the catalog's explicitly encoded type-01 / series-1 steel flange.
 * These are dimensions of the part, not an assembly drawing or an axial addition.
 * An unfamiliar source revision or any different execution requires verification.
 */
export function selectStandardFlatFlangeDimensions(input: {
  name: string; dn: number; pn: number | null; material: string; sourceSha256: string;
}): StandardFlatFlangeDimensions | null {
  if (input.sourceSha256 !== standards.sourceSha256 || input.material !== "st20") return null;
  const designation = input.name.trim().match(/^Фланец\s+плоский\s+(\d+)-(\d+)-01-1-[BВ]-Ст\.?\s*20-IV(?:\s+ГОСТ\s*33259(?:-2015)?)?$/iu);
  if (!designation || Number(designation[1]) !== input.dn || Number(designation[2]) !== input.pn) return null;
  return standards.flangeDimensions.find(row => row.dn === input.dn && row.pn === input.pn && row.type === "01" && row.series === 1 && row.face === "B" && row.material === input.material) ?? null;
}
