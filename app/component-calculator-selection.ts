import type { InsertResultRow } from "./component-insert-types";
export type { InsertResultRow } from "./component-insert-types";
export type InsertFilters = { query: string; dnLarge: string; dnSmall: string; pn: string; material: string; geometry: string; nipple: string; status: string };
export const emptyInsertFilters: InsertFilters = { query: "", dnLarge: "", dnSmall: "", pn: "", material: "", geometry: "", nipple: "", status: "" };

export function filterInsertRows<T extends InsertResultRow>(rows: T[], filters: InsertFilters): T[] {
  const needle = filters.query.trim().toLocaleLowerCase("ru-RU");
  return rows.filter(row => (!needle || row.name.toLocaleLowerCase("ru-RU").includes(needle))
    && (!filters.dnLarge || String(row.dnLarge) === filters.dnLarge)
    && (!filters.dnSmall || String(row.dnSmall) === filters.dnSmall)
    && (!filters.pn || String(row.pn) === filters.pn)
    && (!filters.material || row.material === filters.material)
    && (!filters.geometry || row.geometry === filters.geometry)
    && (!filters.nipple || row.withSensorNipple === (filters.nipple === "yes"))
    && (!filters.status || (filters.status === "new" ? row.isNew : !row.isNew)));
}

// Call with all filtered rows, before slicing the current page. Hidden selections persist.
export function selectInsertRows(selected: ReadonlySet<string>, filtered: InsertResultRow[], action: "all" | "none" | "new"): Set<string> {
  const next = new Set(selected);
  for (const row of filtered) {
    if (action === "none") next.delete(row.identityKey);
    else if (row.exportable && (action === "all" || row.isNew)) next.add(row.identityKey);
  }
  return next;
}

export function insertSelectionCounts(selected: ReadonlySet<string>, filtered: InsertResultRow[]) {
  const visible = filtered.filter(row => selected.has(row.identityKey)).length;
  return { total: selected.size, visible, hidden: selected.size - visible };
}
