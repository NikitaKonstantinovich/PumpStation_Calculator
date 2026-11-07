import { runPlan, type Step, type Trace, type Plan } from "../engineering/engine";
import { accepts, type Field } from "../engineering/schema";
import type { Diagnostic, Evaluation, ParameterBinding, ToolContext, ToolProgram, Values, View } from "./schema";
import { pruneProductParameters } from "./product";
import { evaluate } from "../engineering/expression";
import { PUMP_OPERATIONS } from "./pump-nodes";
import { executePumpOperation } from "./pump-runtime";
import { canEditAllSettings, canEditProjectOptions } from "../user-types";
export const OPERATIONS = ["source", "parameter", "object", "merge", "form", "section", "grid", "field", "condition", "message", "check", "save", ...PUMP_OPERATIONS] as const;
const list = (v: Values) => Object.keys(v).filter(k => /^child\d+$/.test(k)).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5))).map(k => v[k]).filter(Boolean) as View[];
export const canEditParameter = (role: ToolContext["role"], permission: ParameterBinding["permission"]) => permission === "input" || permission === "options" && canEditProjectOptions(role) || canEditAllSettings(role);
/** Explicit modes evaluate only their real dependencies; old publications retain their contract. */
export function parameterExecutionPlan(plan: ToolProgram["plans"][string]): ToolProgram["plans"][string] {
  return pruneProductParameters(plan);
}
const issue = (key: string, node: string, message: string): Diagnostic => ({
  key,
  node,
  message,
  severity: "error"
});
/** Prefer a persisted flattened key before traversing an actual object. */
function attributeValue(values: Values, attribute: string): unknown {
  if (Object.hasOwn(values, attribute)) return values[attribute];
  return attribute.split(".").reduce<unknown>((value, key) => value && typeof value === "object" && Object.hasOwn(value, key) ? (value as Values)[key] : undefined, values);
}
function execute(step: Step, v: Values, context: ToolContext): Values {
  switch (step.operation) {
    case "source":
      {
        if (!context) throw Error("Источник данных не загружен");
        if (v.source === "workspace2") return {
          value: context.values,
          role: context.role
        };
        if (v.source === "base-values") return {
          value: context.defaults
        };
        throw Error("Неизвестный зарегистрированный источник");
      }
    case "parameter":
      {
        const def = step.parameter;
        if (!def) throw Error("Отсутствует определение параметра");
        const scope = typeof v.scope === "string" && v.scope ? v.scope + "." : "",
          key = scope + def.key;
        const values = (v.values ?? {}) as Values,
          defaults = (v.defaults ?? {}) as Values,
          field = def.field,
          active = v.active !== false;
        const saved = Object.hasOwn(values, key),
          base = Object.hasOwn(defaults, def.defaultKey ?? key);
        const mode = def.source?.mode ?? "user";
        let value = saved ? values[key] : base ? defaults[def.defaultKey ?? key] : field.initial ?? null;
        let origin = saved ? context.stored && Object.hasOwn(context.stored, key) && JSON.stringify(context.stored[key]) === JSON.stringify(value) ? "Сохранённое значение проекта" : "Введено пользователем" : base ? "Базовые значения" : "Начальное значение определения";
        let source: ParameterBinding["source"];
        if (mode === "fixed") {
          value = Object.hasOwn(def.source!, "value") ? def.source!.value : null;
          origin = "Постоянное значение определения";
        } else if (mode === "computed") {
          value = v.computed ?? null;
          origin = "Вычислено · " + (step.links.find(e => e.input === "computed")?.from ?? "вход computed");
        } else if (mode === "source") {
          const registry = def.source!.registry!;
          const attribute = (def.source!.attribute ?? key).replace(/^\$\./, scope);
          source = {
            registry,
            attribute
          };
          value = attributeValue(registry === "workspace2" ? context.values : context.defaults, attribute) ?? null;
          origin = (registry === "workspace2" ? "Workspace 2" : "Базовые значения проекта") + " · " + attribute;
        }
        const diagnostics: Diagnostic[] = [];
        if (active && source?.registry === "workspace2" && source.attribute === key) diagnostics.push(issue(key, step.id, field.name + " · источник Workspace 2 должен ссылаться на другой вводимый параметр"));
        if (active && !accepts(field, value)) diagnostics.push(issue(key, step.id, value == null ? field.name + " · обязательное значение" : field.name + " · проверьте тип, диапазон или варианты"));
        const binding: ParameterBinding = {
          key,
          field,
          value,
          active,
          permission: def.permission,
          editable: mode === "user" && canEditParameter(context.role, def.permission),
          origin,
          node: step.id,
          mode,
          ...(source ? {
            source
          } : {})
        };
        return {
          value,
          binding,
          issues: diagnostics,
          valid: !diagnostics.length,
          origin
        };
      }
    case "object":
      return {
        value: Object.fromEntries(step.fields.filter(f => f.direction === "input").map(f => [f.key, v[f.key] ?? null]))
      };
    case "merge":
      return {
        value: Object.assign({}, ...Object.values(v).filter(x => x && typeof x === "object" && !Array.isArray(x)))
      };
    case "save":
      return {
        value: {
          kind: "save",
          source: "workspace2"
        }
      };
    case "form":
    case "section":
    case "grid":
      {
        const view: View = {
          kind: step.operation,
          node: step.id,
          label: String(v.title ?? ""),
          children: list(v),
          columns: Number(v.columns ?? 1),
          collapsible: v.collapsible === true
        };
        if (step.operation === "form") {
          view.command = v.command as View["command"];
          view.showOrigin = v.showOrigin !== false;
        }
        return {
          value: view
        };
      }
    case "field":
      return {
        value: {
          kind: "field",
          node: step.id,
          label: String(v.label ?? ""),
          binding: v.binding as ParameterBinding,
          widget: String(v.widget ?? "auto"),
          hint: String(v.hint ?? ""),
          width: Number(v.width ?? 1),
          visible: v.visible !== false,
          enabled: v.enabled !== false,
          showOrigin: v.showOrigin !== false
        } satisfies View
      };
    case "condition":
      return {
        value: {
          kind: "condition",
          node: step.id,
          label: "",
          visible: v.visible !== false,
          enabled: v.enabled !== false,
          children: v.child ? [v.child as View] : []
        } satisfies View
      };
    case "message":
      return {
        value: {
          kind: "message",
          node: step.id,
          label: String(v.text ?? ""),
          visible: v.visible !== false,
          issues: v.issues as Diagnostic[]
        } satisfies View
      };
    case "check":
      return {
        value: v.valid === false ? [issue(String(v.key ?? ""), step.id, String(v.message ?? "Проверка не пройдена"))] : []
      };
    default:
      {
        const result = executePumpOperation(step, v, context);
        if (result) return result;
        throw Error("Неизвестная операция ноды");
      }
  }
}
export function evaluatePlan(plan: ToolProgram["plans"][string], context: ToolContext, inputs: Values = {}, contexts?: Record<string, ToolContext>): Evaluation {
  const productPlan = plan as Plan & {
    productRoot?: string;
    toolId?: string;
  };
  const prepared = parameterExecutionPlan(plan);
  const ownerContext = (id: string) => {
    if (!productPlan.productRoot) return context;
    const owner = id.split("/")[0];
    return contexts?.[owner] ?? (owner === productPlan.toolId ? context : {
      values: {},
      defaults: context.defaults,
      role: context.role,
      resources: context.resources
    });
  };
  const result = productPlan.productRoot ? runProductPlan(prepared, context, inputs, ownerContext) : runPlan(prepared, {
    context,
    ...inputs
  }, () => {
    throw Error("Встроенная операция станции недоступна в инструменте");
  }, false, undefined, (step, values) => execute(step, values, context));
  for (const record of Object.values(result.trace)) for (const group of [record.inputs, record.outputs]) {
    const value = group.context as ToolContext | undefined;
    const resource = value?.resources?.pump_catalog_v2;
    if (resource) group.context = {
      ...value,
      resources: {
        pump_catalog_v2: {
          reference: true,
          sourceId: resource.sourceId,
          snapshotId: resource.id,
          status: resource.status,
          schemaVersion: resource.schemaVersion,
          itemsCount: resource.items.length
        }
      }
    };
  }
  const outputs = result.trace.result.inputs;
  const bindings: ParameterBinding[] = [],
    issues: Diagnostic[] = "issues" in result ? result.issues as Diagnostic[] : [];
  for (const [id, r] of Object.entries(result.trace)) {
    if (r.outputs.binding) bindings.push(r.outputs.binding as ParameterBinding);
    if (Array.isArray(r.outputs.issues)) issues.push(...(r.outputs.issues as Diagnostic[]));
    const step = plan.steps.find(s => s.id === id);
    if (step?.operation === "check" && Array.isArray(r.outputs.value)) issues.push(...(r.outputs.value as Diagnostic[]));
  }
  for (const [id, r] of Object.entries(result.trace)) if (id.endsWith("/result") && Array.isArray(r.inputs.issues)) issues.push(...(r.inputs.issues as Diagnostic[]));
  if (Array.isArray(outputs.issues)) issues.push(...(outputs.issues as Diagnostic[]));
  const keys = new Set<string>();
  for (const binding of bindings) {
    const scopedKey = (binding.toolId ?? "") + ":" + binding.key;
    if (keys.has(scopedKey)) throw Error("Повторяется идентификатор параметра " + binding.key);
    keys.add(scopedKey);
    if (binding.active && binding.source?.registry === "workspace2") {
      const referenced = bindings.find(b => b.key === binding.source!.attribute && b.toolId === binding.toolId);
      if (referenced && referenced.mode !== "user") issues.push(issue(binding.key, binding.node, binding.field.name + " · источник должен быть параметром пользовательского ввода"));
    }
  }
  let count = 0;
  function validateView(v: View | undefined, depth = 0) {
    if (!v || depth > 20 || ++count > 2000 || !["form", "section", "grid", "field", "condition", "message", "table", "select", "pump-card"].includes(v.kind) || typeof v.node !== "string") throw Error("Некорректная структура интерфейса");
    if (v.kind === "field" || v.kind === "select" || v.kind === "table" && v.binding) {
      const b = bindings.find(b => b.key === v.binding?.key && b.node === v.binding?.node);
      if (!b || JSON.stringify(b) !== JSON.stringify(v.binding)) throw Error(v.node + " · подключите действительную привязку параметра");
    }
    if (v.children) {
      if (!Array.isArray(v.children)) throw Error("Неверный список элементов формы");
      v.children.forEach(c => validateView(c, depth + 1));
    }
    if (v.command && (v.command.kind !== "save" || v.command.source !== "workspace2")) throw Error("Неизвестная команда формы");
  }
  if (outputs.ui) validateView(outputs.ui as View);
  const unique = issues.filter((x, i) => issues.findIndex(y => x.node === y.node && x.key === y.key && x.message === y.message) === i);
  return {
    value: outputs.value,
    view: outputs.ui as View,
    issues: unique,
    bindings,
    trace: result.trace
  };
}
export function parseNumber(text: string, field: Field): number | null {
  if (!text.trim()) return null;
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(text.trim())) throw Error("Введите число");
  const value = Number(text.replace(",", "."));
  if (!accepts(field, value)) throw Error(field.kind === "int" ? "Введите целое число допустимого диапазона" : "Число вне допустимого диапазона");
  return value;
}
export function migrateValues(plan: ToolProgram["plans"][string], context: ToolContext, contexts?: Record<string, ToolContext>) {
  const result = evaluatePlan(plan, context, {}, contexts),
    owner = (plan as Plan & {
      toolId?: string;
    }).toolId,
    bindings = result.bindings.filter(b => !owner || b.toolId === owner),
    values: Values = {},
    messages: string[] = [];
  for (const b of bindings) {
    if (!Object.hasOwn(context.values, b.key)) continue;
    if (b.mode && b.mode !== "user") {
      messages.push(b.field.name + " · прежнее введённое значение сохранено в истории; действует " + b.origin);
      continue;
    }
    if (accepts({
      ...b.field,
      required: false
    }, context.values[b.key])) values[b.key] = context.values[b.key];else messages.push(b.field.name + " · требуется новое значение");
  }
  const missing = Object.keys(context.values).filter(k => !bindings.some(b => b.key === k));
  if (missing.length) messages.push("Удалённые параметры сохранены в предыдущей ревизии проекта · " + missing.join(", "));
  return {
    values,
    messages
  };
}
export function traceNode(trace: Trace, path: string[]) {
  const prefix = path.join("/"),
    result: Trace = {};
  for (const [id, r] of Object.entries(trace)) {
    const key = prefix ? prefix + "/" : "";
    if (!id.startsWith(key)) continue;
    const tail = id.slice(key.length);
    if (!tail.includes("/")) result[tail] = r;else if (tail.endsWith("/result") && tail.split("/").length === 2) result[tail.split("/")[0]] = {
      inputs: trace[id.replace(/result$/, "source")]?.outputs ?? {},
      outputs: r.inputs,
      sources: r.sources
    };
  }
  return result;
}

