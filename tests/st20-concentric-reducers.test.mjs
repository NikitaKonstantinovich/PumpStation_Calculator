import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { mergeSt20ConcentricReducers } from "../scripts/st20-concentric-reducers.mjs";
import { loadTs } from "./load-ts.mjs";

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const source = await read("../public/binding-components.json"), reference = await read("../data/st20-concentric-reducers.json");
const standards = await read("../data/component-insert-standards.json"), bindings = await read("../data/insertion-model-bindings.json");
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const { generateInsertCalculations } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const input = { dnFrom: 50, dnTo: 150, materials: ["st20"], withSensorNipple: false, includeEccentric: false };
const catalog = makeInsertCatalog(source);

test("162 ST20 concentric executions persist once without changing any original source row", () => {
  const enriched = mergeSt20ConcentricReducers(source, reference, standards);
  assert.deepEqual(mergeSt20ConcentricReducers(enriched, reference, standards), enriched);
  assert.deepEqual(enriched.items.filter(i => i.tableId !== reference.id), source.items.filter(i => i.tableId !== reference.id));
  const parts = makeInsertCatalog(enriched).parts.filter(p => p.id.startsWith("st20-concentric:"));
  assert.equal(parts.length, 162);
  assert.equal(new Set(parts.map(p => JSON.stringify([p.dn, p.dnSmall, p.pn, p.outerDiameter, p.outerDiameterSmall, p.wallThickness, p.wallThicknessSmall]))).size, 162);
  for (const row of reference.rows) {
    const part = parts.find(p => p.id === row.id);
    assert.equal(part.material, "st20"); assert.equal(part.geometry, "concentric"); assert.equal(part.pn, row.pn);
    assert.equal(part.lengthMm, row.lengthMm); assert.equal(part.price, row.price.amount);
    assert.ok(part.source.includes(row.price.source));
  }
});

test("price is matched by both diameters and walls; fallback preserves the exact eccentric price", () => {
  const quoted = reference.rows.find(r => r.dn === 50 && r.dnSmall === 32 && r.pn === 16);
  assert.equal(quoted.price.amount, 197.3); assert.equal(quoted.price.basis, "supplier");
  for (const row of reference.rows.filter(r => r.price.basis === "eccentric-fallback")) {
    assert.equal(catalog.parts.find(p => p.id === row.sourceId).price, row.price.amount);
  }
  for (const mutate of [
    r => { r.offers.find(q => q.id === quoted.price.quoteId).dims[0] = 57; },
    r => { r.offers.find(q => q.id === quoted.price.quoteId).dims[3] = 3; },
    r => { r.offers.find(q => q.id === quoted.price.quoteId).material = "aisi304"; },
    r => { r.offers.find(q => q.id === quoted.price.quoteId).geometry = "eccentric"; },
    r => { r.rows[0].geometryDonorId = "переходы-005-r0389"; },
  ]) {
    const invalid = structuredClone(reference); mutate(invalid);
    assert.throws(() => mergeSt20ConcentricReducers(source, invalid, standards));
  }
});

test("only two identical CAD executions are shared; a changed wall or PN invalidates adopted geometry", () => {
  const shared = bindings.rows.filter(r => r.componentId?.startsWith("st20-concentric:"));
  assert.equal(shared.length, 2);
  for (const binding of shared) {
    const row = reference.rows.find(r => r.id === binding.componentId);
    assert.equal(bindings.rows.find(r => r.componentId === row.geometryDonorId).hash, binding.hash);
    assert.equal(binding.match.lengthMm, 76);
    for (const column of ["C", "D", "E", "F", "G", "CALC_ST20_LENGTH_MM"]) {
      const changed = structuredClone(source), item = changed.items.find(i => i.id === row.id);
      item.fields.find(f => f.column === column).value = column === "C" ? "PN25" : 999;
      const part = makeInsertCatalog(changed).parts.find(p => p.id === row.id);
      assert.equal(part.lengthMm, null);
      assert.equal(part.cylindricalLengthLargeMm, null);
    }
  }
});

test("concentric insert generation preserves straight lengths and incomplete rows; painting, seams and prices are included", () => {
  const before = makeInsertCatalog({ ...source, items: source.items.filter(i => i.tableId !== reference.id) });
  const rows = generateInsertCalculations(input, catalog);
  assert.deepEqual(rows.filter(r => r.geometry === "straight"), generateInsertCalculations(input, before));
  const transitions = rows.filter(r => r.geometry === "concentric");
  assert.equal(transitions.length, 51);
  assert.equal(transitions.filter(r => r.complete).length, 12);
  const withEccentric = generateInsertCalculations({ ...input, includeEccentric: true }, catalog);
  assert.deepEqual(withEccentric.filter(r => r.geometry !== "eccentric"), rows);
  assert.equal(new Set(withEccentric.map(r => r.selection.slot)).size, withEccentric.length);
  const missing = transitions.find(r => r.dnLarge === 100 && r.dnSmall === 50 && r.pn === 10);
  assert.equal(missing.complete, false); assert.equal(missing.baseLengthMm, null); assert.equal(missing.price, null);
  const done = transitions.find(r => r.dnLarge === 80 && r.dnSmall === 65 && r.pn === 10);
  assert.equal(done.baseLengthMm, 75); assert.equal(done.totalLengthMm, 85);
  assert.equal(done.name, "Вставка Dn80-Dn65 СТ20");
  assert.ok(Math.abs(done.weldLengthMm - 2 * Math.PI * (89 + 76)) < 1e-8);
  assert.ok(!done.bom.some(p => /extension|pipe/.test(p.role)));
  assert.ok(done.bom.some(p => /painting/.test(p.role)));
  assert.ok(Math.abs(done.price - done.bom.reduce((sum, p) => sum + p.cost, 0)) < 1e-8);
  assert.equal(done.bom.find(p => p.kind === "welding").cost, done.weldCost);
});
