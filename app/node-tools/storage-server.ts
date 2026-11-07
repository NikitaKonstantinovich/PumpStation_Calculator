import { accepts } from "../engineering/schema";
import { db } from "../auth-server";
import { compileTools, runTests } from "./compiler";
import { initialTools } from "./factory";
import { baseSnapshot, type AppliedBaseValues } from "../base-values";
import { currentBasePublication, resolveBaseVersions } from "../base-values-server";
import { defaultProjectSettings } from "../default-settings";
import { evaluatePlan, evaluateProduct, canEditParameter } from "./runtime";
import { deriveTools } from "./product";
import { productContexts, ownBindings, usesCatalog, invalidSelections } from "./product-state";
import { catalogSnapshot } from "./catalog-server";
import type { CatalogSnapshot } from "./catalog-schema";
import type { ToolContext, ToolDocument, ToolProgram, Values, WorkspaceData } from "./schema";
import { isUserRole, type UserRole } from "../user-types";
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
  contexts?: Record<string, Values>;
  sourceVersions?: Record<string, string>;
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
  if (body.role != null && !isUserRole(body.role)) throw new ToolError("Неизвестная роль тестовой симуляции");
  const sourceData = await toolDefaults();
  const context: ToolContext = {
    values: body.values ?? {},
    defaults: sourceData.defaults,
    role: body.role ?? "pro"
  };
  const catalogData = body.action === "save" ? {
    resources: undefined,
    sourceVersions: {}
  } : await toolResources(program, body.sourceVersions);
  context.resources = catalogData.resources;
  const contexts = Object.fromEntries(program.tools.map(t => [t.id, {
    ...context,
    values: body.contexts?.[t.id] ?? (t.id === (body.tool ?? program.tools.find(t => t.enabled !== false)?.id) ? context.values : {})
  }]));
  if (body.action === "test") {
    const tool = deriveTools(doc).find(t => t.id === (body.tool ?? program.tools.find(t => t.enabled !== false)?.id));
    if (!tool) throw new ToolError("Инструмент не выбран");
    const result = program.product ? evaluateProduct(program, tool.id, contexts) : evaluatePlan(program.plans[tool.id], context);
    return {
      result,
      dataset: {
        version: "draft",
        revision: state.revision,
        role: context.role,
        simulatedRole: true,
        sourceVersions: {
          ...sourceData.baseVersions,
          ...catalogData.sourceVersions
        },
        values: context.values
      },
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
    for (const tool of deriveTools(doc).filter(t => t.enabled !== false)) {
      const example = tool.tests[0];
      const trialContext = {
        ...context,
        values: example?.values ?? {},
        role: example?.role ?? "pro" as const
      };
      const result = program.product ? evaluateProduct(program, tool.id, {
        ...contexts,
        [tool.id]: trialContext
      }) : evaluatePlan(program.plans[tool.id], trialContext);
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
export async function toolResources(program: ToolProgram, versions?: Record<string, string>): Promise<{
  resources?: {
    pump_catalog_v2?: CatalogSnapshot;
  };
  sourceVersions: Record<string, string>;
}> {
  if (!usesCatalog(program)) return {
    sourceVersions: versions ?? {}
  };
  const snapshot = await catalogSnapshot(versions?.pump_catalog_v2);
  return {
    resources: {
      pump_catalog_v2: snapshot
    },
    sourceVersions: {
      pump_catalog_v2: snapshot.id
    }
  };
}
function checkValues(id: string, saved: import("./schema").SavedTool, result: import("./schema").Evaluation, defaults: Values, prior: WorkspaceData | undefined, role: UserRole, plan: ToolProgram["plans"][string]) {
  const bindings = ownBindings(result, id),
    previous = prior?.tools[id]?.values;
  const errors = result.issues.filter(i => i.severity === "error");
  if (errors.length) throw new ToolError(errors.map(i => i.message).join("; "));
  const selectionProblems = invalidSelections(result, id, saved.values, previous, plan);
  if (selectionProblems.length) throw new ToolError(selectionProblems.join("; "), 403);
  for (const b of bindings) if ((b.mode ?? "user") === "user" && !canEditParameter(role, b.permission) && previous && Object.hasOwn(previous, b.key) && JSON.stringify(b.value) !== JSON.stringify(previous[b.key])) throw new ToolError("Редактирование параметра недоступно · " + b.field.name, 403);
  for (const [key, value] of Object.entries(saved.values)) {
    const b = bindings.find(b => b.key === key);
    if (!b) throw new ToolError("Неизвестный параметр " + key);
    if (b.mode && b.mode !== "user") throw new ToolError("Запись параметра недоступна для источника «" + b.origin + "» · " + b.field.name + ". Примените миграцию версии.", 403);
    if (!accepts({
      ...b.field,
      required: false
    }, value)) throw new ToolError("Неверный тип или диапазон · " + b.field.name);
    const allowed = previous && Object.hasOwn(previous, key) ? previous[key] : Object.hasOwn(defaults, key) ? defaults[key] : b.field.initial;
    if (!canEditParameter(role, b.permission) && JSON.stringify(value) !== JSON.stringify(allowed)) throw new ToolError("Редактирование параметра недоступно · " + b.field.name, 403);
  }
}
export async function verifyWorkspace(next: WorkspaceData | undefined, prior: WorkspaceData | undefined, role: UserRole) {
  if (!next) {
    if (prior && role !== "admin") throw new ToolError("Удаление сохранённого состояния инструментов недоступно", 403);
    return;
  }
  if (next.product) {
    const program = await toolProgram(next.product.version);
    if (!program.product) throw new ToolError("Выбрана публикация без общего графа продукта");
    const base = await toolDefaults(next.product.baseVersions),
      sources = await toolResources(program, next.product.sourceVersions),
      contexts = productContexts(program, next, base.defaults, role, sources.resources);
    if (usesCatalog(program) && !next.product.sourceVersions?.pump_catalog_v2) throw new ToolError("Закрепите снимок нового каталога");
    for (const tool of program.tools.filter(t => t.enabled !== false)) {
      const saved = next.tools[tool.id];
      if (!saved) throw new ToolError("Отсутствует состояние инструмента · " + tool.name);
      if (saved.version !== program.version || JSON.stringify(saved.baseVersions) !== JSON.stringify(next.product.baseVersions) || JSON.stringify(saved.sourceVersions ?? {}) !== JSON.stringify(next.product.sourceVersions ?? {})) throw new ToolError("Связанные инструменты должны использовать единую версию продукта и источников", 409);
      checkValues(tool.id, saved, evaluateProduct(program, tool.id, contexts), base.defaults, prior, role, program.plans[tool.id]);
    }
    for (const [id, saved] of Object.entries(next.tools)) if (!program.tools.some(t => t.id === id && t.enabled !== false) && JSON.stringify(saved) !== JSON.stringify(prior?.tools[id])) throw new ToolError("Архив отключённого инструмента доступен только для чтения · " + id, 403);
    for (const id of Object.keys(prior?.tools ?? {})) if (!next.tools[id]) throw new ToolError("Архив инструмента должен сохраняться в проекте · " + id, 403);
    return;
  }
  for (const [id, saved] of Object.entries(next.tools)) {
    const program = await toolProgram(saved.version);
    if (program.product) throw new ToolError("Примените согласованную версию продукта целиком", 409);
    const plan = program.plans[id];
    if (!plan) throw new ToolError("Инструмент отсутствует в выбранной публикации");
    const base = await toolDefaults(saved.baseVersions),
      sources = await toolResources(program, saved.sourceVersions);
    checkValues(id, saved, evaluatePlan(plan, {
      values: saved.values,
      defaults: base.defaults,
      role,
      resources: sources.resources
    }), base.defaults, prior, role, plan);
  }
  for (const id of Object.keys(prior?.tools ?? {})) if (!next.tools[id] && role !== "admin") throw new ToolError("Сохранённый инструмент нельзя удалить обходом его прав · " + id, 403);
}
