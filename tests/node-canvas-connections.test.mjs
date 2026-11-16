import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { connectionFeedback } = await loadTs(new URL("../app/engineering/connection-feedback.ts", import.meta.url));
const field = (key, direction, overrides = {}) => ({ key, name: key, kind: "float", meaning: "flow", unit: "м³/ч", direction, ...overrides });
const type = (id, fields) => ({ id, name: id, category: "test", description: "", fields, formulas: {} });
const types = [type("source", [field("value", "output")]), type("both", [field("value", "both")]), type("target", [field("value", "input")])];
const graph = { id: "g", name: "g", groups: {}, nodes: ["source", "both", "target"].map((id, i) => ({ id, type: id, name: id, x: i * 300, y: 0, values: {} })), edges: [{ from: "source", out: "value", to: "both", input: "value" }] };
test("connection feedback accepts fan-out and reports concrete type, unit, meaning and direction mismatches", () => {
  const edge = { from: "source", out: "value", to: "target", input: "value" };
  assert.equal(connectionFeedback(graph, types, edge), "");
  for (const [change, message] of [[{kind:"int"}, /ожидается int, передаётся float/], [{unit:"л/с"}, /Единица/], [{meaning:"head"}, /Смысл/], [{direction:"output"}, /входным портом/]]) {
    const changed = types.map(t => t.id === "target" ? { ...t, fields: [field("value", "input", change)] } : t);
    assert.match(connectionFeedback(graph, changed, edge), message);
  }
  assert.match(connectionFeedback(graph, types, {from:"target",out:"value",to:"both",input:"value"}), /выходным портом/);
});
test("connection feedback rejects cycles while allowing replacement of an occupied input", () => {
  const cycle = { ...graph, nodes: [...graph.nodes, { id:"other",type:"both",name:"other",x:900,y:0,values:{} }], edges:[...graph.edges,{from:"both",out:"value",to:"other",input:"value"}] };
  assert.match(connectionFeedback(cycle, types, {from:"other",out:"value",to:"both",input:"value"}), /цикл/);
  assert.equal(connectionFeedback(cycle, types, {from:"source",out:"value",to:"other",input:"value"}), "");
});
