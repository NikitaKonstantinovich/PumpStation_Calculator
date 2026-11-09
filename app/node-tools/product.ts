import { compileDiagram, DiagramError, type Plan, type Step } from "../engineering/engine";
import { childDiagram, definitionPorts } from "../engineering/hierarchy";
import { compatible, makeField, type Diagram, type Edge } from "../engineering/schema";
import { connectionFeedback } from "../engineering/connection-feedback";
import type { Expr } from "../engineering/expression";
import { safeId, type ToolDefinition, type ToolDocument } from "./schema";
export type ProductPlan = Plan & {
  productRoot: string;
  toolId: string;
};
export const productRoot = (doc: ToolDocument) => doc.product?.root ?? doc.tools[0]?.diagram ?? "tools";
export function pruneProductParameters(plan: Plan): Plan {
  return {
    ...plan,
    steps: plan.steps.map(step => {
      const mode = step.operation === "parameter" ? step.parameter?.source?.mode : undefined;
      if (!mode) return step;
      const inputs = new Set(["scope", "active", ...(mode === "user" ? ["values", "defaults", "role"] : mode === "computed" ? ["computed"] : [])]),
        fields = step.fields.filter(f => f.direction === "output" || inputs.has(f.key)),
        keys = new Set(fields.map(f => f.key));
      return {
        ...step,
        fields,
        links: step.links.filter(e => inputs.has(e.input)),
        values: Object.fromEntries(Object.entries(step.values).filter(([key]) => keys.has(key)))
      };
    })
  };
}

/** Root instances, not a second registry, determine the product's tools. */
export function deriveTools(doc: ToolDocument): ToolDefinition[] {
  if (!doc.product) return doc.tools;
  const root = doc.diagrams.find(g => g.id === doc.product!.root);
  if (!root) throw new DiagramError("Отсутствует корневой граф продукта", doc.product.root);
  return root.nodes.flatMap((node, index) => {
    const type = doc.types.find(t => t.id === node.type);
    if (!type?.instrument) return [];
    return [{
      id: node.id,
      name: node.name,
      diagram: type.instrument,
      category: node.tool?.category ?? type.category ?? "Инструменты",
      order: node.tool?.order ?? index,
      enabled: node.tool?.enabled !== false,
      tests: node.tool?.tests ?? []
    }];
  }).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
}
function unique(prefix: string, used: Set<string>) {
  let id = prefix.slice(0, 87),
    index = 1;
  while (used.has(id)) id = prefix.slice(0, 85) + "_" + index++;
  used.add(id);
  return id;
}

/** Upgrade an editable legacy document only. Saved publications remain untouched. */
export function upgradeDocument(original: ToolDocument): ToolDocument {
  if (original.product) return original;
  const doc = structuredClone(original),
    legacy = doc.tools;
  const existing = doc.diagrams.find(g => g.id === "tools");
  const usable = existing && legacy.some(t => t.diagram === existing.id) && legacy.filter(t=>t.diagram===existing.id).every(t=>existing.nodes.some(n=>n.id===t.id&&doc.types.find(type=>type.id===n.type)?.instrument)) && existing.nodes.filter(n => doc.types.find(t => t.id === n.type)?.instrument).every(n => legacy.some(t => t.id === n.id && t.diagram === existing.id));
  const ids = new Set(doc.diagrams.map(g => g.id)),
    typeIds = new Set(doc.types.map(t => t.id));
  let root: Diagram;
  if (usable) root = existing!;else {
    const id = unique("product", ids),
      input = unique("product.boundary.in", typeIds),
      output = unique("product.boundary.out", typeIds);
    doc.types.push({
      id: input,
      name: "Контекст продукта",
      description: "Системная граница продукта",
      category: "Границы",
      formulas: {},
      fields: [{
        ...makeField("context", "Контекст", "object", "toolContext"),
        direction: "output"
      }]
    }, {
      id: output,
      name: "Выход продукта",
      description: "Системная граница продукта",
      category: "Границы",
      formulas: {},
      fields: []
    });
    root = {
      id,
      name: "Инструменты продукта",
      groups: {},
      nodes: [{
        id: "source",
        type: input,
        name: "Контекст продукта",
        x: 0,
        y: 0,
        values: {}
      }, {
        id: "result",
        type: output,
        name: "Результат продукта",
        x: 1500,
        y: 0,
        values: {}
      }],
      edges: []
    };
    doc.diagrams.push(root);
  }
  for (const [index, tool] of legacy.entries()) {
    let node = root.nodes.find(n => n.id === tool.id && doc.types.find(t => t.id === n.type)?.instrument);
    if (!node) {
      if (root.nodes.some(n => n.id === tool.id)) throw new DiagramError("ID инструмента совпадает с системной границей · " + tool.id, root.id, tool.id);
      const graph = doc.diagrams.find(g => g.id === tool.diagram);
      if (!graph) throw new DiagramError("Не найден прежний граф инструмента", tool.diagram);
      const id = unique("product.instrument." + tool.id, typeIds);
      doc.types.push({
        id,
        name: tool.name,
        category: tool.category,
        description: tool.name,
        formulas: {},
        fields: definitionPorts(graph, doc.types),
        instrument: graph.id
      });
      node = {
        id: tool.id,
        type: id,
        name: tool.name,
        x: 360 + index * 390,
        y: 180,
        values: {}
      };
      root.nodes.push(node);
    }
    node.tool = {
      ...node.tool,
      category: tool.category,
      order: tool.order ?? index,
      enabled: tool.enabled !== false,
      tests: tool.tests
    };
  }
  // The trusted host injects each root instance's own context at its inner boundary.
  root.edges = root.edges.filter(edge => edge.input !== "context" || !root.nodes.some(n => n.id === edge.to && doc.types.find(t => t.id === n.type)?.instrument));
  doc.product = {
    root: root.id
  };
  doc.tools = [];
  return doc;
}

