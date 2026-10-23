import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const m = await loadTs(new URL("../app/model-editor/model.ts", import.meta.url));
const g = await loadTs(new URL("../app/model-editor/snap-geometry.ts", import.meta.url));
const e = await loadTs(new URL("../app/model-editor/snap-engine.ts", import.meta.url));
const s = await loadTs(new URL("../app/model-editor/snap-settings.ts", import.meta.url));
const { createProject, parseProjectConfig } = await loadTs(new URL("../app/project-config.ts", import.meta.url));
const close = (a, b) => assert.ok(m.distance(a, b) < 1e-6, `${a} != ${b}`);
const part = (id = "pipe", kind = "pipe", patch = {}) => ({ id, kind, name: id, position: [0, 0, 0], rotation: [0, 0, 0], hidden: false, locked: false, opacity: 1, ports: [], sourceNote: "test", parameters: { length: 100, width: 80, height: 20, diameter: 20, routeOffset: 0 }, ...patch });
const assembly = (...components) => ({ version: 1, sourceFingerprint: "test", components });
const emptyGeometry = () => ({ points: [], lines: [], circles: [], faces: [] });
const settings = (...enabled) => ({ ...s.defaultSnaps(), types: Object.fromEntries(s.snapDefinitions.map(d => [d.id, enabled.includes(d.id)])) });
const project = p => ({ x: p[0], y: p[1], visible: true });
const query = (geometry, prefs = s.defaultSnaps(), patch = {}) => ({ geometry, settings: prefs, ray: { origin: [0, 0, 100], direction: [0, 0, -1] }, plane: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] }, pointer: { x: 0, y: 0 }, project, ...patch });

test("legacy defaults preserve the existing grid setting; invalid preferences are bounded", () => {
  const old = m.normalizeEditor({ version: 1, snap: false, snapStep: 10 });
  assert.equal(old.snap, false); assert.equal(old.snapStep, 10);
  assert.deepEqual(Object.keys(old.objectSnaps.types).filter(k => old.objectSnaps.types[k]), ["end", "mid", "center", "port"]);
  const bad = s.normalizeSnaps({ radius: Infinity, polarStep: -50, types: { end: false, mid: "yes", invented: true }, plane: "ABC" });
  assert.equal(bad.radius, 12); assert.equal(bad.polarStep, 1); assert.equal(bad.plane, "XY"); assert.equal(bad.types.end, false); assert.equal(bad.types.mid, true);
});

