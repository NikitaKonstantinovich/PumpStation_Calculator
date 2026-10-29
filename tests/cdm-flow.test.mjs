import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";

const model = await loadTs(new URL("../app/model-editor/model.ts", import.meta.url));
const { createProject } = await loadTs(new URL("../app/project-config.ts", import.meta.url));
const pumps = JSON.parse(await readFile(new URL("../public/pumps.json", import.meta.url), "utf8"));
const current = JSON.parse(await readFile(new URL("../public/model-assets/manifest.json", import.meta.url), "utf8"));
const reviewed = { ...current.profiles["371"], sourceHash: "b".repeat(64), meshUrl: "/model-assets/reviewed-cdm42.stl",
  flowReview: { status: "confirmed_corrected", previousNormalizedHash: "a".repeat(64), flowNormalized: [1, 0, 0] } };
const old = { ...reviewed, sourceHash: "a".repeat(64), meshUrl: "/model-assets/old-cdm42.stl", flowReview: undefined };
const catalog = profile => ({ version: 1, profiles: { "371": profile } });

test("published CDM42 profile uses corrected CAD while unsupported CDM120 stays explicitly provisional", () => {
  const cdm42 = current.profiles["371"];
  assert.equal(cdm42.flowReview.status, "confirmed_corrected");
  assert.match(cdm42.source, /3D_FlowVerified\//);
  assert.notEqual(cdm42.sourceHash, cdm42.flowReview.previousNormalizedHash);
  assert.deepEqual(cdm42.flowReview.flowNormalized, [1, 0, 0]);
  assert.deepEqual(cdm42.ports.find(p => p.id === "inlet").axis, [-1, 0, 0]);
  assert.deepEqual(cdm42.ports.find(p => p.id === "outlet").axis, [1, 0, 0]);
  const cdm120 = Object.values(current.profiles).find(p => /\/CDM120-1__/.test(p.source));
  assert.equal(cdm120.flowReview.status, "unconfirmed_no_recognized_marker");
  assert.ok(cdm120.ports.every(p => p.provisional));
  assert.ok(cdm120.warnings.some(w => w.includes("Направление потока CDM не подтверждено")));
});

test("restoring a pre-correction conversion job cannot undo the reviewed CDM orientation", () => {
  const incoming = { ...catalog(old), equipment: { "pump:371": old } };
  const result = model.combineProfiles(catalog(reviewed), incoming);
  assert.deepEqual(result.profiles["371"], reviewed);
  assert.deepEqual(result.equipment["pump:371"], reviewed);
  assert.deepEqual(model.combineProfiles(catalog(old), catalog(reviewed)).profiles["371"], reviewed);
  assert.deepEqual(model.combineProfiles(incoming, catalog(reviewed)).equipment["pump:371"], reviewed);
  const newSource = { ...old, sourceHash: "different-new-source" };
  assert.deepEqual(model.combineProfiles(catalog(reviewed), catalog(newSource)).profiles["371"], newSource);
});

test("CDM resource correction preserves manual poses, visibility, locks and other assembly components", () => {
  const project = createProject("CDM flow correction", { id: "cdm-flow-test", timestamp: "2026-10-26T00:00:00Z" });
  Object.assign(project.entities["system-input"], { selectedPumpId: "371", workingPumpCount: 2, reservePumpCount: 0 });
  const assembly = model.buildAssembly(project, pumps, catalog(old));
  const pump = assembly.components.find(c => c.kind === "pump");
  Object.assign(pump, { position: [123, -40, 221], rotation: [0, 0, 17], hidden: true, opacity: .4, locked: true });
  for (const next of [model.refreshModelAssets(assembly, project, pumps, catalog(reviewed)), model.mergeAssembly(assembly, model.buildAssembly(project, pumps, catalog(reviewed)))]) {
    const corrected = next.components.find(c => c.id === pump.id);
    for (const field of ["position", "rotation", "hidden", "opacity", "locked"]) assert.deepEqual(corrected[field], pump[field]);
    assert.equal(corrected.meshUrl, reviewed.meshUrl);
    assert.equal(corrected.cadSource.hash, reviewed.sourceHash);
    assert.deepEqual(corrected.ports.map(p => p.point), pump.ports.map(p => p.point));
    for (const component of assembly.components.filter(c => c.kind !== "pump")) assert.deepEqual({ ...next.components.find(c => c.id === component.id), orphaned: false }, { ...component, orphaned: false });
    const reopened = model.normalizeEditor({ ...model.emptyEditor(), assembly: JSON.parse(JSON.stringify(next)) });
    assert.equal(reopened.assembly.components.find(c => c.id === pump.id).cadSource.hash, reviewed.sourceHash);
    assert.deepEqual(reopened.assembly.components.find(c => c.id === pump.id).rotation, pump.rotation);
  }
});
