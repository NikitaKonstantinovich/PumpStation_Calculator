import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const json = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
const pumps = await json("public/pumps.json");
const legacy = await json("data/pump-catalog/legacy-pumps.json");
const report = await json("data/pump-catalog/merge-report.json");
const evidence = await json("data/pump-catalog/records.json");
const byId = new Map(pumps.map(p => [p.id, p]));
const catalog = await loadTs(new URL("../app/pump-catalog.ts", import.meta.url));
const { usablePump, interpolateCurve, operatingPoint, pumpCurvePath, cataloguePriceRub, cataloguePurchasePriceRub } = catalog;
const normalize = p => `${p.manufacturer.toUpperCase()}|${p.model.toUpperCase().replace(/\s/g, "").replace("CHLF(T)", "CHLF").replaceAll(",", ".")}`;
const settings = { usdRate: 85, cnyRate: 13, manufacturerDiscounts: {cnp:45, aquastrong:55, onis:0, vandjord:25, wellmix:35} };

test("migration retains every legacy identity and every legacy field as evidence", () => {
  assert.equal(byId.size, pumps.length);
  assert.equal(new Set(pumps.map(normalize)).size, pumps.length);
  assert.equal(pumps.length, report.totalCount);
  assert.equal(legacy.length, report.legacyCount);
  assert.equal(pumps.filter(p => p.selectable).length, report.selectableCount);
  assert.deepEqual([...new Set(pumps.map(p => p.manufacturer))].sort(), ["Aquastrong", "CNP", "ONIS", "VANDJORD", "Wellmix"]);
  for (const old of legacy) {
    assert.ok(byId.has(old.id), old.model);
    assert.equal(normalize(byId.get(old.id)), normalize(old));
    assert.deepEqual(evidence[old.id].legacy, old);
    for (const field of ["drawing", "price", "efficiency", "nominalFlow"]) {
      if (old[field] != null) assert.notEqual(byId.get(old.id)[field], null, `${old.model}: ${field}`);
    }
  }
});

test("reference source wins for overlapping Q/H, motor power, price and technical fields", () => {
  for (const pump of pumps) {
    const records = evidence[pump.id].sources;
    const source = [...records].reverse().find(s => s.file.includes("eventech_"))?.record;
    if (source) {
      assert.deepEqual(pump.curve, source.curves.qh.map(p => [p.q_m3h, p.value]), pump.model);
      if (source.motor_power_kw != null) assert.equal(pump.power, source.motor_power_kw, pump.model);
    }
    const price = records.find(s => s.file.includes("cnp_cdm_fswpc_prices"))?.record;
    if (price) {
      assert.equal(pump.price, price.retail_price_usd);
      assert.equal(pump.priceCurrency, "USD");
      assert.equal(pump.power, price.motor_power_kw);
      assert.equal(pump.execution, price.exact_variant);
    }
    const technical = records.find(s => s.file.includes("cnp_cdm_fswpc_technical"))?.record;
    if (technical) {
      for (const [key, value] of Object.entries(technical.dimensions_mm)) assert.deepEqual(pump.dimensions[key], value);
      assert.deepEqual(pump.inlet, technical.inlet);
    }
  }
  assert.equal(pumps.find(p => p.model === "CHLF15-30").power, 3);
  assert.ok(pumps.filter(p => p.series === "EPP").every(p => p.type === "inline"));
});

test("all usable curves have ordered m³/h coordinates and are drawn without extrapolation", () => {
  for (const p of pumps) {
    const ready = usablePump(p, p.medium);
    assert.equal(ready, p.selectable, p.model);
    assert.equal(usablePump(p, p.medium === "water" ? "wastewater" : "water"), false);
    if (!ready) continue;
    assert.ok(p.curve.length >= 2);
    assert.equal(p.minFlow, p.curve[0][0]);
    assert.equal(p.maxFlow, p.curve.at(-1)[0]);
    assert.equal(interpolateCurve(p.curve, p.minFlow - 0.001), null);
    assert.equal(interpolateCurve(p.curve, p.maxFlow + 0.001), null);
    for (const [q, h] of p.curve) assert.ok(Math.abs(interpolateCurve(p.curve, q) - h) < 1e-7, p.model);
    for (let i = 1; i < p.curve.length; i++) {
      const [q1, h1] = p.curve[i - 1], [q2, h2] = p.curve[i];
      assert.ok(q2 > q1 && h2 >= 0 && q1 >= 0);
      for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        const h = interpolateCurve(p.curve, q1 + t * (q2 - q1));
        assert.ok(h >= Math.min(h1, h2) - 1e-7 && h <= Math.max(h1, h2) + 1e-7, p.model);
      }
    }
    const path = pumpCurvePath(p, 2, p.maxFlow * 2, Math.max(p.maxHead, 1));
    assert.ok(path.startsWith("M"));
    assert.equal((path.match(/C/g) ?? []).length, p.curve.length - 1);
    assert.doesNotMatch(path, /NaN|Infinity/);
  }
});

