import { makeField, type NodeType } from "../engineering/schema";
import type { Step } from "../engineering/engine";
import type { AppliedBaseValues } from "../base-values";
import type { ComponentsDatabase } from "../component-database-types";
import type { CollectorCatalog } from "../collector-calculations";
import type { ControlCabinet } from "../control-cabinet-selection";
import type { SmartCabinet } from "../smart-cabinet-types";
import type { ToolContext, ToolProgram, Values } from "./schema";

export type StationCatalogResources = {
  id: string;
  sourceId: "station_catalog";
  components: ComponentsDatabase;
  cabinets: ControlCabinet[];
  smartCabinets: SmartCabinet[];
  collectorCatalog: CollectorCatalog;
  baseSettings: AppliedBaseValues;
};
export const usesStationCatalog = (program: ToolProgram) => Object.values(program.plans).some(plan => plan.steps.some(step => step.operation === "engineering.catalog"));
export function stationCatalogNodeTypes(): NodeType[] {
  return [{ id: "engineering.catalog", name: "Справочники комплектации", category: "Данные и правила", description: "Закреплённый снимок комплектующих, шкафов, коллекторов и базовых правил. Обновляется явно вместе с источниками продукта.", operation: "engineering.catalog", formulas: {}, fields: [
    ...[["resources", "Справочники комплектации", "stationCatalogResources"], ["components", "Комплектующие", "componentsDatabase"], ["catalog", "Каталог коллекторов", "collectorCatalog"], ["baseSettings", "Базовые правила проекта", "baseSettings"]].map(([key, name, meaning]) => ({ ...makeField(key, name, "object", meaning), direction: "output" as const })),
    { ...makeField("issues", "Проверки источника", "array", "diagnostics"), direction: "output" }
  ] }];
}
export function executeStationCatalog(step: Step, _values: Values, context: ToolContext): Values | undefined {
  if (step.operation !== "engineering.catalog") return undefined;
  const resource = context.resources?.station_catalog;
  if (!resource) return { resources: null, components: null, catalog: null, baseSettings: null, issues: [{ key: "", node: step.id, severity: "warning", message: "Справочники комплектации не загружены. Обновите источники продукта." }] };
  return { resources: resource, components: resource.components, catalog: resource.collectorCatalog, baseSettings: resource.baseSettings, issues: [] };
}

export async function loadStationCatalog(id?: string, base?: Record<string, string>, signal?: AbortSignal): Promise<StationCatalogResources> {
  const query = new URLSearchParams();
  if (id) query.set("snapshot", id);
  if (base) query.set("base", JSON.stringify(base));
  const response = await fetch("/api/node-station-catalog?" + query, { cache: "no-store", signal });
  const data = await response.json() as { error?: string; snapshot?: StationCatalogResources };
  if (!response.ok) throw Error(data.error || "Не удалось загрузить справочники комплектации");
  validateStationCatalog(data.snapshot);
  if (id && data.snapshot.id !== id) throw Error("Источник вернул другой снимок справочников");
  if (base && JSON.stringify(Object.entries(base).sort()) !== JSON.stringify(Object.entries(data.snapshot.baseSettings.versions).sort())) throw Error("Базовые правила источника не соответствуют запрошенной версии");
  return data.snapshot;
}
export function validateStationCatalog(value: unknown): asserts value is StationCatalogResources {
  const s = value as StationCatalogResources | null;
  if (!s || s.sourceId !== "station_catalog" || !/^[a-f0-9]{64}$/.test(s.id) || !Array.isArray(s.components?.items) || !Array.isArray(s.components?.catalogs) || !Array.isArray(s.cabinets) || !Array.isArray(s.smartCabinets) || !s.collectorCatalog?.version || !s.baseSettings?.versions || !Array.isArray(s.baseSettings.values?.velocity)) throw Error("Некорректный снимок справочников комплектации");
}
