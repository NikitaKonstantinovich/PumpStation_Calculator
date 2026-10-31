import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";
const root = new URL("../", import.meta.url);
const pumps = JSON.parse(await readFile(new URL("public/pumps.json", root), "utf8"));
const { resolvePumpSpatial, parseCatalogPumpSpatial } = await loadTs(new URL("app/model-editor/pump-spatial.ts", root));
const { buildAssembly, worldPoint } = await loadTs(new URL("app/model-editor/model.ts", root));
const { createProject } = await loadTs(new URL("app/project-config.ts", root));
const get = model => pumps.find(p => p.manufacturer === "ONIS" && p.model === model);

test("INL uses H1 for nozzle height, L1 for face distance, and the union of body/motor/base envelopes", () => {
  const p = get("INL100-100-27-11/2"), r = resolvePumpSpatial(p);
  assert.deepEqual(r.bounds, [0,-175,-170,550,175,763]);
  assert.deepEqual(r.info.dimensionsMm, [550,350,933]);
  assert.equal(r.info.envelope, "catalog");
  assert.deepEqual(r.ports.map(p => p.point), [[0,0,0],[550,0,0]]);
  assert.equal(r.info.issues.length, 0);
});

test("MV motor terminal box can extend beyond flange length without shifting the port coordinates", () => {
  const p = get("MV 90-6"), r = resolvePumpSpatial(p);
  assert.equal(p.dimensions.flange_face_to_face, 380);
  assert.ok(r.bounds[0] < 0);
  assert.ok(r.info.dimensionsMm[0] > 380);
  assert.deepEqual(r.ports[1].point, [380,0,0]);
  assert.deepEqual(r.ports[1].axis, [1,0,0]);
});

test("MV1 keeps unresolved base width unknown while retaining independently verified flange ports", () => {
  const r = resolvePumpSpatial(get("MV 1-10"));
  assert.deepEqual(r.info.dimensionsMm, [250,null,680]);
  assert.equal(r.info.envelope, "incomplete");
  assert.deepEqual(r.ports[1].point, [250,0,0]);
  assert.equal(r.bounds[2], -75);
});

test("PV ports are on the same side with H1-H elevation; 600/500 is never guessed", () => {
  const r = resolvePumpSpatial(get("PV 12-3"));
  assert.deepEqual(r.ports[1].point, [0,0,144]);
  assert.deepEqual(r.ports.map(p => p.axis), [[-1,0,0],[-1,0,0]]);
  assert.deepEqual(r.info.dimensionsMm, [null,null,570]);
  const uncertain = resolvePumpSpatial(get("PV 8-6"));
  assert.deepEqual(uncertain.info.dimensionsMm, [null,null,null]);
  assert.equal(uncertain.bounds[2], -43.5);
  assert.deepEqual(uncertain.ports[1].point, [0,0,195.5]);
  assert.match(uncertain.note, /600\/500/);
});

test("catalog inlet frame is placed on the station frame only once", () => {
  for (const name of ["INL100-100-27-11/2", "MV 90-6", "PV 8-6"]) {
    const p = get(name), project = createProject();
    Object.assign(project.entities["system-input"], { selectedPumpId: p.id, workingPumpCount: 1, reservePumpCount: 0 });
    const a = buildAssembly(project, pumps, { version: 1, profiles: {} });
    const c = a.components.find(c => c.kind === "pump"), frame = a.components.find(c => c.kind === "frame");
    assert.equal(worldPoint(c, c.ports.find(p => p.id === "inlet").point)[2], frame.parameters.height - c.bounds[2]);
    assert.equal(c.position[2] + c.bounds[2], frame.parameters.height);
  }
});

