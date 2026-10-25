import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";

const model = await loadTs(new URL("../app/model-editor/model.ts", import.meta.url));
const { specificationModels } = await loadTs(new URL("../app/model-editor/specification-models.ts", import.meta.url));
const { createProject, parseProjectConfig } = await loadTs(new URL("../app/project-config.ts", import.meta.url));
const pumps = JSON.parse(await readFile(new URL("../public/pumps.json", import.meta.url), "utf8"));
const profiles = JSON.parse(await readFile(new URL("../public/model-assets/manifest.json", import.meta.url), "utf8"));
const hash = "a".repeat(64), meshUrl = `/api/model-preparation/assets/model-${hash}-v1.stl`;
const valve = { key: "equipment:valve", bounds: [0, -30, -20, 100, 30, 60], source: "Equipment/Valves/valve.step", sourceHash: hash,
  meshUrl, ports: [{ id: "inlet", point: [0, 0, 0], axis: [-1, 0, 0] }], mapping: "catalogue", warnings: ["Проверить паспорт"] };
const prepared = { version: 1, profiles: { "9": { ...profiles.profiles["9"], meshUrl, sourceHash: hash } }, equipment: { "equipment:valve": valve } };
function station() {
  const p = createProject("Конвертация", { id: "prepared-project" });
  Object.assign(p.entities["system-input"], { selectedPumpId: "9", workingPumpCount: 2, reservePumpCount: 0 });
  p.entities["station-spec"].items = [
    { position: "01", name: "Насос", equipmentId: "9", quantity: 2, section: "pump", details: "", status: "selected" },
    { position: "02", name: "Затвор", equipmentId: "valve", quantity: 2, section: "suction", details: "", status: "selected" },
    { position: "03", name: "Шкаф без модели", quantity: 1, section: "control", details: "", status: "clarify" },
  ];
  return p;
}

test("request includes the whole specification, all equipment types and unlinked rows", () => {
  const p = station();
  p.entities["station-spec"].items.push({ ...p.entities["station-spec"].items[1], quantity: 0 });
  const items = specificationModels(p);
  assert.deepEqual(items.map(item => item.key), ["pump:9", "equipment:valve", ""]);
  assert.equal(items[0].quantity, 2);
  assert.ok(items.every(item => !Object.hasOwn(item, "source")));
});

test("asset refresh retains latest manual pose, display, locks, frame, routes and undo states", () => {
  const p = station(), original = model.buildAssembly(p, pumps, profiles), pump = original.components.find(c => c.kind === "pump");
  let moved = model.editComponent(original, { id: pump.id, patch: { position: [900, 800, 700], rotation: [15, 30, 45], hidden: true, opacity: .35 } });
  moved = model.editComponent(moved, { id: pump.id, patch: { locked: true } });
  const current = moved.components.find(c => c.id === pump.id), next = model.refreshModelAssets(moved, p, pumps, prepared), refreshed = next.components.find(c => c.id === pump.id);
  for (const key of ["id", "position", "rotation", "hidden", "opacity", "locked"]) assert.deepEqual(refreshed[key], current[key]);
  assert.equal(refreshed.meshUrl, meshUrl);
  assert.deepEqual(next.components.find(c => c.kind === "frame"), moved.components.find(c => c.kind === "frame"));
  assert.deepEqual(next.components.filter(c => c.routing), moved.components.filter(c => c.routing));
  const history = model.execute(model.createHistory(original), moved);
  const updated = { past: history.past.map(a => model.refreshModelAssets(a, p, pumps, prepared)), present: next, future: [] };
  const undone = model.undo(updated).present.components.find(c => c.id === pump.id);
  assert.deepEqual(undone.position, pump.position);
  assert.equal(undone.meshUrl, meshUrl);
});

test("valves share a prepared mesh, retain ports and are added only once without automatic mounting", () => {
  const p = station(), original = model.buildAssembly(p, pumps, profiles);
  const next = model.refreshModelAssets(original, p, pumps, prepared), valves = next.components.filter(c => c.kind === "equipment");
  assert.equal(valves.length, 2);
  assert.ok(valves.every(c => c.meshUrl === meshUrl && c.equipmentId === "valve"));
  assert.deepEqual(valves[0].ports, valve.ports);
  assert.match(valves[0].sourceNote, /Требуется ручное размещение/);
  assert.equal(next.components.filter(c => c.kind === "pump").length, 2);
  assert.deepEqual(model.refreshModelAssets(next, p, pumps, prepared), next);
});

test("service asset URLs and full manual layout survive project save/reopen; arbitrary URLs do not", () => {
  const p = station(), assembly = model.refreshModelAssets(model.buildAssembly(p, pumps, profiles), p, pumps, prepared);
  const editor = { ...model.emptyEditor(), assembly };
  p.entities["station-model"].editor = editor;
  const restored = parseProjectConfig(JSON.parse(JSON.stringify(p))).entities["station-model"].editor;
  assert.deepEqual(restored.assembly.components.map(c => c.meshUrl), assembly.components.map(c => c.meshUrl));
  editor.assembly.components[0].meshUrl = "https://attacker.invalid/file.stl";
  assert.equal(model.normalizeEditor(editor).assembly.components[0].meshUrl, undefined);
});

test("unrelated project data cannot create stale equipment and previous catalogue warnings survive", () => {
  const p = station(), a = model.buildAssembly(p, pumps, profiles);
  a.components.find(c => c.kind === "pump").sourceNote += ". Расхождение габаритов требует проверки";
  assert.match(model.refreshModelAssets(a, p, pumps, prepared).components.find(c => c.kind === "pump").sourceNote, /Расхождение габаритов/);
  const other = createProject("Другой проект");
  assert.deepEqual(model.refreshModelAssets(model.buildAssembly(other, pumps, profiles), other, pumps, prepared).components, []);
});

test("browser preparation works for a specification containing only non-pump equipment", () => {
  const p = station(); p.entities["system-input"].selectedPumpId = null;
  p.station.selectedPumpId = null;
  p.entities["station-spec"].items = p.entities["station-spec"].items.filter(i => i.section !== "pump");
  assert.equal(model.buildAssembly(p, pumps, prepared).components.filter(c => c.kind === "equipment").length, 2);
});
