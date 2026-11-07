import type { WorkspaceData } from "./schema";
import { safeId } from "./schema";
export function parseWorkspaceData(raw: unknown): WorkspaceData | undefined {
  if (raw == null) return undefined;
  const data = raw as WorkspaceData;
  if (data.schema !== 1 || !data.tools || typeof data.tools !== "object" || Array.isArray(data.tools) || Object.keys(data.tools).length > 30) throw Error("Некорректные данные Workspace 2");
  for (const [key, tool] of Object.entries(data.tools)) {
    if (!safeId(key) || !tool || typeof tool.version !== "string" || !tool.version.length || tool.version.length > 100 || !tool.values || typeof tool.values !== "object" || Array.isArray(tool.values) || Object.keys(tool.values).length > 500) throw Error("Некорректные параметры инструмента");
    if (Object.keys(tool.values).some(k => !safeId(k))) throw Error("Некорректный идентификатор параметра");
    if (!tool.baseVersions || Object.values(tool.baseVersions).some(v => typeof v !== "string" || v.length > 100)) throw Error("Не указаны версии базовых значений");
  }
  return structuredClone(data);
}
