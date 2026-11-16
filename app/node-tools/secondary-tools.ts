import { makeField, type Field, type GraphNode } from "../engineering/schema";
import { addProductTool, prepareDocument } from "./authoring";
import { parameterType } from "./compiler";
import { selectionProofField } from "./pump-nodes";
import { addVisualizationTool, boundaryType, contourInputView, selectedExports, syncInstrument, visualizationSources } from "./visualization-tools";
import { connectPumpSpacing } from "./spacing-upgrade";
import type { ToolDocument, Values } from "./schema";

const field = (key: string, name: string, meaning: string, direction: Field["direction"] = "input", kind: Field["kind"] = "object"): Field => ({ ...makeField(key, name, kind, meaning), direction, required: false });
const rootOf = (doc: ToolDocument) => doc.diagrams.find(g => g.id === doc.product!.root)!;
const typeOf = (doc: ToolDocument, node: GraphNode) => doc.types.find(t => t.id === node.type)!;
const graphOf = (doc: ToolDocument, id: string) => doc.diagrams.find(g => g.id === typeOf(doc, rootOf(doc).nodes.find(n => n.id === id)!).instrument)!;

/** Explicit, idempotent editor command. Existing instruments and user wires are retained. */
export function addSecondaryTools(document: ToolDocument, settingsId: string) {
  let doc = prepareDocument(document);
  const existing = doc.secondaryTools?.[settingsId];
  if (existing) {
    if (!Object.values(existing).every(id => rootOf(doc).nodes.some(n => n.id === id))) throw Error("Часть инструментов второго контура удалена. Восстановите её из истории перед повторным добавлением.");
    return { document: doc, id: existing.selection, diagram: graphOf(doc, existing.selection).id, tools: existing };
  }
  if (!visualizationSources(doc).settings.some(s => s.id === settingsId)) throw Error("Выберите источник настроек проекта");
  const settingsNode = rootOf(doc).nodes.find(n => n.id === settingsId)!;
  const settingsPorts = typeOf(doc, settingsNode).fields.filter(f => f.direction === "output" && f.meaning === "record");
  if (settingsPorts.length !== 1) throw Error("У настроек должен быть один однозначный выход результата настроек");
  const settingsPort = settingsPorts[0].key;
  const inputView = contourInputView(doc, rootOf(doc), settingsId, "secondary");
  if (!inputView) throw Error("Не найдено однозначное представление полей второго контура. Подключите его в настройках проекта.");
  const added = addProductTool(doc, "Подбор насоса (2 контур)");
  doc = added.document;
  const graph = doc.diagrams.find(g => g.id === added.diagram)!;
  const source = boundaryType(doc, graph, "source"), result = boundaryType(doc, graph, "result");
  source.fields.push(field("settings", "Настройки проекта", "record", "output"), field("secondaryInputsUi", "Второй контур — исходные данные", "view", "output"));
  result.fields = result.fields.map(f => f.key === "value" ? field("value", "Выбранное исполнение", "pumpCatalogItem") : f);
  graph.nodes = graph.nodes.filter(n => n.id !== "record"); graph.edges = graph.edges.filter(e => e.from !== "record");
  const add = (id: string, type: string, name: string, x: number, y: number, values: Values = {}) => graph.nodes.push({ id, type, name, x, y, values });
  const wire = (from: string, out: string, to: string, input: string) => graph.edges.push({ from, out, to, input });
  const parameter = (id: string, name: string, contract: Field, y: number) => {
    const type = parameterType(graph.id + ".parameter." + id, name, contract, "input");
    type.parameter!.source = { mode: "user" }; doc.types.push(type);
    add(id, type.id, name, 350, y); wire("project", "value", id, "values"); wire("project", "role", id, "role");
  };
  parameter("selectedPump", "Выбранный насос второго контура", selectionProofField(), 1600);
  parameter("staticHead", "Статический напор второго контура", { ...field("staticHead", "Статический напор", "head", "input", "float"), unit: "м", initial: 0, min: 0 }, 1400);
  parameter("sort", "Сортировка второго подбора", { ...field("sort", "Порядок результатов", "mode", "input", "enum"), options: ["distance", "price"], optionNames: { distance: "По рабочей точке", price: "По цене" }, initial: "price" }, 1200);
  add("readonly", "ui.readOnly", "Второй контур — только просмотр", 700, 0);
  wire("source", "secondaryInputsUi", "readonly", "ui"); wire("readonly", "value", "form", "child0");
  add("filters", "ui.grid", "Фильтры второго контура", 1400, 500, { columns: 3 });
  for (const [i, key, name] of [[0, "type", "Тип насоса"], [1, "manufacturer", "Производитель"], [2, "series", "Серия"]] as const) {
    parameter(key, name, { ...field(key, name, "text", "input", "string"), initial: null }, 300 + i * 250);
    add(key + "Options", "pump.options", name + " — варианты", 700, 300 + i * 250, { attribute: key });
    add(key + "Field", "ui.select", name, 1050, 300 + i * 250, { label: name, showOrigin: false, cascadeAttribute: key === "series" ? "" : key });
    wire("catalog", "value", key + "Options", "catalog"); wire(key + "Options", "options", key + "Field", "options");
    wire(key, "binding", key + "Field", "binding"); wire(key + "Field", "value", "filters", "child" + i);
    wire(key, "value", "filter", key);
    if (key !== "type") wire("type", "value", key + "Options", "type");
    if (key === "series") wire("manufacturer", "value", key + "Options", "manufacturer");
    if (key !== "series") {
      wire("catalog", "value", key + "Field", "cascadeCatalog");
      wire("type", "value", key + "Field", "cascadeType");
      wire("manufacturer", "binding", "typeField", "clear0");
    }
  }
  // Only one binding edge per socket, including the shared manufacturer reset.
  graph.edges = graph.edges.filter((e, i, all) => all.findIndex(a => a.from === e.from && a.out === e.out && a.to === e.to && a.input === e.input) === i);
  wire("series", "binding", "typeField", "clear1"); wire("series", "binding", "manufacturerField", "clear0");
  wire("filters", "value", "form", "child1");
  for (const [i, key] of ["sort", "staticHead"].entries()) {
    add(key + "Field", "ui.field", key === "sort" ? "Порядок результатов" : "Статический напор", 1400, 1000 + i * 200, { showOrigin: false });
    wire(key, "binding", key + "Field", "binding"); wire(key + "Field", "value", "form", "child" + (i + 2));
  }
  add("request", "pump.request", "Условия подбора из настроек", 700, 1400, { contour: "secondary" });
  add("catalog", "pump.catalog", "Новый каталог насосов", 350, 1800);
  add("filter", "pump.filter", "Фильтрация каталога насосов", 1050, 1700);
  add("reserve", "pump.reserve", "Проверка напора по характеристике", 1400, 1700);
  add("measure", "pump.measure", "Рабочая точка кандидатов", 1750, 1700);
  add("rank", "pump.rank", "Сортировка результатов подбора", 2100, 1700);
  add("table", "pump.table", "Таблица кандидатов насосов", 2450, 1100, { preset: "custom", customColumns: "model,manufacturer,series,power,purchasePriceRub,flow,head" });
  add("selection", "pump.select", "Проверка выбранного исполнения", 2450, 1700);
  wire("source", "settings", "request", "settings"); wire("staticHead", "value", "request", "staticHead");
  wire("catalog", "value", "filter", "catalog"); wire("request", "value", "filter", "request");
  wire("filter", "value", "reserve", "candidates"); wire("reserve", "value", "measure", "candidates");
  wire("source", "settings", "measure", "pricing"); wire("measure", "value", "rank", "candidates"); wire("sort", "value", "rank", "mode");
  for (const id of ["table", "selection"]) { wire("rank", "value", id, "candidates"); wire("selectedPump", "binding", id, "binding"); }
  wire("table", "value", "form", "child4"); wire("selection", "value", "result", "value");
  Object.assign(graph.nodes.find(n => n.id === "form")!, { x: 2800, y: 500, values: { title: "Подбор насоса (2 контур)", showOrigin: false } });
  Object.assign(graph.nodes.find(n => n.id === "result")!, { x: 3150, y: 500 });
  syncInstrument(doc, graph);
  rootOf(doc).edges.push({ from: settingsId, out: settingsPort, to: added.id, input: "settings" }, { from: settingsId, out: inputView, to: added.id, input: "secondaryInputsUi" });
  const chart = addVisualizationTool(doc, "hydraulic", { selectionId: added.id, settingsId, contour: "secondary" }); doc = chart.document;
  const card = addVisualizationTool(doc, "card", { selectionId: added.id, settingsId, contour: "secondary" }); doc = card.document;
  const exports = selectedExports(doc, rootOf(doc), added.id);
  connectSecondaryDn(doc, settingsId, added.id, exports);
  connectPumpSpacing(doc);
  const tools = { selection: added.id, chart: chart.id, card: card.id };
  for (const id of Object.values(tools)) guardInstrument(doc, id, settingsId, settingsPort);
  doc.secondaryTools = { ...doc.secondaryTools, [settingsId]: tools };
  const originalBottom = Math.max(0, ...rootOf(document).nodes.map(n => n.y));
  for (const [index, id] of Object.values(tools).entries()) Object.assign(rootOf(doc).nodes.find(n => n.id === id)!, { x: settingsNode.x + 480 + index * 470, y: originalBottom + 420 });
  return { document: doc, id: added.id, diagram: added.diagram, tools };
}