/** Lazy port evaluation keeps data outputs independent from unused forms and commands. */
function runProductPlan(plan: Plan, context: ToolContext, inputs: Values, contextFor: (id: string) => ToolContext) {
  const validationIssues: Diagnostic[] = [];
  const steps = new Map(plan.steps.map(s => [s.id, s])),
    trace: Trace = Object.create(null),
    done = new Set<string>(),
    running = new Set<string>(),
    operated = new Set<string>();
  function record(id: string) {
    return trace[id] ?? (trace[id] = {
      inputs: Object.create(null),
      outputs: Object.create(null),
      sources: Object.create(null)
    });
  }
  function input(step: Step, key: string): unknown {
    const token = step.id + ":in:" + key;
    if (done.has(token)) return record(step.id).inputs[key];
    if (running.has(token)) throw Error("Цикл порта · " + step.id + "." + key);
    running.add(token);
    const field = step.fields.find(f => f.key === key);
    if (!field) throw Error("Неизвестный вход · " + step.id + "." + key);
    const edge = step.links.find(e => e.input === key),
      r = record(step.id);
    let value: unknown;
    if (/^[^/]+\/source$/.test(step.id) && key === "context") {
      value = contextFor(step.id);
      r.sources[key] = "Доверенный контекст экземпляра инструмента";
    } else if (step.id === "source" && Object.hasOwn({
      context,
      ...inputs
    }, key)) {
      value = {
        context,
        ...inputs
      }[key];
      r.sources[key] = "Входные данные продукта";
    } else if (edge) {
      value = output(edge.from, edge.out);
      r.sources[key] = edge.from + "." + edge.out;
    } else {
      value = Object.hasOwn(step.values, key) ? step.values[key] : field.initial;
      r.sources[key] = Object.hasOwn(step.values, key) ? "Значение экземпляра" : "По умолчанию";
    }
    if (field.direction !== "output" && !accepts(field, value)) validationIssues.push(issue(key, step.id, field.name + " · вход не соответствует типу или диапазону"));
    r.inputs[key] = value;
    done.add(token);
    running.delete(token);
    return value;
  }
  function operation(step: Step) {
    if (operated.has(step.id)) return;
    const token = step.id + ":operation";
    if (running.has(token)) throw Error("Цикл операции · " + step.id);
    running.add(token);
    const r = record(step.id),
      v: Values = {};
    for (const f of step.fields) if (f.direction !== "output") v[f.key] = input(step, f.key);
    const values = execute(step, v, contextFor(step.id));
    if (values.binding && typeof values.binding === "object") (values.binding as ParameterBinding).toolId = step.id.split("/")[0];
    Object.assign(r.outputs, values);
    for (const key of Object.keys(values)) r.sources[key] = "Операция · " + step.operation;
    operated.add(step.id);
    running.delete(token);
  }
  function output(id: string, key: string): unknown {
    const token = id + ":out:" + key;
    if (done.has(token)) return record(id).outputs[key];
    if (running.has(token)) throw Error("Цикл порта · " + id + "." + key);
    running.add(token);
    const step = steps.get(id);
    if (!step) throw Error("Источник связи отсутствует · " + id);
    const f = step.fields.find(f => f.key === key);
    if (!f) throw Error("Источник порта отсутствует · " + id + "." + key);
    const r = record(id);
    let value: unknown;
    if (step.operation) {
      operation(step);
      value = r.outputs[key];
    } else if (step.expressions[key]) {
      const v: Values = {};
      const refs = new Set<string>();
      function visit(expr: import("../engineering/expression").Expr) {
        if ("input" in expr) refs.add(expr.input);else if ("args" in expr) expr.args.forEach(visit);
      }
      visit(step.expressions[key]);
      for (const ref of refs) v[ref] = input(step, ref);
      value = evaluate(step.expressions[key], v);
      r.sources[key] = "Формула узла " + id;
    } else {
      value = input(step, key);
    }
    if (!step.operation && !accepts(f, value)) validationIssues.push(issue(key, id, f.name + " · результат не соответствует типу или диапазону"));
    r.outputs[key] = value;
    done.add(token);
    running.delete(token);
    return value;
  }
  const result = steps.get("result");
  if (!result) throw Error("Отсутствует результат продукта");
  for (const field of result.fields) input(result, field.key);
  return {
    value: record("result").inputs.value,
    trace,
    issues: validationIssues
  };
}
export function evaluateProduct(program: ToolProgram, toolId: string, contexts: Record<string, ToolContext>): Evaluation {
  const plan = program.plans[toolId];
  if (!plan) throw Error("Инструмент отсутствует в выбранной версии продукта");
  const enriched = Object.fromEntries(Object.entries(contexts).map(([id, value]) => [id, {
    ...value,
    algorithmVersion: program.version
  }]));
  const context = enriched[toolId] ?? Object.values(enriched)[0];
  if (!context) throw Error("Не задан доверенный контекст продукта");
  return evaluatePlan(plan, context, {}, enriched);
}
