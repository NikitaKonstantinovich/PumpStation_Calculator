import { compatible, type Diagram, type Edge, type NodeType } from "./schema";

/** Reports the actual contract mismatch before a connection reaches the compiler. */
export function connectionFeedback(graph: Diagram, types: NodeType[], edge: Edge, checkCycles = true): string {
  const field = (node: string, key: string) => types.find(t => t.id === graph.nodes.find(n => n.id === node)?.type)?.fields.find(f => f.key === key);
  const out = field(edge.from, edge.out), input = field(edge.to, edge.input);
  if (!out || !input) return "Узел или атрибут больше не существует";
  if (out.direction === "input") return "Источник должен быть выходным портом";
  if (input.direction === "output") return "Получатель должен быть входным портом";
  if (out.kind !== input.kind) return `Тип: ожидается ${input.kind}, передаётся ${out.kind}`;
  if (out.meaning !== input.meaning) return `Смысл: ожидается «${input.meaning}», передаётся «${out.meaning}»`;
  if (out.unit !== input.unit) return `Единица: ожидается «${input.unit || "без единицы"}», передаётся «${out.unit || "без единицы"}»`;
  if (!compatible(out, input)) return "Структура объекта или элементов списка не соответствует входному контракту";
  if(!checkCycles)return "";
  // Replacing an occupied input removes its previous edge before cycle checking.
  const edges = graph.edges.filter(e => e.to !== edge.to || e.input !== edge.input);
  const queue = [edge.to], seen = new Set<string>();
  while (queue.length) {
    const id = queue.pop()!;
    if (id === edge.from) return "Связь создаст цикл зависимостей";
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of edges) if (e.from === id) queue.push(e.to);
  }
  return "";
}
