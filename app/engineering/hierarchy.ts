import { compileDiagram, DiagramError, executableSlice, type Plan, type Step } from "./engine";
import type { Diagram, Document, Edge, Field, GraphNode, NodeType } from "./schema";
export const ROOT = "station";
export const childDiagram = (type: NodeType, parent: string) => type.instrument ?? (type.native !== parent ? type.native : undefined);
export const portNode = (path: string, id: string) => path ? path + "/" + id : id;
export function definitionPorts(diagram: Diagram, types: NodeType[]) {
  const boundary = (id: string) => types.find(t => t.id === diagram.nodes.find(n => n.id === id)?.type)?.fields ?? [];
  return [...boundary("source").map(f => ({
    ...f,
    direction: "input" as const
  })), ...boundary("result").map(f => ({
    ...f,
    direction: "output" as const
  }))];
}
function verifyInterface(type: NodeType, graph: Diagram, types: NodeType[]) {
  const fields = definitionPorts(graph, types);
  if (fields.length !== type.fields.length || fields.some(f => !type.fields.some(p => p.key === f.key && p.kind === f.kind && p.meaning === f.meaning && p.unit === f.unit && p.direction === f.direction))) throw new DiagramError(type.name + " · внешний порт отличается от поля границы Instrument", graph.id);
}

/** Flatten container boundaries to ordinary typed steps. Paths are also trace addresses. */
export function compileTree(document: Document, root: Diagram): Plan {
  const byType = new Map(document.types.map(t => [t.id, t]));
  const graphs = new Map(document.diagrams.map(g => [g.id, g]));
  const steps: Step[] = [];
  function expand(graph: Diagram, path: string, ancestors: string[], instance?: Step) {
    if (ancestors.includes(graph.id) || ancestors.length >= 16) throw new DiagramError("Цикл или превышена глубина Instrument · " + [...ancestors, graph.id].join(" → "), graph.id);
    const containers = new Map<string, Diagram>();
    for (const n of graph.nodes) {
      const type = byType.get(n.type);
      if (!type) throw new DiagramError("Неизвестный тип", graph.id, n.id);
      const target = childDiagram(type, graph.id);
      if (!target) continue;
      const child = graphs.get(target);
      if (!child) throw new DiagramError("Отсутствует определение Instrument", graph.id, n.id);
      verifyInterface(type, child, document.types);
      containers.set(n.id, child);
    }
    const local = compileDiagram(graph, document.types, true);
    for (const step of local.steps) {
      if (steps.length > 18000) throw new DiagramError("Слишком большой развёрнутый граф", graph.id, step.id);
      const id = portNode(path, step.id);
      const links = step.links.map(e => ({
        ...e,
        from: portNode(path, e.from) + (containers.has(e.from) ? "/result" : ""),
        to: id
      }));
      const child = containers.get(step.id);
      if (child) {
        expand(child, id, [...ancestors, graph.id], {
          ...step,
          links
        });
        continue;
      }
      const expanded: Step = {
        ...step,
        id,
        links,
        ...(step.native === graph.id ? {
          direct: true
        } : {})
      };
      if (instance && (step.id === "source" || step.id === "result")) {
        expanded.fields = step.fields.map(f => ({
          ...f,
          direction: "both"
        }));
        if (step.id === "source") {
          expanded.values = {
            ...expanded.values,
            ...instance.values
          };
          expanded.links = instance.links.map(e => ({
            ...e,
            to: id
          }));
        }
      }
      steps.push(expanded);
    }
  }
  expand(root, "", []);
  return {
    id: root.id,
    steps
  };
}