/** Flat compilation checks contracts before dependencies, allowing independent output branches. */
export function flattenProduct(doc: ToolDocument, root: Diagram): Plan {
  const steps: Step[] = [],
    types = new Map(doc.types.map(t => [t.id, t])),
    graphs = new Map(doc.diagrams.map(g => [g.id, g]));
  function expand(graph: Diagram, path: string, ancestors: Set<string>, instance?: Step) {
    if (ancestors.has(graph.id) || ancestors.size >= 16) throw new DiagramError("Цикл вложенных определений Instrument", graph.id);
    const chain = new Set(ancestors).add(graph.id),
      containers = new Map<string, Diagram>();
    for (const node of graph.nodes) {
      const type = types.get(node.type);
      if (!type) throw new DiagramError("Неизвестный тип", graph.id, node.id);
      const id = childDiagram(type, graph.id);
      if (!id) continue;
      const child = graphs.get(id);
      if (!child) throw new DiagramError("Отсутствует определение Instrument", graph.id, node.id);
      const ports = definitionPorts(child, doc.types);
      if (ports.length !== type.fields.length || ports.some(f => !type.fields.some(p => p.key === f.key && p.direction === f.direction && p.kind === f.kind && p.meaning === f.meaning && p.unit === f.unit))) throw new DiagramError("Внешний контракт отличается от внутренней границы", graph.id, node.id);
      containers.set(node.id, child);
    }
    const incoming = new Map<string, Edge[]>();
    for (const edge of graph.edges) {
      const source = types.get(graph.nodes.find(n => n.id === edge.from)?.type ?? "")?.fields.find(f => f.key === edge.out),
        target = types.get(graph.nodes.find(n => n.id === edge.to)?.type ?? "")?.fields.find(f => f.key === edge.input);
      if (!source || !target || !compatible(source, target)) throw new DiagramError("Несовместимые порты · " + edge.from + "." + edge.out + " → " + edge.to + "." + edge.input, graph.id, edge.to);
      const list = incoming.get(edge.to) ?? [];
      if (list.some(e => e.input === edge.input)) throw new DiagramError("Вход занят · " + edge.input, graph.id, edge.to);
      list.push(edge);
      incoming.set(edge.to, list);
    }
    // The product root is a container; an empty product needs no visible result node.
    const virtual = graph.id === root.id && !graph.nodes.some(n => n.id === "result");
    const plain = compileDiagram({
      ...graph,
      nodes: virtual ? [...graph.nodes, {id:"result",type:"__root_result",name:"Результат продукта",x:0,y:0,values:{}}] : graph.nodes,
      edges: []
    }, virtual ? [...doc.types,{id:"__root_result",name:"Результат продукта",category:"Границы",description:"",fields:[],formulas:{}}] : doc.types, true);
    for (const local of plain.steps) {
      if (steps.length > 18000) throw new DiagramError("Превышен размер развёрнутого продукта", graph.id, local.id);
      const id = path ? path + "/" + local.id : local.id;
      const links = (incoming.get(local.id) ?? []).map(edge => ({
        ...edge,
        from: (path ? path + "/" : "") + edge.from + (containers.has(edge.from) ? "/result" : ""),
        to: id
      }));
      const step: Step & {
        diagram: string;
        path: string[];
      } = {
        ...local,
        id,
        links,
        diagram: graph.id,
        path: path ? path.split("/") : []
      };
      const child = containers.get(local.id);
      if (child) {
        expand(child, id, chain, step);
        continue;
      }
      if (instance && (local.id === "source" || local.id === "result")) {
        step.fields = local.fields.map(f => ({
          ...f,
          direction: "both"
        }));
        if (local.id === "source") {
          step.values = {
            ...local.values,
            ...instance.values
          };
          step.links = instance.links.map(e => ({
            ...e,
            to: id
          }));
        }
      }
      steps.push(step);
    }
  }
  expand(root, "", new Set());
  return {
    id: root.id,
    steps
  };
}
function expressionInputs(expr: Expr, keys: Set<string>) {
  if ("input" in expr) keys.add(expr.input);else if ("args" in expr) expr.args.forEach(e => expressionInputs(e, keys));
}

