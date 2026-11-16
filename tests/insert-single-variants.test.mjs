import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { extensionCatalog, extensionInput } from "./fixtures/insert-extension.mjs";
const { generateInsertCalculations, generateInsertCandidates, deduplicateInsertParts } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const { insertVariantSlot } = await loadTs(new URL("../app/component-insert-variants.ts", import.meta.url));
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const data = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const input = { dnFrom: 15, dnTo: 800, materials: ["st20", "aisi304"], withSensorNipple: false, includeEccentric: true };

test("one row per size/PN/material/geometry/connection pair; selected physical identities retain honest dimensions and prices", () => {
  const catalog = makeInsertCatalog(data), candidates = generateInsertCandidates(input, catalog), selected = generateInsertCalculations(input, catalog);
  assert.equal(new Set(selected.map(insertVariantSlot)).size, selected.length);
  assert.equal(selected.length, new Set(candidates.map(insertVariantSlot)).size);
  assert.ok(selected.length < candidates.length);
  for (const row of selected) {
    const original = candidates.find(candidate => candidate.identityKey === row.identityKey);
    const { selection, ...physical } = row;
    assert.deepEqual(physical, original);
    assert.equal(selection.candidateCount, candidates.filter(candidate => insertVariantSlot(candidate) === insertVariantSlot(row)).length);
  }
  const pn25 = selected.filter(row => row.dnLarge === 50 && row.dnSmall === 32 && row.pn === 25 && row.material === "aisi304");
  assert.equal(pn25.length, 2);
  assert.ok(pn25.every(row => row.complete && row.bom.filter(item => item.componentId?.startsWith("newkey-din2503:")).length === 2));
  assert.ok(selected.some(row => row.dnLarge > 200 && row.dnSmall <= 200 && row.pn < 25 && row.material === "aisi304" && row.leftConnection === "flanged" && row.rightConnection === "collar"));
  assert.ok(selected.filter(row => row.material === "aisi304" && row.dnLarge <= 200 && row.pn < 25 && row.configuration.construction !== "compact-threaded").every(row => row.leftConnection === "collar" && row.rightConnection === "collar"));
  const sensor = generateInsertCalculations({ ...input, withSensorNipple: true }, catalog);
  assert.equal(sensor.length, selected.length);
  for (const row of sensor) {
    const bare = selected.find(candidate => insertVariantSlot({ ...candidate, withSensorNipple: true }) === insertVariantSlot(row));
    for (const field of ["base", "left", "right", "baseLengthMm", "axialLeftMm", "axialRightMm"]) assert.deepEqual(row.configuration[field], bare.configuration[field]);
  }
});

function fixture() {
  const catalog = extensionCatalog(); catalog.engineering.variantSelection = { source: "TEST explicit selection rule" };
  const original = catalog.parts.find(p => p.id === "ext-left");
  catalog.parts.push({ ...structuredClone(original), id: "supplier-left", origin: "supplement", thicknessMm: 19, price: 1 });
  return catalog;
}
test("physical source duplicates use the original record and its price instead of importing supplier conflicts", () => {
  const part = extensionCatalog().parts.find(p => p.id === "ext-left");
  const original = { ...part, id: "z-original", origin: "original" }, supplier = { ...part, id: "a-supplier", origin: "supplement", price: 1, warnings: ["unrelated supplier issue"] };
  const chosen = deduplicateInsertParts([supplier, original]);
  assert.equal(chosen.length, 1); assert.equal(chosen[0].id, original.id);
  assert.equal(chosen[0].price, original.price); assert.deepEqual(chosen[0].warnings, []);
  assert.equal(deduplicateInsertParts([{ ...original, price: null }, { ...supplier, warnings: [] }])[0].id, supplier.id);
});
test("a complete original part wins over a cheaper supplier; missing original data selects a complete substitute", () => {
  const catalog = fixture(), select = c => generateInsertCalculations(extensionInput, c).find(row => row.geometry === "concentric");
  const first = select(catalog);
  assert.ok(first.complete); assert.ok(first.bom.some(item => item.componentId === "ext-left"));
  assert.ok(!first.bom.some(item => item.componentId === "supplier-left"));
  catalog.parts.reverse(); assert.equal(select(catalog).identityKey, first.identityKey);
  catalog.parts.find(p => p.id === "ext-left").price = null;
  const fallback = select(catalog);
  assert.ok(fallback.complete); assert.ok(fallback.bom.some(item => item.componentId === "supplier-left"));
  assert.notEqual(fallback.identityKey, first.identityKey);
  const withSensor = generateInsertCalculations({ ...extensionInput, withSensorNipple: true }, catalog).find(row => row.geometry === "concentric");
  assert.equal(withSensor.complete, false);
  assert.deepEqual(withSensor.configuration.left, fallback.configuration.left);
});

test("thread size and gender remain distinct; mirrors of straight connections share one slot", () => {
  const row = generateInsertCalculations(extensionInput, fixture()).find(row => row.geometry === "straight");
  const thread = (gender, size) => ({ ...row, leftConnection: "threaded", threadLeft: size, configuration: { ...row.configuration, left: { connection: "threaded", part: JSON.stringify(["threadEnd","aisi304",50,null,25,"straight",60.3,null,3,null,10,null,null,null,null,size,gender,"test"]), looseFlange: null } } });
  assert.notEqual(insertVariantSlot(thread("male",'2"')), insertVariantSlot(thread("female",'2"')));
  const forward = thread("male",'2"');
  const reverse = { ...forward, leftConnection: forward.rightConnection, rightConnection: forward.leftConnection, threadLeft: forward.threadRight, threadRight: forward.threadLeft,
    configuration: { ...forward.configuration, left: forward.configuration.right, right: forward.configuration.left } };
  assert.equal(insertVariantSlot(forward), insertVariantSlot(reverse));
});
