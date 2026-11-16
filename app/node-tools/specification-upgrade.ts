import type { ToolDocument } from "./schema";
import { specificationNodeTypes } from "./specification-nodes";
import { boundaryType, syncInstrument } from "./visualization-tools";

/** Update the specification in a new publication of the station algorithm. */
export function enableAutomaticStationInsertions(document: ToolDocument): ToolDocument {
  const doc = structuredClone(document);
  const automatic = specificationNodeTypes().find(type => type.operation === "spec.linesAutomatic")!;
  if (!doc.types.some(type => type.id === automatic.id)) doc.types.push(automatic);
  const types = new Map(doc.types.map(type => [type.id, type]));
  let found = false;
  for (const graph of doc.diagrams) {
    const lines = graph.nodes.filter(node => ["spec.lines", "spec.linesAutomatic"].includes(types.get(node.type)?.operation ?? ""));
    if (!lines.length) continue;
    found = true;
    for (const node of lines) {
      node.type = automatic.id;
      node.name = automatic.name;
    }
    const panels = new Set(graph.nodes.filter(node => types.get(node.type)?.operation === "ui.specification").map(node => node.id));
    graph.edges = graph.edges.filter(edge => !panels.has(edge.to) || edge.input !== "dnBinding");
    if (graph.edges.some(edge => edge.from === "source" && edge.out === "dnBinding")) continue;
    const source = graph.nodes.find(node => node.id === "source");
    if (!source || !types.get(source.type)?.fields.some(field => field.key === "dnBinding")) continue;
    const boundary = boundaryType(doc, graph, "source");
    boundary.fields = boundary.fields.filter(field => field.key !== "dnBinding");
    syncInstrument(doc, graph);
    for (const parent of doc.diagrams) {
      const instances = new Set(parent.nodes.filter(node => types.get(node.type)?.instrument === graph.id).map(node => node.id));
      parent.edges = parent.edges.filter(edge => !instances.has(edge.to) || edge.input !== "dnBinding");
    }
  }
  if (!found) throw Error("В алгоритме не найден расчёт сборочных линий");
  return doc;
}
