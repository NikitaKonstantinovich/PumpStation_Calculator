import { algorithmInfo, listAlgorithms } from "./algorithm-store-server";
import { algorithmForProject } from "./algorithm-schema";
import { catalogSnapshot } from "./catalog-server";
import { directProductInputs, nodeAssistantProject } from "./assistant-project";
import { productContexts } from "./product-state";
import type { ToolContext, WorkspaceData } from "./schema";
import { stationCatalogSnapshot } from "./station-catalog-server";
import { initializeAlgorithms, toolDefaults, toolProgram } from "./storage-server";
import { productEvaluator, toolAvailable } from "./workspace-controls";
import type { CatalogSource } from "./workspace-sources";
import type { UserRole } from "../user-types";

function page<T>(rows: T[], offset: number, size: number) {
  return { total: rows.length, offset, nextOffset: offset + size < rows.length ? offset + size : null, items: rows.slice(offset, offset + size) };
}
function search(value: string) { return value.toLocaleLowerCase("ru-RU").replaceAll("ё", "е").trim(); }

export async function searchPublishedAlgorithms(query: string, offset: number) {
  await initializeAlgorithms();
  const algorithms = await listAlgorithms(true);
  return page(algorithms.filter(({ id, name }) => search(`${id} ${name}`).includes(search(query)))
    .map(({ id, name, active, number }) => ({ id, name, version: active, publication: number })), offset, 15);
}

export async function readAlgorithmGraph(algorithmId: string, version: string | undefined, toolId: string, query: string, offset: number) {
  const program = await toolProgram(version, algorithmId, false);
  const { name } = await algorithmInfo(algorithmId);
  const scope = { algorithmId, name, version: program.version, origin: version ? "Закреплённая публикация проекта" : "Текущая публикация продукта" };
  const term = search(query);
  const tools = program.tools.filter(tool => search(`${tool.id} ${tool.name} ${tool.category}`).includes(term)).map(tool => ({
    id: tool.id, name: tool.name, category: tool.category, enabled: tool.enabled !== false,
    directInputs: directProductInputs(program, tool.id), dependencies: program.product?.dependencies[tool.id] ?? [],
  }));
  if (!toolId) return { ...scope, ...page(tools, offset, 15) };
  const requested = search(toolId);
  const tool = program.tools.find(item => search(item.id) === requested || search(item.name) === requested);
  const plan = tool && Object.hasOwn(program.plans, tool.id) ? program.plans[tool.id] : undefined;
  if (!tool || !plan) return { ...scope, message: "Укажите ID или точное название из найденных инструментов", ...page(tools, offset, 15) };
  const steps = plan.steps.filter(step => !term || search(`${step.id} ${step.operation ?? ""} ${step.fields.map(field => field.name).join(" ")}`).includes(term));
  const result = page(steps, offset, 6);
  return { ...scope, tool: tool.id, toolName: tool.name, directInputs: directProductInputs(program, tool.id), ...result, items: result.items.map(step => ({
    node: step.id, operation: step.operation ?? step.native ?? null,
    fields: step.fields.slice(0, 12).map(({ key, name, unit, direction }) => ({ key, name, unit, direction })),
    inputs: step.links.slice(0, 15).map(({ from, out, input }) => ({ from, out, input })),
    formulas: JSON.stringify(step.expressions).slice(0, 900),
    constants: Object.fromEntries(Object.entries(step.values).filter(([, value]) => value === null || typeof value === "number" || typeof value === "boolean").slice(0, 15)),
  })) };
}

export async function readSavedNodeWorkspace(data: WorkspaceData, role: UserRole) {
  const pins = data.product;
  if (!pins) throw new Error("Проекту требуется закреплённая версия продукта");
  const algorithmId = algorithmForProject(data);
  const [program, { defaults }, { name }] = await Promise.all([
    toolProgram(pins.version, algorithmId, false), toolDefaults(pins.baseVersions), algorithmInfo(algorithmId),
  ]);
  const resources: NonNullable<ToolContext["resources"]> = {};
  const available = new Set<CatalogSource>();
  const pump = pins.sourceVersions?.pump_catalog_v2, station = pins.sourceVersions?.station_catalog;
  await Promise.allSettled([
    pump && catalogSnapshot(pump).then(snapshot => { resources.pump_catalog_v2 = snapshot; available.add("pump_catalog_v2"); }),
    station && stationCatalogSnapshot(station, pins.baseVersions).then(snapshot => { resources.station_catalog = snapshot; available.add("station_catalog"); }),
  ]);
  const contexts = productContexts(program, data, defaults, role, resources);
  return nodeAssistantProject({ program, name, data, available, pendingInput: false,
    evaluate: productEvaluator(program, contexts), isAvailable: id => toolAvailable(program, id, contexts, available) });
}
