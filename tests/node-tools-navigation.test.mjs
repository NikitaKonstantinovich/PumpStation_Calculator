import assert from "node:assert/strict";
import test from "node:test";
import { engineeringStore } from "./fixtures/engineering-store.mjs";

const store = await engineeringStore();
test.after(() => store.close());
const { initialTools } = await store.load("node-tools/factory");
const { addressFromTrace, addressId, graphBreadcrumbs, parameterRepresentations, provenance } = await store.load("node-tools/navigation");
const { encapsulate } = await store.load("engineering/hierarchy");

test("trace navigation and breadcrumbs retain the chosen use of a shared contour", () => {
  const doc = initialTools(), main = addressFromTrace(doc, "tools", "settings/main/flowRate"), secondary = addressFromTrace(doc, "tools", "settings/secondary/flowRate");
  assert.equal(main.graph, "tool.contour");
  assert.deepEqual(main.path, ["settings", "main"]);
  assert.equal(secondary.graph, "tool.contour");
  assert.deepEqual(secondary.path, ["settings", "secondary"]);
  assert.notEqual(addressId(main), addressId(secondary));
  const crumbs = graphBreadcrumbs(doc, "tools", secondary);
  assert.equal(crumbs.at(-1).address.node, "flowRate");
  assert.equal(crumbs.at(-2).address.node, "secondary");
  assert.deepEqual(crumbs.at(-2).address.path, ["settings"]);
  assert.equal(addressFromTrace(doc, "tools", "settings/missing/flowRate"), null);
});

test("separate parameter and field wrappers preserve binding navigation for each shared instance", () => {
  let doc = initialTools();
  function wrap(node, name) {
    const graph = doc.diagrams.find(g => g.id === "tool.contour"), ports = [];
    for (const edge of graph.edges) {
      const incoming = edge.to === node, outgoing = edge.from === node;
      if (!incoming && !outgoing) continue;
      const field = incoming ? edge.input : edge.out, direction = incoming ? "input" : "output";
      if (!ports.some(p => p.field === field && p.direction === direction)) ports.push({ key: field, node, field, direction });
    }
    const result = encapsulate(doc, graph, [node], name, ports);
    doc = result.document;
    return result.id;
  }
  const parameter = wrap("flowRate", "Параметр расхода"), field = wrap("field_flowRate", "Представление расхода");
  for (const instance of ["main", "secondary"]) {
    const parameterAddress = { graph: parameter, path: ["settings", instance, parameter], node: "flowRate" }, fieldAddress = { graph: field, path: ["settings", instance, field], node: "field_flowRate" };
    const representations = parameterRepresentations(doc, parameterAddress, "tools");
    assert.equal(representations.length, 1);
    assert.deepEqual(representations[0].address, fieldAddress);
    assert.deepEqual(parameterRepresentations(doc, fieldAddress, "tools")[0].address, fieldAddress);
    const chain = provenance(doc, "tools", fieldAddress);
    assert.deepEqual(chain.parameter, parameterAddress);
    assert(chain.ids.has("settings/" + instance + "/data"));
    assert(!chain.ids.has("settings/" + (instance === "main" ? "secondary" : "main") + "/" + parameter + "/flowRate"));
  }
});

test("hidden field representations retain their concrete instance and conditional navigation", () => {
  const doc = initialTools(), graph = doc.diagrams.find(g => g.id === "tool.contour"), address = { graph: graph.id, path: ["settings", "secondary"], node: "medium" };
  graph.nodes.find(n => n.id === "field_medium").values.visible = false;
  const fields = parameterRepresentations(doc, address);
  assert.equal(fields.length, 1);
  assert.equal(fields[0].visible, false);
  assert(fields[0].label.includes("Перекачиваемая среда"));
  assert.deepEqual(fields[0].address.path, ["settings", "secondary"]);
  assert.equal(parameterRepresentations(doc, { ...address, node: "field_medium" })[0].address.node, "field_medium");
  const settings = doc.diagrams.find(g => g.id === "tool.settings"), volume = parameterRepresentations(doc, { graph: settings.id, path: ["settings"], node: "membraneTankVolume" });
  assert.equal(volume.length, 1);
  assert.equal(volume[0].condition.node, "volumeVisible");
});

test("field provenance follows parameter data consumers through Instrument boundaries without mixing sibling parameters", () => {
  const doc = initialTools(), chain = provenance(doc, "tools", { graph: "tool.contour", path: ["settings", "secondary"], node: "field_flowRate" });
  assert.equal(chain.parameter.node, "flowRate");
  assert(chain.ids.has("settings/secondary/flowRate"));
  assert(chain.ids.has("settings/secondary/field_flowRate"));
  assert(chain.ids.has("settings/secondary/source"));
  assert(chain.ids.has("settings/secondary/result"));
  assert(chain.ids.has("settings/result"));
  assert(!chain.ids.has("settings/main/flowRate"));
  assert(chain.sources.some(item => item.address.node === "source"));
  assert(chain.consumers.length > 0);
});
