import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { mergeIsoStainlessFlanges } from "../scripts/iso-stainless-flanges.mjs";
const read = async p => JSON.parse(await readFile(new URL("../" + p, import.meta.url), "utf8"));
const source = await read("public/binding-components.json"), ref = await read("data/iso-stainless-flanges.json");
const { makeCollectorCatalog } = await loadTs(new URL("../app/collector-catalog.ts", import.meta.url));
const { calculateCollector } = await loadTs(new URL("../app/collector-calculations.ts", import.meta.url));
const { jointFlangeThickness } = await loadTs(new URL("../app/joint-flange-dimensions.ts", import.meta.url));
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const { insertionGeometryContext } = await loadTs(new URL("../app/component-insert-3d-server.ts", import.meta.url), {
  [new URL("../app/auth-server.ts", import.meta.url).href]: "export const sha256 = async value => value;",
});
const { lineGeometry } = await loadTs(new URL("../app/line-geometry-catalog.ts", import.meta.url));
const { buildCollectorTemplate } = await loadTs(new URL("../app/model-editor/collector-template.ts", import.meta.url));
const rendererUrl = new URL("../app/model-editor/insertion-renderer.ts", import.meta.url);
const { pieceObject } = await loadTs(rendererUrl, { [rendererUrl.href]: (await readFile(rendererUrl, "utf8")).replace('from "three"', `from ${JSON.stringify(new URL("../node_modules/three/build/three.module.js", import.meta.url).href)}`) });
const config = dn => ({ type: "suction", dn, pn: 16, material: "aisi304", connection: "flanged", eccentric: false, stationType: "fire", simultaneous: false, jockey: false,
  primary: { flow: 1553, working: 2, reserve: 1, dn: 200, connection: "flanged", spacing: 8500, pn: 16 }, secondary: null, sectionBreaks: 1, instrumentPorts: [] });

test("exact PN16 ISO seats win over GOST independently of catalogue order; metric pipes retain GOST", () => {
  for (const row of ref.rows) for (const reverse of [false, true]) {
    const catalog = makeCollectorCatalog(source);
    if (reverse) catalog.components.reverse();
    const result = calculateCollector(config(row.dn), catalog);
    assert.equal(result.complete, true, result.warnings.join("; "));
    assert.equal(result.lengthMm, 25500);
    for (const role of ["end-weldFlange", "section-break-weldFlange"]) {
      const flange = result.bom.find(b => b.role === role);
      assert.equal(flange.componentId, row.id); assert.equal(flange.cost, 2 * row.price);
    }
    const main = catalog.components.find(p => p.kind === "pipe" && p.dn === row.dn && p.pn === 16 && p.material === "aisi304");
    main.outerDiameter = row.dn === 400 ? 426 : 530;
    const metric = calculateCollector(config(row.dn), catalog);
    assert.ok(metric.bom.find(b => b.role === "end-weldFlange").componentId.startsWith("onyx-gost-pn16:"));
    assert.ok(!metric.warnings.some(w => /посадка на трубу/.test(w)));
  }
});

test("ISO flange card is complete, reproducible and leaves unrelated offers intact", () => {
  const once = mergeIsoStainlessFlanges(source, ref);
  assert.deepEqual(mergeIsoStainlessFlanges(once, ref), once);
  assert.deepEqual(once.items.filter(i => i.tableId !== ref.id), source.items.filter(i => i.tableId !== ref.id));
  assert.throws(() => mergeIsoStainlessFlanges({...source, source: {...source.source, sha256: "changed"}}, ref), /workbook mismatch/);
  for (const row of ref.rows) {
    const item = once.items.find(i => i.id === row.id);
    const f = label => item.fields.find(f => f.headerPath.at(-1) === label)?.value;
    assert.equal(f("Артикул"), row.article); assert.equal(f("Производитель"), "FGinox");
    assert.equal(f("Материал"), "AISI304L / F304L (1.4306)");
    assert.equal(f("Наружный диаметр трубы для проверки посадки, мм"), row.requiredPipeOuterDiameterMm);
    assert.equal(f("Масса по каталогу, кг"), row.weightKg);
    assert.equal(row.price, Math.round(row.originalPriceEur * ref.exchangeRate.rubPerEur * 100) / 100);
    assert.equal(item.prices[0].amount, row.price);
    assert.equal(f("Дата курса"), "2026-11-04");
    assert.match(f("Условия цены"), /без НДС/);
    assert.ok(item.sourceUrls.includes(ref.dimensionUrl));
  }
});

