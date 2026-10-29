import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadTs } from "./load-ts.mjs";
const fixture = JSON.parse(await readFile(new URL("./fixtures/insertion-3d.json", import.meta.url), "utf8"));
globalThis.__insertion3dHash = value => createHash("sha256").update(value).digest("hex");
const replacements = { [new URL("../app/auth-server.ts", import.meta.url).href]: "export const sha256=async value=>globalThis.__insertion3dHash(value);" };
const server = await loadTs(new URL("../app/component-insert-3d-server.ts", import.meta.url), replacements);
const core = await loadTs(new URL("../app/model-editor/insertion-template.ts", import.meta.url));
const model = await loadTs(new URL("../app/model-editor/model.ts", import.meta.url));
const validation = await loadTs(new URL("../app/model-editor/insertion-types.ts", import.meta.url));
const rendererUrl = new URL("../app/model-editor/insertion-renderer.ts", import.meta.url);
const renderer = await loadTs(rendererUrl, { [rendererUrl.href]: (await readFile(rendererUrl, "utf8")).replace('from "three"', `from ${JSON.stringify(new URL("../node_modules/three/build/three.module.js", import.meta.url).href)}`) });
const build = (i, angle = 0, f = fixture) => server.insertion3d(f.rows[i], f.source, f.catalog, { id: "saved-insert-123", revision: 3 }, angle);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const closeVec = (a, b) => a.forEach((n, i) => close(n, b[i]));
const partPose = (piece, point) => model.add(piece.position, model.rotate(point, piece.rotation));

test("real DN125–65 PN25 uses 127 mm reducer, 137 mm finished length and 5 mm seats without pipe extensions", async () => {
  const t = await build(0), g = t.geometry;
  assert.equal(t.status, "layout"); assert.ok(validation.parseInsertionTemplate(t));
  assert.equal(g.baseLengthMm, 127); assert.equal(g.totalLengthMm, 137);
  assert.equal(g.pieces.length, 3); assert.equal(g.pieces[0].shape.outerMm, 139.7);
  assert.equal(g.pieces.find(p => p.id === "right").shape.boltHoles, 8);
  closeVec(g.ports[0].point, [0, 0, 0]); closeVec(g.ports[1].point, [137, 0, 0]);
  closeVec(g.ports[0].axis, [-1, 0, 0]); closeVec(g.ports[1].axis, [1, 0, 0]);
  for (const joint of g.joints) {
    const a = g.pieces.find(p => p.id === joint.a.piece), b = g.pieces.find(p => p.id === joint.b.piece);
    const ap = a.ports.find(p => p.id === joint.a.port), bp = b.ports.find(p => p.id === joint.b.port);
    closeVec(partPose(a, ap.point), partPose(b, bp.point));
    closeVec(model.rotate(ap.axis, a.rotation), model.rotate(bp.axis, b.rotation).map(n => -n));
  }
  assert.equal(g.pieces.find(p => p.id === "left").shape.lengthMm - 5, 21);
});

test("straight collar assembly uses exact 3 mm CAD, butt joints and auxiliary loose flanges without changing price/length", async () => {
  const t = await build(1), g = t.geometry;
  assert.equal(g.baseLengthMm, 130); assert.equal(g.totalLengthMm, 186);
  const collars = g.pieces.filter(p => p.id === "left" || p.id === "right");
  assert.ok(collars.every(p => p.fidelity === "cad"));
  assert.equal(g.pieces.filter(p => p.auxiliary).length, 2);
  assert.equal(t.source.price, fixture.rows[1].price);
  assert.ok(g.joints.every(j => j.kind === "butt"));
  closeVec(g.pieces.find(p => p.id === "left-loose").position, [3, 0, 0]);
  // Native collar X=L is the lip; it is correctly mapped to the external plane.
  const c = collars[0], shape = c.shape;
  closeVec(model.add(shape.modelPosition, model.rotate([28, 0, 0], shape.modelRotation)), [0, 0, 0]);
  closeVec(c.ports[1].point, [28, 0, 0]);
});

test("eccentricity rotates while sensor stays upward at base midpoint; cap occupies its provisional thread port", async () => {
  const t = await build(2, 90), g = t.geometry;
  closeVec(g.ports[1].point, [137, 31.8, 0]);
  const nipple = g.pieces.find(p => p.id === "sensor-nipple"), sensor = g.ports.find(p => p.id === "sensor");
  close(nipple.position[0], 5 + 127 / 2); close(nipple.position[1], 15.9);
  closeVec(model.rotate([1, 0, 0], nipple.rotation), [0, 0, 1]);
  closeVec(sensor.axis, [0, 0, 1]); close(sensor.point[2] - nipple.position[2], 110);
  assert.equal(sensor.occupiedBy, "sensor-plug"); assert.equal(sensor.thread, '1/2"'); assert.ok(sensor.provisional);
  assert.equal(g.pieces.find(p => p.id === "sensor-plug").shape.kind, "marker");
  assert.equal(t.status, "incomplete"); assert.ok(t.issues.some(s => s.includes("глубины навинчивания")));
  assert.ok(t.warnings.some(s => s.includes("25 бар")));
});

