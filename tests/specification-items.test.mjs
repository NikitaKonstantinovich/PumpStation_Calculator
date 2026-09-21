import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { normalizeSpecificationItems } = await loadTs(new URL("../app/specification-items.ts", import.meta.url));
const { createProject, parseProjectConfig } = await loadTs(new URL("../app/project-config.ts", import.meta.url));
const valve = (option, price = 5219) => ({ position: "04.11", name: "Клапан обратный двустворчатый 010С.Y", details: "DN80 · PN16 · Нержавеющая сталь", quantity: 3, price, equipmentId: option, section: "discharge", option, status: "selected" });

test("loading a saved selection removes the legacy duplicate and does not restore it", () => {
  let project = createProject();
  const items = project.entities["station-spec"].items;
  const legacy = items.find(item => item.option === "primaryCheckValve");
  delete legacy.option;
  items.push(valve("primaryCheckValve"));
  for (let i = 0; i < 3; i++) project = parseProjectConfig(JSON.parse(JSON.stringify(project)));
  const checks = project.entities["station-spec"].items.filter(item => /клапан обратный/i.test(item.name));
  assert.equal(checks.length, 1);
  assert.equal(checks[0].equipmentId, "primaryCheckValve");
  assert.equal(checks[0].price * checks[0].quantity, 15657);
});

test("each line starts with collector and shutoff valves, then discharge checks and accessories", () => {
  const project = createProject();
  const source = [...project.entities["station-spec"].items, valve("primaryCheckValve"), valve("secondaryCheckValve", 2858), {
    ...valve("secondaryDischargeValve"), name: "Затвор поворотный дисковый 017W",
  }];
  const snapshot = structuredClone(source);
  const items = normalizeSpecificationItems(source);
  assert.deepEqual(source, snapshot, "normalization must not mutate project state");
  assert.deepEqual(normalizeSpecificationItems(items), items, "repeated synchronization is stable");
  const suction = items.filter(item => item.section === "suction");
  const discharge = items.filter(item => item.section === "discharge");
  assert.deepEqual(suction.slice(0, 2).map(item => item.option), ["suctionCollector", "primarySuctionValve"]);
  assert.deepEqual(discharge.slice(0, 5).map(item => item.option), ["dischargeCollector", "primaryDischargeValve", "secondaryDischargeValve", "primaryCheckValve", "secondaryCheckValve"]);
  assert.ok(suction.every(item => !/CheckValve$/.test(item.option ?? "")));
  assert.deepEqual(discharge.map(item => item.position), discharge.map((_, i) => `04.${String(i + 1).padStart(2, "0")}`));
});

test("a misplaced legacy check is assigned to discharge and duplicates do not sum quantities", () => {
  const selected = valve("primaryCheckValve");
  const items = normalizeSpecificationItems([selected, { ...selected }, { position: "03.09", name: "Обратный клапан", section: "suction", quantity: 3, status: "clarify", details: "" }]);
  assert.equal(items.length, 1);
  assert.equal(items[0].section, "discharge");
  assert.equal(items[0].quantity, 3);
  assert.equal(items[0].price, selected.price);
});
