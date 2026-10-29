import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { hydraulicPortLedger, collectorInstrumentPortErrors } = await loadTs(new URL("../app/hydraulic-port-ledger.ts", import.meta.url));
const { calculateCollector, collectorCode } = await loadTs(new URL("../app/collector-calculations.ts", import.meta.url));
const { resources } = await import("./fixtures/station-specification.mjs");
const port = { id: "discharge-tank", side: "discharge", section: "common", dn: 20, pn: 16, connection: "threaded" };
const use = { portId: port.id, owner: "tank", purpose: "equipment", dn: 20, pn: 16, connection: "threaded" };

test("port has one owner, with explicit closure and unassigned-end diagnostics", () => {
  assert.equal(hydraulicPortLedger([port], [use]).complete, true);
  assert.equal(hydraulicPortLedger([port], [{ ...use, purpose: "closure" }]).entries[0].status, "closed");
  assert.equal(hydraulicPortLedger([port], []).entries[0].status, "open");
  assert.equal(hydraulicPortLedger([port], [use, { ...use, owner: "transducer" }]).entries[0].status, "conflict");
});
test("unknown ports, duplicate identities and incompatible connections are never silently accepted", () => {
  for (const [ports, uses] of [[[], [use]], [[port, port], [use]], [[port], [{ ...use, dn: 25 }]], [[port], [{ ...use, pn: 25 }]], [[port], [{ ...use, connection: "flanged" }]]]) {
    assert.equal(hydraulicPortLedger(ports, uses).complete, false);
  }
  for (const raw of [null, {}, [null], [{ id: "one", dn: 15, state: "free" }], [{ id: "one", dn: 15, state: "open" }, { id: "one", dn: 20, state: "capped" }]]) assert.ok(collectorInstrumentPortErrors(raw).length);
});
const config = instrumentPorts => ({ type: "discharge", dn: 100, pn: 16, material: "aisi304", connection: "flanged", eccentric: false, stationType: "utility", simultaneous: false, jockey: false,
  primary: { flow: 60, working: 2, reserve: 1, dn: 65, connection: "flanged", spacing: 500, pn: 16 }, secondary: null,
  ...(instrumentPorts === undefined ? {} : { instrumentPorts }) });
test("occupied collector ports retain their nipple and weld but do not contain a second closing cap", () => {
  const ports = [{ id: "gauge", dn: 15, state: "occupied" }, { id: "reserve", dn: 20, state: "capped" }];
  const calculation = calculateCollector(config(ports), resources.components.collectorCatalog);
  assert.ok(calculation.bom.some(row => row.role === "instrument-gauge"));
  assert.ok(!calculation.bom.some(row => row.role === "instrument-gauge-plug"));
  assert.equal(calculation.bom.find(row => row.role === "instrument-reserve-plug").quantity, 1);
  assert.equal(calculation.welds.filter(row => row.role.startsWith("instrument-")).length, 2);
  assert.notEqual(collectorCode(config()), collectorCode(config(ports)));
  assert.equal(collectorCode(config(ports)), collectorCode(config([...ports].reverse())));
  const changed = [{ ...ports[0], state: "capped" }, ports[1]];
  assert.notEqual(collectorCode(config(ports)), collectorCode(config(changed)));
  const open = calculateCollector(config([{ ...ports[0], state: "open" }]), resources.components.collectorCatalog);
  assert.equal(open.complete, false);
  assert.equal(open.price, null);
  assert.match(open.warnings.join(" "), /свободное подключение/);
});
