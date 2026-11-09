import type { WorkspaceData } from "./schema";
import { safeId } from "./schema";
export function parseWorkspaceData(raw: unknown): WorkspaceData | undefined {
  if (raw == null) return undefined;
  const data = raw as WorkspaceData;
  if(data.algorithmId != null && (typeof data.algorithmId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(data.algorithmId)))throw Error("Некорректный ID алгоритма");
  if(data.algorithmId && data.product?.algorithmId && data.algorithmId!==data.product.algorithmId)throw Error("Противоречивые ссылки на алгоритм");
  if (data.schema !== 1 || !data.tools || typeof data.tools !== "object" || Array.isArray(data.tools) || Object.keys(data.tools).length > 30) throw Error("Некорректные данные Workspace 2");
  for (const [key, tool] of Object.entries(data.tools)) {
    if (!safeId(key) || !tool || typeof tool.version !== "string" || !tool.version.length || tool.version.length > 100 || !tool.values || typeof tool.values !== "object" || Array.isArray(tool.values) || Object.keys(tool.values).length > 500) throw Error("Некорректные параметры инструмента");
    if (Object.keys(tool.values).some(k => !safeId(k))) throw Error("Некорректный идентификатор параметра");
    if (!tool.baseVersions || Object.values(tool.baseVersions).some(v => typeof v !== "string" || v.length > 100)) throw Error("Не указаны версии базовых значений");
  }
  const refs = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.entries(value).some(([key, v]) => !safeId(key) || typeof v !== "string" || !v.length || v.length > 100)) throw Error("Некорректные версии источников");
  };
  if (data.product) {
    if (data.product.algorithmId != null && (typeof data.product.algorithmId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(data.product.algorithmId))) throw Error("Некорректный ID алгоритма");
    if (typeof data.product.version !== "string" || !data.product.version || data.product.version.length > 100) throw Error("Не указана версия продукта");
    refs(data.product.baseVersions);
    if (data.product.sourceVersions) refs(data.product.sourceVersions);
  }
  for (const tool of Object.values(data.tools)) if (tool.sourceVersions) refs(tool.sourceVersions);
  return structuredClone(data);
}
