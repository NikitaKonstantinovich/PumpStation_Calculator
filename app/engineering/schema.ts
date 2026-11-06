export type DataKind = "number" | "string" | "boolean" | "enum" | "reference" | "object" | "array";
export type Field = {
  key: string;
  name: string;
  kind: DataKind;
  meaning: string;
  unit: string;
  direction: "input" | "output" | "both";
  required?: boolean;
  initial?: unknown;
  options?: string[];
  min?: number;
  max?: number;
};
export type NodeType = {
  id: string;
  name: string;
  category: string;
  description: string;
  fields: Field[];
  formulas: Record<string, string>;
  native?: string;
  instrument?: string;
  section?: "input" | "edit" | "output";
};
export type GraphNode = {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  values: Record<string, unknown>;
  group?: string;
  catalog?: {
    id: string;
    name: string;
    overridden: string[];
  };
};
export type Edge = {
  from: string;
  out: string;
  to: string;
  input: string;
};
export type Diagram = {
  id: string;
  name: string;
  nodes: GraphNode[];
  edges: Edge[];
  groups: Record<string, string>;
};
export type Document = {
  schema: 1;
  types: NodeType[];
  diagrams: Diagram[];
};
export type Signature = {
  id: string;
  name: string;
  screen: string;
  file: string;
  args: Field[];
  result: Field;
};
export type Version = {
  id: string;
  author: string;
  created: string;
};
export type EditorState = {
  revision: number;
  active: string;
  draft: Document;
  versions: Version[];
  sources: Record<string, string>;
};
export const validKey = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z_][\w.-]{0,95}$/.test(value) && !["__proto__", "prototype", "constructor"].includes(value);
export const compatible = (a: Field, b: Field) => a.direction !== "input" && b.direction !== "output" && a.kind === b.kind && a.meaning === b.meaning && a.unit === b.unit;
export function accepts(field: Field, value: unknown): boolean {
  if (value == null) return !field.required;
  switch (field.kind) {
    case "number":
      return typeof value === "number" && Number.isFinite(value) && (field.min == null || value >= field.min) && (field.max == null || value <= field.max);
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && !Array.isArray(value);
    case "reference":
    case "string":
      return typeof value === "string";
    case "enum":
      return typeof value === "string" && !!field.options?.includes(value);
    case "boolean":
      return typeof value === "boolean";
  }
}
export function makeField(key: string, name: string, kind: DataKind = "number", meaning = key, unit = "", direction: Field["direction"] = "both"): Field {
  return {
    key,
    name,
    kind,
    meaning,
    unit,
    direction,
    ...(kind === "number" && (meaning === "dn" || meaning === "pn") ? {
      min: 1
    } : {})
  };
}
export function display(value: unknown) {
  if (value == null) return "Нет данных";
  if (typeof value === "object") return Array.isArray(value) ? "Массив · " + value.length : "Объект · " + Object.keys(value).length;
  return String(value);
}
