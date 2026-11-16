// An isolated teaching/test graph. Never installed into a user's draft or factory document.
export function addPumpProductFixture(document, id = "pumpFixture") {
  const doc = structuredClone(document), root = doc.diagrams.find(graph => graph.id === doc.product.root), graphId = id + ".graph";
  const f = (key, kind, meaning, direction = "input") => ({ key, name: key, kind, meaning, direction, unit: "" });
  const ports = [f("context", "object", "toolContext"), f("settings", "object", "record"), f("value", "object", "pumpCatalogItem", "output"), f("ui", "object", "view", "output")];
  doc.types.push({ id: id + ".in", name: "Входы подбора", category: "Границы", description: "Тест", formulas: {}, fields: ports.filter(field => field.direction === "input").map(field => ({ ...field, direction: "output" })) },
    { id: id + ".out", name: "Выходы подбора", category: "Границы", description: "Тест", formulas: {}, fields: ports.filter(field => field.direction === "output").map(field => ({ ...field, direction: "input" })) },
    { id, name: "Учебный подбор", category: "Подбор", description: "Изолированный учебный пример", formulas: {}, fields: ports, instrument: graphId });
  const nodes = [], edges = [], add = (node, type, x, y, values = {}) => nodes.push({ id: node, type, name: doc.types.find(typeDef => typeDef.id === type)?.name || node, x, y, values }), wire = (from, out, to, input) => edges.push({ from, out, to, input });
  add("source", id + ".in", 0, 0); add("state", "data.source", 250, 0, { source: "workspace2" });
  add("selection", "pump.selectionParameter", 500, 0); add("catalog", "pump.catalog", 250, 300, { source: "pump_catalog_v2" });
  add("request", "pump.request", 250, 700); add("filter", "pump.filter", 650, 300); add("reserve", "pump.reserve", 1000, 300);
  add("measure", "pump.measure", 1350, 300); add("rank", "pump.rank", 1700, 300); add("table", "pump.table", 2050, 300);
  add("checkSelection", "pump.select", 2050, 0); add("card", "pump.card", 2400, 0); add("save", "command.save", 2400, 700);
  add("form", "ui.form", 2750, 300, { title: "Учебный подбор насосов" }); add("result", id + ".out", 3100, 300);
  wire("source", "context", "state", "context"); wire("state", "value", "selection", "values"); wire("state", "role", "selection", "role");
  wire("source", "settings", "request", "settings"); wire("catalog", "value", "filter", "catalog"); wire("request", "value", "filter", "request");
  wire("filter", "value", "reserve", "candidates"); wire("reserve", "value", "measure", "candidates"); wire("source", "settings", "measure", "pricing");
  wire("measure", "value", "rank", "candidates"); wire("rank", "value", "table", "candidates"); wire("selection", "binding", "table", "binding");
  wire("rank", "value", "checkSelection", "candidates"); wire("selection", "binding", "checkSelection", "binding");
  wire("checkSelection", "value", "card", "item"); wire("checkSelection", "selection", "card", "selection");
  wire("table", "value", "form", "child0"); wire("card", "value", "form", "child1"); wire("save", "value", "form", "command");
  wire("form", "value", "result", "ui"); wire("checkSelection", "value", "result", "value");
  doc.diagrams.push({ id: graphId, name: "Учебный подбор насосов", groups: {}, nodes, edges });
  root.nodes.push({ id, type: id, name: "Учебный подбор насосов", x: 650, y: 250, values: {}, tool: { category: "Подбор", order: 10, enabled: true } });
  root.edges.push({ from: "settings", out: "value", to: id, input: "settings" });
  return doc;
}
