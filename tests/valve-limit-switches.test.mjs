import test from "node:test";
import assert from "node:assert/strict";
import { fixture, sync, rows, resources, load, parseProjectConfig, assessSpecification } from "./fixtures/station-specification.mjs";
const { addValveLimitSwitches } = await load("valve-limit-switches");
const { lineSpecParts, field, itemDn } = await load("line-spec-parts");
const { specificationExportRows, specificationCsv } = await load("specification-export");
const db = resources.components;
const valve = dn => db.items.find(item => item.catalogId === "затворы" && /017W.*Красный/i.test(item.family) && itemDn(item) === dn);
function build(dn, items = db.items, selected = valve(dn)) {
  const p = sync(fixture()), out = [];
  const parts = lineSpecParts(out, "suction", "test", p.entities["station-collectors"].suction.configuration, { items }, db.collectorCatalog);
  addValveLimitSwitches(parts, items, "primary", 3, dn, selected);
  return out;
}
test("real Dendor brackets follow valve DN, with two exact TZ-8111 units per valve", () => {
  for (const dn of [50, 65, 80, 100, 125, 150]) {
    const actual = build(dn), [bracket, sensor] = actual;
    assert.equal(actual.length, 2);
    assert.equal(bracket.equipmentId, `кронштейны-001-r000${dn <= 80 ? 5 : 6}`);
    assert.equal(bracket.quantity, 3); assert.equal(bracket.price, dn <= 80 ? 241.75 : 241.15);
    assert.equal(sensor.equipmentId, "кипиа-004-r0028"); assert.equal(sensor.quantity, 6); assert.equal(sensor.price, 957);
    assert.equal(field(db.items.find(item => item.id === sensor.equipmentId), /^Исполнение$/), "TZ 8111");
  }
});

test("DN150 uses the handle price and description; DN200 keeps the gearbox", () => {
  for (const dn of [125, 150, 200]) {
    const p=fixture();
    Object.assign(p.entities['station-settings'], { stationType:'fire' });
    Object.assign(p.entities['station-dn'], { suctionValveDn:dn, dischargeValveDn:dn, connectionType:'flanged', suctionValveType:'butterfly', dischargeValveType:'butterfly', pn:16 });
    const result=sync(p);
    for (const option of ['primarySuctionValve','primaryDischargeValve']) {
      const row=rows(result).find(r=>r.option===option); assert.ok(row);
      const item=db.items.find(i=>i.id===row.equipmentId); assert.ok(item);
      const execution=dn<=150?/рукоятк/i:/редуктор/i;
      assert.match(row.details,execution);
      assert.equal(row.price,item.prices.find(p=>execution.test(p.label)).amount);
    }
  }
});
test("unknown model, DN, missing components and missing prices never restore a flat kit charge", () => {
  for (const selected of [null, { ...valve(65), family: "Затвор другого семейства" }, valve(100)]) {
    const [bracket, sensor] = build(65, db.items, selected);
    assert.equal(bracket.equipmentId, undefined); assert.equal(bracket.price, null);
    assert.equal(sensor.price, 957);
  }
  assert.equal(build(200)[0].price, null);
  for (const id of ["кронштейны-001-r0005", "кипиа-004-r0028"]) {
    assert.ok(build(65, db.items.filter(item => item.id !== id)).some(row => row.price === null));
    assert.equal(build(65, db.items.map(item => item.id === id ? { ...item, prices: [] } : item)).find(row => row.equipmentId === id).price, null);
  }
});
test("main and separating valves share the same concrete parts through sync, import and export", () => {
  const p = fixture(); Object.assign(p.entities["station-settings"], { stationType: "fire", isolatingValves: true });
  Object.assign(p.entities["station-dn"], { collectorMaterial: "st20", suctionCollectorDn: 100, dischargeCollectorDn: 100, pn: 16 });
  const manual = { position: "99", name: "Ручной комплект заказчика", section: "electrical", quantity: 1, price: 3000, status: "selected", details: "" };
  rows(p).push(manual);
  let result = sync(p);
  const all = rows(result).flatMap(row => row.hydraulicAssembly ? row.hydraulicAssembly.parts.map(part => ({ ...part, quantity: part.quantity * row.quantity })) : [row]);
  const switches = all.filter(row => row.assemblyRole?.endsWith("-limit-switches-switch"));
  const brackets = all.filter(row => row.assemblyRole?.endsWith("-limit-switches-bracket"));
  assert.equal(switches.reduce((sum, row) => sum + row.quantity, 0), 20); // 6 main + 4 separating valves.
  assert.equal(brackets.reduce((sum, row) => sum + row.quantity, 0), 10);
  assert.ok(!all.some(row => /^(primary|separator)-limit-switches$/.test(row.assemblyRole ?? "")));
  assert.equal(rows(result).find(row => row.name === manual.name).price, 3000);
  assert.equal(sync(result), result);
  const saved = rows(result); result = sync(parseProjectConfig(JSON.parse(JSON.stringify(result)))); assert.deepEqual(rows(result), saved);
  const exported = specificationExportRows(rows(result), [{ title: "Состав", sections: [{ id: "suction" }, { id: "discharge" }] }], assessSpecification(result));
  const csv = specificationCsv(exported); assert.match(csv, /TZ-8111 PROxima/); assert.match(csv, /Кронштейн концевых выключателей/);
  assert.doesNotMatch(csv, /Комплект концевых выключателей/);
  result.entities["station-settings"].isolatingValves = false;
  const disabled = sync(result);
  assert.ok(!rows(disabled).some(row => row.option === "isolatingValves"));
  assert.equal(rows(disabled).filter(row => row.assemblyRole === "primary-limit-switches-switch").length, 2);
});
