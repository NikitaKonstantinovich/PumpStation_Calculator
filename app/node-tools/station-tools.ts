import { makeField, type Diagram, type Field, type GraphNode, type NodeType } from "../engineering/schema";
import { addProductTool, prepareDocument } from "./authoring";
import { parameterType } from "./compiler";
import { boundaryType, selectedExports, syncInstrument, visualizationSources } from "./visualization-tools";
import { deriveTools } from "./product";
import { defaultDnOverrides } from "./dn-runtime";
import { createCollectors } from "../collector-project";
import type { ToolDocument } from "./schema";

export type StationToolKind = "dn" | "collectors" | "specification";
export type StationToolSources = { settingsId?: string; selectionId?: string; secondarySelectionId?: string; dnId?: string; collectorsId?: string };
export const STATION_TOOL_NAMES: Record<StationToolKind, string> = { dn: "Расчёт DN", collectors: "Конструктор коллекторов", specification: "Спецификация" };
const field = (key: string, name: string, meaning: string, direction: Field["direction"] = "input", kind: Field["kind"] = "object"): Field => ({ ...makeField(key, name, kind, meaning), direction, required: false });
const typeOf = (doc: ToolDocument, node: GraphNode) => doc.types.find(type => type.id === node.type)!;
function parameterBindingOutput(doc: ToolDocument, root: Diagram, id: string, meaning: string): string | undefined {
  function follows(graph: Diagram, nodeId: string, port: string, parents: { graph: Diagram; node: string }[], visited: Set<string>): boolean {
    const token = [...parents.map(p => p.node), graph.id, nodeId, port].join("/");
    if (visited.has(token) || visited.size > 80) return false;
    const seen = new Set(visited).add(token), node = graph.nodes.find(n => n.id === nodeId);
    if (!node) return false;
    const type = typeOf(doc, node);
    if (type.parameter && port === "binding") return type.parameter.field.meaning === meaning;
    if (type.instrument) {
      const child = doc.diagrams.find(g => g.id === type.instrument), edge = child?.edges.find(e => e.to === "result" && e.input === port);
      return !!child && !!edge && follows(child, edge.from, edge.out, [...parents, { graph, node: nodeId }], seen);
    }
    if (nodeId === "source" && parents.length) {
      const parent = parents.at(-1)!, edge = parent.graph.edges.find(e => e.to === parent.node && e.input === port);
      return !!edge && follows(parent.graph, edge.from, edge.out, parents.slice(0, -1), seen);
    }
    return false;
  }
  const node = root.nodes.find(n => n.id === id);
  return node && typeOf(doc, node).fields.find(f => f.direction === "output" && f.meaning === "parameterBinding" && follows(root, id, f.key, [], new Set()))?.key;
}
function output(doc: ToolDocument, root: Diagram, id: string | undefined, meaning: string) {
  const node = root.nodes.find(node => node.id === id);
  if (!node || node.tool?.enabled === false) throw Error("Выберите подключённый инструмент — " + meaning);
  const ports = typeOf(doc, node).fields.filter(port => port.direction === "output" && port.meaning === meaning && port.kind === "object");
  if (ports.length !== 1) throw Error("В инструменте «" + node.name + "» должен быть один выход расчёта «" + meaning + "».");
  return { from: node.id, out: ports[0].key };
}
export function stationToolSources(document: ToolDocument) {
  const doc = prepareDocument(document), root = doc.diagrams.find(g => g.id === doc.product!.root)!;
  const byMeaning = (meaning: string) => deriveTools(doc).filter(t => t.enabled !== false && root.nodes.some(n => n.id === t.id && typeOf(doc, n).fields.some(f => f.direction === "output" && f.meaning === meaning))).map(t => ({ id: t.id, name: t.name }));
  return { ...visualizationSources(doc), dn: byMeaning("stationDnResult"), collectors: byMeaning("stationCollectorResult") };
}