function connectSecondaryDn(doc: ToolDocument, settingsId: string, selectionId: string, ports: { item: string; selection: string; request: string }) {
  const root = rootOf(doc);
  const targets = root.nodes.flatMap(n => {
    const graph = doc.diagrams.find(g => g.id === typeOf(doc, n)?.instrument);
    return graph && root.edges.some(e => e.from === settingsId && e.to === n.id) ? graph.nodes.filter(n => typeOf(doc, n)?.operation === "station.dnContext").map(context => ({ tool: n, graph, context })) : [];
  });
  if (targets.length !== 1) throw Error("Для выбранных настроек требуется один существующий инструмент «Расчёт DN». Уточните связи перед добавлением второго контура.");
  const { tool, graph, context } = targets[0], boundary = boundaryType(doc, graph, "source");
  for (const [key, name, meaning] of [["item", "Выбранное исполнение", "pumpCatalogItem"], ["selection", "Статус подтверждения", "pumpSelectionState"], ["request", "Условия подбора", "pumpRequest"]] as const) {
    const input = "secondary" + key[0].toUpperCase() + key.slice(1);
    if (graph.edges.some(e => e.to === context.id && e.input === input) || root.edges.some(e => e.to === tool.id && e.input === input)) throw Error("Вход второго контура «" + name + "» в расчёте DN уже подключён. Существующая связь сохранена.");
    if (!boundary.fields.some(f => f.key === input)) boundary.fields.push(field(input, name + " — второй контур", meaning, "output"));
    graph.edges.push({ from: "source", out: input, to: context.id, input });
    root.edges.push({ from: selectionId, out: ports[key], to: tool.id, input });
  }
  syncInstrument(doc, graph);
}

