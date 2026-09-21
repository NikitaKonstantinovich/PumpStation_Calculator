import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mergeBindingSupplement } from "../scripts/binding-supplements.mjs";
import { loadTs } from "./load-ts.mjs";

const binding = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const supplier = JSON.parse(await readFile(new URL("../data/lunda-plugs.json", import.meta.url), "utf8"));
const { makeCollectorCatalog } = await loadTs(new URL("../app/collector-catalog.ts", import.meta.url));
const { calculateCollector } = await loadTs(new URL("../app/collector-calculations.ts", import.meta.url));
const configuration = material => ({ type: "discharge", dn: 100, pn: 16, material, connection: "flanged", eccentric: false, stationType: "utility", simultaneous: false, jockey: false, primary: { flow: 60, working: 2, reserve: 1, dn: 80, connection: "flanged", spacing: 500, pn: 16 }, secondary: null });

test("supplier import adds six verified SKUs idempotently after a workbook reimport", () => {
  const workbook = structuredClone(binding);
  workbook.items = workbook.items.filter(v => v.tableId !== supplier.id);
  workbook.catalogs.forEach(v => { v.tables = v.tables.filter(t => t.id !== supplier.id); });
  const merged = mergeBindingSupplement(workbook, supplier);
  assert.deepEqual(mergeBindingSupplement(merged, supplier), merged);
  assert.equal(workbook.items.length, 1794);
  assert.equal(merged.items.length, 1800);
  assert.deepEqual(merged.items.filter(v => v.tableId !== supplier.id), workbook.items);
  assert.equal(merged.statistics.priceEntries, 4232);
  const caps = makeCollectorCatalog(merged).components.filter(v => v.kind === "plug");
  assert.deepEqual(caps.map(v => [v.dn, v.price, v.pn]), [[15,56.12,40],[20,82.96,40],[25,130.54,40],[32,222.04,null],[40,330.62,null],[50,522.16,null]]);
  assert.ok(caps.every(v => v.material === "brass" && v.threadGender === "female" && v.source.includes("2026-09-10")));
});

test("LD female caps complete steel and stainless BOMs without adding welds", () => {
  const catalog = makeCollectorCatalog(mergeBindingSupplement(binding, supplier));
  for (const material of ["aisi304", "st20"]) {
    const c = configuration(material);
    const result = calculateCollector(c, catalog);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.complete, true);
    const caps = result.bom.filter(v => v.kind === "plug");
    assert.deepEqual(caps.map(v => [v.componentId, v.quantity, v.unitPrice]), [[`${supplier.id}:LD.67.504.15`,2,56.12],[`${supplier.id}:LD.67.504.20`,1,82.96]]);
    assert.ok(result.bom.filter(v => v.kind === "nipple").every(v => catalog.components.find(i => i.id === v.componentId).material === material));
    const withoutCaps = calculateCollector(c, { ...catalog, components: catalog.components.filter(v => v.kind !== "plug") });
    assert.equal(result.weldCost, withoutCaps.weldCost);
    assert.ok(Math.abs(result.price - withoutCaps.subtotal - (2 * 56.12 + 82.96)) < 1e-8);
    const suction = calculateCollector({ ...c, type: "suction" }, catalog);
    assert.deepEqual(suction.bom.filter(v => v.kind === "plug").map(v => [v.quantity, v.unitPrice]), [[1,56.12]]);
  }
});

test("male, unrated and insufficient-pressure caps cannot complete a collector", () => {
  for (const patch of [{ threadGender: "male" }, { threadGender: undefined }, { pn: null }, { pn: 10 }]) {
    const catalog = makeCollectorCatalog(mergeBindingSupplement(binding, supplier));
    Object.assign(catalog.components.find(v => v.kind === "plug" && v.dn === 15), patch);
    const result = calculateCollector(configuration("aisi304"), catalog);
    assert.equal(result.price, null);
    assert.ok(result.warnings.some(v => v.includes("Заглушка резьбовая ВР DN15")));
  }
});
