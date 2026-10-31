import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { mergeStandardStainlessFlanges } from "../scripts/standard-stainless-flanges.mjs";
const read = async p => JSON.parse(await readFile(new URL("../" + p, import.meta.url), "utf8"));
const source = await read("public/binding-components.json"), ref = await read("data/standard-stainless-flanges.json");
const { makeCollectorCatalog } = await loadTs(new URL("../app/collector-catalog.ts", import.meta.url));
const { calculateCollector } = await loadTs(new URL("../app/collector-calculations.ts", import.meta.url));
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const { generateInsertCalculations } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const { supplierFlangeFor } = await loadTs(new URL("../app/component-supplier-flanges.ts", import.meta.url));
const { insertionGeometryContext } = await loadTs(new URL("../app/component-insert-3d-server.ts", import.meta.url), {
  [new URL("../app/auth-server.ts", import.meta.url).href]: "export const sha256 = async value => value;",
});
const { lineGeometry } = await loadTs(new URL("../app/line-geometry-catalog.ts", import.meta.url));
const rendererUrl = new URL("../app/model-editor/insertion-renderer.ts", import.meta.url);
const { pieceObject } = await loadTs(rendererUrl, { [rendererUrl.href]: (await readFile(rendererUrl,"utf8")).replace('from "three"', `from ${JSON.stringify(new URL("../node_modules/three/build/three.module.js",import.meta.url).href)}`) });

test("one priced PN16 SKU per DN through 900; retired series cannot return on generation", () => {
  const once = mergeStandardStainlessFlanges(source, ref);
  assert.deepEqual(mergeStandardStainlessFlanges(once, ref), once);
  assert.deepEqual(ref.rows.map(r => r.dn), [200,250,300,350,400,500,600,700,800,900]);
  assert.equal(new Set(ref.rows.map(r => r.dn)).size, 10);
  for (const old of ref.replaces) assert.ok(!once.items.some(r => r.tableId === old.tableId));
  assert.deepEqual(once.items.filter(r => r.tableId !== ref.id), source.items.filter(r => r.tableId !== ref.id));
  const altered = structuredClone(source);
  altered.items.push({ id: "unknown", tableId: ref.replaces[0].tableId, family: "user edited" });
  assert.throws(() => mergeStandardStainlessFlanges(altered, ref), /Unexpected retired/);
});

test("actual alloy, source prices and PN survive all adapters; dimensions are guarded", () => {
  const inserts = makeInsertCatalog(source), collectors = makeCollectorCatalog(source);
  for (const r of ref.rows) {
    const item = source.items.find(i => i.id === r.id), p = inserts.parts.find(p => p.id === r.id);
    assert.equal(item.fields.find(f => f.column === "material").value, "12Х18Н10Т");
    assert.equal(p.material, "aisi304"); assert.equal(p.price, r.price);
    assert.equal(p.thicknessMm, r.dimensions.thicknessMm); assert.equal(p.boreDiameterMm, r.dimensions.boreDiameterMm);
    assert.deepEqual(supplierFlangeFor(item, source.source.sha256).compatiblePns, [16]);
    assert.ok(!p.warnings.some(w => /Материал.*противореч/.test(w)), p.warnings.join("; "));
    const cfg = { type: "discharge", dn: r.dn, pn: 16, material: "aisi304", connection: "flanged", eccentric: false, stationType: "utility", simultaneous: false, jockey: false,
      primary: { flow: 60, working: 2, reserve: 1, dn: 80, connection: "flanged", spacing: 500, pn: 16 }, secondary: null };
    if (r.dn > 200) {
      const calc = calculateCollector(cfg, collectors), flange = calc.bom.find(b => b.role === "end-weldFlange");
      assert.equal(flange.componentId, r.id); assert.equal(flange.cost, 2*r.price);
      assert.ok(!calc.warnings.some(w => /Нет (компонента|цены): Фланец/.test(w) && w.includes(`DN${r.dn}`)));
    }
    for (const pn of [10,25]) assert.ok(!calculateCollector({...cfg,pn}, collectors).bom.some(b => b.componentId === r.id));
  }
  const edited = structuredClone(source), item = edited.items.find(r => r.id === ref.rows[2].id);
  item.fields.find(f => f.column === "CALC_FLANGE_B").value = 99;
  assert.equal(makeInsertCatalog(edited).parts.find(p => p.id === item.id).thicknessMm, null);
});

test("new flanges use the ST20 parametric renderer with actual drilling and mating planes", () => {
  const catalog = makeInsertCatalog(source), context = insertionGeometryContext(source, catalog);
  for (const r of ref.rows) {
    const item = source.items.find(i => i.id === r.id), g = lineGeometry(item, catalog, context);
    assert.equal(g.fidelity, "parametric"); assert.equal(g.shape.kind, "flange");
    assert.equal(g.shape.innerMm, r.dimensions.boreDiameterMm); assert.equal(g.shape.boltHoles, r.dimensions.holes);
    assert.equal(g.shape.faceHeightMm, r.dimensions.faceHeightMm); assert.equal(g.shape.faceDiameterMm, r.dimensions.faceDiameterMm);
    assert.deepEqual(g.ports.map(p => p.point[0]), [0,r.dimensions.thicknessMm]);
    assert.equal(context.models[r.id], undefined); // No supplier URL masquerades as an imported STEP.
    if (r.geometryDonorId) {
      const donor = catalog.parts.find(p => p.id === r.geometryDonorId);
      assert.equal(donor.thicknessMm, g.length); assert.equal(donor.boreDiameterMm, g.shape.innerMm);
    }
    const object = pieceObject({id:r.id, componentId:r.id, role:"flange", name:r.name, position:[0,0,0], rotation:[0,0,0], shape:g.shape, fidelity:g.fidelity, source:g.source, ports:[], auxiliary:false});
    const extrema = [];
    object.traverse(child => { if(child.geometry){child.geometry.computeBoundingBox();extrema.push([child.geometry.boundingBox.min.x,child.geometry.boundingBox.max.x]);} });
    assert.ok(Math.abs(Math.min(...extrema.map(e=>e[0]))) < .001);
    assert.ok(Math.abs(Math.max(...extrema.map(e=>e[1])) - g.length) < .001); // raised face is inside b
  }
});

test("large row-1 bores do not silently approve smaller ISO pipes in collectors or inserts", () => {
  const catalog = makeCollectorCatalog(source);
  const config = { type: "discharge", dn: 400, pn: 16, material: "aisi304", connection: "flanged", eccentric: false, stationType: "utility", simultaneous: false, jockey: false,
    primary: { flow: 60, working: 2, reserve: 1, dn: 80, connection: "flanged", spacing: 500, pn: 16 }, secondary: null };
  const result = calculateCollector(config, catalog);
  assert.equal(result.complete, false);
  assert.ok(result.warnings.some(w => w.includes("Ø406.4") && w.includes("Ø426")));
  const matching = calculateCollector({...config, dn:350}, catalog);
  assert.ok(!matching.warnings.some(w => /посадка на трубу/.test(w)));
  const inserts = generateInsertCalculations({dnFrom:400,dnTo:400,materials:["aisi304"],withSensorNipple:false,includeEccentric:false}, makeInsertCatalog(source));
  const usesFlange = inserts.filter(r => r.pn === 16 && r.bom.some(p => p.componentId === "onyx-gost-pn16:00000051406"));
  assert.ok(usesFlange.length > 0);
  for (const r of usesFlange) {
    assert.equal(r.complete,false); assert.equal(r.price,null);
    assert.ok(r.warnings.some(w => w.includes("Ø406.4") && w.includes("Ø426")));
  }
});