test("operating point lies on both plotted pump and system curves for one/two pumps", () => {
  for (const p of pumps.filter(p => p.selectable)) {
    const index = Math.floor(p.curve.length / 2);
    const q = (p.curve[index - 1][0] + p.curve[index][0]) / 2;
    const h = interpolateCurve(p.curve, q);
    if (!(q > 0 && h > 0)) continue;
    for (const count of [1, 2]) {
      const input = {flowRate:q * count, head:h, staticHead:h / 3};
      const actual = operatingPoint(p, count, input);
      assert.ok(actual, p.model);
      assert.ok(Math.abs(interpolateCurve(p.curve, actual.flow / count) - actual.head) < 1e-6, p.model);
      assert.ok(Math.abs(input.staticHead + (h - input.staticHead) * (actual.flow / input.flowRate) ** 2 - actual.head) < 1e-6);
    }
  }
  const p = {curve:[[0, 20], [10, 10]]};
  assert.equal(operatingPoint(p, 1, {flowRate:10, head:40, staticHead:30}), null);
  assert.equal(operatingPoint(p, 1, {flowRate:0, head:10, staticHead:0}), null);
  assert.deepEqual(operatingPoint({curve:[[0,1],[2,5]]}, 1, {flowRate:1, head:3, staticHead:2}), {flow:1, head:3});
});

test("currency conversion and brand discounts do not double-discount net snapshots", () => {
  const p = {manufacturer:"Aquastrong", price:100, priceCurrency:"CNY", priceKind:"list"};
  assert.equal(cataloguePriceRub(p, settings), 1300);
  assert.equal(cataloguePurchasePriceRub(p, settings), 585);
  assert.equal(cataloguePurchasePriceRub({...p, priceCurrency:"RUB", priceKind:"net"}, settings), 100);
  assert.equal(cataloguePurchasePriceRub({...p, manufacturer:"CNP", priceCurrency:"USD"}, settings), 4675);
  assert.equal(cataloguePurchasePriceRub({...p, manufacturer:"VANDJORD", priceCurrency:"RUB"}, settings), 75);
  for (const pump of pumps.filter(p => p.priceKind === "net" && p.price != null)) {
    assert.equal(pump.priceCurrency, "RUB");
    assert.equal(cataloguePurchasePriceRub(pump, settings), Math.round(pump.price * 100) / 100);
  }
});

test("every local sketch/document exists and copied source assets match checksums", async () => {
  const assets = await json("data/pump-catalog/asset-manifest.json");
  assert.deepEqual(report.missingSourceAssets, []);
  for (const path of new Set(pumps.map(p => p.drawing).filter(p => p?.startsWith("/")))) {
    await access(new URL(`../public${path}`, import.meta.url));
  }
  for (const [path, asset] of Object.entries(assets)) {
    const bytes = await readFile(new URL(`../public${path}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256, path);
  }
});

test("sketch resolver preserves legacy coverage and prioritizes exact reference drawings", async () => {
  const {pumpSketchFor} = await loadTs(new URL("../app/pump-sketches.ts", import.meta.url));
  const paths = new Set();
  for (const p of pumps) {
    const sketch = pumpSketchFor(p);
    if (p.drawing && p.drawingSource) assert.equal(sketch.src, p.drawing);
    if (sketch?.src.startsWith("/")) paths.add(sketch.src);
  }
  for (const old of legacy) {
    if (pumpSketchFor(old)) assert.ok(pumpSketchFor(byId.get(old.id)), old.model);
  }
  for (const path of paths) await access(new URL(`../public${path}`, import.meta.url));
  const changedExecution = pumps.find(p => p.model === "CDM32-3");
  assert.doesNotMatch(pumpSketchFor(changedExecution).src, /cdm-32-3\.png$/);
  assert.match(pumpSketchFor(changedExecution).caption, /CDM32-3FSWPC/);
  assert.equal(pumpSketchFor({manufacturer:"Wellmix", model:"missing", drawing:null}), undefined);
});

test("saved projects retain old choices and accept new-brand ruble specification items", async () => {
  const {createProject, parseProjectConfig} = await loadTs(new URL("../app/project-config.ts", import.meta.url));
  const project = createProject("Migration regression", {id:"migration-test", timestamp:"2026-09-22T00:00:00.000Z"});
  const old = legacy.find(p => p.model === "CHLF(T)15-30");
  project.entities["system-input"].selectedPumpId = old.id;
  project.entities["station-settings"].manufacturerDiscounts.aquastrong = 42;
  const fresh = pumps.find(p => p.manufacturer === "VANDJORD" && p.priceCurrency === "RUB");
  project.entities["station-spec"].items = [{position:"01", name:fresh.model, details:"Test pump", quantity:1, unit:"шт.", price:123, listPrice:fresh.price, priceCurrency:"RUB", equipmentId:fresh.id, section:"pump", status:"selected"}];
  const parsed = parseProjectConfig(JSON.parse(JSON.stringify(project)));
  assert.equal(parsed.entities["system-input"].selectedPumpId, old.id);
  assert.equal(byId.get(old.id).model, "CHLF15-30");
  assert.equal(parsed.entities["station-settings"].manufacturerDiscounts.aquastrong, 42);
  assert.equal(parsed.entities["station-spec"].items[0].priceCurrency, "RUB");
});