test("source catalog letters cannot manufacture horizontal ports or reuse old MBL data for 2026", () => {
  assert.equal(get("MH 1-3").dimensions.L6, 305);
  assert.deepEqual(resolvePumpSpatial(get("MH 1-3")).ports, []);
  assert.equal(get("MBL 32-160-2.2/2").dimensions.D, 445);
  assert.equal(get("MBL 100-160-22/2E").dimensions.D, 856);
  const lettersOnly = { ...get("MBL 80-250-45/2E"), spatialData: undefined, dimensions: { A: 125, H: 564 } };
  assert.equal(resolvePumpSpatial(lettersOnly).info.envelope, "incomplete");
  assert.deepEqual(resolvePumpSpatial(lettersOnly).ports, []);
});

test("invalid catalog frames are rejected and valid CAD remains authoritative", () => {
  const p = get("INL100-100-27-11/2");
  for (const mutate of [s => s.units = "m", s => s.boundsMm[3] = -10, s => s.ports[1].axis = [0,0,0], s => s.ports[0].point[0] = 1, s => s.ports[1].id = "inlet"]) {
    const s = structuredClone(p.spatialData); mutate(s);
    assert.equal(parseCatalogPumpSpatial(s), undefined);
    assert.deepEqual(resolvePumpSpatial({ ...p, spatialData: s }).ports, []);
  }
  const profile = { bounds: [-1,-2,-3,4,5,6], ports: [{ id: "outlet", point: [2,3,4], axis: [0,0,1] }], warnings: [] };
  const r = resolvePumpSpatial(p, profile);
  assert.deepEqual(r.bounds, profile.bounds); assert.deepEqual(r.ports, profile.ports);
  assert.equal(r.info.envelope, "cad");
});

