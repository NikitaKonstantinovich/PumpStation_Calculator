import { betaOperations } from "./profile";
import { accepts, compatible, validKey, type Diagram, type Document, type Edge, type Field, type GraphNode, type NodeType, type Signature } from "./schema";
import { compileExpression, evaluate, type Expr } from "./expression";
export type Step = {
  id: string;
  catalog?: GraphNode["catalog"];
  fields: Field[];
  values: Record<string, unknown>;
  links: Edge[];
  expressions: Record<string, Expr>;
  native?: string;
  direct?: boolean;
};
export type Plan = {
  id: string;
  steps: Step[];
};
export type Trace = Record<string, {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  sources: Record<string, string>;
}>;
export function connectionProblem(graph: Diagram, types: NodeType[], edge: Edge): string {
  const nodeType = (id: string) => types.find(t => t.id === graph.nodes.find(n => n.id === id)?.type);
  const out = nodeType(edge.from)?.fields.find(f => f.key === edge.out),
    input = nodeType(edge.to)?.fields.find(f => f.key === edge.input);
  if (!out || !input) return "Узел или поле отсутствует";
  if (!compatible(out, input)) return "Несовместимые поля: " + out.name + " (" + out.meaning + " " + out.unit + ") → " + input.name + " (" + input.meaning + " " + input.unit + ")";
  const next = [edge.to],
    visited = new Set<string>();
  while (next.length) {
    const id = next.pop()!;
    if (id === edge.from) return "Связь создаст цикл зависимостей";
    if (!visited.has(id)) {
      visited.add(id);
      for (const e of graph.edges) if (e.from === id) next.push(e.to);
    }
  }
  return "";
}
export function compileDiagram(graph: Diagram, types: NodeType[], multi = false): Plan {
  const nodes = new Map(graph.nodes.map(n => [n.id, n]));
  if (nodes.size !== graph.nodes.length || !nodes.has("result")) throw Error(graph.name + " · отсутствует результат или повторяется ID узла");
  const incoming = new Map<string, Edge[]>();
  const byType = new Map(types.map(t => [t.id, t]));
  for (const e of graph.edges) {
    const edges = incoming.get(e.to) ?? [];
    const out = byType.get(nodes.get(e.from)?.type ?? "")?.fields.find(f => f.key === e.out);
    const input = byType.get(nodes.get(e.to)?.type ?? "")?.fields.find(f => f.key === e.input);
    if (!out || !input || !compatible(out, input)) throw Error(e.to + "." + e.input + " · несовместимый или отсутствующий порт");
    if (edges.some(other => other.input === e.input)) throw Error(e.to + "." + e.input + " · вход уже занят");
    edges.push(e);
    incoming.set(e.to, edges);
  }
  const steps: Step[] = [],
    done = new Set<string>(),
    visiting = new Set<string>();
  function visit(id: string) {
    if (done.has(id)) return;
    if (visiting.has(id)) throw Error(id + " · цикл зависимостей");
    visiting.add(id);
    const node = nodes.get(id)!,
      type = byType.get(node.type);
    if (!type) throw Error(id + " · неизвестный тип " + node.type);
    const links = incoming.get(id) ?? [];
    links.forEach(e => visit(e.from));
    const names = new Set(type.fields.filter(f => f.direction !== "output").map(f => f.key));
    const expressions: Record<string, Expr> = {};
    for (const [key, expr] of Object.entries(type.formulas)) {
      if (!type.fields.some(f => f.key === key && f.direction !== "input")) throw Error(node.name + "." + key + " · требуется выход");
      try {
        expressions[key] = compileExpression(expr, names);
      } catch (error) {
        throw Error(node.name + "." + key + " · " + (error as Error).message);
      }
    }
    if (!multi && id === "result" && !links.some(e => e.input === "value")) throw Error(node.name + " · подключите результат");
    steps.push({
      id,
      catalog: node.catalog,
      fields: type.fields,
      values: node.values,
      links,
      expressions,
      native: type.native
    });
    visiting.delete(id);
    done.add(id);
  }
  for (const id of nodes.keys()) visit(id);
  return {
    id: graph.id,
    steps
  };
}
export type StepCache = Map<string, {
  inputs: unknown[];
  outputs: Record<string, unknown>;
}>;
export function runPlan(plan: Plan, args: Record<string, unknown>, native: (name: string, values: Record<string, unknown>, direct?: boolean) => unknown, traceAll = false, cache?: StepCache) {
  const trace: Trace = Object.create(null);
  const needed = new Set(["result"]);
  if (!traceAll) for (let i = plan.steps.length - 1; i >= 0; i--) {
    const step = plan.steps[i];
    if (needed.has(step.id)) step.links.forEach(e => needed.add(e.from));
  }
  for (const step of plan.steps) {
    if (!traceAll && !needed.has(step.id)) continue;
    const values: Record<string, unknown> = Object.create(null),
      outputs: Record<string, unknown> = Object.create(null),
      sources: Record<string, string> = Object.create(null);
    for (const f of step.fields) {
      values[f.key] = Object.hasOwn(step.values, f.key) ? step.values[f.key] : f.initial;
      sources[f.key] = Object.hasOwn(step.values, f.key) ? step.catalog && !step.catalog.overridden.includes(f.key) ? "Каталог · " + step.catalog.name : "Введено инженером" : "По умолчанию";
      if (step.id === "source" && Object.hasOwn(args, f.key)) {
        values[f.key] = args[f.key];
        sources[f.key] = "Входные данные расчёта";
      }
    }
    for (const e of step.links) {
      values[e.input] = trace[e.from].outputs[e.out];
      sources[e.input] = e.from + "." + e.out;
    }
    // Reuse independent scalar subtrees. Objects from legacy callers may be mutated in place.
    const inputValues = Object.values(values),
      reusable = cache && inputValues.every(v => v == null || typeof v !== "object" && typeof v !== "function");
    const old = reusable ? cache.get(step.id) : undefined;
    if (old && old.inputs.length === inputValues.length && old.inputs.every((v, i) => Object.is(v, inputValues[i]))) {
      trace[step.id] = {
        inputs: values,
        outputs: old.outputs,
        sources
      };
      continue;
    }
    try {
      for (const f of step.fields) if (f.required && f.direction !== "output" && values[f.key] == null) throw Error(f.name + " · обязательный вход пуст");
      if (step.native) {
        outputs.value = native(step.native, values, step.direct);
        sources.value = "Встроенная операция · " + step.native;
      }
      for (const f of step.fields) {
        if (f.direction === "input") continue;
        if (Object.hasOwn(step.expressions, f.key)) {
          outputs[f.key] = evaluate(step.expressions[f.key], values);
          if (!accepts(f, outputs[f.key])) throw Error(f.name + " · результат не соответствует типу или диапазону");
          sources[f.key] = "Формула узла " + step.id;
        } else if (!Object.hasOwn(outputs, f.key)) outputs[f.key] = values[f.key];
      }
    } catch (error) {
      throw Error(step.id + " · " + (error as Error).message);
    }
    if (reusable && Object.values(outputs).every(v => v == null || typeof v !== "object" && typeof v !== "function")) cache.set(step.id, {
      inputs: inputValues,
      outputs
    });
    trace[step.id] = {
      inputs: values,
      outputs,
      sources
    };
  }
  return {
    value: trace.result.inputs.value,
    trace
  };
}
export class DiagramError extends Error {
  constructor(message: string, readonly diagram: string, readonly node?: string) {
    super(message);
  }
}
export function validateDocument(doc: Document, sigs: Signature[], builtin: NodeType[], forPublish: boolean) {
  if (doc?.schema !== 1 || !Array.isArray(doc.types) || doc.types.length > 800 || !Array.isArray(doc.diagrams) || doc.diagrams.length > 300) throw Error("Некорректный формат или превышен размер графа");
  const unique = (ids: string[]) => ids.every(validKey) && new Set(ids).size === ids.length;
  if (!unique(doc.types.map(t => t.id)) || !unique(doc.diagrams.map(g => g.id))) throw Error("Некорректные или повторяющиеся ключи типов или графов");
  for (const t of doc.types) {
    if (!t.name.trim() || !Array.isArray(t.fields) || t.fields.length > 700 || !unique(t.fields.map(f => f.key))) throw Error(t.name + " · проверьте поля");
    const original = builtin.find(b => b.id === t.id);
    if (t.native !== original?.native) throw Error("Неизвестная встроенная операция");
    if (original && (t.native || t.id.startsWith("args.") || t.id.startsWith("return.")) && JSON.stringify(t.fields) !== JSON.stringify(original.fields)) throw Error(t.name + " · контракт штатного инструмента фиксирован");
    for (const f of t.fields) {
      if (!["number", "string", "boolean", "enum", "reference", "object", "array"].includes(f.kind) || !["input", "output", "both"].includes(f.direction) || typeof f.unit !== "string" || !f.meaning || !f.name) throw Error(t.name + "." + f.key + " · неверное определение поля");
      if (f.initial != null && !accepts(f, f.initial)) throw Error(t.name + "." + f.key + " · неверное значение по умолчанию");
    }
  }
  for (const sig of sigs) if (!doc.diagrams.some(g => g.id === sig.id)) throw Error("Удалена схема " + sig.name);
  for (const graph of doc.diagrams) {
    if (!Array.isArray(graph.nodes) || graph.nodes.length > 250 || !Array.isArray(graph.edges) || graph.edges.length > 800 || !unique(graph.nodes.map(n => n.id))) throw Error("Некорректные узлы схемы");
    for (const n of graph.nodes) if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || !n.values || Array.isArray(n.values) || typeof n.values !== "object" || !doc.types.some(t => t.id === n.type)) throw Error(n.name + " · неверные параметры узла");
    if (!forPublish) continue;
    try {
      const sig = sigs.find(s => s.id === graph.id);
      if (sig && (graph.nodes.find(n => n.id === "source")?.type !== "args." + sig.id || graph.nodes.find(n => n.id === "result")?.type !== "return." + sig.id)) throw Error(graph.name + " · изменён внешний контракт");
      for (const n of graph.nodes) {
        const t = doc.types.find(t => t.id === n.type)!;
        if (sig && betaOperations.has(sig.id) && t.native && !betaOperations.has(t.native)) throw Error(n.name + " · операция полной версии недоступна в схеме beta");
      }
      const program = compileDiagram(graph, doc.types, !sig && graph.id!=="lab");
      for (const step of program.steps) for (const f of step.fields) {
        if (f.direction === "output") continue;
        const connected = step.links.some(e => e.input === f.key);
        const literal = Object.hasOwn(step.values, f.key) ? step.values[f.key] : f.initial;
        if (!connected && !accepts(f, literal)) throw Error(graph.name + " → " + step.id + "." + f.key + " · требуется совместимое значение или связь");
      }
    } catch (error) {
      const message = (error as Error).message;
      const node = graph.nodes.find(n => [n.id, n.name].some(label => message.startsWith(label + ".") || message.startsWith(label + " ·") || message.includes(" → " + label + ".")));
      throw new DiagramError(message, graph.id, node?.id);
    }
  }
  if (forPublish) {
    const byId = new Map(doc.diagrams.map(d => [d.id, d])),
      done = new Set<string>(),
      stack = new Set<string>();
    function checkCalls(id: string) {
      if (done.has(id)) return;
      if (stack.has(id)) throw Error("Цикл между инструментами: " + [...stack, id].join(" → "));
      stack.add(id);
      for (const node of byId.get(id)?.nodes ?? []) {
        const type = doc.types.find(t => t.id === node.type);
        if(type?.instrument){if(!byId.has(type.instrument))throw new DiagramError("Нет определения Instrument",id,node.id);checkCalls(type.instrument);}
        if(type?.native && type.native!==id)checkCalls(type.native);
      }
      stack.delete(id);
      done.add(id);
    }
    doc.diagrams.forEach(g => checkCalls(g.id));
  }
}

