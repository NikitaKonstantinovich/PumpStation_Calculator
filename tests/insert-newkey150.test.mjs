import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const { generateInsertCalculations, generateInsertCandidates } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const catalog = makeInsertCatalog(source);
const input = { dnFrom: 150, dnTo: 150, materials: ["aisi304"], includeEccentric: true, withSensorNipple: false };
const id = "newkey-din2503:NK-FDh150-4";
const target = row => row.pn === 25 && [80, 100, 125].includes(row.dnSmall);
const smallerEnds = { 80: [88.9, "фланцы-007-r0140", 21], 100: [114.3, "ifitting-en01:1154", 24], 125: [139.7, "newkey-din2503:NK-FDh125-4", 21] };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test("DN150 reducers to DN80/100/125 PN25 select one ready flange execution with sourced cost, length and welds", () => {
  const rows = generateInsertCalculations(input, catalog).filter(target);
  assert.equal(rows.length, 6);
  assert.equal(new Set(rows.map(row => `${row.dnSmall}:${row.geometry}`)).size, 6);
  for (const row of rows) {
    const [od, rightId, rightDepth] = smallerEnds[row.dnSmall];
    assert.equal(row.complete, true, row.warnings.join("; "));
    assert.deepEqual([row.leftConnection, row.rightConnection], ["flanged", "flanged"]);
    assert.deepEqual([row.baseLengthMm, row.totalLengthMm], [140, 150]);
    assert.equal(row.extension, undefined); assert.equal(row.machining, undefined);
    assert.ok(row.bom.every(item => item.kind !== "pipe"));
    assert.equal(row.bom.find(item => item.role === "left-flanged").componentId, id);
    assert.equal(row.bom.find(item => item.role === "left-flanged").unitPrice, 9487);
    assert.equal(row.bom.find(item => item.role === "right-flanged").componentId, rightId);
    assert.deepEqual(row.assemblyDecisions.map(decision => decision.depthMm), [23, rightDepth]);
    assert.equal(row.welds.length, 2);
    near(row.weldLengthMm, 2 * Math.PI * (168.3 + od));
    near(row.weldCost, row.weldLengthMm / 1000 * 5000);
    near(row.price, row.bom.reduce((sum, item) => sum + item.cost, 0));
  }
  const concentric = rows.filter(row => row.geometry === "concentric");
  assert.deepEqual(concentric.map(row => Math.round(row.price * 100) / 100), [29648.31, 36445.14, 36248.11]);
});

test("original DN150 retains its 161 mm bore and machining blockers; the ready analogue does not waive sensor PN25 warnings", () => {
  const original = catalog.parts.find(part => part.id === "фланцы-007-r0143");
  assert.deepEqual([original.boreDiameterMm, original.thicknessMm, original.price], [161, 30, 9290.96]);
  const old = generateInsertCandidates(input, catalog).filter(row => target(row) && row.bom.some(item => item.role === "left-flanged" && item.componentId === original.id));
  assert.ok(old.length > 0);
  assert.ok(old.every(row => !row.complete && row.price === null && row.warnings.some(reason => /Расточка левого фланца/.test(reason))));
  const sensor = generateInsertCalculations({ ...input, withSensorNipple: true }, catalog).filter(target);
  assert.equal(sensor.length, 6);
  assert.ok(sensor.every(row => row.complete && row.price > 0 && row.assumptions?.some(item => item.code === "sensor-pn25-pressure")));
});

test("missing analogue dimensions or price cannot turn the three DN150 reducer sizes into ready products", () => {
  for (const mutate of [part => { part.price = null; }, part => { part.thicknessMm = null; }, part => { delete part.dimensionSources.boreDiameterMm; }]) {
    const changed = structuredClone(catalog); mutate(changed.parts.find(part => part.id === id));
    const rows = generateInsertCalculations(input, changed).filter(target);
    assert.equal(rows.length, 6);
    assert.ok(rows.every(row => !row.complete && row.price === null));
  }
});