test("whole component transforms all connections and survives project normalization with database link and warnings", async () => {
  const t = await build(2), c = core.insertionComponent(t, "insert-test"); c.position = [100, 200, 300]; c.rotation = [0, 0, 90]; c.insertion.hiddenPieceIds = ["sensor-plug"];
  const assembly = { version: 1, sourceFingerprint: "test", components: [c] };
  closeVec(model.portPoint(assembly, { componentId: c.id, portId: "right" }), [100, 337, 268.2]);
  closeVec(model.portAxis(assembly, { componentId: c.id, portId: "right" }), [0, 1, 0]);
  const saved = model.normalizeEditor(JSON.parse(JSON.stringify({ ...model.emptyEditor(), assembly, selectedId: c.id })));
  assert.deepEqual(saved.assembly.components[0].insertion, c.insertion);
  assert.equal(saved.assembly.components[0].equipmentId, "calculated-insertion:saved-insert-123");
  assert.equal(saved.assembly.components[0].ports.find(p => p.id === "sensor").occupiedBy, "sensor-plug");
});

test("geometry cache ignores price/name/revision, invalidates physical geometry and clones resources safely", async () => {
  const a = await build(0), f = structuredClone(fixture);
  f.rows[0].price += 100; f.rows[0].name += " новое название"; f.catalog.parts.forEach(p => { p.price = 42; });
  const b = await server.insertion3d(f.rows[0], f.source, f.catalog, { id: "saved-insert-123", revision: 4 }, 0);
  assert.equal(a.geometryKey, b.geometryKey); assert.notEqual(a.source.price, b.source.price);
  assert.notEqual((await build(2, 0)).geometryKey, (await build(2, 180)).geometryKey);
  const cache = new renderer.InsertionRenderCache(), x = cache.get(core.insertionComponent(a, "a")), y = cache.get(core.insertionComponent(b, "b"));
  assert.equal(cache.builds, 1); assert.notEqual(x.children[0].children[0].geometry, y.children[0].children[0].geometry);
  renderer.disposeInsertionObject(x); assert.ok(y.children[0].children[0].geometry.getAttribute("position").count > 0);
  cache.get(core.insertionComponent(await build(2), "c")); assert.equal(cache.builds, 2);
  renderer.disposeInsertionObject(y); cache.dispose();
});

test("matching reducer CAD is reused; changed dimensions never select an incompatible model", async () => {
  const t = await build(3); assert.equal(t.geometry.pieces[0].fidelity, "cad");
  closeVec(model.rotate([0, 0, 76], t.geometry.pieces[0].shape.modelRotation), [76, 0, 0]);
  const catalog = structuredClone(fixture.catalog), part = catalog.parts.find(p => p.id === "переходы-005-r0365"); part.wallThickness = 5;
  const context = server.insertionGeometryContext(fixture.source, catalog);
  assert.equal(context.models[part.id], undefined);
  assert.throws(() => core.prepareInsertionTemplate(fixture.rows[3], context), /Нет|Нельзя/);
  const missing = server.insertionGeometryContext(fixture.source, fixture.catalog); missing.models = {};
  const fallback = core.prepareInsertionTemplate(fixture.rows[3], missing);
  assert.equal(fallback.geometry.pieces[0].fidelity, "outline"); assert.ok(fallback.warnings.some(s => s.includes("точной CAD-модели нет")));
});

test("independent end executions remain distinct and missing dimensions are explicit", async () => {
  const t = await build(4);
  assert.equal(t.geometry.ports[0].connection, "collar"); assert.equal(t.geometry.ports[1].connection, "flanged");
  assert.equal(t.geometry.ports[0].dn, 100); assert.equal(t.geometry.ports[1].dn, 100);
  const context = server.insertionGeometryContext(fixture.source, fixture.catalog); delete context.flanges["newkey-din2503:NK-FDh125-4"];
  const partial = core.prepareInsertionTemplate(fixture.rows[0], context); assert.equal(partial.status, "incomplete"); assert.ok(partial.issues.some(s => s.includes("не хватает размеров")));
});

test("ports reject occupied/incompatible connections, and project parser rejects unsafe geometry", async () => {
  const t = await build(2), a = t.geometry.ports[0], b = structuredClone(a); b.axis = [1, 0, 0];
  assert.deepEqual(core.connectionCompatibility(a, b), []);
  b.dn = 50; assert.ok(core.connectionCompatibility(a, b).includes("Разные DN"));
  const sensor = t.geometry.ports[2]; assert.ok(core.connectionCompatibility(sensor, sensor).includes("Подключение занято"));
  const bad = await build(1); bad.geometry.pieces[1].shape.meshUrl = "https://example.test/private.stl";
  assert.equal(validation.parseInsertionTemplate(bad), null);
  const nonfinite = await build(0); nonfinite.geometry.ports[0].point[0] = NaN; assert.equal(validation.parseInsertionTemplate(nonfinite), null);
  const ring = await build(0); ring.geometry.pieces[1].shape.innerMm = 500; assert.equal(validation.parseInsertionTemplate(ring), null);
});