/** Explicit editor action: each calculation phase remains an editable node. */
export function addStationTool(document: ToolDocument, kind: StationToolKind, sources: StationToolSources) {
  if (!Object.hasOwn(STATION_TOOL_NAMES, kind)) throw Error("Неизвестный инструмент комплектации");
  let doc = structuredClone(prepareDocument(document));
  const root = doc.diagrams.find(g => g.id === doc.product!.root)!;
  const links: { from: string; out: string; input: string; name: string; meaning: string }[] = [];
  if (kind === "dn") {
    links.push({ ...output(doc, root, sources.settingsId, "record"), input: "settings", name: "Настройки проекта", meaning: "record" });
    const available = visualizationSources(doc).selections;
    for (const secondary of [false, true]) {
      const id = secondary ? sources.secondarySelectionId : sources.selectionId;
      if (secondary && !id) continue;
      if (!id || !available.some(source => source.id === id)) throw Error("Выберите источник подтверждённого насоса");
      const ports = selectedExports(doc, root, id);
      for (const [key, name, meaning] of [["item", "Выбранный насос", "pumpCatalogItem"], ["selection", "Подтверждение насоса", "pumpSelectionState"], ["request", "Условия подбора", "pumpRequest"]] as const) links.push({ from: id, out: ports[key], input: secondary ? "secondary" + key[0].toUpperCase() + key.slice(1) : key, name: name + (secondary ? " — второй контур" : ""), meaning });
    }
  } else if (kind === "collectors") links.push({ ...output(doc, root, sources.dnId, "stationDnResult"), input: "dn", name: "Расчёт DN", meaning: "stationDnResult" });
  else links.push({ ...output(doc, root, sources.collectorsId, "stationCollectorResult"), input: "collectors", name: "Коллекторы и параметры установки", meaning: "stationCollectorResult" });
  const added = addProductTool(doc, STATION_TOOL_NAMES[kind]); doc = added.document;
  const graph = doc.diagrams.find(g => g.id === added.diagram)!, nextRoot = doc.diagrams.find(g => g.id === doc.product!.root)!;
  const rootNode = nextRoot.nodes.find(n => n.id === added.id)!;
  rootNode.tool = { ...rootNode.tool, category: kind === "specification" ? "Вывод" : "Обработка и отображение" };
  const source = boundaryType(doc, graph, "source"), result = boundaryType(doc, graph, "result");
  source.fields.push(...links.map(link => field(link.input, link.name, link.meaning, "output")));
  result.fields = result.fields.map(f => f.key === "value" ? field("value", STATION_TOOL_NAMES[kind], { dn: "stationDnResult", collectors: "stationCollectorResult", specification: "stationSpecificationResult" }[kind]) : f);
  graph.nodes = graph.nodes.filter(n => n.id !== "record"); graph.edges = graph.edges.filter(e => e.from !== "record");
  const add = (id: string, type: string, name: string, x: number, y: number, values: Record<string, unknown> = {}) => graph.nodes.push({ id, type, name, x, y, values });
  const wire = (from: string, out: string, to: string, input: string, binding = false) => graph.edges.push({ from, out, to, input, ...(binding ? { kind: "binding" as const } : {}) });
  function parameter(key: string, name: string, meaning: string, initial: unknown, permission: "input" | "options" | "all" = "all", kind: Field["kind"] = "object") {
    const t: NodeType = parameterType(graph.id + ".parameter." + key, name, { ...field(key, name, meaning, "input", kind), initial }, permission);
    t.parameter!.source = { mode: "user" }; doc.types.push(t);
    add(key, t.id, name, 350, 270 + graph.nodes.filter(n => n.type.includes(".parameter.")).length * 220);
    wire("project", "value", key, "values"); wire("project", "role", key, "role");
  }
  add("catalog", "engineering.catalog", "Справочники комплектации", 350, -300);
  if (kind === "dn") {
    parameter("dnOverrides", "Настройки DN, PN и арматуры", "dnOverrides", defaultDnOverrides());
    parameter("hydraulicOptions", "Комплектация и приборы установки", "hydraulicOptions", null, "options");
    add("context", "station.dnContext", "Исходные данные DN", 700, 0);
    add("primary", "station.dnCircuit", "Основной контур", 1040, 0);
    add("secondary", "station.dnCircuit", "Второй контур", 1040, 260, { secondary: true });
    add("calculation", "station.dnResult", "Результат расчёта DN", 1380, 0);
    add("panel", "ui.dnCalculator", "Панель расчёта DN", 1720, 0);
    for (const link of links) wire("source", link.input, "context", link.input);
    wire("catalog", "baseSettings", "context", "baseSettings"); wire("dnOverrides", "value", "context", "overrides");
    wire("hydraulicOptions", "value", "context", "hydraulicOptions");
    for (const key of ["primary", "secondary"]) { wire("context", "context", key, "context"); wire(key, "circuit", "calculation", key); }
    wire("context", "context", "calculation", "context"); wire("calculation", "value", "panel", "data"); wire("dnOverrides", "binding", "panel", "binding", true);
    wire("calculation", "value", "result", "value");
    // Binding is also exposed so the specification's insertion editor can write
    // to the exact same DN settings, without a second hidden copy.
    result.fields.push(field("dnBinding", "Настройки DN — редактирование", "parameterBinding")); wire("dnOverrides", "binding", "result", "dnBinding", true);
    result.fields.push(field("hydraulicBinding", "Комплектация — редактирование", "parameterBinding")); wire("hydraulicOptions", "binding", "result", "hydraulicBinding", true);
  } else if (kind === "collectors") {
    parameter("collectorState", "Настройки и результаты коллекторов", "collectorState", createCollectors(), "input");
    add("recommend", "collector.recommend", "Рекомендации из расчёта DN", 700, 0);
    add("resolve", "collector.resolve", "Конфигурация коллекторов", 1040, 0);
    add("calculate", "collector.calculate", "Материалы, сварка и стоимость", 1380, 0);
    add("calculation", "collector.result", "Результат конструктора", 1720, 0);
    add("actions", "collector.databaseActions", "Действия с базой коллекторов", 1380, 380);
    add("panel", "ui.collectorConstructor", "Карточки коллекторов", 2060, 0);
    wire("source", "dn", "recommend", "dn"); wire("recommend", "recommendations", "resolve", "recommendations"); wire("collectorState", "value", "resolve", "state"); wire("catalog", "catalog", "resolve", "catalog");
    wire("resolve", "resolved", "calculate", "resolved"); wire("resolve", "resolved", "calculation", "resolved"); wire("calculate", "calculations", "calculation", "calculations");
    wire("calculation", "result", "result", "value"); wire("resolve", "resolved", "panel", "resolved"); wire("calculate", "calculations", "panel", "calculations"); wire("actions", "commands", "panel", "commands"); wire("collectorState", "binding", "panel", "stateBinding", true);
    for (const [key, meaning, name] of [["dnBinding", "dnOverrides", "Настройки DN — редактирование"], ["hydraulicBinding", "hydraulicOptions", "Комплектация — редактирование"]]) {
      const port = parameterBindingOutput(doc, nextRoot, sources.dnId!, meaning);
      if (port) { source.fields.push(field(key, name, "parameterBinding", "output")); result.fields.push(field("forward_" + key, name, "parameterBinding")); wire("source", key, "result", "forward_" + key, true); nextRoot.edges.push({ from: sources.dnId!, out: port, to: added.id, input: key, kind: "binding" }); }
    }
  } else {
    parameter("manualRows", "Ручные позиции спецификации", "specManualRows", [], "all", "array");
    const stages = [["pumps", "spec.pumps", "Насосы и количества"], ["cabinet", "spec.cabinet", "Шкаф управления"], ["frame", "spec.frame", "Рама установки"], ["lines", "spec.lines", "Арматура и линии насосов"], ["options", "spec.options", "Приборы и опции"], ["finalize", "spec.finalize", "Состав и стоимость"], ["readiness", "spec.readiness", "Готовность спецификации"], ["panel", "ui.specification", "Таблица спецификации"]];
    stages.forEach(([id, type, name], i) => add(id, type, name, 700 + i * 340, 0));
    wire("source", "collectors", "pumps", "collectors"); wire("catalog", "resources", "pumps", "resources"); wire("manualRows", "value", "pumps", "manualRows");
    wire("pumps", "batch", "cabinet", "batch"); wire("cabinet", "value", "frame", "batch"); wire("frame", "work", "lines", "work"); wire("lines", "value", "options", "work"); wire("options", "value", "finalize", "work"); wire("finalize", "result", "readiness", "result"); wire("readiness", "data", "panel", "data"); wire("finalize", "result", "result", "value");
    wire("manualRows", "binding", "panel", "manualBinding", true);
    for (const [key, meaning, name] of [["dnBinding", "dnOverrides", "Настройки DN — редактирование"], ["hydraulicBinding", "hydraulicOptions", "Комплектация — редактирование"]]) {
      const port = parameterBindingOutput(doc, nextRoot, sources.collectorsId!, meaning);
      if (port) { source.fields.push(field(key, name, "parameterBinding", "output")); wire("source", key, "panel", key, true); nextRoot.edges.push({ from: sources.collectorsId!, out: port, to: added.id, input: key, kind: "binding" }); }
    }
  }
  wire("panel", "value", "form", "child0");
  const end = Math.max(...graph.nodes.map(n => n.x)) + 340;
  for (const [id, x, y] of [["form", end, 0], ["save", end, 380], ["result", end + 340, 0]] as const) Object.assign(graph.nodes.find(n => n.id === id)!, { x, y });
  graph.nodes.find(n => n.id === "form")!.values.showOrigin = false;
  syncInstrument(doc, graph);
  for (const { from, out, input } of links) nextRoot.edges.push({ from, out, to: added.id, input });
  return { document: doc, id: added.id, diagram: added.diagram };
}
