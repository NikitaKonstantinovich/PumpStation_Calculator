import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { createProject } = await loadTs(new URL("../app/project-config.ts", import.meta.url));
const { projectAccessError, parseAccessibleProject, collectorAccessError } = await loadTs(new URL("../app/project-access.ts", import.meta.url));
const { synchronizeCollectors } = await loadTs(new URL("../app/collector-project.ts", import.meta.url));
const pumps = JSON.parse(await readFile(new URL("../public/pumps.json", import.meta.url), "utf8"));
const pump = pumps.find(item => item.manufacturer === "CNP" && item.model === "TD100-22G/2");
assert.ok(pump, "test must exercise a known pump from the nozzle catalogue");

test("all tiers can use the default project and duty-point inputs", () => {
  const project = createProject();
  Object.assign(project.entities["system-input"], { flowRate: 30, head: 25, workingPumpCount: 2, reservePumpCount: 1 });
  for (const role of ["base", "plus", "pro", "admin"]) assert.equal(projectAccessError(project, role), null);
});

test("base locks every project setting, plus changes only options, pro/admin allow all settings", () => {
  const patches = [
    [{ membraneTank: true }, true], [{ membraneTankVolume: 50 }, true], [{ vibrationCompensators: true }, true],
    [{ collectorPlugs: true }, true], [{ isolatingValves: true }, true], [{ jockeyPump: true }, true],
    [{ combinedCircuitsSimultaneous: true }, true], [{ stationType: "fire" }, false], [{ inletHead: 12 }, false],
    [{ usdRate: 100 }, false], [{ cnyRate: 15 }, false], [{ manufacturerDiscounts: { cnp: 0 } }, false],
  ];
  for (const [patch, option] of patches) {
    const project = createProject(); Object.assign(project.entities["station-settings"], patch);
    assert.ok(projectAccessError(project, "base"), JSON.stringify(patch));
    assert.equal(Boolean(projectAccessError(project, "plus")), !option, JSON.stringify(patch));
    for (const role of ["pro", "admin"]) assert.equal(projectAccessError(project, role), null);
  }
});

test("manual DN, nozzle and collector overrides require pro, including JSON imports", () => {
  const edits = [
    project => { project.entities["station-dn"].suctionCollectorDn = 200; },
    project => { project.entities["station-dn"].collectorMaterial = "st20"; },
    project => { project.entities["station-dn"].connectionType = "flanged"; },
    project => { project.entities["station-dn"].pn = 25; },
    project => { project.entities["station-dn"].pumpSuctionPort = { pumpId: "test", dn: 50, connection: "threaded", source: "Manual" }; },
    project => { project.entities["station-collectors"].suction.overrides = { dn: 200 }; },
    project => { project.entities["station-collectors"].discharge.overrides = { material: "st20" }; },
    project => { project.entities["station-collectors"].suction.spacing1 = 600; },
    project => { project.entities["station-collectors"].suction.eccentric = true; },
  ];
  for (const edit of edits) {
    const project = createProject(); edit(project); const original = JSON.stringify(project);
    for (const role of ["base", "plus"]) {
      assert.ok(projectAccessError(project, role));
      assert.throws(() => parseAccessibleProject(JSON.parse(original), role), /pro/);
    }
    for (const role of ["pro", "admin"]) assert.doesNotThrow(() => parseAccessibleProject(JSON.parse(original), role));
    assert.equal(JSON.stringify(project), original, "access checks must not reset or mutate saved projects");
  }
});

test("collector API policy recomputes standard dimensions instead of trusting client parameters", () => {
  for (const pumpId of [undefined, pump.id]) {
    const project = createProject();
    Object.assign(project.entities["system-input"], { flowRate: 30, head: 25, workingPumpCount: 2, reservePumpCount: 1, selectedPumpId: pumpId });
    const synced = synchronizeCollectors(project);
    for (const type of ["suction", "discharge"]) {
      const standard = JSON.parse(JSON.stringify(synced.entities["station-collectors"][type].configuration));
      for (const role of ["base", "plus"]) {
        assert.equal(collectorAccessError(standard, role), null);
        for (const patch of [{ dn: 250 }, { pn: 25 }, { material: "st20" }, { eccentric: true }, { stationType: "fire" }, { primary: { ...standard.primary, spacing: 700 } }]) {
          assert.ok(collectorAccessError({ ...standard, ...patch }, role), JSON.stringify(patch));
        }
      }
      assert.equal(collectorAccessError({ ...standard, dn: 250 }, "pro"), null);
      assert.equal(collectorAccessError({ ...standard, dn: 250 }, "admin"), null);
      assert.equal(collectorAccessError({ ...standard, jockey: true, simultaneous: true }, "plus"), null);
      assert.ok(collectorAccessError({ ...standard, jockey: true }, "base"));
    }
  }
});
