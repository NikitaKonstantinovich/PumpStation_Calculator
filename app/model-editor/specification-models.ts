import type { ProjectConfig, SpecEntity } from "../project-config";
import type { CollectorsEntity } from "../collector-project";
import type { Assembly } from "./model";
import { pumpHasNonRoundFlange, type Pump } from "../pump-catalog";
import { preparedPumpCadIsNonRoundVariant } from "./prepared-pump-cad";

export type ModelRequestItem = { key: string; equipmentId: string; name: string; position: string; quantity: number };

/** Stable catalogue IDs, never filenames supplied by the browser. */
export function specificationModels(project: ProjectConfig): ModelRequestItem[] {
  return ((project.entities["station-spec"] as SpecEntity)?.items ?? []).filter(item => item.quantity > 0&&!item.hydraulicPart).map(item => ({
    key: item.equipmentId ? `${item.section === "pump" || /^насос\s/i.test(item.name) ? "pump" : "equipment"}:${item.equipmentId}` : "",
    equipmentId: item.equipmentId ?? "", name: item.name, position: item.position, quantity: item.quantity,
  }));
}

export function availableSpecificationPumpKeys(assembly: Assembly): Set<string> {
  return new Set(assembly.components.flatMap(component => {
    if (!component.equipmentId || !component.cadSource || !component.meshUrl?.startsWith("/model-assets/")) return [];
    return component.kind === "pump" || component.sourceKey?.startsWith("pump:") ? [`pump:${component.equipmentId}`] : [];
  }));
}

export function specificationPreparationItems(items: ModelRequestItem[], catalogue: Pump[], availablePumpKeys: ReadonlySet<string>) {
  const unavailable = new Set(catalogue.filter(pumpHasNonRoundFlange).map(pump => `pump:${pump.id}`));
  return items.filter(item => !availablePumpKeys.has(item.key) && !unavailable.has(item.key) &&
    !(item.key.startsWith("pump:") && preparedPumpCadIsNonRoundVariant(item.equipmentId)));
}

export function lineGeometryIds(project: ProjectConfig): string[] {
  const collectors = project.entities["station-collectors"] as CollectorsEntity;
  return [...new Set([...specificationModels(project).map(i => i.equipmentId), ...[collectors.suction, collectors.discharge].flatMap(c => c.calculation?.bom.map(r => r.componentId ?? "") ?? [])].filter(Boolean))].sort();
}
