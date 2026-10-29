import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { createProject } = await loadTs(new URL("../app/project-config.ts", import.meta.url));
const { synchronizeCollectors } = await loadTs(new URL("../app/collector-project.ts", import.meta.url));
const { buildSuctionSpec, checkSuctionSpecPressure, suctionFingerprint } = await loadTs(new URL("../app/suction-spec.ts", import.meta.url));
const { buildDischargeSpec, checkDischargeSpecPressure, dischargeFingerprint } = await loadTs(new URL("../app/discharge-spec.ts", import.meta.url));
const { selectVibrationCompensator } = await loadTs(new URL("../app/line-vibration.ts", import.meta.url));
const { makeCollectorCatalog } = await loadTs(new URL("../app/collector-catalog.ts", import.meta.url));
const binding = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const catalog = makeCollectorCatalog(binding);
const field = (name, value) => ({ column: name, headerPath: [name], value });
const role = (rows, name) => rows.find(row => row.assemblyRole === name);
const builders = { suction: buildSuctionSpec, discharge: buildDischargeSpec };

function fixture({ pumpDn = 80, valveDn = pumpDn, connection = "flanged", pumpConnection = connection, pn = 16, type = "utility" } = {}) {
  const p = createProject();
  Object.assign(p.entities["station-settings"], { vibrationCompensators: true, inletHead: 10, stationType: type });
  Object.assign(p.entities["system-input"], { selectedPumpId: "vibration-test", flowRate: 10, head: 40, staticHead: 0, workingPumpCount: 2, reservePumpCount: 1, calculated: true });
  Object.assign(p.entities["station-dn"], {
    pn, collectorMaterial: "st20", connectionType: connection, suctionValveDn: valveDn, dischargeValveDn: valveDn,
    suctionValveType: connection === "flanged" ? "butterfly" : "ball", dischargeValveType: connection === "flanged" ? "butterfly" : "ball",
    pumpSuctionPort: { pumpId: "vibration-test", dn: pumpDn, connection: pumpConnection, source: "test" },
    pumpDischargePort: { pumpId: "vibration-test", dn: pumpDn, connection: pumpConnection, source: "test" },
  });
  return synchronizeCollectors(p);
}

test("both lines use nozzle-sized compensators followed by a separate rigid insertion, with two joint kits and integral elastomer seals", () => {
  const p = fixture();
  p.entities["station-dn"].pumpDischargePort.dn = 100;
  p.entities["station-dn"].dischargeValveDn = 100;
  const synced = synchronizeCollectors(p);
  for (const [side, build] of Object.entries(builders)) {
    const rows = build(synced, binding, catalog), size = side === "suction" ? 80 : 100;
    const vibration = role(rows, "primary-vibration-compensator"), insertion = role(rows, "primary-after-vibration-insertion");
    assert.equal(vibration.quantity, 3);
    assert.equal(vibration.price, size === 80 ? 6789 : 7906);
    assert.equal(vibration.selectedPn, 16);
    assert.match(vibration.details, new RegExp(`DN${size}`));
    assert.match(insertion.name, new RegExp(`Вставка ФФ DN${size}–${size}`));
    assert.ok(rows.indexOf(vibration) < rows.indexOf(insertion));
    assert.equal(role(rows, "primary-after-vibration-insertion-flanges-weldFlange").quantity, 6);
    for (const joint of ["pump", "insertion"]) {
      assert.equal(role(rows, `primary-vibration-${joint}-gasket`), undefined);
      for (const hardware of ["bolts", "nuts", "washers"]) assert.equal(role(rows, `primary-vibration-${joint}-fasteners-${hardware}`).quantity, 24);
      assert.equal(role(rows, `primary-vibration-${joint}-fasteners-bolts`).price, null, "missing compensator flange dimensions must not produce guessed bolts");
    }
    assert.equal(role(rows, "primary-pump-gasket"), undefined, "old pump joint must not be duplicated");
    const branchGaskets = rows.filter(row => row.assemblyRole.startsWith("primary-") && /gasket/.test(row.assemblyRole));
    assert.equal(branchGaskets.reduce((sum, row) => sum + row.quantity, 0), (side === "suction" ? 2 : 4) * 3);
    if (side === "discharge") assert.equal(role(rows, "primary-between-valves-insertion").quantity, 3);
  }
});

test("larger manual valve DN uses the reducer as the required insertion after vibration", () => {
  for (const build of Object.values(builders)) {
    const rows = build(fixture({ pumpDn: 65, valveDn: 80 }), binding, catalog);
    assert.match(role(rows, "primary-vibration-compensator").details, /DN65/);
    assert.equal(role(rows, "primary-after-vibration-insertion"), undefined);
    assert.match(role(rows, "primary-reducer").name, /DN80–65/);
    assert.ok(rows.indexOf(role(rows, "primary-vibration-compensator")) < rows.indexOf(role(rows, "primary-reducer")));
    assert.equal(role(rows, "primary-reducer-small-flange-weldFlange").quantity, 3);
    assert.equal(role(rows, "primary-reducer-large-flange-weldFlange").quantity, 3);
    for (const roleName of ["primary-insertion-reducer-gasket", "primary-insertion-reducer-fasteners-bolts", "primary-after-vibration-insertion-flanges-weldFlange"]) assert.equal(role(rows, roleName), undefined);
  }
});

