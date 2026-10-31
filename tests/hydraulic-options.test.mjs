import test from "node:test";
import assert from "node:assert/strict";
import { fixture, choose, sync, rows, resources, parseProjectConfig, load, assessSpecification } from "./fixtures/station-specification.mjs";
const { calculateCollector } = await load("collector-calculations");
const { hydraulicAssemblyPrice, hydraulicOptionCatalog } = await load("hydraulic-option-assembly");
const { tankMounting } = await load("tank-mounting");
const { specificationExportRows, specificationCsv } = await load("specification-export");
const { stationHydraulicPortLedger } = await load("station-hydraulic-ports");
const options = p => rows(p).filter(row => row.generatedBy === "hydraulic-options");
const role = (p, name) => options(p).find(row => row.assemblyRole === name);
const part = (row, name) => row.hydraulicAssembly.parts.find(p => p.assemblyRole === name);

test("base preferences choose compatible products in order and retain the project's previous selection",async()=>{
  const {legacyBaseSnapshot}=await load("base-values");
  const original=role(sync(fixture()),"discharge:transducer").equipmentId;
  const source=hydraulicOptionCatalog(resources.components.items).find(item=>item.id===original);
  const preferred={...structuredClone(source),id:"preferred-compatible-transducer"};
  const data={...resources,components:{...resources.components,items:[...resources.components.items,preferred]}};
  const project=fixture();project.entities["station-settings"].baseValues=legacyBaseSnapshot();
  project.entities["station-settings"].baseValues.values.preferences.rules=[{id:"test",stationType:"all",side:"discharge",role:"transducer",productIds:["missing-preferred-product",preferred.id]}];
  const selected=sync(project,data),row=role(selected,"discharge:transducer");assert.equal(row.equipmentId,preferred.id);assert.ok(row.hydraulicAssembly.findings.some(f=>/Предпочтительное изделие/.test(f)));
  assert.strictEqual(sync(selected,data),selected,"warning and selection must remain stable on repeated calculation");
  selected.entities["station-settings"].baseValues.values.preferences.rules[0].productIds=[original];
  assert.equal(role(sync(selected,data),"discharge:transducer").equipmentId,preferred.id,"previous choice remains until explicit update");
  const wrong=fixture();wrong.entities["station-settings"].baseValues=legacyBaseSnapshot();wrong.entities["station-settings"].baseValues.values.preferences.rules=[{id:"wrong-kind",stationType:"all",side:"discharge",role:"transducer",productIds:["not-a-compatible-transducer"]}];
  const fallback=role(sync(wrong),"discharge:transducer");assert.equal(fallback.equipmentId,original);assert.ok(fallback.hydraulicAssembly.findings.some(f=>/Предпочтительное изделие/.test(f)));
});

test("confirmed KIP scheme for all station types: relay on suction, transducer on discharge; jockey adds none", () => {
  for (const [type, count] of [["utility", 1], ["smart", 1], ["fire", 2], ["combined", 2]]) for (const jockey of [false, true]) {
    const p = fixture(); Object.assign(p.entities["station-settings"], { stationType: type, jockeyPump: jockey });
    if (type === "combined" || type === "fire" && jockey) choose(p, "318", 1, 0, true);
    const result = sync(p), instruments = rows(result).filter(row => ["gauge", "pressure-switch", "instrument-valve"].includes(row.assemblyRole));
    assert.equal(instruments.filter(row => row.assemblyRole === "gauge").length, 2);
    assert.equal(instruments.filter(row => row.assemblyRole === "pressure-switch").length, 1);
    assert.equal(instruments.find(row => row.assemblyRole === "pressure-switch").section, "suction");
    assert.ok(instruments.every(row => row.quantity === count));
    assert.equal(role(result, "discharge:transducer").quantity, count);
    assert.match(role(result, "discharge:transducer").equipmentId, /^station-v11-oni-ppt10-/);
    assert.equal(role(result, "suction:transducer"), undefined);
    assert.equal(part(role(result, "discharge:transducer"), "резьбовые-фитинги-002-r0225").quantity, 1);
    for (const id of ["резьбовые-фитинги-002-r0225", "резьбовые-фитинги-003-r0235"]) {
      assert.equal(rows(result).find(row => row.section === "suction" && row.assemblyRole === id).quantity, count);
      assert.equal(part(role(result, "discharge:transducer"), id).quantity, 1);
    }
    assert.equal(rows(result).find(row => row.section === "suction" && row.assemblyRole === "instrument-seals").quantity, count * .5);
    assert.equal(part(role(result, "discharge:transducer"), "sensor-seals").quantity, .3);
    for (const side of ["suction", "discharge"]) {
      const entries = result.entities["station-spec"].hydraulicPorts.entries;
      assert.equal(entries.find(entry => entry.port.id === `${side}:kip-1/gauge`).port.dn, 15);
      assert.equal(entries.find(entry => entry.port.id === `${side}:kip-1/sensor`).port.dn, 8);
    }
    assert.equal(result.entities["station-collectors"].suction.configuration.instrumentPorts.length, 1);
    assert.equal(result.entities["station-spec"].hydraulicPorts.complete, count===1);
  }
});

