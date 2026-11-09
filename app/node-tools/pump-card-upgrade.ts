import { definitionPorts } from "../engineering/hierarchy";
import { makeField, type Diagram, type GraphNode } from "../engineering/schema";
import type { ToolDocument } from "./schema";

/** Additive migration of the existing standard instruments; never replace user wires. */
export function connectPumpCardPoints(doc: ToolDocument, onlyId?: string): void {
  const root = doc.diagrams.find(g => g.id === doc.product?.root);
  if (!root) return;
  const type = (n: GraphNode) => doc.types.find(t => t.id === n.type)!;
  const graph = (n: GraphNode) => doc.diagrams.find(g => g.id === type(n)?.instrument);
  const operations = (g: Diagram, op: string) => g.nodes.filter(n => type(n)?.operation === op);
  const boundary = (g: Diagram, id: string) => { const n = g.nodes.find(n => n.id === id); return n && type(n); };
  const sync = (g: Diagram) => { const fields = definitionPorts(g, doc.types); doc.types.filter(t => t.instrument === g.id).forEach(t => { t.fields = fields; }); };
  const selectionSource = (n: GraphNode) => root.edges.filter(e => e.to === n.id && type(n).fields.some(f => f.key === e.input && f.meaning === "pumpSelectionState")).map(e => e.from + "/" + e.out);
  const port = (g: Diagram, id: "source" | "result", preferred: string, name: string, meaning: string) => {
    const t = boundary(g, id); if (!t) return null;
    // A shared boundary definition is not modified: it may belong to unrelated instruments.
    if (doc.diagrams.some(other => other.id !== g.id && other.nodes.some(n => n.type === t.id))) return null;
    let key = preferred, index = 2;
    while (t.fields.some(f => f.key === key && f.meaning !== meaning)) key = preferred + "_" + index++;
    if (!t.fields.some(f => f.key === key)) t.fields.push({ ...makeField(key, name, "object", meaning), direction: id === "source" ? "output" : "input", required: false });
    return key;
  };
  for (const card of root.nodes.filter(n => !onlyId || n.id === onlyId)) {
    const cg = graph(card); if (!cg) continue;
    const nodes = operations(cg, "pump.detailData"); if (nodes.length !== 1) continue;
    const details = nodes[0];
    if (cg.edges.some(e => e.to === details.id && e.input === "operatingPoint") || Object.hasOwn(details.values, "operatingPoint")) continue;
    const origins = selectionSource(card); if (origins.length !== 1) continue;
    const charts = root.nodes.filter(n => n.id !== card.id && n.tool?.enabled !== false && selectionSource(n).includes(origins[0]) && graph(n) && operations(graph(n)!, "pump.chartPoint").length === 1);
    if (charts.length !== 1) continue;
    const chart = charts[0], hg = graph(chart)!, point = operations(hg, "pump.chartPoint")[0];
    if (!type(point).fields.some(f => f.key === "details" && f.meaning === "pumpOperatingPoint")) continue;
    const out = port(hg, "result", "operatingPoint", "Рабочая точка с условиями расчёта", "pumpOperatingPoint");
    const input = port(cg, "source", "operatingPoint", "Рабочая точка с условиями расчёта", "pumpOperatingPoint");
    if (!out || !input) continue;
    const existing = hg.edges.find(e => e.to === "result" && e.input === out);
    if (existing && (existing.from !== point.id || existing.out !== "details") || root.edges.some(e => e.to === card.id && e.input === input)) continue;
    if (!existing) hg.edges.push({ from: point.id, out: "details", to: "result", input: out });
    cg.edges.push({ from: "source", out: input, to: details.id, input: "operatingPoint" });
    sync(hg); sync(cg);
    root.edges.push({ from: chart.id, out, to: card.id, input });
  }
}
