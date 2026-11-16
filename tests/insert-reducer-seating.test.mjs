import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
// Inspect all candidates here; server choice/uniqueness is covered by insert-single-variants.test.mjs.
const { generateInsertCandidates: generateInsertCalculations } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const input = { dnFrom: 50, dnTo: 50, materials: ["aisi304"], withSensorNipple: false, includeEccentric: true };
const catalog = makeInsertCatalog(source);
// Historical explicit approvals are tested independently of the later general project rule.
delete catalog.engineering.reducerReadyBoreSeating;
const ids = ["newkey-din2503:NK-FDh50-4", "newkey-din2503:NK-FDh32-4"];
const target = row => row.geometry === "concentric" && row.dnSmall === 32 && row.pn === 25
  && row.bom.filter(item => ids.includes(item.componentId)).length === 2;
const both = data => generateInsertCalculations(input, data).filter(target);

test("historical Grossner approvals remain stored but cannot create flange variants where the collector rule requires collars", () => {
  const unapproved = structuredClone(catalog); unapproved.engineering.reducerSeatingApprovals = unapproved.engineering.reducerSeatingApprovals.filter(rule => !rule.id.startsWith("grossner-seating-"));
  const original = structuredClone(catalog.parts);
  for (const withSensorNipple of [false, true]) {
    const before = generateInsertCalculations({ ...input, withSensorNipple }, unapproved);
    const after = generateInsertCalculations({ ...input, withSensorNipple }, catalog);
    assert.deepEqual(after, before);
    const lowPressure = after.filter(row => row.dnSmall === 32 && [10, 16].includes(row.pn));
    assert.ok(lowPressure.length > 0);
    for (const row of lowPressure) {
      assert.deepEqual([row.leftConnection, row.rightConnection], ["collar", "collar"]);
      assert.equal(row.totalLengthMm, 114); assert.ok(row.complete, row.warnings.join("; "));
      assert.ok(row.bom.every(item => !item.componentId?.startsWith("grossner-en01:")));
    }
    assert.equal(new Set(after.map(row => row.identityKey)).size, after.length);
  }
  assert.deepEqual(catalog.parts, original);
  assert.ok(catalog.engineering.reducerSeatingApprovals.some(rule => rule.id.startsWith("grossner-seating-")));
});

test("Newkey PN25 seating completes both reducer geometries without changing their physical products or inventing measured profiles", () => {
  const without = structuredClone(catalog);
  without.engineering.reducerSeatingApprovals = without.engineering.reducerSeatingApprovals.filter(rule => !rule.id.startsWith("newkey-seating-"));
  const before = generateInsertCalculations(input, without), after = generateInsertCalculations(input, catalog);
  const changed = after.filter(row => row.assemblyDecisions?.some(rule => rule.ruleId.startsWith("newkey-seating-")));
  assert.equal(changed.length, 6); // Both Newkey ends, or a single end paired with an older flange.
  const completed = changed.filter(row => row.complete);
  assert.equal(completed.length, 2);
  assert.deepEqual(completed.map(row => row.geometry).sort(), ["concentric", "eccentric"]);
  for (const row of changed) {
    const old = before.find(item => item.identityKey === row.identityKey);
    assert.ok(old && !old.complete);
    assert.deepEqual(row.configuration, old.configuration);
    assert.deepEqual(row.bom, old.bom); assert.deepEqual(row.welds, old.welds);
    assert.equal(row.baseLengthMm, 76); assert.equal(row.totalLengthMm, 86);
    assert.equal(row.extension, undefined);
    assert.ok(row.bom.every(item => item.kind !== "pipe"));
    assert.ok(row.dimensions.filter(d => /Длина цилиндрического участка/.test(d.name)).every(d => d.value === null));
    if (row.complete) {
      assert.deepEqual(row.assemblyDecisions.map(d => d.depthMm), [15, 13]);
      assert.deepEqual(row.warnings, []);
      assert.equal(row.price, row.bom.reduce((sum, item) => sum + item.cost, 0));
    } else {
      assert.equal(row.assemblyDecisions.length, 1);
      assert.equal(row.price, null);
      assert.ok(row.warnings.some(reason => /Расточка/.test(reason)));
      assert.ok(row.warnings.some(reason => /профил/.test(reason)));
    }
  }
  for (const row of after.filter(row => !changed.includes(row))) assert.deepEqual(row, before.find(old => old.identityKey === row.identityKey));
  assert.equal(after.length, before.length); assert.equal(new Set(after.map(row => row.identityKey)).size, after.length);
});

