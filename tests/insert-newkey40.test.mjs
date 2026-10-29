import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const { generateInsertCalculations, generateInsertCandidates } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const catalog = makeInsertCatalog(source);
const input = { dnFrom: 80, dnTo: 80, materials: ["aisi304"], includeEccentric: true, withSensorNipple: false };
const isTarget = row => row.dnLarge === 80 && row.dnSmall === 40 && row.pn === 25;

test("DN80-40 PN25 uses original DN80 and ready Newkey DN40, with one row per geometry and no boring", () => {
  const rows = generateInsertCalculations(input, catalog).filter(isTarget);
  assert.equal(rows.length, 2);
  assert.deepEqual(new Set(rows.map(row => row.geometry)), new Set(["concentric", "eccentric"]));
  for (const row of rows) {
    assert.equal(row.complete, true, row.warnings.join("; "));
    assert.equal(row.baseLengthMm, 89);
    assert.equal(row.totalLengthMm, 99);
    assert.equal(row.extension, undefined);
    assert.equal(row.machining, undefined);
    assert.equal(row.bom.find(item => item.role === "left-flanged").componentId, "фланцы-007-r0140");
    const right = row.bom.find(item => item.role === "right-flanged");
    assert.equal(right.componentId, "newkey-din2503:NK-FDh40-4");
    assert.equal(right.unitPrice, 2173);
    assert.deepEqual(row.assemblyDecisions.map(decision => decision.depthMm), [21, 13]);
    assert.equal(row.welds.length, 2);
    assert.ok(Math.abs(row.weldLengthMm - 2 * Math.PI * (88.9 + 48.3)) < 1e-8);
    assert.ok(row.price > 0);
  }
});

test("old DN40 bore is unchanged and its candidates still require machining; PN25 sensor carries the project pressure warning", () => {
  const oldFlange = catalog.parts.find(part => part.id === "фланцы-007-r0137");
  assert.equal(oldFlange.boreDiameterMm, 46);
  assert.equal(oldFlange.thicknessMm, 22);
  const oldRows = generateInsertCandidates(input, catalog).filter(row => isTarget(row)
    && row.bom.some(item => item.role === "right-flanged" && item.componentId === oldFlange.id));
  assert.ok(oldRows.length > 0);
  assert.ok(oldRows.every(row => !row.complete && row.price === null && row.warnings.some(reason => /Расточка правого фланца/.test(reason))));
  const sensor = generateInsertCalculations({ ...input, withSensorNipple: true }, catalog).filter(isTarget);
  assert.equal(sensor.length, 2);
  assert.ok(sensor.every(row => row.complete && row.price > 0 && row.assumptions?.some(item => item.code === "sensor-pn25-pressure")));
});
