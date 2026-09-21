import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { resolveDnConnection } = await loadTs(new URL("../app/dn-defaults.ts", import.meta.url));
const { createProject, parseProjectConfig } = await loadTs(new URL("../app/project-config.ts", import.meta.url));
const { synchronizeCollectors, collectorRecommendation } = await loadTs(new URL("../app/collector-project.ts", import.meta.url));

function projectFor(stationType, dn = 50) {
  const p = createProject();
  Object.assign(p.entities["station-settings"], { stationType, jockeyPump: stationType === "fire" });
  for (const id of ["system-input", "system-input-2"]) Object.assign(p.entities[id], { flowRate: 10, head: 30, workingPumpCount: 1, reservePumpCount: 1, calculated: true });
  Object.assign(p.entities["station-dn"], {
    suctionCollectorDn: dn, dischargeCollectorDn: dn, suctionValveDn: dn, dischargeValveDn: dn,
    secondarySuctionCollectorDn: dn, secondaryDischargeCollectorDn: dn, secondarySuctionValveDn: dn, secondaryDischargeValveDn: dn,
    connectionType: null, secondaryConnectionType: null,
  });
  return p;
}

test("utility and SMART primary circuits default to thread through DN50 inclusive", () => {
  for (const stationType of ["utility", "smart"]) for (const dn of [25, 32, 40, 50]) {
    assert.deepEqual(resolveDnConnection({ stationType }, dn), { connection: "threaded", forcedFlanged: false, threadedAllowed: true });
    const p = projectFor(stationType, dn);
    for (const side of ["suction", "discharge"]) {
      const c = collectorRecommendation(p, side);
      assert.equal(c.connection, "threaded");
      assert.equal(c.primary.connection, "threaded");
    }
  }
});

test("secondary combined and fire circuits default to thread independently of primary circuit", () => {
  for (const stationType of ["combined", "fire"]) {
    const p = projectFor(stationType);
    Object.assign(p.entities["station-dn"], { suctionValveDn: 100, dischargeValveDn: 100 });
    assert.equal(resolveDnConnection({ stationType }, 50, true).connection, "threaded");
    for (const side of ["suction", "discharge"]) {
      const c = collectorRecommendation(p, side);
      assert.equal(c.primary.connection, "flanged");
      assert.equal(c.secondary.connection, "threaded");
    }
  }
});

test("manual flanges and independent collector overrides survive saving and loading", () => {
  for (const stationType of ["utility", "smart", "combined", "fire"]) {
    const p = projectFor(stationType);
    Object.assign(p.entities["station-dn"], { connectionType: "flanged", secondaryConnectionType: "flanged" });
    const saved = parseProjectConfig(JSON.parse(JSON.stringify(synchronizeCollectors(p))));
    for (const side of ["suction", "discharge"]) {
      const c = saved.entities["station-collectors"][side].configuration;
      assert.equal(c.connection, "flanged");
      assert.equal(c.primary.connection, "flanged");
      if (c.secondary) assert.equal(c.secondary.connection, "flanged");
    }
  }
  const p = projectFor("smart");
  p.entities["station-collectors"].discharge.overrides = { connection: "flanged", primaryConnection: "flanged" };
  const saved = parseProjectConfig(JSON.parse(JSON.stringify(synchronizeCollectors(p))));
  assert.equal(saved.entities["station-collectors"].suction.configuration.connection, "threaded");
  assert.equal(saved.entities["station-collectors"].discharge.configuration.connection, "flanged");
  assert.equal(saved.entities["station-collectors"].discharge.configuration.primary.connection, "flanged");
});

test("DN65 forces flanges and returning to DN50 restores automatic thread", () => {
  for (const stationType of ["utility", "smart", "combined", "fire"]) {
    const secondary = stationType === "combined" || stationType === "fire";
    assert.equal(resolveDnConnection({ stationType }, 65, secondary, "threaded").connection, "flanged");
    assert.equal(resolveDnConnection({ stationType }, 65, secondary).threadedAllowed, false);
    assert.equal(resolveDnConnection({ stationType }, 50, secondary).connection, "threaded");
  }
});

test("large collectors do not force DN50 pump fittings to flanges", () => {
  const p = projectFor("smart");
  Object.assign(p.entities["station-dn"], { suctionCollectorDn: 100, dischargeCollectorDn: 100 });
  for (const side of ["suction", "discharge"]) {
    const c = collectorRecommendation(p, side);
    assert.equal(c.connection, "flanged");
    assert.equal(c.primary.connection, "threaded");
  }
});

test("an unset valve DN uses pump flow, independent of the other side's manual DN", () => {
  const p = projectFor("smart");
  p.entities["system-input"].flowRate = 30;
  p.entities["station-dn"].dischargeValveDn = null;
  const suction = collectorRecommendation(p, "suction");
  const discharge = collectorRecommendation(p, "discharge");
  assert.equal(suction.primary.dn, 50);
  assert.equal(discharge.primary.dn, 80);
  assert.equal(suction.primary.connection, "flanged");
  assert.equal(discharge.primary.connection, "flanged");
  assert.equal(suction.connection, "threaded", "network DN50 still defaults to thread");
});

test("primary fire and combined circuits retain their flange rule", () => {
  for (const stationType of ["fire", "combined"]) assert.deepEqual(resolveDnConnection({ stationType }, 50, false, "threaded"), { connection: "flanged", forcedFlanged: true, threadedAllowed: false });
});
