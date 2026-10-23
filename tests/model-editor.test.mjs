import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";

const model = await loadTs(new URL("../app/model-editor/model.ts", import.meta.url));
const { createProject, parseProjectConfig } = await loadTs(new URL("../app/project-config.ts", import.meta.url));
const pumps = JSON.parse(await readFile(new URL("../public/pumps.json", import.meta.url), "utf8"));
const profiles = JSON.parse(await readFile(new URL("../public/model-assets/manifest.json", import.meta.url), "utf8"));
function station() {
  const p = createProject("Редактор — реальная установка", { id: "editor-test", timestamp: "2026-10-23T00:00:00Z" });
  Object.assign(p.entities["system-input"], { selectedPumpId: "9", workingPumpCount: 2, reservePumpCount: 1 });
  return p;
}
function assembly() { return model.buildAssembly(station(), pumps, profiles); }
const samePoint = (a, b) => assert.ok(model.distance(a, b) < .0001, `${a} != ${b}`);

test("assembly uses actual catalogue identity, STEP bounds and three physical pump instances", () => {
  const a = assembly(), pump = a.components.find(c => c.kind === "pump");
  assert.equal(a.components.filter(c => c.kind === "pump").length, 3);
  assert.equal(a.components.filter(c => c.routing).length, 6);
  assert.deepEqual(pump.bounds, profiles.profiles["9"].bounds);
  assert.equal(pump.meshUrl, profiles.profiles["9"].meshUrl);
  assert.equal(pump.equipmentId, "9");
  assert.match(pump.sourceNote, /Монтажная пригодность/);
  assert.equal(new Set(a.components.map(c => c.id)).size, a.components.length);
});
test("empty project does not present invented selected pumps", () => {
  assert.equal(model.buildAssembly(createProject(), pumps, profiles).components.length, 0);
});
test("moving and rotating pump rebuilds supported pipe endpoints, retaining collector connections", () => {
  const a = assembly(), pump = a.components.find(c => c.kind === "pump"), pipe = a.components.find(c => c.routing?.from.componentId === pump.id);
  const original = model.pipePoints(a, pipe);
  const next = model.editComponent(a, { id: pump.id, patch: { position: [100, 75, 500], rotation: [0, 0, 90] } });
  const points = model.pipePoints(next, next.components.find(c => c.id === pipe.id));
  samePoint(points[0], model.portPoint(next, pipe.routing.from));
  samePoint(points.at(-1), original.at(-1));
  assert.equal(model.connectionIssues(next).length, 0);
  assert.notDeepEqual(a.components.find(c => c.id === pump.id).position, [100, 75, 500]);
});
test("locked component rejects changes from numeric and gizmo command paths; display remains editable", () => {
  const a = assembly(), pump = a.components.find(c => c.kind === "pump");
  const locked = model.editComponent(a, { id: pump.id, patch: { locked: true } });
  const edited = model.editComponent(locked, { id: pump.id, patch: { position: [20, 30, 40], rotation: [0, 30, 0], hidden: true, opacity: .4 } });
  const c = edited.components.find(c => c.id === pump.id);
  assert.deepEqual(c.position, pump.position); assert.deepEqual(c.rotation, pump.rotation);
  assert.equal(c.hidden, true); assert.equal(c.opacity, .4);
});
test("purchased equipment dimensions cannot be changed by an editor command", () => {
  const a = assembly(), c = a.components.find(c => c.kind === "pump");
  const edited = model.editComponent(a, { id: c.id, patch: { parameters: { ...c.parameters, length: 1 } } });
  assert.deepEqual(edited.components.find(p => p.id === c.id).parameters, c.parameters);
});
test("CAD/catalogue dimension disagreements are exposed without scaling the purchased model", () => {
  const changedCatalog = pumps.map(p => p.id === "9" ? { ...p, dimensions: { ...p.dimensions, overall_height: 1000 } } : p);
  const a = model.buildAssembly(station(), changedCatalog, profiles), c = a.components.find(c => c.kind === "pump");
  assert.equal(c.parameters.height, profiles.profiles["9"].bounds[5] - profiles.profiles["9"].bounds[2]);
  assert.match(c.sourceNote, /Расхождение габаритов требует проверки/);
});
test("freezing connected pipe preserves its geometry and reports a gap after pump movement", () => {
  const a = assembly(), pipe = a.components.find(c => c.routing), old = model.pipePoints(a, pipe);
  const frozen = model.editComponent(a, { id: pipe.id, patch: { locked: true } });
  assert.deepEqual(model.pipePoints(frozen, frozen.components.find(c => c.id === pipe.id)), old);
  const moved = model.editComponent(frozen, { id: pipe.routing.from.componentId, patch: { position: [999, 0, 500] } });
  assert.ok(model.connectionIssues(moved).some(issue => issue.id === pipe.id && /соединение нарушено/.test(issue.message)));
});
test("disabling automatic route retains current geometry and enables manual pose", () => {
  const a = assembly(), pipe = a.components.find(c => c.routing), old = model.pipePoints(a, pipe);
  const manual = model.setAutomaticRoute(a, pipe.id, false);
  assert.deepEqual(model.pipePoints(manual, manual.components.find(c => c.id === pipe.id)), old);
  const moved = model.editComponent(manual, { id: pipe.id, patch: { position: [100, 0, 0] } });
  samePoint(model.pipePoints(moved, moved.components.find(c => c.id === pipe.id))[0], model.add(old[0], [100, 0, 0]));
  assert.ok(model.connectionIssues(moved).some(i => i.id === pipe.id));
});
test("parametric frame and pipe dimensions rebuild bounds without scaling purchased items", () => {
  let a = model.addManualPipe(assembly(), "manual-test");
  const pipe = a.components.find(c => c.id === "manual-test");
  a = model.editComponent(a, { id: pipe.id, patch: { parameters: { ...pipe.parameters, length: 1000, diameter: 100 } } });
  assert.deepEqual(model.dimensions(model.componentBounds(a, a.components.find(c => c.id === pipe.id))), [1000, 100, 100]);
  const frame = a.components.find(c => c.id === "frame");
  a = model.editComponent(a, { id: frame.id, patch: { parameters: { ...frame.parameters, length: 2000, width: 1500, height: 120 } } });
  assert.deepEqual(model.dimensions(model.componentBounds(a, a.components.find(c => c.id === frame.id))), [2000, 1500, 120]);
});
test("shortened collector reports branch ports outside its ends", () => {
  const a = assembly(), collector = a.components.find(c => c.kind === "collector");
  const next = model.editComponent(a, { id: collector.id, patch: { parameters: { ...collector.parameters, length: 10 } } });
  assert.ok(model.connectionIssues(next).some(i => i.id === collector.id));
});
test("undo/redo treats one geometry command as one transaction and branches discard redo", () => {
  const a = assembly(), pump = a.components.find(c => c.kind === "pump");
  const b = model.editComponent(a, { id: pump.id, patch: { position: [200, 0, 500] } });
  const h = model.execute(model.createHistory(a), b);
  assert.deepEqual(model.undo(h).present, a);
  assert.deepEqual(model.redo(model.undo(h)).present, b);
  const c = model.editComponent(a, { id: pump.id, patch: { position: [300, 0, 500] } });
  assert.equal(model.execute(model.undo(h), c).future.length, 0);
});
test("native project save/load preserves transforms, manual geometry, camera, IDs, mode, routing and lock", () => {
  const p = station(); let a = model.addManualPipe(assembly(), "manual-persist");
  a = model.editComponent(a, { id: "frame", patch: { position: [150, 250, 40], rotation: [0, 0, 30], locked: true } });
  const editor = { ...model.emptyEditor(), assembly: a, selectedId: "frame", grid: false, snap: false, snapStep: 10, camera: { position: [2000, -2000, 1500], target: [0, 0, 300] } };
  p.entities["station-model"] = { kind: "model", view: { rotation: 0, zoom: 1 }, mode: "editor", editor };
  const loaded = parseProjectConfig(JSON.parse(JSON.stringify(p))).entities["station-model"];
  assert.equal(loaded.mode, "editor"); assert.deepEqual(loaded.editor, model.normalizeEditor(JSON.parse(JSON.stringify(editor))));
  assert.deepEqual(loaded.editor.assembly.components.find(c => c.id === "frame").position, [150, 250, 40]);
  assert.ok(loaded.editor.assembly.components.some(c => c.id === "manual-persist"));
});
test("legacy projects retain preview mode and open without editor data", () => {
  const loaded = parseProjectConfig(JSON.parse(JSON.stringify(createProject())));
  assert.equal(loaded.entities["station-model"].mode, "preview");
  assert.equal(loaded.entities["station-model"].editor, undefined);
});
test("composition synchronization retains edits and removed equipment for explicit review", () => {
  const a = assembly(), pump = a.components.find(c => c.kind === "pump");
  let edited = model.editComponent(a, { id: pump.id, patch: { position: [125, 250, 700] } });
  edited = model.addManualPipe(edited, "manual-keep");
  const p = station(); p.entities["system-input"].reservePumpCount = 0;
  const merged = model.mergeAssembly(edited, model.buildAssembly(p, pumps, profiles));
  assert.deepEqual(merged.components.find(c => c.id === pump.id).position, [125, 250, 700]);
  assert.equal(merged.components.find(c => c.id === "manual-keep").orphaned, undefined);
  assert.ok(merged.components.some(c => c.orphaned));
  assert.equal(merged.sourceFingerprint, model.sourceFingerprint(p));
});
test("adding a pump during synchronization adds its collector ports without losing manual collector placement", () => {
  const a = assembly(), p = station(); p.entities["system-input"].reservePumpCount = 2;
  const edited = model.editComponent(a, { id: "collector-suction", patch: { position: [-600, 400, 200] } });
  const merged = model.mergeAssembly(edited, model.buildAssembly(p, pumps, profiles));
  const collector = merged.components.find(c => c.id === "collector-suction");
  assert.deepEqual(collector.position, [-600, 400, 200]);
  assert.equal(collector.ports.length, 4);
  assert.ok(!model.connectionIssues(merged).some(i => /точка подключения не найдена/.test(i.message)));
});
test("hiding components affects camera fitting bounds without changing full installation dimensions", () => {
  const a = assembly(), before = model.assemblyBounds(a);
  const hidden = { ...a, components: a.components.map(c => ({ ...c, hidden: true })) };
  assert.deepEqual(model.assemblyBounds(hidden), before);
  assert.equal(model.assemblyBounds(hidden, true), null);
});
test("secondary circuit uses its own selected diameter and preserves geometry source revision", () => {
  const p = station(); p.entities["station-settings"].stationType = "combined";
  Object.assign(p.entities["system-input-2"], { selectedPumpId: "90", workingPumpCount: 1, reservePumpCount: 0 });
  p.entities["station-dn"].secondarySuctionValveDn = 25;
  p.entities["station-dn"].suctionValveDn = 65;
  const a = model.buildAssembly(p, pumps, profiles);
  assert.equal(a.components.find(c => c.id === "pipe-suction-pump-2-90-0").parameters.diameter, 33.7);
  assert.equal(a.components.find(c => c.id === "pipe-suction-pump-1-9-0").parameters.diameter, 76.1);
  assert.equal(a.components.find(c => c.id === "pump-1-9-0").cadSource.hash, profiles.profiles["9"].sourceHash);
});
test("model edits do not alter source fingerprint but equipment/count changes do", () => {
  const p = station(), before = model.sourceFingerprint(p);
  p.entities["station-model"].editor = { ...model.emptyEditor(), assembly: assembly() };
  p.workspace.windows[0].w += 20;
  assert.equal(model.sourceFingerprint(p), before);
  p.entities["system-input"].reservePumpCount++;
  assert.notEqual(model.sourceFingerprint(p), before);
});
test("direction-review profiles never acquire inlet/outlet roles or automatic pump connections", () => {
  const profile = Object.values(profiles.profiles).find(p => p.ports.some(port => port.id === "port-a"));
  assert.ok(profile);
  const p = station(); p.entities["system-input"].selectedPumpId = profile.pumpId;
  const a = model.buildAssembly(p, pumps, profiles);
  assert.ok(a.components.some(c => c.kind === "pump"));
  assert.equal(a.components.filter(c => c.routing).length, 0);
});
test("normalization rejects external asset URLs, duplicate IDs, nonfinite poses and invalid camera", () => {
  const a = assembly(), c = a.components[0];
  const raw = { ...model.emptyEditor(), camera: { position: [0, 0, 0], target: [0, 0, 0] }, snapStep: -10, assembly: { ...a, components: [{ ...c, meshUrl: "https://example.com/model.stl" }, c, { ...c, id: "bad", position: [NaN, 0, 0] }] } };
  const normalized = model.normalizeEditor(raw);
  assert.equal(normalized.assembly.components.length, 1); assert.equal(normalized.assembly.components[0].meshUrl, undefined);
  assert.equal(normalized.camera, undefined); assert.equal(normalized.snapStep, 25);
});
