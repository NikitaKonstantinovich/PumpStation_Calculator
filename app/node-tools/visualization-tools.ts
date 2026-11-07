import { makeField, compatible, type Diagram, type Edge, type Field, type GraphNode } from "../engineering/schema";
import { definitionPorts } from "../engineering/hierarchy";
import { defaultChartGridSettings } from "../pump-chart-grid";
import { defaultPumpFrequencySettings } from "../pump-frequency";
import { addProductTool, prepareDocument } from "./authoring";
import { parameterType } from "./compiler";
import { hydraulicNodeTypes } from "./hydraulic-nodes";
import { detailNodeTypes } from "./pump-detail-data";
import { deriveTools } from "./product";
import type { ToolDocument } from "./schema";

export type VisualizationKind = "hydraulic" | "card";
export type VisualizationSource = { id: string; name: string };
export type VisualizationSources = { selections: VisualizationSource[]; settings: VisualizationSource[] };
type Location = { graph: Diagram; node: GraphNode; parents: { graph: Diagram; node: GraphNode }[] };
type Ref = { from: string; out: string };

const field = (key: string, name: string, meaning: string, direction: Field["direction"] = "input", kind: Field["kind"] = "object"): Field => ({ ...makeField(key, name, kind, meaning), direction, required: false });
const typeOf = (doc: ToolDocument, node: GraphNode) => doc.types.find(type => type.id === node.type)!;
const diagramOf = (doc: ToolDocument, node: GraphNode) => doc.diagrams.find(graph => graph.id === typeOf(doc, node)?.instrument);

function unique(preferred: string, used: Iterable<string>) {
  const keys = new Set(used);
  if (!keys.has(preferred)) return preferred;
  let index = 2;
  while (keys.has(preferred.slice(0, 85) + "_" + index)) index++;
  return preferred.slice(0, 85) + "_" + index;
}

function locations(doc: ToolDocument, graph: Diagram, parents: Location["parents"] = [], visited = new Set<string>()): Location[] {
  if (visited.has(graph.id) || visited.size >= 16) return [];
  const seen = new Set(visited).add(graph.id);
  return graph.nodes.flatMap(node => {
    const child = diagramOf(doc, node);
    return [{ graph, node, parents }, ...(child ? locations(doc, child, [...parents, { graph, node }], seen) : [])];
  });
}

function selectionLocations(doc: ToolDocument, graph: Diagram): Location[] {
  const found: Location[] = [];
  function follow(current: Diagram, ref: Ref, parents: Location["parents"], seen: Set<string>) {
    const key = current.id + ":" + ref.from + ":" + ref.out;
    if (seen.has(key) || seen.size >= 32) return;
    const next = new Set(seen).add(key), node = current.nodes.find(node => node.id === ref.from);
    if (!node) return;
    if (typeOf(doc, node).operation === "pump.select" && ref.out === "value") { found.push({ graph: current, node, parents }); return; }
    const child = diagramOf(doc, node), edge = child?.edges.find(edge => edge.to === "result" && edge.input === ref.out);
    if (child && edge) follow(child, edge, [...parents, { graph: current, node }], next);
  }
  const result = graph.nodes.find(node => node.id === "result");
  for (const port of result ? typeOf(doc, result).fields : []) {
    if (port.kind !== "object" || port.meaning !== "pumpCatalogItem") continue;
    const edge = graph.edges.find(edge => edge.to === "result" && edge.input === port.key);
    if (edge) follow(graph, edge, [], new Set());
  }
  if (found.length) return found.filter((location, index) => found.findIndex(other => other.graph.id === location.graph.id && other.node.id === location.node.id && JSON.stringify(other.parents.map(parent => parent.node.id)) === JSON.stringify(location.parents.map(parent => parent.node.id))) === index);
  return locations(doc, graph).filter(({ node }) => typeOf(doc, node).operation === "pump.select");
}

/** Sources are identified by their operations and parameter contracts, never display names. */
export function visualizationSources(document: ToolDocument): VisualizationSources {
  const doc = prepareDocument(document), root = doc.diagrams.find(graph => graph.id === doc.product!.root)!;
  const result: VisualizationSources = { selections: [], settings: [] };
  for (const tool of deriveTools(doc).filter(tool => tool.enabled !== false)) {
    const node = root.nodes.find(node => node.id === tool.id)!, graph = diagramOf(doc, node);
    if (!graph) continue;
    const contents = locations(doc, graph);
    if (selectionLocations(doc, graph).length === 1) result.selections.push({ id: node.id, name: node.name });
    const meanings = new Set(contents.flatMap(({ node }) => {
      const parameter = typeOf(doc, node).parameter;
      return parameter ? [parameter.field.meaning] : [];
    }));
    if (["stationType", "flow", "head"].every(meaning => meanings.has(meaning))) result.settings.push({ id: node.id, name: node.name });
  }
  return result;
}

