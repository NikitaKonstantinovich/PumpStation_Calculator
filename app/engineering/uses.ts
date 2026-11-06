import { childDiagram, ROOT } from "./hierarchy";
import type { Document } from "./schema";
export function usesInStation(doc: Document, typeId: string) {
  const graphs = new Map(doc.diagrams.map(g => [g.id, g])),
    types = new Map(doc.types.map(t => [t.id, t]));
  const uses: {
    diagram: string;
    node: string;
    path: string[];
    name: string;
    links: number;
  }[] = [];
  function visit(id: string, path: string[], names: string[], parents: Set<string>) {
    if (parents.has(id) || parents.size >= 16 || uses.length >= 150) return;
    const g = graphs.get(id);
    if (!g) return;
    const chain = new Set(parents).add(id);
    for (const n of g.nodes) {
      if (n.type === typeId) uses.push({
        diagram: id,
        node: n.id,
        path,
        name: [...names, n.name].join(" → "),
        links: g.edges.filter(e => e.from === n.id || e.to === n.id).length
      });
      const t = types.get(n.type),
        child = t && childDiagram(t, id);
      if (child) visit(child, [...path, n.id], [...names, n.name], chain);
    }
  }
  visit(ROOT, [], [], new Set());
  return uses;
}
