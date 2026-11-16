import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
const { planFlangeBoring, readFlangeBoringRates } = await loadTs(new URL("../app/component-flange-boring.ts", import.meta.url));
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
// Inspect all candidates here; server choice/uniqueness is covered by insert-single-variants.test.mjs.
const { generateInsertCandidates: generateInsertCalculations } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const provenance = "TEST FIXTURE ONLY: approved hypothetical machining parameters";
const input = { side: "left", flangeId: "TEST-flange", dn: 50, pn: 25, material: "aisi304", originalBoreMm: 59, baseOuterDiameterMm: 60.3, originalSource: provenance, baseSource: provenance };
const pending = { source: provenance, diametralClearanceMm: null, clearanceSource: null };
const approved = { ...pending, diametralClearanceMm: 0.5, clearanceSource: provenance };
const rate = { id: "TEST-boring-rate", material: "aisi304", dn: 50, pn: 25, pricePerPiece: 120, source: provenance, warnings: [] };

test("planned boring keeps original bore and actual OD, without inventing clearance or zero cost", () => {
  const before = structuredClone(input), result = planFlangeBoring(input, pending, []);
  assert.deepEqual(input, before);
  assert.equal(result.operation.originalBoreMm, 59); assert.equal(result.operation.baseOuterDiameterMm, 60.3);
  assert.equal(result.operation.targetBoreMm, null); assert.equal(result.operation.unitPrice, null);
  assert.equal(result.operation.radialRemovalMm, null); assert.equal(result.operation.quantity, 1);
  assert.ok(result.warnings.some(w => /зазор/.test(w))); assert.ok(result.warnings.some(w => /тариф/.test(w)));
});
test("confirmed diametral clearance determines target and radial removal using OD, with one piece charge", () => {
  const result = planFlangeBoring(input, approved, [rate]);
  assert.deepEqual(result.warnings, []); assert.equal(result.operation.targetBoreMm, 60.8);
  assert.equal(result.operation.radialRemovalMm, 0.9); assert.equal(result.operation.cost, 120);
  assert.equal(result.operation.rateId, rate.id);
  assert.equal(planFlangeBoring({ ...input, originalBoreMm: 61 }, approved, [rate]).operation, null);
  assert.equal(planFlangeBoring({ ...input, originalBoreMm: 60.8 }, approved, [rate]).operation, null);
  assert.equal(planFlangeBoring({ ...input, originalBoreMm: 61 }, pending, []).operation, null);
  assert.ok(planFlangeBoring({ ...input, originalBoreMm: 60.3 }, pending, []).operation);
});
test("missing sources, negative clearances, missing or ambiguous tariff cannot produce a complete operation", () => {
  assert.equal(planFlangeBoring({ ...input, originalBoreMm: null }, approved, [rate]).operation, null);
  assert.equal(planFlangeBoring({ ...input, baseSource: undefined }, approved, [rate]).operation, null);
  assert.equal(planFlangeBoring(input, { ...approved, source: "" }, [rate]).operation, null);
  for (const policy of [{ ...approved, diametralClearanceMm: -1 }, { ...approved, clearanceSource: null }]) {
    const result = planFlangeBoring(input, policy, [rate]);
    assert.equal(result.operation.targetBoreMm, null); assert.ok(result.warnings.length > 0);
  }
  for (const rates of [[], [rate, { ...rate, id: "duplicate" }], [{ ...rate, material: "st20" }], [{ ...rate, pn: 16 }], [{ ...rate, pricePerPiece: 0 }]]) {
    const result = planFlangeBoring(input, approved, rates);
    assert.equal(result.operation.cost, null); assert.ok(result.warnings.length > 0);
  }
});
test("only explicit catalogue machining services with correct material, PN, units and source become tariffs", () => {
  const service = { id: rate.id, catalogId: "работы", family: "Расточка", fields: [
    ["Назначение", "Расточка фланца"], ["Материал", "AISI304"], ["DN", 50], ["PN", 25], ["Источник тарифа", provenance],
  ].map(([label, value]) => ({ column: label, headerPath: [label], value })), prices: [{ label: "Цена, ₽/шт.", currency: "RUB", amount: 120 }] };
  const data = { items: [...source.items, service] };
  assert.deepEqual(readFlangeBoringRates(data), [rate]);
  assert.deepEqual(readFlangeBoringRates(source), []);
  service.prices[0].label = "Цена, ₽/м";
  assert.equal(readFlangeBoringRates(data)[0].pricePerPiece, null);
  assert.ok(readFlangeBoringRates(data)[0].warnings.length);
});
test("real reducer keeps two distinct boring operations without extension and with both profile checks", () => {
  const catalog = makeInsertCatalog(source), snapshot = structuredClone(catalog);
  const request = { dnFrom: 50, dnTo: 50, materials: ["aisi304"], withSensorNipple: false, includeEccentric: false };
  const row = generateInsertCalculations(request, catalog).find(row => row.dnSmall === 32 && row.pn === 25);
  assert.deepEqual(catalog, snapshot); assert.equal(row.machining.length, 2);
  assert.deepEqual(row.machining.map(x => [x.side, x.originalBoreMm, x.baseOuterDiameterMm]), [["left", 59, 60.3], ["right", 39, 42.4]]);
  assert.deepEqual(row.configuration.flangeBores, [{ side: "left", targetBoreMm: null }, { side: "right", targetBoreMm: null }]);
  assert.equal(row.bom.filter(x => x.kind === "machining").length, 2);
  assert.equal(row.baseLengthMm, 76); assert.equal(row.extension, undefined); assert.equal(row.totalLengthMm, 86); assert.equal(row.price, null);
  assert.equal(row.welds.length, 2);
  assert.ok(row.warnings.some(w => /цилиндрического участка/.test(w)));
  assert.equal(row.dimensions.find(d => d.name === "Фактический внутренний зазор между фланцами"), undefined);
  assert.ok(row.warnings.every(w => !/Недостаточный внутренний зазор/.test(w)));
  assert.ok(row.warnings.every(w => !/не проходит в посадочное/.test(w)));
  assert.match(row.description, /расточка фланцев: 2 шт/);
  const collar = generateInsertCalculations({ ...request, dnFrom: 65, dnTo: 65 }, catalog).find(row => row.geometry === "straight" && row.pn === 16);
  assert.equal(collar.machining, undefined); assert.equal(collar.configuration.flangeBores, undefined);
});
