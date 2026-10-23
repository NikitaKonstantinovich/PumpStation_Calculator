import type { InsertCalculation } from "./component-insert-calculations";

export type InsertResultRow = InsertCalculation & {
  isNew: boolean;
  existingId: string | null;
  conflict: string | null;
  exportable: boolean;
};
export type InsertExportResult = {
  created: number;
  updated: number;
  failed: Array<{ key: string; reason: string }>;
  rows: InsertResultRow[];
  catalogVersion: string;
  stale?: boolean;
};
