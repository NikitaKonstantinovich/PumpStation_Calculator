import type { Document, Field } from "../engineering/schema";
import type { Plan, Trace } from "../engineering/engine";
import type { UserRole } from "../user-types";
export type Values = Record<string, unknown>;
export type Diagnostic = {
  key: string;
  node: string;
  message: string;
  severity: "error" | "warning";
};
export const diagnosticKey = (issue: Diagnostic) => JSON.stringify([issue.node, issue.key, issue.severity, issue.message]);
export type ParameterBinding = {
  key: string;
  toolId?: string;
  field: Field;
  permission: "input" | "options" | "all";
  editable: boolean;
  active: boolean;
  origin: string;
  value: unknown;
  node: string;
  mode?: "user" | "fixed" | "computed" | "source";
  source?: {registry:"workspace2"|"base-values";attribute:string};
};
export type View = {
  kind: "form" | "section" | "grid" | "field" | "condition" | "message" | "table" | "select" | "pump-card";
  node: string;
  label: string;
  rows?:Record<string,unknown>[];
  options?:{value:string;label:string}[];
  columnsSpec?:{key:string;label:string;unit?:string}[];
  selection?:{snapshotId:string;requestKey:string;variantId:string|null;valid:boolean;stale?:boolean;message?:string};
  total?:number;
  children?: View[];
  binding?: ParameterBinding;
  widget?: string;
  columns?: number;
  collapsible?: boolean;
  visible?: boolean;
  enabled?: boolean;
  showOrigin?: boolean;
  hint?: string;
  width?: number;
  issues?: Diagnostic[];
  command?: {
    kind: "save";
    source: "workspace2";
  };
};
export type ToolTest = {
  id: string;
  name: string;
  diagram?: string;
  inputs?: Values;
  values: Values;
  role?: UserRole;
  expected?: Values;
  errors?: string[];
  tolerance?: number;
};
export type ToolDefinition = {
  id: string;
  name: string;
  category: string;
  diagram: string;
  order?:number;
  enabled?:boolean;
  tests: ToolTest[];
};
export type ToolDocument = Document & {
  tools: ToolDefinition[];
  product?:{root:string};
};
export type ToolProgram = {
  version: string;
  product?:{root:string;dependencies:Record<string,string[]>};
  tools: Omit<ToolDefinition, "tests">[];
  plans: Record<string, Plan>;
};
export type ToolContext = {
  stored?: Values;
  values: Values;
  defaults: Values;
  role: UserRole;
  algorithmVersion?:string;
  resources?:{pump_catalog_v2?:import("./catalog-schema").CatalogSnapshot};
};
export type Evaluation = {
  value: unknown;
  view: View;
  issues: Diagnostic[];
  bindings: ParameterBinding[];
  trace: Trace;
};
export type SavedTool = {
  version: string;
  values: Values;
  baseVersions: Record<string, string>;
  sourceVersions?:Record<string,string>;
};
export type WorkspaceData = {
  schema: 1;
  product?:{version:string;baseVersions:Record<string,string>;sourceVersions?:Record<string,string>};
  tools: Record<string, SavedTool>;
};
export type TestResult = {
  inputs?: Values;
  expected?: unknown;
  actual?: unknown;
  node?: string;
  id: string;
  name: string;
  passed: boolean;
  message: string;
};
export const ROOT = "tools";
export const API = "/api/admin/node-tools";
export const safeId = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z_][\w.-]{0,95}$/.test(v) && !["constructor", "prototype", "__proto__"].includes(v);
