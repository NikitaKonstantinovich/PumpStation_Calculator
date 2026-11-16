import type { ToolDocument } from "./schema";

export const DEFAULT_ALGORITHM = "pump-station";
export type Algorithm = {
  id: string; name: string; connected: boolean; revision: number; active: string;
  number: number; created: string; updated: string; saved: string; hasDraft: boolean;
};
export type AlgorithmVersion = {
  id: string; algorithmId: string; number: number; created: string; author: string;
  reason: "save" | "restore" | "copy" | "create" | "migration";
  sourceAlgorithm: string | null; sourceVersion: string | null;
};
export const algorithmForProject = (data?: { algorithmId?:string; product?: { algorithmId?: string } }) => data?.algorithmId ?? data?.product?.algorithmId ?? DEFAULT_ALGORITHM;
export function emptyAlgorithm(): ToolDocument {
  return { schema: 1, types: [], tools: [], product: { root: "tools" }, diagrams: [
    { id: "tools", name: "Инструменты продукта", nodes: [], edges: [], groups: {} }
  ] };
}
