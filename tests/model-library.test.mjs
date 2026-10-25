import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { parseModelLibrary, filterLibrary, addLibraryModel } = await loadTs(new URL("../app/model-editor/library.ts", import.meta.url));
const { normalizeEditor, mergeAssembly, createHistory, execute, undo, redo, componentBounds } = await loadTs(new URL("../app/model-editor/model.ts", import.meta.url));
const hash = "a".repeat(64), otherHash = "b".repeat(64);
const row = { id: hash, name: "Переход 60,3×48,3 AISI304", source: "Equipment/Piping/reducer.step", sources: ["Equipment/Piping/reducer.step", "Equipment/Fittings/DN50-DN40.step"], categories: ["Трубопроводы", "Фитинги"], sourceHash: hash, units: "mm", status: "ready", bounds: [-30.15, -30.15, 100, 30.15, 30.15, 176], meshUrl: `/model-assets/model-${hash}-v1.stl`, bytes: 125000, ports: [{ id: "guessed", point: [0,0,0] }], warnings: ["Соответствие каталогу не назначено"] };
const library = () => parseModelLibrary({ version: 1, models: [row, { ...row, id: otherHash, sourceHash: otherHash, name: "Клапан DN100", categories: ["Арматура"], sources: ["Equipment/Valves/010C.step"], status: "error", meshUrl: undefined, error: "Ошибка исходного STEP" }] });
const empty = () => ({ version: 1, sourceFingerprint: "fixture", components: [] });

test("library search uses all duplicate paths and intersects category/status filters", () => {
  const models = library().models;
  assert.equal(filterLibrary(models, "dn50 aisi304", "Фитинги", "ready").length, 1);
  assert.equal(filterLibrary(models, "dn50", "Арматура", "ready").length, 0);
  assert.equal(filterLibrary(models, "010c", "", "error")[0].name, "Клапан DN100");
  assert.equal(filterLibrary(models, "", "", "").length, 2);
});

test("only valid local hash-bound meshes and millimetre bounds can enter the library", () => {
  for (const patch of [{ meshUrl: "https://external.invalid/a.stl" }, { meshUrl: "/model-assets/../../secret.stl" }, { sourceHash: otherHash }, { bounds: [0,0,0,1,2,0] }, { bounds: [0,0,0,Infinity,2,3] }, { units: "m" }, { status: "unknown" }]) {
    assert.throws(() => parseModelLibrary({ version: 1, models: [{ ...row, ...patch }] }), /Некорректн/);
  }
  assert.throws(() => parseModelLibrary({ version: 1, models: [row, row] }), /Некорректн/);
  assert.deepEqual(library().models[0].ports, []);
});

test("manual CAD keeps source coordinates and actual dimensions, survives save/update, and supports Undo/Redo", () => {
  const original = empty(), model = library().models[0];
  const added = addLibraryModel(original, model, "manual-test");
  assert.equal(original.components.length, 0);
  const part = added.components[0];
  assert.deepEqual(part.bounds, row.bounds);
  assert.deepEqual(part.position, [30.15, 30.15, -100]);
  assert.deepEqual(componentBounds(added, part), [0,0,0,60.3,60.3,76]);
  assert.deepEqual(part.rotation, [0,0,0]);
  assert.equal(part.parameters.height, 76);
  assert.equal(part.equipmentId, undefined);
  assert.deepEqual(part.cadSource, { path: row.source, hash });
  assert.deepEqual(part.ports, []);
  const saved = normalizeEditor(JSON.parse(JSON.stringify({ version: 1, assembly: added }))).assembly;
  assert.equal(saved.components[0].meshUrl, row.meshUrl);
  assert.equal(mergeAssembly(saved, empty()).components[0].orphaned, false);
  const history = execute(createHistory(original), added);
  assert.equal(undo(history).present.components.length, 0);
  assert.equal(redo(undo(history)).present.components[0].cadSource.hash, hash);
  const twice = addLibraryModel(added, model, "second");
  assert.ok(componentBounds(twice, twice.components[1])[0] >= componentBounds(added, part)[3] + 99.99);
});

test("unready models, duplicate instance IDs and overflowing assembly are rejected", () => {
  const model = library().models[0], added = addLibraryModel(empty(), model, "one");
  assert.throws(() => addLibraryModel(empty(), library().models[1], "error"), /не готова/);
  assert.throws(() => addLibraryModel(added, model, "one"), /уже существует/);
  assert.throws(() => addLibraryModel({ ...added, components: Array.from({ length: 500 }, () => added.components[0]) }, model, "new"), /500/);
});
