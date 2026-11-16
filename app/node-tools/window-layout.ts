import type { PanelState, WorkspaceGrid, WorkspaceMode } from "../project-config";
export type ProductWindow = PanelState<string>;
export type ProductLayout = { schema: 1; windows: ProductWindow[]; mode: WorkspaceMode; zoom: number; grid: WorkspaceGrid; gridHeightScreens: number };
export const layoutKey = (user: string, algorithm: string, project: string) => "product-windows/1/" + [user, algorithm, project].map(encodeURIComponent).join("/");
export function newWindow(id: string, tool?: string, index = 0): ProductWindow {
  return { id, activeTool: tool, entityId: tool ?? "", minimized:false, x: 20 + index * 36, y: 16 + index * 36, w: 760, h: 600, z: index + 1 };
}
export function initialLayout(first?: string): ProductLayout {
  return { schema: 1, windows: first ? [newWindow("initial", first)] : [], mode: "free", zoom: 100, gridHeightScreens: 1, grid: { columns: 2, rows: 2, columnSizes: [1, 1], rowSizes: [1, 1], cells: first ? ["initial", null, null, null] : [null, null, null, null] } };
}
const bounded = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
export function readLayout(raw: string | null, first?: string): ProductLayout {
  if (!raw) return initialLayout(first);
  try {
    const value = JSON.parse(raw) as ProductLayout;
    if (value.schema !== 1 || !Array.isArray(value.windows) || value.windows.length > 40) return initialLayout(first);
    const ids = new Set<string>();
    const windows = value.windows.filter(w => w && typeof w.id === "string" && !ids.has(w.id) && !!ids.add(w.id)).map(w => ({
      ...newWindow(w.id), activeTool: typeof w.activeTool === "string" ? w.activeTool : undefined, entityId: typeof w.activeTool === "string" ? w.activeTool : "", minimized: w.minimized === true,
      x: bounded(w.x, 20, 0, 12000), y: bounded(w.y, 16, 0, 12000), w: bounded(w.w, 760, 280, 4000), h: bounded(w.h, 600, 220, 4000), z: bounded(w.z, 1, 0, 1000000)
    }));
    const columns = Math.round(bounded(value.grid?.columns, 2, 1, 6)), rows = Math.round(bounded(value.grid?.rows, 2, 1, 6));
    const assigned = new Set<string>();
    const cells = Array.from({ length: rows * columns }, (_, i) => {
      const id = value.grid?.cells?.[i];
      return typeof id === "string" && ids.has(id) && !assigned.has(id) && assigned.add(id) ? id : null;
    });
    return { schema: 1, windows, mode: value.mode === "grid" || value.mode === "mobile" ? value.mode : "free", zoom: bounded(value.zoom, 100, 50, 150), gridHeightScreens: bounded(value.gridHeightScreens, 1, .1, 10), grid: { columns, rows, cells, columnSizes: Array.from({length: columns}, (_, i) => bounded(value.grid?.columnSizes?.[i], 1, .1, 10)), rowSizes: Array.from({length: rows}, (_, i) => bounded(value.grid?.rowSizes?.[i], 1, .1, 10)) } };
  } catch { return initialLayout(first); }
}
export function fitGrid(layout: ProductLayout, columns = layout.grid.columns, rows = layout.grid.rows): ProductLayout {
  const visible = layout.windows.filter(w => !w.minimized);
  const assigned = layout.grid.cells.filter((id): id is string => !!id && visible.some(w => w.id === id));
  const ordered = [...assigned, ...visible.map(w => w.id).filter(id => !assigned.includes(id))];
  const cells = Array.from({length: columns * rows}, (_, i) => ordered[i] ?? null);
  return { ...layout, mode: "grid", windows: layout.windows.map(w => !w.minimized && !cells.includes(w.id) ? {...w, minimized: true} : w), grid: { columns, rows, cells, columnSizes: Array.from({length:columns}, (_,i) => layout.grid.columns === columns ? layout.grid.columnSizes[i] : 1), rowSizes: Array.from({length:rows}, (_,i) => layout.grid.rows === rows ? layout.grid.rowSizes[i] : 1) } };
}
export function closeWindow(layout: ProductLayout, id: string): ProductLayout {
  return {...layout, windows:layout.windows.filter(w=>w.id!==id), grid:{...layout.grid,cells:layout.grid.cells.map(cell=>cell===id?null:cell)}};
}
