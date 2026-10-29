import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const readJson = async path => JSON.parse((await readFile(new URL(`../${path}`, import.meta.url), "utf8")).replace(/^\uFEFF/, ""));
const pumps = (await readJson("public/pumps.json")).filter(p => p.manufacturer === "LEO");
const raw = await readJson("data/pump-catalog/leo-xst-source.json");
const evidence = await readJson("data/pump-catalog/records.json");
const report = await readJson("data/pump-catalog/leo-xst-report.json");
const catalog = await loadTs(new URL("../app/pump-catalog.ts", import.meta.url));

test("LEO XST has all source models and keeps inactive 60 Hz records out of selection", () => {
  assert.equal(pumps.length, 98);
  assert.equal(pumps.length, report.models);
  assert.equal(pumps.filter(p => catalog.usablePump(p, "water")).length, 61);
  assert.ok(pumps.every(p => !catalog.usablePump(p, "wastewater")));
  assert.equal(pumps.filter(p => p.frequencyHz === 60 && !p.selectable && !p.active).length, 37);
  for (const row of raw.pumps) {
    const pump = pumps.find(p => p.id === `leo-xst-${row.ID}`);
    assert.ok(pump, row.PumpName);
    assert.equal(pump.model, row.PumpName);
    const source = raw.curves1.find(c => c.ID === row.ID);
    const decode = value => value.split("|").slice(1).map(pair => pair.split(",").map(Number));
    assert.deepEqual(pump.curve, decode(source.PointsInfoQH));
    assert.deepEqual(pump.efficiencyCurve, decode(source.PointsInfoQE));
    assert.deepEqual(pump.powerCurve, decode(source.PointsInfoQP));
    assert.deepEqual(pump.npshCurve, decode(source.PointsInfoNPSH));
    assert.equal(evidence[pump.id].sources[0].record.pump.ID, row.ID);
    assert.equal(pump.price, null);
    assert.equal(pump.priceCurrency, null);
  }
});

test("LEO XST nominal operating point is usable with original m³/h coordinates", () => {
  const pump = pumps.find(p => p.model === "XST32-125/7");
  assert.equal(pump.nominalFlow, 12.5);
  assert.equal(pump.power, 0.75);
  assert.equal(catalog.interpolateCurve(pump.curve, 12.5), 13.6);
  for (const count of [1, 2]) {
    const point = catalog.operatingPoint(pump, count, { flowRate: 12.5 * count, head: 13.6, staticHead: 5 });
    assert.ok(point);
    assert.ok(Math.abs(point.flow - 12.5 * count) < 1e-6);
    assert.ok(Math.abs(point.head - 13.6) < 1e-6);
  }
  assert.equal(catalog.interpolateCurve(pump.curve, 22.01), null);
  assert.equal(pump.weightKg, 27);
  assert.equal(pump.fluid["Максимальное рабочее давление, бар"], 12);
});

test("LEO minimum working flow limits selection without deleting the shutoff part of its graph", () => {
  const pump = pumps.find(p => p.model === "XST32-125/7");
  assert.notEqual(catalog.interpolateCurve(pump.curve, 0.5), null);
  assert.equal(catalog.selectionHeadAtFlow(pump, 0.5), null);
  assert.equal(catalog.selectionHeadAtFlow(pump, 1.25), 17.4);
  assert.equal(catalog.selectionHeadAtFlow(pump, 22), 5.9);
  assert.equal(catalog.selectionHeadAtFlow(pump, 22.01), null);
  const legacy = { ...pump, selectionFlowRange: undefined };
  assert.equal(catalog.selectionHeadAtFlow(legacy, 0.5), catalog.interpolateCurve(legacy.curve, 0.5));
});