test("native project roundtrip retains independent checkboxes, face reference, and saved local point", () => {
  const p = createProject("Snaps"), prefs = settings("quadrant", "apparent", "project", "tangent", "reference");
  Object.assign(prefs, { radius: 19, plane: "face", face: { componentId: "frame", featureId: "frame/beam0/face2-1" }, polarStep: 17, labels: false });
  p.entities["station-model"].editor = { ...m.emptyEditor(), snap: false, objectSnaps: prefs, referencePoints: [{ id: "r", componentId: "frame", point: [1.1, 2.2, 3.3] }], assembly: assembly(part("frame", "frame")) };
  const parsed = parseProjectConfig(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(parsed.entities["station-model"].editor.objectSnaps, prefs);
  assert.deepEqual(parsed.entities["station-model"].editor.referencePoints, p.entities["station-model"].editor.referencePoints);
  assert.equal(parsed.entities["station-model"].editor.snap, false);
});

test("pipe circles and axes use analytic parameters and full component rotation", () => {
  const c = part("p", "pipe", { position: [20, 30, 40], rotation: [20, 40, 65] });
  const geo = g.snapGeometry(assembly(c));
  assert.equal(geo.circles.length, 2); assert.equal(geo.lines.length, 1);
  close(geo.circles[0].origin, m.worldPoint(c, [-50, 0, 0]));
  const quadrants = geo.points.filter(p => p.kinds.includes("quadrant"));
  assert.equal(quadrants.length, 8);
  for (const p of quadrants.slice(0, 4)) assert.ok(Math.abs(m.distance(p.point, geo.circles[0].origin) - 10) < 1e-6);
  close(g.localPoint(c, m.worldPoint(c, [12, 43, -8])), [12, 43, -8]);
});

test("frame features belong to real beams, with distinct contour, face and insertion semantics", () => {
  const geo = g.snapGeometry(assembly(part("f", "frame")));
  assert.equal(geo.lines.length, 48); assert.equal(geo.faces.length, 24);
  assert.equal(geo.points.filter(p => p.kinds.includes("vertex")).length, 32);
  assert.ok(!geo.faces.some(f => m.distance(f.origin, [0, 0, 10]) < 1e-6), "no fictitious face over frame opening");
  const face = geo.faces[0]; assert.ok(g.onFace(face.origin, face));
  assert.ok(!g.onFace(m.add(face.origin, g.scale(face.u, 1e4)), face));
});

test("imported mesh/bounds never fabricate analytic edges or circle centers; ports retain status/axis", () => {
  const pump = part("pump", "pump", { meshUrl: "/model-assets/pump.stl", bounds: [-5, -5, -5, 5, 5, 5], ports: [{ id: "in", point: [0, 4, 0], axis: [1, 0, 0], provisional: true }], rotation: [0, 0, 90] });
  const geo = g.snapGeometry(assembly(pump));
  assert.equal(geo.lines.length, 0); assert.equal(geo.circles.length, 0); assert.equal(geo.faces.length, 0);
  const p = geo.points.find(p => p.kinds.includes("port")); close(p.point, [-4, 0, 0]); close(p.axis, [0, 1, 0]); assert.equal(p.approximate, true);
  assert.ok(!geo.points.some(p => p.kinds.includes("center")));
});

test("all supported point checkboxes filter independently and coincident labels merge after filtering", () => {
  const geo = g.snapGeometry(assembly(part("p"), part("f", "frame")));
  for (const kind of ["end", "vertex", "mid", "center", "quadrant", "centroid", "base", "faceCenter"]) {
    const found = e.candidates(query(geo, settings(kind)));
    assert.ok(found.length, kind); assert.ok(found.every(c => c.kinds.length === 1 && c.kinds[0] === kind));
  }
  const all = e.candidates(query(geo, settings("center", "faceCenter", "centroid")));
  const merged = e.rankedCandidates(all, project, { x: -50, y: 0 }, 1);
  const center = merged.find(p => m.distance(p.point, [-50, 0, 0]) < 1e-6);
  assert.deepEqual(new Set(center.kinds), new Set(["center", "faceCenter", "centroid"]));
  assert.deepEqual(e.candidates(query(geo, settings())), []);
});

test("hidden components are excluded, locked targets accepted, moving component and dependent routes rejected", () => {
  const a = assembly(part("hidden", "frame", { hidden: true }), part("locked", "pipe", { locked: true }), part("moving"), part("route", "pipe", { routing: { automatic: true, from: { componentId: "moving", portId: "a" }, to: { componentId: "locked", portId: "b" }, points: [[0, 0, 0], [5, 0, 0]] } }));
  const geo = g.snapGeometry(a), excluded = g.excludedTargets(a, "moving");
  assert.ok(!geo.points.some(p => p.componentId === "hidden")); assert.deepEqual([...excluded], ["moving", "route"]);
  const found = e.candidates(query(geo, settings("end", "mid"), { exclude: excluded }));
  assert.ok(found.length); assert.ok(found.every(p => p.componentId === "locked"));
});

test("saved reference points follow transforms; absent geometry does not clear preferences", () => {
  const p = part("p", "pump", { position: [10, 20, 30], rotation: [0, 0, 90] });
  const geo = g.snapGeometry(assembly(p), [{ id: "r", componentId: "p", point: [1, 2, 3] }]);
  const prefs = settings("reference", "quadrant");
  const found = e.candidates(query(geo, prefs)); assert.equal(found.length, 1); close(found[0].point, [8, 21, 33]); assert.equal(prefs.types.quadrant, true);
});

test("3D intersections reject skew and overlap while projection is explicitly opt-in", () => {
  close(e.segmentIntersection([-10, 0, 0], [10, 0, 0], [0, -10, 0], [0, 10, 0]), [0, 0, 0]);
  assert.equal(e.segmentIntersection([-10, 0, 0], [10, 0, 0], [0, -10, 5], [0, 10, 5]), null);
  assert.equal(e.segmentIntersection([0, 0, 0], [10, 0, 0], [5, 0, 0], [20, 0, 0]), null);
  const geo = { ...emptyGeometry(), lines: [{ id: "a", componentId: "a", a: [-10, 0, 0], b: [10, 0, 0] }, { id: "b", componentId: "b", a: [0, -10, 5], b: [0, 10, 5] }] };
  assert.equal(e.candidates(query(geo, settings("intersection", "apparent"))).length, 0);
  const projected = e.candidates(query(geo, settings("apparent", "project")));
  assert.equal(projected.length, 1); assert.equal(projected[0].projected, true); close(projected[0].point, [0, 0, 0]);
});

test("perpendicular edge/plane and tangents require explicit reference and satisfy geometry", () => {
  const geo = { ...emptyGeometry(), lines: [{ id: "l", componentId: "p", a: [-20, 0, 0], b: [20, 0, 0] }], circles: [{ id: "c", componentId: "p", origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], radius: 5 }], faces: [{ id: "f", componentId: "p", origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], halfU: 20, halfV: 20 }] };
  assert.equal(e.candidates(query(geo, settings("perpendicular", "planeFoot", "tangent"))).length, 0);
  close(e.candidates(query(geo, settings("perpendicular"), { reference: [3, 6, 0] }))[0].point, [3, 0, 0]);
  close(e.candidates(query(geo, settings("planeFoot"), { reference: [3, 6, 8] }))[0].point, [3, 6, 0]);
  const tangent = e.candidates(query(geo, settings("tangent"), { reference: [10, 0, 0] })); assert.equal(tangent.length, 2);
  for (const t of tangent) { assert.ok(Math.abs(Math.hypot(...t.point) - 5) < 1e-6); assert.ok(Math.abs(g.dot(t.point, m.subtract([10, 0, 0], t.point))) < 1e-6); }
  assert.equal(e.tangentPoints([10, 0, 1], geo.circles[0]).length, 0, "out-of-plane reference is not silently projected");
});

