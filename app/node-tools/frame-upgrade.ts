import { makeField } from "../engineering/schema";
import { addProductTool } from "./authoring";
import { boundaryType, syncInstrument } from "./visualization-tools";
import { FRAME_STAGES } from "./frame-nodes";
import type { ToolDocument } from "./schema";

/** Explicit, idempotent migration of one specification. Existing project versions stay pinned. */
export function addFrameCalculation(document: ToolDocument, specificationId: string) {
  const input = structuredClone(document);
  const root = input.diagrams.find(g => g.id === input.product?.root);
  const spec = root?.nodes.find(n => n.id === specificationId);
  const graph = input.diagrams.find(g => g.id === input.types.find(t => t.id === spec?.type)?.instrument);
  if (!root || !spec || !graph) throw Error("Не найден инструмент спецификации");
  const existing = root.edges.find(e => e.from === specificationId && e.out === "frameInput");
  if (existing) {
    const target = root.nodes.find(n => n.id === existing.to);
    const inner = input.diagrams.find(g => g.id === input.types.find(t => t.id === target?.type)?.instrument);
    if (inner?.nodes.some(n => input.types.find(t => t.id === n.type)?.operation === "frame.inputs")) return {document: input, id: target!.id, diagram: inner.id};
    throw Error("Выход расчёта рамы уже используется другим инструментом");
  }
  const finalizers = graph.nodes.filter(n => input.types.find(t => t.id === n.type)?.operation === "spec.finalize");
  if (finalizers.length !== 1) throw Error("Требуется один узел согласования спецификации");
  const incoming = graph.edges.filter(e => e.to === finalizers[0].id && e.input === "work");
  if (incoming.length !== 1) throw Error("Не найден однозначный источник состава спецификации");
  const added = addProductTool(input, "Расчёт гнутой рамы");
  const doc = added.document, nextRoot = doc.diagrams.find(g => g.id === root.id)!;
  const sg = doc.diagrams.find(g => g.id === graph.id)!, fg = doc.diagrams.find(g => g.id === added.diagram)!;
  for (const [side, key, name] of [["source", "frameResult", "Состав с рассчитанной рамой"], ["result", "frameInput", "Состав до расчёта рамы"]] as const) {
    const boundary = boundaryType(doc, sg, side);
    if (boundary.fields.some(f => f.key === key)) throw Error("Порт уже существует: " + name);
    boundary.fields.push({...makeField(key, name, "object", "stationSpecificationWork"), direction: side === "source" ? "output" : "input", required: false});
  }
  sg.edges = sg.edges.filter(e => !(e.to === finalizers[0].id && e.input === "work"));
  sg.edges.push({...incoming[0], to: "result", input: "frameInput"}, {from: "source", out: "frameResult", to: finalizers[0].id, input: "work"});
  syncInstrument(doc, sg);
  const node = nextRoot.nodes.find(n => n.id === added.id)!;
  node.tool = {...node.tool, category: "Обработка и отображение", workspaceVisible: false};
  boundaryType(doc, fg, "source").fields.push({...makeField("work", "Состав до расчёта рамы", "object", "stationSpecificationWork"), direction: "output", required: false});
  const result = boundaryType(doc, fg, "result");
  result.fields = result.fields.map(f => f.key === "value" ? {...f, meaning: "stationSpecificationWork", name: "Состав с рассчитанной рамой"} : f);
  fg.nodes = fg.nodes.filter(n => ["source", "result", "form"].includes(n.id));
  fg.edges = fg.edges.filter(e => e.from === "form" && e.to === "result");
  FRAME_STAGES.forEach(([type, name], i) => {
    const id = "stage" + i;
    fg.nodes.push({id, type, name, x: 350 + i * 360, y: 260, values: {}});
    fg.edges.push({from: i ? "stage" + (i - 1) : "source", out: i ? "value" : "work", to: id, input: "work"});
  });
  fg.edges.push({from: "stage" + (FRAME_STAGES.length - 1), out: "value", to: "result", input: "value"});
  syncInstrument(doc, fg);
  nextRoot.edges.push({from: specificationId, out: "frameInput", to: added.id, input: "work"}, {from: added.id, out: "value", to: specificationId, input: "frameResult"});
  return {document: doc, id: added.id, diagram: fg.id};
}
