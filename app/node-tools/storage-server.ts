import { accepts } from "../engineering/schema";
import { db } from "../auth-server";
import { compileTools, runTests } from "./compiler";
import { initialTools } from "./factory";
import { baseSnapshot, type AppliedBaseValues } from "../base-values";
import { currentBasePublication, resolveBaseVersions } from "../base-values-server";
import { defaultProjectSettings } from "../default-settings";
import { evaluatePlan, canEditParameter } from "./runtime";
import type { ToolContext, ToolDocument, ToolProgram, Values, WorkspaceData } from "./schema";
import type { UserRole } from "../user-types";
export class ToolError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}
const FACTORY = "node-tools-v1";
const compiledCache = new Map<string, ToolProgram>();
async function stateRow() {
  const row = await db().prepare("SELECT revision,active,draft FROM node_tool_state WHERE id=1").first<{
    revision: number;
    active: string | null;
    draft: string | null;
  }>();
  if (!row) throw new ToolError("Примените миграцию 0017_node_tools.sql", 503);
  return row;
}
async function seed() {
  const row = await stateRow();
  if (row.revision === 0 && !row.active && !row.draft) {
    const base = await currentBasePublication();
    const doc = initialTools(Object.keys(base.values.financial.discounts).filter(k => /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(k))),
      program = compileTools(doc, FACTORY);
    await db().batch([db().prepare("INSERT OR IGNORE INTO node_tool_versions(id,document,program,author) VALUES(?,?,?,?)").bind(FACTORY, JSON.stringify(doc), JSON.stringify(program), "Заводской инструмент"), db().prepare("UPDATE node_tool_state SET active=? WHERE id=1 AND revision=0 AND active IS NULL AND draft IS NULL").bind(FACTORY)]);
  }
}
export async function toolState() {
  await seed();
  const row = await stateRow();
  const versions = await db().prepare("SELECT id,author,created FROM node_tool_versions ORDER BY rowid DESC").all();
  let doc: ToolDocument;
  if (row.draft) doc = JSON.parse(row.draft);else if (row.active) {
    const saved = await db().prepare("SELECT document FROM node_tool_versions WHERE id=?").bind(row.active).first<{
      document: string;
    }>();
    doc = saved ? JSON.parse(saved.document) : initialTools();
  } else doc = {
    schema: 1,
    types: [],
    diagrams: [],
    tools: []
  };
  return {
    ...row,
    draft: doc,
    versions: versions.results ?? []
  };
}
export async function toolProgram(version?: string | null): Promise<ToolProgram> {
  await seed();
  const id = version || (await stateRow()).active;
  if (!id) return {
    version: "",
    tools: [],
    plans: {}
  };
  const cached = compiledCache.get(id);
  if (cached) return cached;
  const row = await db().prepare("SELECT program FROM node_tool_versions WHERE id=?").bind(id).first<{
    program: string;
  }>();
  if (!row) throw new ToolError("Версия инструмента отсутствует", 404);
  const program = JSON.parse(row.program) as ToolProgram;
  if (compiledCache.size >= 20) compiledCache.delete(compiledCache.keys().next().value!);
  compiledCache.set(id, program);
  return program;
}
export function defaultsFrom(applied: AppliedBaseValues): Values {
  const settings = defaultProjectSettings(applied);
  return {
    ...settings,
    membraneTankVolume: String(settings.membraneTankVolume),
    ...Object.fromEntries(Object.entries(settings.manufacturerDiscounts).map(([k, v]) => ["discount_" + k, v]))
  };
}
export async function toolDefaults(versions?: Record<string, string>) {
  const applied = versions ? await resolveBaseVersions(versions as AppliedBaseValues["versions"]) : await currentBasePublication().then(p => baseSnapshot(p.id, p.values));
  return {
    defaults: defaultsFrom(applied),
    baseVersions: applied.versions
  };
}
export async function toolCommand(body: {
  action: string;
  revision: number;
  document?: ToolDocument;
  version?: string;
  tool?: string;
  values?: Values;
  role?: UserRole;
}, author: string) {
  await seed();
  const state = await stateRow();
  if (!Number.isSafeInteger(body.revision) || body.revision !== state.revision) throw new ToolError("Черновик изменён в другом окне. Загрузите актуальную ревизию.", 409);
  const conflict = () => new ToolError("Черновик изменён в другом окне.", 409);
  if (body.action === "rollback") {
    const row = await db().prepare("SELECT document FROM node_tool_versions WHERE id=?").bind(body.version ?? "").first<{
      document: string;
    }>();
    if (!row) throw new ToolError("Версия отсутствует", 404);
    const changed = await db().prepare("UPDATE node_tool_state SET active=?,draft=?,revision=revision+1 WHERE id=1 AND revision=?").bind(body.version, row.document, body.revision).run();
    if (changed.meta?.changes !== 1) throw conflict();
    return toolState();
  }
  if (!["save", "test", "publish"].includes(body.action) || !body.document) throw new ToolError("Некорректная команда");
  const doc = body.document,
    program = compileTools(doc, "draft", body.action !== "save");
  const context: ToolContext = {
    values: body.values ?? {},
    defaults: (await toolDefaults()).defaults,
    role: body.role ?? "pro"
  };
  if (body.action === "test") {
    const tool = doc.tools.find(t => t.id === (body.tool ?? doc.tools[0]?.id));
    if (!tool) throw new ToolError("Инструмент не выбран");
    const result = evaluatePlan(program.plans[tool.id], context);
    return {
      result,
      tests: runTests(doc, context),
      writes: [{
        source: "workspace2",
        command: "save",
        values: context.values,
        dryRun: true
      }]
    };
  }
  const json = JSON.stringify(doc);
  if (body.action === "save") {
    const response = await db().prepare("UPDATE node_tool_state SET draft=?,revision=revision+1 WHERE id=1 AND revision=?").bind(json, body.revision).run();
    if (response.meta?.changes !== 1) throw conflict();
  } else {
    const tests = runTests(doc, context),
      failed = tests.filter(t => !t.passed);
    if (failed.length) throw new ToolError("Проверки публикации · " + failed.map(t => t.name + ": " + t.message).join("; "));
    for (const tool of doc.tools) {
      const example = tool.tests[0];
      const result = evaluatePlan(program.plans[tool.id], {
        ...context,
        values: example?.values ?? {},
        role: example?.role ?? "pro"
      });
      if (result.view?.kind !== "form") throw new ToolError(tool.name + " · выход интерфейса должен быть формой");
    }
    const id = crypto.randomUUID(),
      publication = {
        ...program,
        version: id
      };
    const [response] = await db().batch([db().prepare("INSERT INTO node_tool_versions(id,document,program,author) SELECT ?,?,?,? FROM node_tool_state WHERE id=1 AND revision=?").bind(id, json, JSON.stringify(publication), author, body.revision), db().prepare("UPDATE node_tool_state SET draft=?,active=?,revision=revision+1 WHERE id=1 AND revision=?").bind(json, id, body.revision)]);
    if (response.meta?.changes !== 1) throw conflict();
  }
  return toolState();
}
export async function verifyWorkspace(next: WorkspaceData | undefined, prior: WorkspaceData | undefined, role: UserRole) {
  if (!next) return;
  for (const [id, saved] of Object.entries(next.tools)) {
    const program = await toolProgram(saved.version),
      plan = program.plans[id];
    if (!plan) throw new ToolError("Инструмент отсутствует в выбранной публикации");
    const defaults = await toolDefaults(saved.baseVersions),
      context = {
        values: saved.values,
        defaults: defaults.defaults,
        role
      };
    const result = evaluatePlan(plan, context);
    if (result.issues.length) throw new ToolError(result.issues.map(i => i.message).join("; "));
    for (const [key, value] of Object.entries(saved.values)) {
      const binding = result.bindings.find(b => b.key === key);
      if (!binding) throw new ToolError("Неизвестный параметр " + key);
      if (!accepts({
        ...binding.field,
        required: false
      }, value)) throw new ToolError("Неверный тип или диапазон · " + binding.field.name);
      if (!canEditParameter(role, binding.permission) && JSON.stringify(value) !== JSON.stringify(prior?.tools[id]?.values[key] ?? binding.field.initial ?? defaults.defaults[key])) throw new ToolError("Редактирование параметра недоступно · " + binding.field.name, 403);
    }
  }
}
