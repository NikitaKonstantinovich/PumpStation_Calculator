import { childDiagram, ROOT } from "./hierarchy";
import type { Diagram, Document, GraphNode, NodeType } from "./schema";
export const WIDTH = 284;
export type Address = {
  graph: string;
  path: string[];
  node: string;
};
export type Frame = {
  x: number;
  y: number;
  k: number;
};
export const sections = {
  input: "Ввод",
  edit: "Редактирование и отображение",
  output: "Вывод"
};
export function layout(doc: Document) {
  const types = new Map(doc.types.map(t => [t.id, t]));
  const diagrams = new Map(doc.diagrams.map(g => [g.id, g]));
  function card(g: Diagram, n: GraphNode) {
    const type = types.get(n.type)!;
    const pins = (out: boolean) => type.fields.filter(f => g.edges.some(e => out ? e.from === n.id && e.out === f.key : e.to === n.id && e.input === f.key));
    const ins = pins(false),
      outs = pins(true);
    const child = diagrams.get(childDiagram(type, g.id) ?? "");
    return {
      n,
      type,
      ins,
      outs,
      child,
      h: Math.max(child ? 147 : 85, 64 + 27 * Math.max(ins.length, outs.length))
    };
  }
  const sizes = new Map<string, ReturnType<typeof bounds>>();
  function bounds(g: Diagram) {
    const x = Math.min(0, ...g.nodes.map(n => n.x)),
      y = Math.min(0, ...g.nodes.map(n => n.y));
    return {
      x,
      y,
      w: Math.max(1, ...g.nodes.map(n => n.x + WIDTH - x)),
      h: Math.max(1, ...g.nodes.map(n => n.y + card(g, n).h - y))
    };
  }
  function size(g: Diagram) {
    let s = sizes.get(g.id);
    if (!s) {
      s = bounds(g);
      sizes.set(g.id, s);
    }
    return s;
  }
  function nested(frame: Frame, g: Diagram, n: GraphNode, child: Diagram): Frame {
    const b = size(child),
      h = card(g, n).h;
    const k = Math.min((WIDTH - 32) / b.w, (h - 46) / b.h);
    return {
      k: frame.k * k,
      x: frame.x + frame.k * (n.x + (WIDTH - b.w * k) / 2 - b.x * k),
      y: frame.y + frame.k * (n.y + 29 + (h - 40 - b.h * k) / 2 - b.y * k)
    };
  }
  function locate(graph: string, root = ROOT): string[] | null {
    const queue: {
        id: string;
        path: string[];
      }[] = [{
        id: root,
        path: []
      }],
      seen = new Set<string>();
    for (let i = 0; i < queue.length; i++) {
      const {
        id,
        path
      } = queue[i];
      if (id === graph) return path;
      if (seen.has(id)) continue;
      seen.add(id);
      const g = diagrams.get(id);
      if (!g) continue;
      for (const n of g.nodes) {
        const t = types.get(n.type);
        const next = t && childDiagram(t, id);
        if (next) queue.push({
          id: next,
          path: [...path, n.id]
        });
      }
    }
    return null;
  }
  function at(base: string, path: string[]) {
    let graph = diagrams.get(base)!,
      frame = {
        x: 0,
        y: 0,
        k: 1
      };
    for (const key of path) {
      const n = graph.nodes.find(n => n.id === key);
      if (!n) break;
      const child = card(graph, n).child;
      if (!child) break;
      frame = nested(frame, graph, n, child);
      graph = child;
    }
    return {
      graph,
      frame
    };
  }
  return {
    card,
    size,
    nested,
    locate,
    at,
    diagrams
  };
}
export function classification(type: NodeType) {
  return type.section ? sections[type.section] : type.category;
}