function guardInstrument(doc: ToolDocument, id: string, settingsId: string, settingsPort: string) {
  const graph = graphOf(doc, id), source = boundaryType(doc, graph, "source"), result = boundaryType(doc, graph, "result");
  if (!source.fields.some(f => f.key === "settings")) source.fields.push(field("settings", "Настройки проекта", "record", "output"));
  if (!rootOf(doc).edges.some(e => e.to === id && e.input === "settings")) rootOf(doc).edges.push({ from: settingsId, out: settingsPort, to: id, input: "settings" });
  const outputs = result.fields.map(f => ({ ...f, direction: "output" as const, required: false }));
  const type = { id: graph.id + ".guard", name: "Выполнять только активный контур", category: "Контуры", description: "При отключении пропускает зависимые вычисления и сохраняет собственные настройки инструмента.", operation: "circuit.guard", formulas: {}, fields: [field("active", "Контур используется", "flag", "input", "boolean"), ...outputs.map(f => ({ ...f, key: "in_" + f.key, direction: "input" as const })), ...outputs] };
  doc.types.push(type);
  const resultNode = graph.nodes.find(n => n.id === "result")!;
  graph.nodes.push({ id: "active", type: "circuit.active", name: "Второй контур используется", x: 700, y: -300, values: {} }, { id: "guard", type: type.id, name: type.name, x: resultNode.x, y: resultNode.y, values: {} });
  resultNode.x += 350;
  graph.edges = graph.edges.map(e => e.to === "result" ? { ...e, to: "guard", input: "in_" + e.input } : e);
  graph.edges.push({ from: "source", out: "settings", to: "active", input: "settings" }, { from: "active", out: "active", to: "guard", input: "active" }, ...outputs.map(f => ({ from: "guard", out: f.key, to: "result", input: f.key })));
  syncInstrument(doc, graph);
}
