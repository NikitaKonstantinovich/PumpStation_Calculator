import type { ProjectConfig, SpecEntity } from "../project-config";
import type { CollectorsEntity } from "../collector-project";

export type ModelRequestItem = { key: string; equipmentId: string; name: string; position: string; quantity: number };

/** Stable catalogue IDs, never filenames supplied by the browser. */
export function specificationModels(project: ProjectConfig): ModelRequestItem[] {
  return ((project.entities["station-spec"] as SpecEntity)?.items ?? []).filter(item => item.quantity > 0).map(item => ({
    key: item.equipmentId ? `${item.section === "pump" || /^насос\s/i.test(item.name) ? "pump" : "equipment"}:${item.equipmentId}` : "",
    equipmentId: item.equipmentId ?? "", name: item.name, position: item.position, quantity: item.quantity,
  }));
}

export function lineGeometryIds(project: ProjectConfig): string[] {
  const collectors = project.entities["station-collectors"] as CollectorsEntity;
  return [...new Set([...specificationModels(project).map(i => i.equipmentId), ...[collectors.suction, collectors.discharge].flatMap(c => c.calculation?.bom.map(r => r.componentId ?? "") ?? [])].filter(Boolean))].sort();
}
