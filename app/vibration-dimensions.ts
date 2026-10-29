import type { BindingCatalog } from "./collector-catalog";
import type { AssemblyComponent } from "./suction-catalog";

export const VIBRATION_REFERENCE_COLUMN = "KMS_MOUNTING_REFERENCE";
export const VIBRATION_DIMENSIONS_REVISION = "kms-mounting-v1";
const prefix = "KMS_MOUNTING_", referenceId = "dendor-kms-mounting-2026-10-28";
export type VibrationCad = { source: string; sourceHash: string; bounds: number[]; planesMm: number[]; matingAreasMm2: number[]; lengthMm: number };
export type VibrationExecution = { pn: number; source: string; status: "confirmed" | "ambiguous" | "missing"; candidateLengthsMm: number[]; reason: string; lengthMm?: number; separateGasket?: boolean; sealingSource?: string; cad?: VibrationCad; cadReview?: VibrationCad };
type ReferenceRow = { componentId: string; family: string; tableId: string; dn: number; executions: VibrationExecution[] };
type Reference = { version: number; id: string; sourceSha256: string; rows: ReferenceRow[] };
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const itemDn = (item: AssemblyComponent) => { const fields = item.fields.filter(field => field.headerPath.at(-1) === "DN"); return fields.length === 1 ? Number(String(fields[0].value).match(/\d+/)?.[0]) : NaN; };
const matches = (item: AssemblyComponent, row: ReferenceRow) => row.componentId === item.id && item.catalogId === "компенсаторы" && row.family === item.family && itemDn(item) === row.dn;

/** Persist exact PN-specific lengths; no generic L can leak into PN25. */
export function mergeVibrationDimensions(input: BindingCatalog, raw: unknown): BindingCatalog {
  const reference = raw as Reference, data = structuredClone(input);
  if (reference.version !== 1 || reference.id !== referenceId || !/^[a-f0-9]{64}$/.test(reference.sourceSha256)) throw new Error("Invalid KMS reference");
  if (data.source.sha256 !== reference.sourceSha256) return data;
  for (const row of reference.rows) {
    if (!positive(row.dn) || new Set(row.executions.map(e => e.pn)).size !== row.executions.length || row.executions.some(e =>
      ![10,16,25].includes(e.pn) || !["confirmed","ambiguous","missing"].includes(e.status) || !e.source || !e.reason || !e.candidateLengthsMm.every(positive) ||
      e.status === "confirmed" && (!positive(e.lengthMm) || !e.candidateLengthsMm.includes(e.lengthMm)) ||
      e.cad && (!/^[a-f0-9]{64}$/.test(e.cad.sourceHash) || e.cad.bounds.length !== 6 || !e.cad.bounds.every(Number.isFinite) || e.cad.planesMm.length !== 2 || !e.cad.planesMm.every(Number.isFinite) ||
        !positive(e.lengthMm) || Math.abs(e.cad.lengthMm - e.lengthMm) > .01 || Math.abs(e.cad.planesMm[1] - e.cad.planesMm[0] - e.lengthMm) > .01))) throw new Error(`Invalid KMS execution: ${row.componentId}`);
  }
  for (const item of data.items) {
    const row = reference.rows.find(row => matches(item, row) && item.tableId === row.tableId);
    if (!row) continue;
    item.fields = item.fields.filter(field => !field.column.startsWith(prefix));
    item.fields.push({ column: VIBRATION_REFERENCE_COLUMN, headerPath: ["Источник URL монтажных данных KMS"], value: JSON.stringify({ referenceId: reference.id, ...row }) });
    for (const execution of row.executions) {
      if (execution.status === "confirmed") item.fields.push({ column: `${prefix}PN${execution.pn}_L`, headerPath: [`Монтажная длина PN${execution.pn}, мм`], value: execution.lengthMm });
      item.fields.push({ column: `${prefix}PN${execution.pn}_STATUS`, headerPath: [`Подтверждение PN${execution.pn}`], value: execution.reason });
      item.fields.push({ column: `${prefix}PN${execution.pn}_SOURCE`, headerPath: [`Документация PN${execution.pn}`], value: execution.source });
    }
  }
  return data;
}

export function vibrationExecutions(item: AssemblyComponent): VibrationExecution[] {
  const value = item.fields.find(field => field.column === VIBRATION_REFERENCE_COLUMN)?.value;
  if (typeof value !== "string") return [];
  try { const row = JSON.parse(value) as ReferenceRow & { referenceId: string }; return row.referenceId === referenceId && matches(item, row) && Array.isArray(row.executions) ? row.executions : []; }
  catch { return []; }
}
export function vibrationExecution(item: AssemblyComponent, pn: number) {
  return vibrationExecutions(item).find(execution => execution.pn === pn);
}