/** Each normal screen demands just its output from the same station and supplies its own host inputs. */
export function endpointPlan(root: Plan, key: string, host: string) {
  if (!root.steps.find(s => s.id === "result")?.links.some(e => e.input === key)) throw new DiagramError("Подключите выход станции · " + key, ROOT, "result");
  const selected = executableSlice(root, [key]);
  const end = selected.steps.at(-1)!;
  return {
    ...selected,
    id: host,
    steps: [...selected.steps.slice(0, -1), {
      ...end,
      fields: end.fields.map(f => ({
        ...f,
        key: "value"
      })),
      links: end.links.map(e => ({
        ...e,
        input: "value"
      }))
    }]
  };
}
export type Boundary = {
  key: string;
  node: string;
  field: string;
  direction: "input" | "output";
};
export function encapsulate(doc: Document, graph: Diagram, ids: string[], name: string, ports: Boundary[]) {
  const members = new Set(ids),
    nodes = graph.nodes.filter(n => members.has(n.id));
  if (!nodes.length || nodes.some(n => ["source", "result"].includes(n.id))) throw Error("Выберите внутренние узлы");
  const uid = "i_" + crypto.randomUUID().replaceAll("-", "");
  const fields: Field[] = ports.map(p => {
    const n = nodes.find(n => n.id === p.node),
      f = doc.types.find(t => t.id === n?.type)?.fields.find(f => f.key === p.field);
    if (!f || f.direction === (p.direction === "input" ? "output" : "input")) throw Error("Недоступный порт " + p.field);
    return {
      ...f,
      key: p.key,
      direction: p.direction,
      ...(p.direction === "input" && n && Object.hasOwn(n.values, p.field) ? {
        initial: n.values[p.field]
      } : {})
    };
  });
  if (new Set(fields.map(f => f.key)).size !== fields.length) throw Error("Ключи внешних портов должны быть уникальны");
  const port = (dir: Boundary["direction"], n: string, k: string) => {
    const p = ports.find(p => p.direction === dir && p.node === n && p.field === k);
    if (!p) throw Error("Для существующей связи откройте порт " + n + "." + k);
    return p.key;
  };
  const outer: Edge[] = [],
    inner: Edge[] = [];
  for (const e of graph.edges) {
    const from = members.has(e.from),
      to = members.has(e.to);
    if (from && to) inner.push(e);else if (from) outer.push({
      ...e,
      from: uid,
      out: port("output", e.from, e.out)
    });else if (to) outer.push({
      ...e,
      to: uid,
      input: port("input", e.to, e.input)
    });else outer.push(e);
  }
  for (const p of ports) {
    inner.push(p.direction === "input" ? {
      from: "source",
      out: p.key,
      to: p.node,
      input: p.field
    } : {
      from: p.node,
      out: p.field,
      to: "result",
      input: p.key
    });
  }
  const x = Math.min(...nodes.map(n => n.x)),
    y = Math.min(...nodes.map(n => n.y));
  const n = (id: string, type: string, name: string, x: number, y: number): GraphNode => ({
    id,
    type,
    name,
    x,
    y,
    values: {}
  });
  const type: NodeType = {
    id: uid,
    name,
    category: "Инструменты",
    description: name,
    fields,
    formulas: {},
    instrument: uid,
    section: "edit"
  };
  const boundaryType = (dir: "input" | "output", suffix: string): NodeType => ({
    ...type,
    id: uid + suffix,
    instrument: undefined,
    name: dir === "input" ? "Входы Instrument" : "Выходы Instrument",
    fields: fields.filter(f => f.direction === dir).map(f => ({
      ...f,
      direction: dir === "input" ? "output" : "input"
    }))
  });
  const child: Diagram = {
    id: uid,
    name,
    groups: {
      ...graph.groups
    },
    nodes: [n("source", uid + ".in", "Входы", 0, 0), ...nodes.map(node => ({
      ...node,
      x: node.x - x + 320,
      y: node.y - y
    })), n("result", uid + ".out", "Выходы", Math.max(...nodes.map(n => n.x)) - x + 650, 0)],
    edges: inner
  };
  return {
    id: uid,
    document: {
      ...doc,
      types: [...doc.types, type, boundaryType("input", ".in"), boundaryType("output", ".out")],
      diagrams: [...doc.diagrams.map(g => g.id === graph.id ? {
        ...g,
        nodes: [...g.nodes.filter(n => !members.has(n.id)), n(uid, uid, name, x, y)],
        edges: outer
      } : g), child]
    }
  };
}