test("tank defaults off; 8 L direct, 50/100 L hose and three matched mounting sets", () => {
  assert.equal(role(sync(fixture()), "discharge:tank"), undefined);
  for (const volume of [8, 50, 100]) {
    const p = fixture(); Object.assign(p.entities["station-settings"], { membraneTank: true, membraneTankVolume: volume });
    const result = sync(p), tank = role(result, "discharge:tank");
    assert.equal(tank.quantity, 1); assert.match(tank.equipmentId, /мембранный-бак-001/);
    assert.equal(part(tank, "tank-valve").quantity, 1);
    assert.equal(Boolean(part(tank, "tank-hose")), volume !== 8);
    assert.equal(Boolean(part(tank, "tank-top-cap")), volume === 100);
    const c = result.entities["station-collectors"].discharge.configuration;
    assert.equal(c.instrumentPorts.find(port => port.id === "tank").dn, 20);
    const bom = calculateCollector(c, resources.components.collectorCatalog).bom;
    assert.equal(bom.filter(row => row.role === "instrument-tank").length, 1);
    assert.equal(bom.filter(row => row.role === "instrument-tank-plug").length, 0);
    if (volume !== 8) {
      assert.equal(part(tank, "tank-hose").details, "Длина не задана");
      assert.equal(part(tank, "tank-hose").price, 2350.94);
      assert.equal(part(tank, "tank-mount-bolts").quantity, 3);
      assert.equal(part(tank, "tank-mount-nuts").quantity, 3);
      assert.equal(part(tank, "tank-mount-washers").quantity, 6);
      assert.match(part(tank, "tank-mount-bolts").name, /М10х30/);
      const mounting = tankMounting(resources.components.items, volume);
      assert.ok(mounting.minimum <= 30);
    }
  }
});

test("required KIP connection parts and collector outlets cannot silently disappear", () => {
  const p = sync(fixture());
  p.entities["station-spec"].items = rows(p).filter(row => !(row.section === "suction" && row.assemblyRole === "резьбовые-фитинги-003-r0235"));
  assert.ok(assessSpecification(p).findings.some(f => f.id.includes("резьбовые-фитинги-003-r0235")));
  const ports = p.entities["station-collectors"].suction.configuration.instrumentPorts;
  ports[0].state = "capped";
  assert.equal(stationHydraulicPortLedger(p).complete, false);
  ports[0].state = "occupied";
  ports.push({ id: "reserve", dn: 15, state: "open" });
  assert.equal(stationHydraulicPortLedger(p).complete, false);
  ports[1].state = "capped";
  assert.equal(stationHydraulicPortLedger(p).complete, true);
});

test("two optional blind flanges replace one network joint each; unknown blind thickness does not select bolts", () => {
  const p = fixture(); Object.assign(p.entities["station-settings"], { collectorPlugs: true });
  Object.assign(p.entities["station-dn"], { collectorMaterial: "st20", suctionCollectorDn: 80, dischargeCollectorDn: 100, pn: 16 });
  const result = sync(p), plugs = options(result).filter(row => row.option === "collectorPlugs");
  assert.equal(plugs.length, 2); assert.equal(plugs.reduce((sum, row) => sum + row.quantity, 0), 2);
  assert.ok(plugs.every(row => row.equipmentId && row.price === null));
  assert.ok(plugs.every(row => part(row, "plug-fasteners-bolts").price === null));
  for (const side of ["suction", "discharge"]) {
    assert.equal(rows(result).find(row => row.section === side && row.assemblyRole === "network-gaskets").quantity, 1);
    assert.equal(part(role(result, `${side}:plug`), "plug-gasket").quantity, 1);
    const ledger = result.entities["station-spec"].hydraulicPorts;
    assert.equal(ledger.entries.find(e => e.port.id === `${side}:end-2`).status, "closed");
  }
});