function syncInstrument(doc: ToolDocument, graph: Diagram) {
  const ports = definitionPorts(graph, doc.types);
  doc.types = doc.types.map(type => type.instrument === graph.id ? { ...type, fields: ports } : type);
}

function boundaryType(doc: ToolDocument, graph: Diagram, id: "source" | "result") {
  const node = graph.nodes.find(node => node.id === id);
  if (!node) throw Error("В определении инструмента отсутствует граница «" + id + "»");
  let type = typeOf(doc, node);
  if (!type) throw Error("Не найден тип границы инструмента");
  if (doc.diagrams.some(other => other.id !== graph.id && other.nodes.some(item => item.type === type.id))) {
    type = { ...structuredClone(type), id: unique(graph.id + "." + id + ".visualization", doc.types.map(type => type.id)) };
    doc.types.push(type);
    node.type = type.id;
  }
  return type;
}

function exposeOutput(doc: ToolDocument, graph: Diagram, source: Ref, desired: Field) {
  const boundary = boundaryType(doc, graph, "result");
  const actual = typeOf(doc, graph.nodes.find(node => node.id === source.from)!).fields.find(port => port.key === source.out);
  if (!actual || !compatible({ ...actual, direction: "output" }, { ...desired, direction: "input" })) throw Error("Расчётный выход не соответствует контракту «" + desired.name + "»");
  const existing = graph.edges.find(edge => edge.to === "result" && edge.from === source.from && edge.out === source.out && boundary.fields.some(port => port.key === edge.input && compatible({ ...desired, direction: "output" }, port)));
  if (existing) return existing.input;
  const key = unique(desired.key, definitionPorts(graph, doc.types).map(port => port.key));
  boundary.fields.push({ ...desired, key, direction: "input" });
  graph.edges.push({ ...source, to: "result", input: key });
  syncInstrument(doc, graph);
  return key;
}

function exposeLocation(doc: ToolDocument, location: Location, source: Ref, desired: Field) {
  let port = exposeOutput(doc, location.graph, source, desired);
  for (const parent of [...location.parents].reverse()) port = exposeOutput(doc, parent.graph, { from: parent.node.id, out: port }, desired);
  return port;
}

function selectedExports(doc: ToolDocument, root: Diagram, selectionId: string) {
  const container = root.nodes.find(node => node.id === selectionId), graph = container && diagramOf(doc, container);
  if (!graph) throw Error("Выберите инструмент подбора насосов");
  const producers = selectionLocations(doc, graph);
  if (producers.length !== 1) throw Error("В выбранном инструменте должна быть одна проверка выбранного исполнения");
  const producer = producers[0], incoming = producer.graph.edges.find(edge => edge.to === producer.node.id && edge.input === "candidates");
  if (!incoming) throw Error("Подключите результаты подбора к проверке выбранного исполнения");
  const item = exposeLocation(doc, producer, { from: producer.node.id, out: "value" }, field("item", "Выбранное исполнение", "pumpCatalogItem", "output"));
  const selection = exposeLocation(doc, producer, { from: producer.node.id, out: "selection" }, field("selection", "Статус подтверждения", "pumpSelectionState", "output"));
  // Read the request from precisely the dataset consumed by pump.select. Rebuilding
  // a pump.request here would lose configured contour/static-head/filter semantics.
  const linked = producer.graph.edges.find(edge => edge.to === "result" && typeOf(doc, producer.graph.nodes.find(node => node.id === edge.from)!).formulas?.value === 'get(candidates,"request")' && producer.graph.edges.some(input => input.to === edge.from && input.input === "candidates" && input.from === incoming.from && input.out === incoming.out));
  let requestSource: Ref;
  if (linked) requestSource = { from: linked.from, out: linked.out };
  else {
    const id = unique(producer.graph.id + ".selectedRequest", doc.types.map(type => type.id));
    doc.types.push({ id, name: "Условия подтверждённого подбора", category: "Гидравлическая кривая", description: "Точные условия из набора кандидатов, использованного проверкой выбранного исполнения.", fields: [field("candidates", "Результаты подбора", "pumpDataset"), field("value", "Условия подбора", "pumpRequest", "output")], formulas: { value: 'get(candidates,"request")' } });
    const nodeId = unique("selectedRequest", producer.graph.nodes.map(node => node.id));
    producer.graph.nodes.push({ id: nodeId, type: id, name: "Условия подтверждённого подбора", x: producer.node.x, y: producer.node.y + 240, values: {} });
    producer.graph.edges.push({ from: incoming.from, out: incoming.out, to: nodeId, input: "candidates" });
    requestSource = { from: nodeId, out: "value" };
  }
  const request = exposeLocation(doc, producer, requestSource, field("request", "Условия подбора", "pumpRequest", "output"));
  return { item, selection, request };
}

