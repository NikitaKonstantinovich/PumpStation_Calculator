import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const { generateInsertCalculations, generateInsertCandidates } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const catalog = makeInsertCatalog(source);
const input = { dnFrom: 125, dnTo: 125, materials: ["aisi304"], includeEccentric: true, withSensorNipple: false };
const isTarget = row => row.dnLarge === 125 && row.dnSmall === 65 && row.pn === 25;

test("DN125-65 PN25 uses original DN65 and ready Newkey DN125, with one row per geometry and no boring", () => {
  const rows = generateInsertCalculations(input, catalog).filter(isTarget);
  assert.equal(rows.length, 2);
  assert.deepEqual(new Set(rows.map(row => row.geometry)), new Set(["concentric", "eccentric"]));
  for (const row of rows) {
    assert.equal(row.complete, true, row.warnings.join("; "));
    assert.equal(row.baseLengthMm, 127);
    assert.equal(row.totalLengthMm, 137);
    assert.equal(row.extension, undefined);
    assert.equal(row.machining, undefined);
    assert.equal(row.bom.find(item => item.role === "right-flanged").componentId, "фланцы-007-r0139");
    const left = row.bom.find(item => item.role === "left-flanged");
    assert.equal(left.componentId, "newkey-din2503:NK-FDh125-4");
    assert.equal(left.unitPrice, 7365);
    assert.deepEqual(row.assemblyDecisions.map(decision => decision.depthMm), [21, 19]);
    assert.equal(row.welds.length, 2);
    assert.ok(Math.abs(row.weldLengthMm - 2 * Math.PI * (139.7 + 76.1)) < 1e-8);
    assert.ok(row.price > 0);
  }
});

test("old DN125 bore is unchanged and its candidates still require machining; PN25 sensor carries the project pressure warning", () => {
  const oldFlange = catalog.parts.find(part => part.id === "фланцы-007-r0142");
  assert.equal(oldFlange.boreDiameterMm, 135);
  assert.equal(oldFlange.thicknessMm, 30);
  const oldRows = generateInsertCandidates(input, catalog).filter(row => isTarget(row)
    && row.bom.some(item => item.role === "left-flanged" && item.componentId === oldFlange.id));
  assert.ok(oldRows.length > 0);
  assert.ok(oldRows.every(row => !row.complete && row.price === null && row.warnings.some(reason => /Расточка левого фланца/.test(reason))));
  const sensor = generateInsertCalculations({ ...input, withSensorNipple: true }, catalog).filter(isTarget);
  assert.equal(sensor.length, 2);
  assert.ok(sensor.every(row => row.complete && row.price > 0 && row.assumptions?.some(item => item.code === "sensor-pn25-pressure")));
});
