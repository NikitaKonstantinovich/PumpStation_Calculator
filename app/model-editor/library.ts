import { assemblyBounds, type Assembly, type Bounds, type Component, type Port } from "./model";

export type LibraryModel = {
  id: string; name: string; source: string; sources: string[]; categories: string[];
  sourceHash: string; units: "mm"; status: "ready" | "pending" | "error";
  bounds?: Bounds; meshUrl?: string; bytes?: number; ports: Port[]; warnings: string[]; error?: string;
};
export type ModelLibrary = { version: 1; models: LibraryModel[] };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
const validBounds = (value: unknown): value is Bounds => Array.isArray(value) && value.length === 6 && value.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e7) && [0, 1, 2].every(i => value[i + 3] > value[i]);

/** Public metadata is still validated before a URL or dimensions enter a project. */
export function parseModelLibrary(raw: unknown): ModelLibrary {
  const data = object(raw);
  if (data.version !== 1 || !Array.isArray(data.models) || data.models.length > 50000) throw new Error("Неизвестный формат библиотеки моделей");
  const ids = new Set<string>();
  const models = data.models.map(raw => {
    const row = object(raw);
    if (typeof row.id !== "string" || !/^[a-f0-9]{64}$/.test(row.id) || ids.has(row.id) || row.sourceHash !== row.id || row.units !== "mm"
      || typeof row.name !== "string" || typeof row.source !== "string" || !["ready", "pending", "error"].includes(String(row.status))) throw new Error("Некорректная запись библиотеки моделей");
    ids.add(row.id);
    if (row.status === "ready" && (!validBounds(row.bounds) || row.meshUrl !== `/model-assets/model-${row.id}-v1.stl`)) throw new Error(`Некорректная готовая модель: ${row.name}`);
    return { id: row.id, name: row.name, source: row.source, sources: strings(row.sources), categories: strings(row.categories), sourceHash: row.id, units: "mm" as const,
      status: row.status as LibraryModel["status"], bounds: validBounds(row.bounds) ? row.bounds : undefined, meshUrl: typeof row.meshUrl === "string" && row.status === "ready" ? row.meshUrl : undefined,
      bytes: typeof row.bytes === "number" && Number.isFinite(row.bytes) && row.bytes > 0 ? row.bytes : undefined,
      // Generic library assets do not receive guessed mounting points. Reviewed
      // catalogue profiles keep their ports through the separate manifest.
      ports: [], warnings: strings(row.warnings), error: typeof row.error === "string" ? row.error : undefined };
  });
  return { version: 1, models };
}

export function filterLibrary(models: LibraryModel[], search: string, category: string, status: string) {
  const words = search.toLocaleLowerCase("ru").trim().split(/\s+/).filter(Boolean);
  return models.filter(model => (!category || model.categories.includes(category)) && (!status || model.status === status)
    && words.every(word => `${model.name} ${model.sources.join(" ")} ${model.categories.join(" ")}`.toLocaleLowerCase("ru").includes(word)));
}

export function addLibraryModel(assembly: Assembly, model: LibraryModel, id: string): Assembly {
  if (assembly.components.length >= 500) throw new Error("В сборке уже 500 компонентов");
  if (!id || assembly.components.some(c => c.id === id)) throw new Error("Компонент с таким ID уже существует");
  if (model.status !== "ready" || !validBounds(model.bounds) || model.meshUrl !== `/model-assets/model-${model.sourceHash}-v1.stl`) throw new Error("Браузерная модель ещё не готова");
  const bounds: Bounds = [...model.bounds], occupied = assemblyBounds(assembly);
  const component: Component = {
    id, name: model.name, kind: "equipment", sourceKey: "manual",
    sourceNote: `Геометрия CAD, мм. Исходная ориентация сохранена. ${model.warnings.join(". ")}. Ручная компоновка; спецификация не изменяется`,
    cadSource: { path: model.source, hash: model.sourceHash }, bounds, meshUrl: model.meshUrl,
    position: [(occupied ? occupied[3] + 100 : 0) - bounds[0], -bounds[1], -bounds[2]], rotation: [0, 0, 0],
    hidden: false, opacity: 1, locked: false, ports: [],
    parameters: { length: bounds[3] - bounds[0], width: bounds[4] - bounds[1], height: bounds[5] - bounds[2], diameter: 50, routeOffset: 0 },
  };
  return { ...assembly, components: [...assembly.components, component] };
}
