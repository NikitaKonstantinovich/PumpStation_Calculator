import type { ProjectConfig, SpecEntity } from "../project-config";

export type ModelRequestItem = { key: string; equipmentId: string; name: string; position: string; quantity: number };

/** Stable catalogue IDs, never filenames supplied by the browser. */
export function specificationModels(project: ProjectConfig): ModelRequestItem[] {
  return ((project.entities["station-spec"] as SpecEntity)?.items ?? []).filter(item => item.quantity > 0).map(item => ({
    key: item.equipmentId ? `${item.section === "pump" || /^насос\s/i.test(item.name) ? "pump" : "equipment"}:${item.equipmentId}` : "",
    equipmentId: item.equipmentId ?? "", name: item.name, position: item.position, quantity: item.quantity,
  }));
}