/** Demand individual ports; independent boundaries do not create whole-Instrument cycles. */
export function productSlice(plan: Plan, requested: Record<string, string[]>, root: string, toolId: string): ProductPlan {
  const byId = new Map(plan.steps.map(step => [step.id, step])),
    needed = new Map<string, Set<string>>(),
    visiting = new Set<string>(),
    done = new Set<string>(),
    order: string[] = [];
  function demand(id: string, key: string, output: boolean) {
    const token = id + ":" + (output ? "out:" : "in:") + key;
    if (done.has(token)) return;
    if (visiting.has(token)) {
      const path = [...visiting, token].join(" → ");
      const local = id.split("/").at(-1);
      const owner = byId.get(id) as Step & {
        diagram?: string;
        path?: string[];
      } | undefined;
      throw Object.assign(new DiagramError("Цикл расчётных портов · " + path, owner?.diagram ?? root, local), {
        path: owner?.path ?? id.split("/").slice(0, -1)
      });
    }
    const step = byId.get(id);
    if (!step) throw new DiagramError("Узел связи отсутствует · " + id, root);
    const field = step.fields.find(f => f.key === key);
    if (!field) throw new DiagramError("Порт отсутствует · " + id + "." + key, root, id.split("/").at(-1));
    const keys = needed.get(id) ?? new Set<string>();
    keys.add(key);
    needed.set(id, keys);
    visiting.add(token);
    if (output && step.operation) {
      for (const f of step.fields) if (f.direction !== "output") demand(id, f.key, false);
    } else if (output && step.expressions[key]) {
      const refs = new Set<string>();
      expressionInputs(step.expressions[key], refs);
      for (const ref of refs) demand(id, ref, false);
    } else if (output && field.direction === "output") {/* Literal outputs have no input dependency. */} else {
      const edge = step.links.find(e => e.input === key);
      const ownContext = /^[^/]+\/source$/.test(id) && key === "context";
      if (edge && !ownContext) demand(edge.from, edge.out, true);
    }
    visiting.delete(token);
    done.add(token);
    if (!order.includes(id)) order.push(id);
  }
  for (const [id, keys] of Object.entries(requested)) for (const key of keys) demand(id, key, false);
  return {
    id: plan.id,
    productRoot: root,
    toolId,
    steps: order.map(id => {
      const step = byId.get(id)!,
        keys = needed.get(id)!;
      return {
        ...step,
        fields: step.fields.filter(f => keys.has(f.key)),
        links: step.links.filter(e => keys.has(e.input)),
        values: Object.fromEntries(Object.entries(step.values).filter(([key]) => keys.has(key))),
        expressions: Object.fromEntries(Object.entries(step.expressions).filter(([key]) => keys.has(key)))
      };
    })
  };
}
export function productEndpoint(plan: Plan, root: string, tool: ToolDefinition): ProductPlan {
  const boundary = plan.steps.find(s => s.id === tool.id + "/result");
  if (!boundary) throw new DiagramError("Отсутствует выход инструмента", tool.diagram, "result");
  if (!boundary.links.some(e => e.input === "ui")) throw new DiagramError("Подключите интерфейс инструмента", tool.diagram, "result");
  const keys = ["value", "ui", "issues"].filter(key => boundary.fields.some(f => f.key === key));
  const result: Step = {
    id: "result",
    fields: boundary.fields.filter(f => keys.includes(f.key)).map(f => ({
      ...f,
      direction: "input"
    })),
    values: {},
    links: keys.map(key => ({
      from: boundary.id,
      out: key,
      to: "result",
      input: key
    })),
    expressions: {}
  };
  return productSlice({
    ...plan,
    steps: [...plan.steps.filter(s => s.id !== "result"), result]
  }, {
    result: keys
  }, root, tool.id);
}
export function assertProductMetadata(doc: ToolDocument) {
  const root = doc.diagrams.find(g => g.id === doc.product?.root);
  if (!root) throw Error("Отсутствует корневой граф продукта");
  for(const edge of root.edges)if(edge.input==="context"&&root.nodes.some(n=>n.id===edge.to&&doc.types.find(t=>t.id===n.type)?.instrument))throw new DiagramError("Контекст экземпляра задаётся системой; подключите расчётный вход",root.id,edge.to);
  for (const node of root.nodes) {
    const type = doc.types.find(t => t.id === node.type);
    if (!type?.instrument) continue;
    const context=type.fields.find(f=>f.key==="context"&&f.direction==="input"),ui=type.fields.find(f=>f.key==="ui"&&f.direction==="output");
    if(context?.kind!=="object"||context.meaning!=="toolContext"||context.unit!==""||ui?.kind!=="object"||ui.meaning!=="view"||ui.unit!=="")throw new DiagramError("Инструменту продукта нужны вход context (toolContext) и выход ui (view)",root.id,node.id);
    if (!safeId(node.id) || !node.name.trim() || node.tool?.order != null && !Number.isFinite(node.tool.order) || node.tool?.enabled != null && typeof node.tool.enabled !== "boolean" || node.tool?.tests != null && (!Array.isArray(node.tool.tests) || node.tool.tests.length > 100)) throw new DiagramError("Некорректные свойства инструмента продукта", root.id, node.id);
  }
}
export function validateProductPorts(plan: Plan, root: string) {
  const fields: Step["fields"] = [],
    links: Edge[] = [];
  for (const step of plan.steps) for (const field of step.fields) if (field.direction !== "input") {
    const key = "p" + fields.length;
    fields.push({
      ...field,
      key,
      direction: "input"
    });
    links.push({
      from: step.id,
      out: field.key,
      to: "__validate_ports",
      input: key
    });
  }
  const end: Step = {
    id: "__validate_ports",
    fields,
    links,
    values: {},
    expressions: {}
  };
  productSlice({
    ...plan,
    steps: [...plan.steps, end]
  }, {
    __validate_ports: fields.map(f => f.key)
  }, root, "");
}
const connectionCache = new WeakMap<ToolDocument, Map<string, string>>();
/** UI connections use the same expanded-port dependencies as publication. */
export function productConnectionProblem(doc: ToolDocument, graph: Diagram, edge: Edge): string {
  if (!doc.product) return connectionFeedback(graph, doc.types, edge);
  if(graph.id===doc.product.root&&edge.input==="context"&&doc.types.find(t=>t.id===graph.nodes.find(n=>n.id===edge.to)?.type)?.instrument)return "Контекст экземпляра задаётся системой; подключите расчётный вход";
  const contract = connectionFeedback(graph, doc.types, edge, false);
  if (contract) return contract;
  const coarse = connectionFeedback(graph, doc.types, edge);
  if (!coarse && graph.id === doc.product.root) return "";
  const cache = connectionCache.get(doc) ?? new Map<string, string>();
  connectionCache.set(doc, cache);
  const key = JSON.stringify([graph.id, edge.from, edge.out, edge.to, edge.input]);
  if (cache.has(key)) return cache.get(key)!;
  const changed = {
      ...graph,
      edges: [...graph.edges.filter(e => e.to !== edge.to || e.input !== edge.input), edge]
    },
    proposed = {
      ...doc,
      diagrams: doc.diagrams.map(g => g.id === graph.id ? changed : g)
    };
  let result = "";
  try {
    const root = proposed.diagrams.find(g => g.id === doc.product!.root)!;
    validateProductPorts(pruneProductParameters(flattenProduct(proposed, root)), root.id);
  } catch (error) {
    if ((error as Error).message.includes("Цикл")) result = (error as Error).message;
  }
  cache.set(key, result);
  return result;
}