/** Lower only the fields consumed by the host result. Editor-only data stays in the draft. */
export function executableSlice(plan: Plan, outputs = ["value"]): Plan {
  const needs = new Map<string, Set<string>>([["result", new Set(outputs)]]),
    steps: Step[] = [];
  function references(expr: Expr, fields: Set<string>) {
    if ("input" in expr) fields.add(expr.input);else if ("args" in expr) expr.args.forEach(e => references(e, fields));
  }
  for (const step of [...plan.steps].reverse()) {
    const requested = needs.get(step.id);
    if (!requested) continue;
    const fields = new Set(requested),
      inputs = new Set<string>();
    const expressions = Object.fromEntries(Object.entries(step.expressions).filter(([key]) => requested.has(key)));
    for (const key of requested) {
      if (expressions[key]) references(expressions[key], inputs);else inputs.add(key);
    }
    if (step.native) for (const f of step.fields) if (f.direction !== "output") inputs.add(f.key);
    inputs.forEach(key => fields.add(key));
    const links = step.links.filter(e => inputs.has(e.input));
    for (const e of links) {
      const source = needs.get(e.from) ?? new Set<string>();
      source.add(e.out);
      needs.set(e.from, source);
    }
    const values = Object.fromEntries(Object.entries(step.values).filter(([key]) => fields.has(key)));
    steps.push({
      id: step.id,
      native: step.native,
      ...(step.direct ? {direct:true} : {}),
      fields: step.fields.filter(f => fields.has(f.key)),
      values,
      links,
      expressions
    });
  }
  return {
    id: plan.id,
    steps: steps.reverse()
  };
}
