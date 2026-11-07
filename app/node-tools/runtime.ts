import { runPlan, type Step, type Trace } from "../engineering/engine";
import { accepts, type Field } from "../engineering/schema";
import type { Diagnostic, Evaluation, ParameterBinding, ToolContext, ToolProgram, Values, View } from "./schema";
import { canEditAllSettings, canEditProjectOptions } from "../user-types";
export const OPERATIONS = ["source", "parameter", "object", "merge", "form", "section", "grid", "field", "condition", "message", "check", "save"] as const;
const list = (v: Values) => Object.keys(v).filter(k => /^child\d+$/.test(k)).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5))).map(k => v[k]).filter(Boolean) as View[];
export const canEditParameter = (role: ToolContext["role"], permission: ParameterBinding["permission"]) => permission === "input" || permission === "options" && canEditProjectOptions(role) || canEditAllSettings(role);
const issue = (key: string, node: string, message: string): Diagnostic => ({
  key,
  node,
  message,
  severity: "error"
});
function execute(step: Step, v: Values, context: ToolContext): Values {
  switch (step.operation) {
    case "source":
      {
        const context = v.context as ToolContext;
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
        const value = saved ? values[key] : base ? defaults[def.defaultKey ?? key] : field.initial ?? null;
        const origin = saved ? context.stored && Object.hasOwn(context.stored, key) && JSON.stringify(context.stored[key]) === JSON.stringify(value) ? "Сохранённое значение проекта" : "Введено пользователем" : base ? "Базовые значения" : "Значение определения";
        const diagnostics: Diagnostic[] = [];
        if (active && !accepts(field, value)) diagnostics.push(issue(key, step.id, value == null ? field.name + " · обязательное значение" : field.name + " · проверьте тип, диапазон или варианты"));
        const binding: ParameterBinding = {
          key,
          field,
          value,
          active,
          permission: def.permission,
          editable: canEditParameter((v.role ?? "base") as ToolContext["role"], def.permission),
          origin,
          node: step.id
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
        if (step.operation === "form") view.command = v.command as View["command"];
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
          width: Number(v.width ?? 1)
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
      throw Error("Неизвестная операция ноды");
  }
}
export function evaluatePlan(plan: ToolProgram["plans"][string], context: ToolContext, inputs: Values = {}): Evaluation {
  const result = runPlan(plan, {
    context,
    ...inputs
  }, () => {
    throw Error("Встроенная операция станции недоступна в инструменте");
  }, false, undefined, (step, values) => execute(step, values, context));
  const outputs = result.trace.result.inputs;
  const bindings: ParameterBinding[] = [],
    issues: Diagnostic[] = [];
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
    if (keys.has(binding.key)) throw Error("Повторяется идентификатор параметра " + binding.key);
    keys.add(binding.key);
  }
  let count = 0;
  function validateView(v: View | undefined, depth = 0) {
    if (!v || depth > 20 || ++count > 2000 || !["form", "section", "grid", "field", "condition", "message"].includes(v.kind) || typeof v.node !== "string") throw Error("Некорректная структура интерфейса");
    if (v.kind === "field") {
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
export function migrateValues(plan: ToolProgram["plans"][string], context: ToolContext) {
  const result = evaluatePlan(plan, context),
    values: Values = {},
    messages: string[] = [];
  for (const b of result.bindings) {
    if (!Object.hasOwn(context.values, b.key)) continue;
    if (accepts({
      ...b.field,
      required: false
    }, context.values[b.key])) values[b.key] = context.values[b.key];else messages.push(b.field.name + " · требуется новое значение");
  }
  const missing = Object.keys(context.values).filter(k => !result.bindings.some(b => b.key === k));
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
