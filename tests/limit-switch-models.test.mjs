import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { parseModelLibrary, filterLibrary, addLibraryModel } = await loadTs(new URL("../app/model-editor/library.ts", import.meta.url));
const { normalizeEditor, mergeAssembly } = await loadTs(new URL("../app/model-editor/model.ts", import.meta.url));
const raw = JSON.parse(await readFile(new URL("../public/model-assets/library.json", import.meta.url), "utf8"));
const library = parseModelLibrary(raw);
const bracket = library.models.find(m => m.source.endsWith("Кронштейн концевых выключателей для Dendor 017W Dn50-80.SLDPRT"));
const sensor = filterLibrary(library.models, "TZ-8111", "КИПиА", "ready")[0];

test("bracket and exact EKF TZ-8111 have real hash-bound geometry in millimetres", async () => {
  for (const model of [bracket, sensor]) {
    assert.ok(model, "Both requested models must be searchable and ready");
    assert.equal(model.status, "ready");
    const source = await readFile(new URL(`../../${model.source}`, import.meta.url));
    assert.equal(createHash("sha256").update(source).digest("hex"), model.sourceHash);
    const mesh = await readFile(new URL(`../public${model.meshUrl}`, import.meta.url));
    const triangles = mesh.readUInt32LE(80);
    assert.ok(triangles > 100);
    assert.equal(mesh.length, 84 + 50 * triangles);
    assert.equal(createHash("sha256").update(mesh).digest("hex"), raw.models.find(m => m.id === model.id).meshHash);
    const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < triangles; i++) for (let p = 0; p < 3; p++) for (let axis = 0; axis < 3; axis++) {
      const value = mesh.readFloatLE(84 + 50*i + 12 + p*12 + axis*4);
      assert.ok(Number.isFinite(value));
      low[axis] = Math.min(low[axis], value); high[axis] = Math.max(high[axis], value);
    }
    [...low, ...high].forEach((value, i) => assert.ok(Math.abs(value-model.bounds[i]) < .1, "Metadata must match the rendered mesh"));
    assert.deepEqual(model.ports, []);
  }
  assert.ok(Math.abs(bracket.bounds[4]-bracket.bounds[1]-2) < .001, "Native 2 mm sheet must not be rescaled");
  assert.ok(Math.abs(sensor.bounds[4]-sensor.bounds[1]-100.5) < .01, "Official switch length must not be rescaled");
  const manifest = JSON.parse(await readFile(new URL("../public/model-assets/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.equipment["equipment:кипиа-004-r0028"].sourceHash, sensor.sourceHash);
  assert.equal(manifest.equipment["equipment:кипиа-004-r0029"]?.sourceHash === sensor.sourceHash, false, "Do not map TZ-8108 to TZ-8111");
});

test("one bracket and two separate switches survive project serialization and composition refresh", () => {
  const empty = { version: 1, sourceFingerprint: "test", components: [] };
  let assembly = addLibraryModel(empty, bracket, "bracket");
  assembly = addLibraryModel(assembly, sensor, "open-switch");
  assembly = addLibraryModel(assembly, sensor, "closed-switch");
  const saved = normalizeEditor(JSON.parse(JSON.stringify({ version: 1, assembly }))).assembly;
  const refreshed = mergeAssembly(saved, empty);
  assert.equal(refreshed.components.length, 3);
  assert.equal(refreshed.components.filter(c => c.meshUrl === sensor.meshUrl).length, 2);
  assert.deepEqual(refreshed.components.map(c => c.cadSource), assembly.components.map(c => c.cadSource));
  assert.ok(refreshed.components.every(c => !c.orphaned && c.sourceKey === "manual"));
  assert.doesNotMatch(refreshed.components[0].sourceNote, /Геометрия STEP/);
});