test("separators add N-1 valves per collector and exactly two welded ends per gap", () => {
  for (const pumps of [1, 2, 4, 6]) {
    const p = choose(fixture(), "318", pumps, 0);
    Object.assign(p.entities["station-settings"], { stationType: "fire", isolatingValves: true });
    Object.assign(p.entities["station-dn"], { collectorMaterial: "st20", suctionCollectorDn: 100, dischargeCollectorDn: 100, pn: 16 });
    const result = sync(p);
    for (const side of ["suction", "discharge"]) {
      const c = result.entities["station-collectors"][side].configuration;
      assert.equal(c.sectionBreaks, pumps - 1);
      const calculated = calculateCollector(c, resources.components.collectorCatalog);
      if (pumps === 1) { assert.equal(role(result, `${side}:separator`), undefined); continue; }
      const row = role(result, `${side}:separator`);
      assert.equal(row.quantity, pumps - 1);
      assert.equal(calculated.bom.find(row => row.role === "section-break-weldFlange").quantity, 2 * (pumps - 1));
      assert.equal(calculated.welds.find(row => row.role === "section-break").count, 2 * (pumps - 1));
      assert.equal(part(row, "separator-gaskets").quantity, 2);
      assert.equal(part(row, "collector-interface").price, 0);
      assert.equal(part(row, "separator-limit-switches-bracket").quantity, 1);
      assert.equal(part(row, "separator-limit-switches-bracket").equipmentId, "кронштейны-001-r0006");
      assert.equal(part(row, "separator-limit-switches-bracket").price, 241.15);
      assert.equal(part(row, "separator-limit-switches-switch").quantity, 2);
      assert.equal(part(row, "separator-limit-switches-switch").price, 957);
      assert.equal(part(row, "separator-limit-switches"), undefined);
      assert.equal(row.price, hydraulicAssemblyPrice(row.hydraulicAssembly));
      assert.equal(row.hydraulicAssembly.parts.filter(part => /weldFlange/.test(part.assemblyRole)).length, 0);
    }
  }
  const utility = fixture(); utility.entities["station-settings"].isolatingValves = true;
  assert.ok(!options(sync(utility)).some(row => row.option === "isolatingValves"));
  assert.ok(assessSpecification(sync(utility)).findings.some(f => /separation-station-type/.test(f.id)));
});

test("option toggle/import/recalculation are idempotent and preserve manual rows", () => {
  const p = fixture(); Object.assign(p.entities["station-settings"], { membraneTank: true, membraneTankVolume: 100, collectorPlugs: true });
  p.entities["station-spec"].items.push({ position: "99", name: "Ручная деталь", details: "", quantity: 3, price: 50, status: "selected", section: "electrical" });
  let result = sync(p);
  assert.strictEqual(sync(result), result);
  const expected = rows(result); result = sync(parseProjectConfig(JSON.parse(JSON.stringify(result))));
  assert.deepEqual(rows(result), expected);
  Object.assign(result.entities["station-settings"], { membraneTank: false, collectorPlugs: false });
  result = sync(result);
  assert.ok(!options(result).some(row => ["membraneTank", "collectorPlugs"].includes(row.option)));
  assert.equal(rows(result).find(row => row.name === "Ручная деталь").quantity, 3);
  assert.equal(result.entities["station-collectors"].discharge.configuration.instrumentPorts.find(port => port.id === "tank").state, "capped");
});

test("explicit incompatible or removed choice remains visible; valid product price is not assembly readiness", () => {
  const p = fixture(); Object.assign(p.entities["station-settings"], { membraneTank: true, membraneTankVolume: 8, hydraulicOptions: { products: { "discharge:tank": "мембранный-бак-001-r0005" } } });
  let result = sync(p), tank = role(result, "discharge:tank");
  assert.equal(tank.technicalStatus, "error"); assert.equal(tank.equipmentId, "мембранный-бак-001-r0005");
  p.entities["station-settings"].hydraulicOptions.products["discharge:tank"] = "removed";
  tank = role(sync(p), "discharge:tank"); assert.equal(tank.equipmentId, undefined); assert.equal(tank.price, null);
  assert.match(tank.technicalNotes.join(" "), /removed/);
  const sensor = role(result, "discharge:transducer");
  assert.equal(sensor.price, hydraulicAssemblyPrice(sensor.hydraulicAssembly));
  assert.notEqual(sensor.technicalStatus, "ready");
  const catalog = hydraulicOptionCatalog(resources.components.items);
  assert.equal(catalog.filter(item => item.id === "station-v11-oni-ppt10-16").length, 1);
});

test("draft export includes nested connection details and does not double their prices", () => {
  const p = fixture(); p.entities["station-settings"].membraneTank = true;
  const result = sync(p), items = options(result);
  const groups = [{ title: "Гидравлика", sections: [{ id: "suction" }, { id: "discharge" }] }];
  const exported = specificationExportRows(items, groups, assessSpecification(result));
  assert.equal(exported.filter(row => row.kind === "item").length, items.length);
  const csv = specificationCsv(exported);
  assert.match(csv, /включён в цену, повторно не суммируется/);
  assert.match(csv, /Футорка/); assert.match(csv, /Черновик/);
});