test("PN-specific prices and pressure checks never borrow a higher execution's rating", () => {
  for (const [pn, price] of [[10, 6235], [16, 6789], [25, 22621]]) {
    assert.equal(selectVibrationCompensator(binding.items, 80, pn, "flanged").price, price);
  }
  const p = fixture();
  p.entities["station-settings"].inletHead = 200;
  for (const [side, check] of [["suction", checkSuctionSpecPressure], ["discharge", checkDischargeSpecPressure]]) {
    const rows = check(p, builders[side](p, binding, catalog), binding, catalog);
    const row = role(rows, "primary-vibration-compensator");
    const result = row[side === "suction" ? "inletPressureCheck" : "dischargePressureCheck"].checks[0];
    assert.equal(result.limitBar, 16);
    assert.equal(result.status, "exceeded");
  }
  const items = structuredClone(binding.items);
  for (const item of items.filter(item => item.catalogId === "компенсаторы")) item.prices = item.prices.filter(entry => !/PN25/.test(entry.label));
  for (const build of Object.values(builders)) {
    const row = role(build(fixture({ pn: 25 }), { items }, catalog), "primary-vibration-compensator");
    assert.equal(row.price, null); assert.equal(row.status, "clarify"); assert.equal(row.equipmentId, undefined);
  }
});

test("threaded and mixed branches keep compatible rigid inserts and count every sealed thread", () => {
  for (const [pumpConnection, connection, size, threads] of [["threaded", "threaded", 40, 4], ["threaded", "flanged", 40, 2], ["flanged", "threaded", 40, 2]]) {
    for (const [side, build] of Object.entries(builders)) {
      const rows = build(fixture({ pumpDn: size, connection, pumpConnection }), binding, catalog);
      const row = role(rows, "primary-vibration-compensator");
      if (pumpConnection === "threaded") { assert.equal(row.price, null); assert.match(row.description, /резьбовым/); }
      else assert.equal(row.price, 3960);
      assert.ok(role(rows, "primary-after-vibration-insertion"));
      assert.equal(role(rows, "primary-flax").quantity, Number((3 * (threads + (side === "discharge" && connection === "threaded" ? 2 : 0)) * .1).toFixed(3)));
      assert.equal(role(rows, "primary-vibration-pump-gasket"), undefined);
    }
  }
});

test("a bare compensator thickness without provenance or a confirmed insert never sizes its joints", () => {
  const items = structuredClone(binding.items);
  const selected = selectVibrationCompensator(items, 80, 16, "flanged");
  selected.item.fields.push(field("Толщина фланца, мм", 20));
  for (const build of Object.values(builders)) {
    const rows = build(fixture(), { items }, catalog);
    assert.equal(role(rows, "primary-vibration-insertion-fasteners-bolts").price, null);
    assert.equal(role(rows, "primary-vibration-pump-fasteners-bolts").price, null);
  }
});

test("second circuits use their own port sizes, quantities and PN; disabling option removes the assembly", () => {
  const p = fixture({ type: "combined" });
  Object.assign(p.entities["system-input-2"], { calculated: true, selectedPumpId: "vibration-secondary", flowRate: 5, head: 30, staticHead: 0, workingPumpCount: 1, reservePumpCount: 1 });
  Object.assign(p.entities["station-dn"], {
    secondaryConnectionType: "flanged", secondaryPn: 25, secondarySuctionValveDn: 65, secondaryDischargeValveDn: 65,
    secondaryPumpSuctionPort: { pumpId: "vibration-secondary", dn: 65, connection: "flanged", source: "test" },
    secondaryPumpDischargePort: { pumpId: "vibration-secondary", dn: 65, connection: "flanged", source: "test" },
  });
  const synced = synchronizeCollectors(p);
  for (const [side, build] of Object.entries(builders)) {
    const rows = build(synced, binding, catalog);
    const row = role(rows, "secondary-vibration-compensator");
    assert.equal(row.quantity, 2); assert.equal(row.price, 17689); assert.equal(row.selectedPn, 25);
    assert.equal(role(rows, "secondary-vibration-pump-gasket").quantity, 2);
    assert.equal(role(rows, "network-gaskets").quantity, 2);
    assert.equal(rows.filter(row => /vibration-compensator$/.test(row.assemblyRole)).length, 2, side);
  }
  const fingerprints = [suctionFingerprint(synced), dischargeFingerprint(synced)];
  synced.entities["station-settings"].vibrationCompensators = false;
  assert.notEqual(suctionFingerprint(synced), fingerprints[0]); assert.notEqual(dischargeFingerprint(synced), fingerprints[1]);
  for (const build of Object.values(builders)) assert.ok(build(synced, binding, catalog).every(row => !/vibration/.test(row.assemblyRole)));
});
