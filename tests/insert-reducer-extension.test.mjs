import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { extensionCatalog, extensionInput } from "./fixtures/insert-extension.mjs";
const { generateInsertCalculations, insertCatalogMetadata } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const calculate = catalog => generateInsertCalculations({ ...extensionInput, materials: catalog.materials }, catalog);
const reducer = catalog => calculate(catalog).find(row => row.geometry !== "straight");
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

for (const geometry of ["concentric", "eccentric"]) test(`${geometry} pump reducer uses catalogue length and only two end welds`, () => {
  const catalog = extensionCatalog(); catalog.parts.find(p => p.kind === "reducer").geometry = geometry;
  const row = reducer(catalog);
  assert.ok(row.complete, row.warnings.join("; "));
  assert.equal(row.baseLengthMm, 76); assert.equal(row.totalLengthMm, 86);
  assert.equal(row.extension, undefined); assert.equal(row.configuration.extension, undefined);
  assert.equal(row.assumptions, undefined);
  assert.ok(row.bom.every(item => item.kind !== "pipe" && !item.role.startsWith("extension")));
  assert.equal(row.welds.length, 2);
  near(row.weldLengthMm, 2 * Math.PI * (60.3 + 42.4));
  near(row.price, 730 + 2710 + 1847 + row.weldLengthMm / 1000 * 5000);
  assert.equal(row.bom.find(item => item.role === "base").quantity, 1);
  assert.ok(row.dimensions.every(d => !/крепеж|болт|внутренний зазор|удлиняющ/.test(d.name)));
  assert.equal(row.name, `Вставка ${geometry === "eccentric" ? "Э " : ""}Dn50-Dn32 AISI304`);
});

test("missing or longer valve hardware and unrelated pipes cannot affect a pump reducer", () => {
  const catalog = extensionCatalog(), before = reducer(catalog);
  catalog.engineering.boltReferences = [];
  catalog.standardBolts = [];
  catalog.parts = catalog.parts.filter(p => p.kind !== "pipe");
  assert.deepEqual(reducer(catalog), before);
  catalog.standardBolts = [{ id: "long", lengthMm: 1000, diameterMm: 16 }];
  assert.deepEqual(reducer(catalog), before);
  delete catalog.engineering.reducerExtension;
  assert.deepEqual(reducer(catalog), before);
  assert.ok(insertCatalogMetadata(catalog).connectionNotes.some(note => /у насоса/.test(note)));
});

test("ST20 painting uses the reducer length and larger DN only", () => {
  const row = reducer(extensionCatalog("st20"));
  assert.ok(row.complete, row.warnings.join("; "));
  const paint = row.bom.filter(item => item.kind === "painting");
  assert.equal(paint.length, 1); assert.equal(paint[0].componentId, "ext-paint");
  assert.equal(paint[0].quantity, 0.076); near(paint[0].cost, 0.076 * 450);
});

test("both direct reducer seating profiles remain mandatory", () => {
  for (const key of ["cylindricalLengthLargeMm", "cylindricalLengthSmallMm"]) {
    const catalog = extensionCatalog(); delete catalog.parts.find(p => p.kind === "reducer")[key];
    const row = reducer(catalog);
    assert.equal(row.complete, false); assert.equal(row.price, null);
    assert.equal(row.totalLengthMm, 86);
    assert.ok(row.warnings.some(w => /Посадка перехода.*профиля/.test(w)));
    assert.equal(row.extension, undefined);
  }
});

test("missing reducer length, flange thickness, source or price still blocks exportable price", () => {
  for (const change of [c => c.parts.find(p => p.kind === "reducer").lengthMm = null,
    c => c.parts.find(p => p.id === "ext-right").dimensionSources.thicknessMm = "",
    c => c.parts.find(p => p.kind === "reducer").dimensionSources.lengthMm = "",
    c => c.parts.find(p => p.kind === "reducer").price = null]) {
    const catalog = extensionCatalog(); change(catalog);
    const row = reducer(catalog);
    assert.equal(row.complete, false); assert.equal(row.price, null);
    assert.equal(row.extension, undefined);
  }
});

test("straight inserts retain clearance based on full valve/check-valve hardware", () => {
  const catalog = extensionCatalog();
  const row = calculate(catalog).find(row => row.geometry === "straight");
  assert.ok(row.complete, row.warnings.join("; "));
  assert.equal(row.baseLengthMm, 173); assert.equal(row.totalLengthMm, 183);
  assert.equal(row.dimensions.find(d => d.name === "Минимальный внутренний зазор между фланцами").value, 143);
  catalog.engineering.boltReferences = [];
  const missing = calculate(catalog).find(row => row.geometry === "straight");
  assert.equal(missing.complete, false); assert.equal(missing.totalLengthMm, null);
  assert.ok(reducer(catalog).complete);
});

test("unequal pipe walls do not require an allowance when no pipe-to-reducer joint exists", () => {
  const catalog = extensionCatalog(); catalog.parts.find(p => p.kind === "reducer").wallThickness = 5.6;
  catalog.parts.find(p => p.kind === "pipe").wallThickness = 2;
  const row = reducer(catalog);
  assert.ok(row.complete, row.warnings.join("; "));
  assert.equal(row.assumptions, undefined);
  assert.equal(row.welds.length, 2);
  assert.equal(row.dimensions.find(d => d.name === "Больший конец: толщина стенки").value, 5.6);
});

test("catalogue reducer length changes physical identity; price changes do not", () => {
  const catalog = extensionCatalog(), before = reducer(catalog), base = catalog.parts.find(p => p.kind === "reducer");
  base.price += 100;
  const repriced = reducer(catalog);
  assert.equal(repriced.identityKey, before.identityKey); near(repriced.price - before.price, 100);
  base.lengthMm = 80;
  const longer = reducer(catalog);
  assert.equal(longer.totalLengthMm, 90); assert.notEqual(longer.identityKey, before.identityKey);
  assert.equal(longer.extension, undefined);
});