test("nearest edges, axes, extensions and triangle vertices are distinct candidates", () => {
  const geo = { ...emptyGeometry(), lines: [{ id: "l", componentId: "p", a: [-10, 0, 0], b: [10, 0, 0], axis: true }] };
  const q = query(geo, settings("nearEdge", "axis", "extension", "nearFace", "meshVertex"), { ray: { origin: [20, 1, 100], direction: [0, 0, -1] }, surface: { componentId: "mesh", point: [20, 1, 0], vertices: [[19, 0, 0], [21, 0, 0], [20, 2, 0]] } });
  const found = e.candidates(q);
  close(found.find(c => c.kinds.includes("extension")).point, [20, 0, 0]);
  close(found.find(c => c.kinds.includes("nearEdge")).point, [10, 0, 0]);
  assert.equal(found.filter(c => c.kinds.includes("meshVertex")).length, 3);
  assert.ok(found.filter(c => c.componentId === "mesh").every(c => c.approximate));
});

test("two-reference midpoint does not generate all pairs; XYZ guides are alternatives", () => {
  const q = query(emptyGeometry(), settings("between", "trackX", "trackY", "trackZ"), { reference: [1, 2, 3], secondReference: [11, 12, 13], ray: { origin: [7, 8, 100], direction: [0, 0, -1] } });
  const found = e.candidates(q); assert.equal(found.length, 4);
  close(found.find(c => c.kinds.includes("between")).point, [6, 7, 8]);
  close(found.find(c => c.kinds.includes("trackX")).point, [7, 2, 3]);
  close(found.find(c => c.kinds.includes("trackY")).point, [1, 8, 3]);
  assert.equal(e.candidates({ ...q, reference: undefined }).length, 0);
});