test("Newkey approval remains tied to sourced exact geometry and does not waive PN25 nipple pressure", () => {
  const select = c => generateInsertCalculations(input, c).find(row => row.dnSmall === 32 && row.geometry === "concentric" && row.pn === 25 && row.bom.filter(item => item.componentId?.startsWith("newkey-din2503:")).length === 2);
  for (const mutate of [
    c => { c.parts.find(p => p.id === "переходы-005-r0367").lengthMm += 1; },
    c => { c.parts.find(p => p.id === "переходы-005-r0367").id += "-another"; },
    c => { c.engineering.reducerSeatingApprovals.filter(r => r.id.startsWith("newkey-")).forEach(r => { r.source = ""; }); },
  ]) {
    const changed = structuredClone(catalog); mutate(changed);
    const row = select(changed); assert.ok(!row.complete && row.price === null);
    assert.equal(row.assemblyDecisions, undefined); assert.ok(row.warnings.some(w => /профил/.test(w)));
  }
  for (const mutate of [
    p => { p.thicknessMm += 1; }, p => { p.boreDiameterMm += 0.1; }, p => { p.price = null; }, p => { delete p.dimensionSources.thicknessMm; },
  ]) {
    const changed = structuredClone(catalog); mutate(changed.parts.find(p => p.id === "newkey-din2503:NK-FDh50-4"));
    const row = select(changed); assert.ok(!row.complete && row.price === null);
  }
  const sensor = generateInsertCalculations({ ...input, withSensorNipple: true }, catalog).filter(row => row.dnSmall === 32 && row.pn === 25 && row.geometry !== "straight" && row.bom.filter(item => item.componentId?.startsWith("newkey-din2503:")).length === 2);
  assert.equal(sensor.length, 2);
  for (const row of sensor) {
    assert.equal(row.assemblyDecisions.length, 2);
    assert.equal(row.complete, true); assert.ok(row.price > 0);
    assert.ok(row.assumptions?.some(item => item.code === "sensor-pn25-pressure"));
    assert.ok(row.warnings.every(reason => !/профил/.test(reason)));
  }
});

test("each approval is tied to an exact reducer, flange, side, depth, physical identity and sourced decision", () => {
  const mutations = [
    c => { c.parts.find(p => p.id === "переходы-005-r0367").id += "-other"; },
    c => { c.parts.find(p => p.id === "переходы-005-r0367").lengthMm += 1; },
    c => { c.parts.find(p => p.id === "переходы-005-r0367").wallThickness += 0.1; },
    c => { c.engineering.reducerSeatingApprovals.forEach(rule => { rule.source = ""; }); },
    c => { c.engineering.reducerSeatingApprovals.forEach(rule => { rule.depthMm += 1; }); },
    c => { c.engineering.reducerSeatingApprovals.forEach(rule => { rule.side = rule.side === "left" ? "right" : "left"; }); },
  ];
  for (const change of mutations) {
    const changed = structuredClone(catalog); change(changed);
    const row = both(changed).find(row => row.pn === 25);
    assert.ok(row && !row.complete && row.price === null);
    assert.equal(row.assemblyDecisions, undefined);
    assert.ok(row.warnings.some(reason => /профил/.test(reason)));
  }
  const changed = structuredClone(catalog);
  changed.parts.find(p => p.id === ids[0]).standard += " changed";
  const affected = both(changed); assert.ok(affected.length > 0);
  for (const row of affected) {
    assert.equal(row.complete, false);
    assert.deepEqual(row.assemblyDecisions.map(d => d.side), ["right"]);
    assert.ok(row.warnings.some(reason => /левого.*профил/.test(reason)));
  }
  const wrongWorkbook = structuredClone(source); wrongWorkbook.source.sha256 = "different";
  assert.deepEqual(makeInsertCatalog(wrongWorkbook).engineering.reducerSeatingApprovals, []);
});

test("assembly approval does not bypass missing prices, thickness sources or unsuitable bore", () => {
  for (const mutate of [
    p => { p.price = null; },
    p => { delete p.dimensionSources.thicknessMm; },
    p => { p.boreDiameterMm = 59; },
  ]) {
    const changed = structuredClone(catalog); mutate(changed.parts.find(p => p.id === ids[0]));
    const affected = both(changed); assert.ok(affected.length > 0);
    for (const row of affected) assert.ok(!row.complete && row.price === null, row.warnings.join("; "));
  }
  const changed = structuredClone(catalog); changed.parts.find(p => p.id === ids[0]).price += 100;
  const before = both(catalog), after = both(changed);
  assert.ok(after.length > 0);
  for (const row of after) {
    const old = before.find(item => item.identityKey === row.identityKey);
    assert.ok(row.complete); assert.equal(row.price, old.price + 100);
    assert.deepEqual(row.assemblyDecisions, old.assemblyDecisions);
  }
});