function mainInputView(doc: ToolDocument, root: Diagram, settingsId: string) {
  const node = root.nodes.find(node => node.id === settingsId), graph = node && diagramOf(doc, node);
  if (!graph) throw Error("Не найден выбранный инструмент настроек проекта");
  const candidates = locations(doc, graph).filter(location => {
    if (location.node.values.scope !== "main") return false;
    const child = diagramOf(doc, location.node);
    if (!child) return false;
    const meanings = new Set(locations(doc, child).flatMap(({ node }) => typeOf(doc, node).parameter ? [typeOf(doc, node).parameter!.field.meaning] : []));
    return meanings.has("flow") && meanings.has("head") && typeOf(doc, location.node).fields.some(port => port.direction === "output" && port.meaning === "view" && port.kind === "object");
  });
  if (candidates.length !== 1) return null;
  const candidate = candidates[0], ports = typeOf(doc, candidate.node).fields.filter(port => port.direction === "output" && port.meaning === "view" && port.kind === "object");
  if (ports.length !== 1) return null;
  return exposeLocation(doc, candidate, { from: candidate.node.id, out: ports[0].key }, field("mainInputsUi", "Основной контур — исходные данные", "view", "output"));
}

/** Explicit editor action only: append a real, editable Instrument to the product. */
export function addVisualizationTool(document: ToolDocument, kind: VisualizationKind, sources: { selectionId: string; settingsId?: string }): { document: ToolDocument; id: string; diagram: string } {
  if (!["hydraulic", "card"].includes(kind)) throw Error("Выберите шаблон инструмента");
  const doc = structuredClone(prepareDocument(document));
  const available = visualizationSources(doc);
  if (!available.selections.some(source => source.id === sources.selectionId)) throw Error("Выберите доступный инструмент подбора насосов");
  if (sources.settingsId && !available.settings.some(source => source.id === sources.settingsId)) throw Error("Выберите доступный инструмент настроек проекта");
  const missing = [...hydraulicNodeTypes(), ...detailNodeTypes()].filter(type => !doc.types.some(existing => existing.id === type.id));
  doc.types.push(...missing);
  const root = doc.diagrams.find(graph => graph.id === doc.product!.root)!;
  const exported = selectedExports(doc, root, sources.selectionId);
  const projectUi = kind === "hydraulic" && sources.settingsId ? mainInputView(doc, root, sources.settingsId) : null;
  const added = addProductTool(doc, kind === "hydraulic" ? "Гидравлическая кривая" : "Карточка насоса"), next = added.document;
  const targetRoot = next.diagrams.find(graph => graph.id === next.product!.root)!, graph = next.diagrams.find(graph => graph.id === added.diagram)!;
  const tool = targetRoot.nodes.find(node => node.id === added.id)!;
  tool.tool = { ...tool.tool, category: kind === "hydraulic" ? "Обработка и отображение" : "Вывод" };
  const source = boundaryType(next, graph, "source"), result = boundaryType(next, graph, "result");
  source.fields.push(field("item", "Выбранное исполнение", "pumpCatalogItem", "output"), field("selection", "Статус подтверждения", "pumpSelectionState", "output"));
  if (kind === "hydraulic") source.fields.push(field("request", "Условия подбора", "pumpRequest", "output"), field("projectInputsUi", "Основной контур — исходные данные", "view", "output"));
  result.fields = result.fields.map(port => port.key === "value" ? field("value", kind === "hydraulic" ? "Рабочая точка" : "Данные насоса", kind === "hydraulic" ? "pumpChartPoint" : "pumpCardData") : port);
  graph.nodes = graph.nodes.filter(node => node.id !== "record");
  graph.edges = graph.edges.filter(edge => edge.from !== "record");
  const wire = (from: string, out: string, to: string, input: string, kind?: Edge["kind"]) => graph.edges.push({ from, out, to, input, ...(kind ? { kind } : {}) });
  const add = (id: string, type: string, name: string, x: number, y: number) => graph.nodes.push({ id, type, name, x, y, values: {} });
  if (kind === "hydraulic") {
    for (const parameter of [
      { key: "method", name: "Метод построения кривой", meaning: "curveMethod", kind: "enum" as const, initial: "pchip", options: ["pchip", "linear", "polynomial"], names: { pchip: "PCHIP — через точки", linear: "Ломаная — по точкам", polynomial: "Полиномиальное сглаживание" } },
      { key: "frequency", name: "Частотное регулирование", meaning: "pumpFrequencySettings", kind: "object" as const, initial: defaultPumpFrequencySettings() },
      { key: "grid", name: "Настройки сетки графика", meaning: "pumpChartGrid", kind: "object" as const, initial: defaultChartGridSettings() }
    ]) {
      const contract: Field = { ...field(parameter.key, parameter.name, parameter.meaning, "input", parameter.kind), initial: parameter.initial, ...(parameter.options ? { options: parameter.options, optionNames: parameter.names } : {}) };
      const type = parameterType(unique(graph.id + ".parameter." + parameter.key, next.types.map(type => type.id)), parameter.name, contract, "input");
      type.parameter!.source = { mode: "user" };
      next.types.push(type);
      add(parameter.key, type.id, parameter.name, 650, ["method", "frequency", "grid"].indexOf(parameter.key) * 220);
      wire("project", "value", parameter.key, "values"); wire("project", "role", parameter.key, "role");
    }
    add("model", "pump.chartModel", "Модель гидравлической кривой", 1050, 0);
    add("axes", "pump.chartAxes", "Шкалы графика", 1390, 0);
    add("system", "pump.chartSystem", "Кривая системы", 1730, 0);
    add("point", "pump.chartPoint", "Фактическая рабочая точка", 1730, 230);
    add("pointBindings", "ui.chartPointBindings", "Поля исходных данных", 1050, 650);
    add("chart", "ui.hydraulicChart", "График гидравлических характеристик", 2070, 0);
    for (const key of ["item", "selection", "request"]) wire("source", key, "model", key);
    for (const key of ["method", "frequency"]) wire(key, "value", "model", key);
    wire("model", "model", "axes", "model"); wire("grid", "value", "axes", "grid");
    wire("model", "model", "system", "model"); wire("axes", "axes", "system", "axes");
    wire("model", "model", "point", "model");
    for (const [from, out, input] of [["model", "model", "model"], ["axes", "axes", "axes"], ["system", "segments", "segments"], ["point", "point", "point"]]) wire(from, out, "chart", input);
    for (const key of ["method", "frequency", "grid"]) wire(key, "binding", "chart", key + "Binding", "binding");
    wire("source", "projectInputsUi", "pointBindings", "ui");
    for (const key of ["flowBinding", "headBinding"]) wire("pointBindings", key, "chart", key, "binding");
    wire("chart", "value", "form", "child0"); wire("point", "point", "result", "value");
    for (const [id, x, y] of [["form", 2410, 0], ["save", 2070, 650], ["result", 2750, 0]] as const) Object.assign(graph.nodes.find(node => node.id === id)!, { x, y });
  } else {
    add("details", "pump.detailData", "Характеристики выбранного исполнения", 650, 0);
    add("card", "ui.pumpDetail", "Карточка насоса", 990, 0);
    wire("source", "item", "details", "item"); wire("source", "selection", "details", "selection");
    wire("details", "value", "card", "data"); wire("card", "value", "form", "child0"); wire("details", "value", "result", "value");
    for (const [id, x, y] of [["form", 1330, 0], ["save", 990, 350], ["result", 1670, 0]] as const) Object.assign(graph.nodes.find(node => node.id === id)!, { x, y });
  }
  syncInstrument(next, graph);
  const exportedKeys: (keyof typeof exported)[] = kind === "hydraulic" ? ["item", "selection", "request"] : ["item", "selection"];
  for (const key of exportedKeys) targetRoot.edges.push({ from: sources.selectionId, out: exported[key], to: added.id, input: key });
  if (projectUi && sources.settingsId) targetRoot.edges.push({ from: sources.settingsId, out: projectUi, to: added.id, input: "projectInputsUi" });
  return { document: next, id: added.id, diagram: added.diagram };
}