test("parallel and polar guide constraints, custom angle and working face transformations", () => {
  const q = query(emptyGeometry(), settings("parallel", "ortho", "polar"), { reference: [0, 0, 0], parallelLine: { id: "l", componentId: "p", a: [0, 0, 0], b: [10, 10, 0] }, ray: { origin: [12, 8, 100], direction: [0, 0, -1] } });
  const found = e.candidates(q); const parallel = found.find(c => c.kinds.includes("parallel"));
  assert.ok(Math.abs(parallel.point[0] - parallel.point[1]) < 1e-6);
  const polar = found.find(c => c.kinds.includes("polar")); assert.ok(Math.abs(polar.point[0] - polar.point[1]) < 1e-6);
  assert.equal(found.filter(c => c.kinds.includes("ortho")).length, 2);
  const geo = g.snapGeometry(assembly(part("f", "frame", { position: [17, 3, 30], rotation: [25, 12, 14] })));
  const face = geo.faces[0], plane = g.workingPlane({ ...s.defaultSnaps(), plane: "face", face: { componentId: "f", featureId: face.id } }, geo);
  const projected = g.projectPlane([70, 80, 90], plane);
  assert.ok(Math.abs(g.dot(m.subtract(projected, plane.origin), g.cross(plane.u, plane.v))) < 1e-6);
  assert.equal(g.workingPlane({ ...s.defaultSnaps(), plane: "face" }, geo), null);
});

test("screen radius is in pixels, definite features beat near-surface and previous selection is stable", () => {
  const c = (id, point, kinds) => ({ id, point, kinds, label: id, symbol: "x", componentId: "p", componentIds: ["p"], approximate: false, projected: false });
  const all = [c("end", [10, 0, 0], ["end"]), c("near", [0, 0, 0], ["nearFace"]), c("mid", [-8, 0, 0], ["mid"])];
  assert.equal(e.rankedCandidates(all, project, { x: 0, y: 0 }, 12)[0].id, "mid");
  assert.equal(e.rankedCandidates(all, project, { x: 0, y: 0 }, 12, "end")[0].id, "end");
  assert.deepEqual(e.rankedCandidates(all, p => ({ x: p[0] * 2, y: p[1] * 2, visible: true }), { x: 0, y: 0 }, 12).map(c => c.id), ["near"]);
  assert.equal(e.rankedCandidates(all, p => ({ ...project(p), visible: false }), { x: 0, y: 0 }, 12).length, 0);
});

test("point move aligns exactly without grid rounding, updates pipes, and is one undo transaction", () => {
  const a = assembly(part("p", "pump", { position: [3, 5, 7], rotation: [0, 0, 90], ports: [{ id: "port", point: [3, 2, 1] }] }), part("target", "pump", { ports: [{ id: "port", point: [40, 50, 60] }] }), part("route", "pipe", { routing: { automatic: true, from: { componentId: "p", portId: "port" }, to: { componentId: "target", portId: "port" }, points: [[0, 0, 0], [1, 1, 1]] } }));
  const source = m.worldPoint(a.components[0], [3, 2, 1]), target = [123.456, 234.567, 345.678];
  const next = e.moveByPoints(a, "p", source, target);
  close(m.worldPoint(next.components[0], [3, 2, 1]), target); close(m.pipePoints(next, next.components[2])[0], target);
  const history = m.execute(m.createHistory(a), next); assert.equal(history.past.length, 1); assert.deepEqual(m.undo(history).present, a); assert.deepEqual(m.redo(m.undo(history)).present, next);
  const locked = assembly({ ...a.components[0], locked: true }); assert.equal(e.moveByPoints(locked, "p", source, target), locked);
});

test("edge-on circle remains snappable; missing projection plane cannot silently yield 3D points", () => {
  const circle = { id: "c", componentId: "p", origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], radius: 10 };
  const point = e.nearestCircleToRay({ origin: [0, -100, 0], direction: [0, 1, 0] }, circle);
  assert.ok(Math.abs(point[0]) < .001); assert.ok(Math.abs(Math.hypot(...point) - 10) < 1e-6);
  const geo = g.snapGeometry(assembly(part()));
  assert.deepEqual(e.candidates(query(geo, settings("end", "project"), { plane: null })), []);
});

test("constructions inherit approximation from reference points", () => {
  const q = query(emptyGeometry(), settings("between", "trackX"), { reference: [0, 0, 0], secondReference: [10, 10, 10], referenceApproximate: true });
  assert.ok(e.candidates(q).every(c => c.approximate));
  const secondOnly = e.candidates({ ...q, referenceApproximate: false, secondReferenceApproximate: true });
  assert.equal(secondOnly.find(c => c.kinds.includes("between")).approximate, true);
  assert.equal(secondOnly.find(c => c.kinds.includes("trackX")).approximate, false);
});