test("all persisted ONIS spatial frames have valid units, roles, sources and finite bounds", () => {
  const list = pumps.filter(p => p.manufacturer === "ONIS" && p.spatialData);
  assert.equal(list.length, 472);
  for (const p of list) {
    assert.ok(parseCatalogPumpSpatial(p.spatialData), p.model);
    assert.ok(resolvePumpSpatial(p).bounds.every(Number.isFinite), p.model);
    assert.match(p.spatialData.source, /^(https:\/\/onis\.ru\/files\/catalogs\/|repository:data\/sources\/onis-mbl2026\/MBL\.xlsx#)/);
  }
  assert.ok(pumps.filter(p => p.manufacturer === "ONIS" && p.series.startsWith("SW")).every(p => !p.spatialData));
});

test("all 44 original MBL use drawing dimensions and net weight, never the package envelope", () => {
  const list = pumps.filter(p => p.manufacturer === "ONIS" && p.series === "MBL");
  assert.equal(list.length, 44);
  for (const p of list) {
    const r = resolvePumpSpatial(p);
    assert.ok(p.weightKg > 0);
    assert.match(p.physicalDataSources["Масса"], /Нетто.*page=16/);
    assert.equal(r.info.envelope, "catalog");
    assert.deepEqual(r.info.dimensionsMm, [p.dimensions.D, p.dimensions.F, p.dimensions.H2]);
    assert.ok(Object.keys(p.dimensions).every(k => !/pack|gross|упаков|брутто/i.test(k)));
    assert.doesNotMatch(p.physicalNote, /до проверки чертежа/);
    assert.deepEqual(r.ports[1].point, [p.dimensions.A, 0, p.dimensions.H2 - p.dimensions.H1]);
    assert.deepEqual(r.ports[1].axis, [0, 0, 1]);
  }
  const p = get("MBL 32-160-1.5/2");
  assert.equal(p.weightKg, 32); // Net 32, gross 35; package 490 x 285 x 355.
  assert.deepEqual(resolvePumpSpatial(p).info.dimensionsMm, [411, 240, 292]);
  const project = createProject();
  Object.assign(project.entities["system-input"], { selectedPumpId: p.id, workingPumpCount: 1, reservePumpCount: 0 });
  const a = buildAssembly(project, pumps, { version: 1, profiles: {} });
  const c = a.components.find(c => c.kind === "pump"), frame = a.components.find(c => c.kind === "frame");
  assert.equal(c.position[2] + c.bounds[2], frame.parameters.height);
  assert.equal(worldPoint(c, c.ports.find(p => p.id === "outlet").point)[2], frame.parameters.height + 292);
  const conflict = get("MBL 65-125-4/2");
  assert.deepEqual([conflict.inletDn, conflict.outletDn], [80, 65]);
  assert.match(resolvePumpSpatial(conflict).note, /DN1\/DN2=65\/50/);
  assert.equal(get("MBL 50-200-15/2").dimensions.C, 307.5);
  assert.equal(get("MBL 65-125-5.5/2").weightKg, 66.5);
  assert.equal(get("MBL 80-250-45/2E").dimensions.D, 973);
});

test("MBL 2026 workbook retains both table schemas and all 99 exact models", async () => {
  const facts = JSON.parse(await readFile(new URL("data/pump-catalog/onis-spatial-data.json", root), "utf8"));
  const rows = Object.entries(facts.pumps).filter(([, f]) => f.source === "mbl2026-user-workbook-20261031");
  assert.equal(rows.length, 99);
  for (const [id, fact] of rows) {
    const p = pumps.find(p => p.id === id);
    assert.equal(p.series, "MBL (2026)");
    assert.equal(p.model, fact.model);
    assert.equal(p.article, fact.article);
    assert.equal(fact.sourceRow.length, fact.sourceHeaders.length);
    assert.equal(fact.sourceRow[fact.sourceHeaders.indexOf("S")], "4*14");
    assert.equal(p.dimensions.S, undefined);
    assert.ok(parseCatalogPumpSpatial(p.spatialData));
    assert.equal(resolvePumpSpatial(p).info.envelope, "catalog");
    assert.ok(p.dimensions.overall_height > 0);
    for (const [key, value] of Object.entries(fact.dimensions)) assert.equal(p.dimensions[key], value);
    assert.equal(resolvePumpSpatial(p).ports.length, 2);
    assert.doesNotMatch(p.physicalNote, /не получена|недоступна|не назначены/);
  }
  const small = get("MBL 65-160-9.2/2E").dimensions;
  assert.deepEqual([small.D, small.H, small.H1, small.H2], [605, undefined, 180, 385]);
  const large = get("MBL 65-160-11/2E").dimensions;
  assert.deepEqual([large.D, large.H, large.H1, large.H2], [798, 424, 180, 385]);
  assert.equal(get("MBL 65-315-90/2E").dimensions.M, 419);
});

test("MBL 2026 large drawing separates motor height, discharge elevation and width", () => {
  const p = get("MBL 80-250-45/2E"), r = resolvePumpSpatial(p);
  assert.deepEqual(r.info.dimensionsMm, [973,450,564]);
  assert.deepEqual(r.bounds, [0,-225,-250,973,225,314]);
  assert.deepEqual(r.ports[1].point, [125,0,314]);
  assert.deepEqual(r.ports[1].axis, [0,0,1]);
  // This motor is taller than the pump; the discharge must stay BELOW the box top.
  const tall = resolvePumpSpatial(get("MBL 100-160-15/2E"));
  assert.deepEqual(tall.info.dimensionsMm, [785,353,488]);
  assert.deepEqual(tall.ports[1].point, [128,0,248]);
  assert.equal(tall.bounds[5], 288);
  const small = resolvePumpSpatial(get("MBL 32-125-0.75/2E"));
  assert.deepEqual(small.info.dimensionsMm, [435,191,257]);
  assert.deepEqual(small.ports[1].point, [80,0,145]);
  const project = createProject();
  Object.assign(project.entities["system-input"], { selectedPumpId: p.id, workingPumpCount: 1, reservePumpCount: 0 });
  const a = buildAssembly(project, pumps, { version: 1, profiles: {} });
  const c = a.components.find(c => c.kind === "pump"), frame = a.components.find(c => c.kind === "frame");
  assert.equal(c.position[2] + c.bounds[2], frame.parameters.height);
  assert.equal(worldPoint(c, c.ports.find(p => p.id === "outlet").point)[2], frame.parameters.height + 564);
  assert.equal(c.pumpGeometry.envelope, "catalog");
});
