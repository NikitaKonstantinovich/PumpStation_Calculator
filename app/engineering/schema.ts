export type DataKind = "number" | "float" | "int" | "string" | "boolean" | "enum" | "reference" | "object" | "array";
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
  optionNames?: Record<string,string>;
  shape?: Field[];
  item?: Field;
  min?: number;
  max?: number;
};
export type ParameterSource = {
  mode: "user" | "fixed" | "computed" | "source";
  value?: unknown;
  registry?: "workspace2" | "base-values";
  /** An exact key or object path. $. prefixes the current Instrument scope. */
  attribute?: string;
};
export type NodeType = {
  id: string;
  name: string;
  category: string;
  description: string;
  fields: Field[];
  formulas: Record<string, string>;
  operation?: string;
  parameter?: {key:string; field:Field; permission:"input"|"options"|"all"; defaultKey?:string; source?:ParameterSource};
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
  kind?: "data"|"binding"|"command";
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
function sameValueType(a:Field,b:Field):boolean {
  return a.kind===b.kind && a.meaning===b.meaning && a.unit===b.unit && (!b.item || !!a.item && sameValueType(a.item,b.item)) && (!b.shape || !!a.shape && b.shape.every(field=>{const source=a.shape!.find(f=>f.key===field.key);return !!source&&sameValueType(source,field);}));
}
export const compatible = (a: Field, b: Field) => a.direction !== "input" && b.direction !== "output" && sameValueType(a,b);
export function accepts(field: Field, value: unknown): boolean {
  if (value == null) return !field.required;
  switch (field.kind) {
    case "int":
      return typeof value==="number" && Number.isSafeInteger(value) && (field.min==null||value>=field.min) && (field.max==null||value<=field.max);
    case "float":
    case "number":
      return typeof value === "number" && Number.isFinite(value) && (field.min == null || value >= field.min) && (field.max == null || value <= field.max);
    case "array":
      return Array.isArray(value) && (!field.item || value.every(v=>accepts(field.item!,v)));
    case "object":
      return typeof value === "object" && !Array.isArray(value) && (!field.shape || field.shape.every(f=>accepts(f,(value as Record<string,unknown>)[f.key])));
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
