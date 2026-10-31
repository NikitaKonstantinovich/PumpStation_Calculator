import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";
const root = new URL("../", import.meta.url);
const { resolvePumpSpatial } = await loadTs(new URL("app/model-editor/pump-spatial.ts", root));
const model = await loadTs(new URL("app/model-editor/model.ts", root));
const { createProject } = await loadTs(new URL("app/project-config.ts", root));
const pumps = JSON.parse(await readFile(new URL("public/pumps.json", root), "utf8"));
const profiles = JSON.parse(await readFile(new URL("public/model-assets/manifest.json", root), "utf8"));
const none = { version: 1, profiles: {} };
// Explicit missing-data fixture: the live MBL catalog now has verified dimensions/ports.
const mbl = { ...pumps.find(p => p.id === "nu-34f0554f7dc091e4"), dimensions: undefined, spatialData: undefined };
function assembly(id, catalog = profiles, lines) {
  const project = createProject();
  Object.assign(project.entities["system-input"], { selectedPumpId: id, workingPumpCount: 1, reservePumpCount: 0 });
  return model.buildAssembly(project, pumps.map(p => p.id === mbl.id ? mbl : p), catalog, lines);
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("complete catalog dimensions form an exact box without inventing nozzle positions", () => {
  const result = resolvePumpSpatial({ ...mbl, dimensions: { overall_length: 1200, overall_width: 500, overall_height: 650, flange_center_height: 180 } });
  assert.deepEqual(result.bounds, [0, -250, 0, 1200, 250, 650]);
  assert.equal(result.info.envelope, "catalog");
  assert.deepEqual(result.ports, []);
  assert.equal(result.info.issues.length, 2);
});
test("packaging, dimension letters and invalid values are not substituted for pump dimensions", () => {
  const r = resolvePumpSpatial({ ...mbl, dimensions: { overall_length: -1, overall_width: NaN, overall_height: Infinity, H1: 800, base_width: 200, packaging_length: 1500 } });
  assert.equal(r.info.envelope, "incomplete");
  assert.deepEqual(r.info.dimensionsMm, [null, null, null]);
  assert.deepEqual(r.ports, []);
});
test("CNP CDM catalog coordinate frame uses flange height once; instrument height is not outlet height", () => {
  const pump = pumps.find(p => p.id === "9");
  const r = resolvePumpSpatial({ ...pump, dimensions: { ...pump.dimensions, other_connection_height: 9999 } });
  assert.equal(r.info.envelope, "catalog");
  assert.equal(r.info.coordinateSystem, "inlet");
  assert.deepEqual(r.ports[1].point, [pump.dimensions.flange_face_to_face, 0, 0]);
  const a = assembly(pump.id, none), c = a.components.find(c => c.kind === "pump");
  const frame = a.components.find(c => c.kind === "frame");
  close(model.worldPoint(c, c.ports[1].point)[2], frame.parameters.height + pump.dimensions.flange_center_height);
});
test("missing mesh retains measured CAD bounds and horizontal discharge frame", () => {
  const pump = pumps.find(p => p.type === "end_suction" && profiles.profiles[p.id]?.ports.some(p => p.id === "outlet"));
  const profile = { ...profiles.profiles[pump.id], meshUrl: undefined };
  const r = resolvePumpSpatial(pump, profile);
  assert.equal(r.info.envelope, "cad");
  assert.deepEqual(r.bounds, profile.bounds);
  const a = assembly(pump.id, { version: 1, profiles: { [pump.id]: profile } });
  const c = a.components.find(c => c.kind === "pump"), frame = a.components.find(c => c.kind === "frame");
  const original = profile.ports.find(p => p.id === "outlet"), out = c.ports.find(p => p.id === "outlet");
  assert.deepEqual(out.point, original.point);
  assert.deepEqual(out.axis, [0, 0, 1]);
  close(model.worldPoint(c, out.point)[2], frame.parameters.height - profile.bounds[2] + original.point[2]);
  const rotated = { ...c, position: [10, 20, 30], rotation: [0, 0, 90] };
  const point = model.worldPoint(rotated, out.point);
  close(point[0], 10 - out.point[1]); close(point[1], 20 + out.point[0]); close(point[2], 30 + out.point[2]);
});
test("explicit CAD axes have priority and unnamed ports are not assigned flow roles", () => {
  const profile = { bounds: [0,-10,-20,100,10,80], ports: [{ id: "outlet", point: [50,0,0], axis: [1,0,0] }], warnings: [] };
  assert.deepEqual(resolvePumpSpatial(mbl, profile).ports[0].axis, [1,0,0]);
  const unknown = resolvePumpSpatial(mbl, { ...profile, ports: [{ id: "port-a", point: [0,0,0] }] });
  assert.equal(unknown.ports[0].id, "port-a");
  assert.equal(unknown.info.issues.length, 2);
});
test("ONIS MBL uses explicit schematic scene ports without changing missing catalog data", () => {
  assert.ok(mbl);
  for (const lines of [undefined, { version: 1, revision: "test", items: {}, issues: [] }]) {
    const a = assembly(mbl.id, none, lines), c = a.components.find(c => c.kind === "pump");
    assert.equal(c.pumpGeometry.envelope, "incomplete");
    assert.deepEqual(c.pumpGeometry.dimensionsMm, [null, null, null]);
    assert.equal(c.pumpGeometry.schematic, true);
    assert.ok(c.ports.every(p => p.provisional && /Условная компоновка/.test(p.source)));
    assert.deepEqual(resolvePumpSpatial(mbl).ports, []);
    assert.ok(model.connectionIssues(a).some(i => /Нет координат напорного/.test(i.message)));
    assert.deepEqual(model.normalizeEditor({ ...model.emptyEditor(), assembly: a }).assembly.components.find(item => item.id === c.id).pumpGeometry, c.pumpGeometry);
  }
});
test("refresh replaces legacy ports with labelled schematic ports while preserving manual pose", () => {
  const fresh = assembly(mbl.id, none), previous = structuredClone(fresh);
  const p = previous.components.find(c => c.kind === "pump");
  p.position = [100,200,300]; p.ports = [{ id: "outlet", point: [400,0,0], axis: [0,0,1] }]; delete p.pumpGeometry;
  const merged = model.mergeAssembly(previous, fresh).components.find(c => c.id === p.id);
  assert.deepEqual(merged.position, [100,200,300]);
  assert.equal(merged.pumpGeometry.schematic, true);
  assert.ok(merged.ports.every(p => p.provisional));
  assert.equal(merged.pumpGeometry.envelope, "incomplete");
});


test("rendered fallback has catalog dimensions; missing sizes use an explicitly different marker material", async () => {
  const replacements = {};
  for (const name of ["geometry", "collector-renderer", "insertion-renderer", "fastener-renderer"]) {
    const url = new URL(`app/model-editor/${name}.ts`, root);
    replacements[url.href] = (await readFile(url, "utf8")).replace('from "three"', `from ${JSON.stringify(new URL("node_modules/three/build/three.module.js", root).href)}`);
  }
  const { componentObject, disposeObject } = await loadTs(new URL("app/model-editor/geometry.ts", root), replacements);
  const a = assembly("9", none), c = a.components.find(c => c.kind === "pump");
  const object = componentObject(a, c), mesh = object.children.find(o => o.isMesh);
  const [l,w,h] = c.pumpGeometry.dimensionsMm;
  assert.deepEqual([mesh.geometry.parameters.width,mesh.geometry.parameters.height,mesh.geometry.parameters.depth], [l,w,h]);
  assert.equal(mesh.material.wireframe, false); disposeObject(object);
  const unknown = assembly(mbl.id, none), uc = unknown.components.find(c => c.kind === "pump");
  const marker = componentObject(unknown, uc), um = marker.children.find(o => o.isMesh);
  assert.equal(um.material.wireframe, false); assert.equal(um.material.color.getHex(), 0xe3a145); disposeObject(marker);
});
