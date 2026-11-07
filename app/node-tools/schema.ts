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
export type ParameterBinding = {
  key: string;
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
  kind: "form" | "section" | "grid" | "field" | "condition" | "message";
  node: string;
  label: string;
  children?: View[];
  binding?: ParameterBinding;
  widget?: string;
  columns?: number;
  collapsible?: boolean;
  visible?: boolean;
  enabled?: boolean;
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
  tests: ToolTest[];
};
export type ToolDocument = Document & {
  tools: ToolDefinition[];
};
export type ToolProgram = {
  version: string;
  tools: Omit<ToolDefinition, "tests">[];
  plans: Record<string, Plan>;
};
export type ToolContext = {
  stored?: Values;
  values: Values;
  defaults: Values;
  role: UserRole;
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
};
export type WorkspaceData = {
  schema: 1;
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
