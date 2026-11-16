import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";

const { resolveDnConnection, suctionHydraulics, dischargeHydraulics, recommendedDn } = await loadTs(new URL("../app/dn-defaults.ts", import.meta.url));
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

test("both multistage pump types default each line and circuit to its own nozzle, preserving manual DN", async () => {
  const pumps = JSON.parse(await readFile(new URL("../public/pumps.json", import.meta.url), "utf8"));
  for (const type of ["vertical_multistage", "horizontal_multistage", "end_suction"]) for (const secondary of [false, true]) {
    const pump = pumps.find(p => p.type === type);
    assert.ok(pump);
    const p = projectFor("combined");
    const input = p.entities[secondary ? "system-input-2" : "system-input"];
    const dn = p.entities["station-dn"], settings = p.entities["station-settings"];
    Object.assign(input, { selectedPumpId: pump.id, flowRate: 200 });
    const suctionField = secondary ? "secondarySuctionValveDn" : "suctionValveDn";
    const dischargeField = secondary ? "secondaryDischargeValveDn" : "dischargeValveDn";
    Object.assign(dn, {
      [suctionField]: null, [dischargeField]: null,
      [secondary ? "secondaryConnectionType" : "connectionType"]: "flanged",
      [secondary ? "secondaryPumpSuctionPort" : "pumpSuctionPort"]: { pumpId: pump.id, dn: 80, connection: "flanged", source: "test" },
      [secondary ? "secondaryPumpDischargePort" : "pumpDischargePort"]: { pumpId: pump.id, dn: 65, connection: "flanged", source: "test" },
    });
    const expected = type === "end_suction" ? [recommendedDn(200), recommendedDn(200)] : [80, 65];
    assert.equal(suctionHydraulics(dn, input, settings, secondary).dn, expected[0]);
    assert.equal(dischargeHydraulics(dn, input, settings, secondary).dn, expected[1]);
    const saved = parseProjectConfig(JSON.parse(JSON.stringify(synchronizeCollectors(p))));
    for (const [side, size] of [["suction", expected[0]], ["discharge", expected[1]]]) {
      assert.equal(saved.entities["station-collectors"][side].configuration[secondary ? "secondary" : "primary"].dn, size);
    }
    dn[suctionField] = 100; dn[dischargeField] = 125;
    assert.equal(suctionHydraulics(dn, input, settings, secondary).dn, 100);
    assert.equal(dischargeHydraulics(dn, input, settings, secondary).dn, 125);
    dn[suctionField] = null; dn[dischargeField] = null;
    assert.equal(dischargeHydraulics(dn, input, settings, secondary).dn, expected[1]);
  }
});