test("default 017W hardware uses the matching ISO flange thickness; explicit metric SKU remains explicit", () => {
  for (const row of ref.rows) {
    const grip = jointFlangeThickness(source, "aisi304", row.dn, 16);
    assert.deepEqual(grip.warnings, []);
    assert.equal(grip.thicknessMm, 2 * row.dimensions.thicknessMm);
    assert.match(grip.source, new RegExp(row.article));
    const catalog = makeCollectorCatalog(source);
    const c = config(500); c.primary.dn = row.dn;
    const calculated = calculateCollector(c, catalog);
    assert.equal(calculated.bom.find(b => b.role === "branch1-weldFlange").componentId, row.id);
    assert.ok(!calculated.warnings.some(w => /Несколько толщин/.test(w)));
    const metricId = source.items.find(i => i.id.startsWith("onyx-gost-pn16:") && i.fields.some(f => f.headerPath.at(-1) === "DN" && f.value === row.dn)).id;
    const explicit = jointFlangeThickness(source, "aisi304", row.dn, 16, undefined, metricId);
    assert.ok(!explicit.source.includes(row.article));
  }
});

test("both ISO flanges generate actual 3D meshes and are used on collector ends", () => {
  const inserts = makeInsertCatalog(source), ctx = insertionGeometryContext(source, inserts), collectors = makeCollectorCatalog(source);
  const entries = source.items.map(item => ({...item, geometry: lineGeometry(item, inserts, ctx)}));
  const lineCatalog = {version: 1, revision: "test", items: Object.fromEntries(entries.map(i => [i.id, i.geometry])), issues: []};
  for (const row of ref.rows) {
    const item = entries.find(i => i.id === row.id), g = item.geometry;
    assert.deepEqual(g.issues, []); assert.equal(g.shape.kind, "flange"); assert.equal(g.fidelity, "parametric");
    assert.equal(g.shape.innerMm, row.dn === 400 ? 411 : 513.5);
    assert.equal(g.shape.outerMm, row.dn === 400 ? 580 : 715);
    assert.equal(g.shape.lengthMm, row.dn === 400 ? 38 : 46);
    assert.equal(g.shape.boltHoles, row.dn === 400 ? 16 : 20);
    assert.equal(g.shape.boltHoleMm, row.dn === 400 ? 30 : 33);
    assert.equal(g.shape.faceHeightMm, 0); assert.equal(g.shape.faceDiameterMm, 0);
    const configuration = config(row.dn), calculation = calculateCollector(configuration, collectors);
    const template = buildCollectorTemplate({configuration, calculation}, lineCatalog, [], "suction");
    const flanges = template.pieces.filter(p => p.componentId === row.id);
    assert.equal(flanges.length, 2);
    for (const piece of flanges) {
      assert.equal(piece.shape.innerMm, row.dimensions.boreDiameterMm);
      const object = pieceObject(piece), meshes = [];
      object.traverse(child => {if(child.geometry) { child.geometry.computeBoundingBox(); meshes.push(child.geometry); }});
      assert.ok(meshes.length > 0); assert.ok(meshes.every(m => m.attributes.position.count > 0));
      assert.ok(Math.abs(Math.max(...meshes.map(m => m.boundingBox.max.x)) - row.dimensions.thicknessMm) < .001);
    }
  }
  const edited = structuredClone(source), item = edited.items.find(i => i.id === ref.rows[0].id);
  item.fields.find(f => f.column === "CALC_FLANGE_BORE").value = 426;
  const modified = makeInsertCatalog(edited);
  assert.equal(modified.parts.find(p => p.id === item.id).boreDiameterMm, null);
});
