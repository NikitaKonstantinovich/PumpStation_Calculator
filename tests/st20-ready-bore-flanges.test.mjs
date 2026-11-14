import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mergeSupplierFlanges } from "../scripts/supplier-flanges.mjs";
import { loadTs } from "./load-ts.mjs";

const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const app = name => loadTs(new URL(`../app/${name}.ts`, import.meta.url));
const [source, readyFlanges, flangeDimensions] = await Promise.all([
  json("../public/binding-components.json"),
  json("../data/st20-ready-bore-flanges.json"),
  json("../data/flange-dimensions.json"),
]);
const { catalogPressures, mergeFlangeDimensions, readFlangeDimensions } = await app("flange-dimensions");
const { makeInsertCatalog } = await app("component-insert-catalog");
const { makeCollectorCatalog } = await app("collector-catalog");
const { generateInsertCandidates, generateInsertCalculations } = await app("component-insert-calculations");
const { jointFlangeThickness } = await app("joint-flange-dimensions");

// ГОСТ 33259-2015, figure 3 and tables 2–3. Face B uses h, rather than h1.
const expected = [
  { dn: 32, b: 18, bore: 43.5, od: 140, pcd: 100, faceOd: 78, faceHeight: 2, pipeOds: [42.3, 42.4], baselines: ["фланцы-001-r0007", "фланцы-002-r0030", "фланцы-003-r0053"] },
  { dn: 40, b: 18, bore: 49.5, od: 150, pcd: 110, faceOd: 88, faceHeight: 3, pipeOds: [48, 48.3], baselines: ["фланцы-001-r0008", "фланцы-002-r0031", "фланцы-003-r0054"] },
  { dn: 50, b: 20, bore: 61.5, od: 165, pcd: 125, faceOd: 102, faceHeight: 3, pipeOds: [60, 60.3], baselines: ["фланцы-001-r0009", "фланцы-002-r0032", "фланцы-003-r0055"] },
];
const pressures = [10, 16, 25];
const enriched = mergeFlangeDimensions(mergeSupplierFlanges(source, readyFlanges), flangeDimensions);
const baseSource = { ...enriched, items: enriched.items.filter(item => item.tableId !== readyFlanges.id) };
const itemById = new Map(enriched.items.map(item => [item.id, item]));
const itemPressures = catalogPressures(enriched.items);
const insertionCatalog = makeInsertCatalog(enriched);
const request = { dnFrom: 32, dnTo: 65, materials: ["st20"], includeEccentric: true, withSensorNipple: false };
const uses = (row, id) => row.bom.some(item => item.componentId === id);

test("steel row 2 inserts have sourced nominal dimensions, the original drilling and no supplier prices", () => {
  assert.equal(readyFlanges.rows.length, 9);
  for (const entry of expected) {
    for (const [index, pn] of pressures.entries()) {
      const id = `st20-ready-bore:${entry.dn}-${pn}`;
      const offer = readyFlanges.rows.find(row => row.id === id);
      assert.ok(offer, id);
      assert.equal(offer.baselineId, entry.baselines[index]);
      assert.deepEqual(offer.supportedPipeOuterDiametersMm, entry.pipeOds);
      assert.deepEqual(offer.compatiblePns, [pn]);
      assert.equal(offer.price, null);

      const item = itemById.get(id);
      assert.ok(item, id);
      assert.deepEqual(item.prices, []);
      assert.equal(item.fields.find(field => field.headerPath.at(-1) === "Назначение")?.value, "Фланец вставки");
      const baseline = itemById.get(offer.baselineId);
      const original = readFlangeDimensions(baseline, itemPressures.get(baseline.id), flangeDimensions, enriched.source.sha256);
      const actual = readFlangeDimensions(item, pn, flangeDimensions, enriched.source.sha256);
      assert.deepEqual(actual.warnings, [], id);
      assert.equal(actual.dimensions.thicknessMm, entry.b);
      assert.equal(actual.dimensions.boreDiameterMm, entry.bore);
      assert.equal(actual.dimensions.outerDiameterMm, entry.od);
      assert.equal(actual.standard, "ГОСТ33259-2015:01:2:B");
      const matingDimensions = [
        ["boltCircleMm", entry.pcd], ["boltHoleDiameterMm", 18], ["holes", 4],
        ["faceDiameterMm", entry.faceOd], ["faceHeightMm", entry.faceHeight],
      ];
      for (const [key, value] of matingDimensions) {
        assert.equal(actual.dimensions[key], value, `${id}: ${key}`);
        assert.equal(original.dimensions[key], value, `${baseline.id}: ${key}`);
      }
      for (const pipeOd of entry.pipeOds) {
        const gap = actual.dimensions.boreDiameterMm - pipeOd;
        assert.ok(gap >= 0.5 && gap <= 2, `${id}: Ø${pipeOd}`);
      }
      const part = insertionCatalog.parts.find(part => part.id === id);
      assert.ok(part, id);
      assert.equal(part.price, null);
      assert.deepEqual(part.supportedPipeOuterDiametersMm, entry.pipeOds);
    }
  }
});

test("insert-only steel flanges preserve collector choices and default joint thickness", () => {
  const before = makeCollectorCatalog(baseSource);
  const after = makeCollectorCatalog(enriched);
  assert.ok(after.components.every(part => !part.id.startsWith("st20-ready-bore:")));
  for (const { dn, b, baselines } of expected) {
    for (const [index, pn] of pressures.entries()) {
      const id = `st20-ready-bore:${dn}-${pn}`;
      const beforeJoint = jointFlangeThickness(baseSource, "st20", dn, pn);
      const defaultJoint = jointFlangeThickness(enriched, "st20", dn, pn);
      assert.ok(beforeJoint.thicknessMm > 0, baselines[index]);
      assert.equal(defaultJoint.thicknessMm, beforeJoint.thicknessMm);
      assert.deepEqual([...defaultJoint.partThicknesses.keys()], [baselines[index]]);
      assert.deepEqual(defaultJoint.warnings, beforeJoint.warnings);
      const exactJoint = jointFlangeThickness(enriched, "st20", dn, pn, undefined, id);
      assert.equal(exactJoint.thicknessMm, 2 * b);
      assert.deepEqual([...exactJoint.partThicknesses.keys()], [id]);
      assert.deepEqual(after.valveBolts.find(row => row.dn === dn && row.pn === pn && row.material === "st20"),
        before.valveBolts.find(row => row.dn === dn && row.pn === pn && row.material === "st20"));
    }
  }
});

test("sourced DN65 to DN50 eccentric reducer still requires a confirmed and priced flange", () => {
  const reducerId = "переходы-001-r0049";
  const originalFlange = "фланцы-003-r0055";
  const alternate = "st20-ready-bore:50-25";
  const candidates = generateInsertCandidates(request, insertionCatalog).filter(row => uses(row, reducerId));
  const original = candidates.find(row => uses(row, originalFlange));
  const preview = candidates.find(row => uses(row, alternate));
  assert.ok(original);
  assert.equal(original.dnSmall, 50);
  assert.equal(original.baseLengthMm, 89);
  assert.equal(original.totalLengthMm, 99);
  assert.equal(original.complete, false);
  assert.equal(original.price, null);
  assert.equal(original.machining?.find(operation => operation.side === "right")?.originalBoreMm, 59);
  assert.ok(preview);
  assert.equal(preview.complete, false);
  assert.equal(preview.price, null);
  assert.equal(preview.machining, undefined);
  assert.equal(preview.assemblyDecisions?.find(decision => decision.side === "right")?.depthMm, 15);

  const selected = generateInsertCalculations(request, insertionCatalog);
  assert.ok(selected.some(row => row.geometry === "eccentric" && row.dnLarge === 65 && row.dnSmall === 50 && row.pn === 25));
  assert.ok(selected.every(row => !row.complete || row.bom.every(item => !item.componentId?.startsWith("st20-ready-bore:"))));
  const completeRows = rows => rows.filter(row => row.complete).map(row => [row.identityKey, row.bom, row.price]);
  const baseline = generateInsertCalculations(request, makeInsertCatalog(baseSource));
  assert.deepEqual(completeRows(selected), completeRows(baseline));
});

test("a price does not establish actual steel row 2 fit, and unrelated ends stay excluded", () => {
  const alternate = "st20-ready-bore:50-25";
  const changed = structuredClone(enriched);
  const offer = changed.items.find(item => item.id === alternate);
  offer.prices.push({ amount: 1000, currency: "RUB", sourceColumn: "price", label: "Цена, ₽/шт." });
  const catalog = makeInsertCatalog(changed);
  assert.equal(catalog.parts.find(part => part.id === alternate).price, 1000);

  const candidates = generateInsertCandidates(request, catalog);
  const reducer = candidates.find(row => uses(row, "переходы-001-r0049") && uses(row, alternate));
  assert.ok(reducer);
  assert.equal(reducer.bom.find(item => item.componentId === alternate).unitPrice, 1000);
  assert.equal(reducer.complete, false);
  assert.equal(reducer.price, null);
  assert.ok(reducer.warnings.some(warning => /фактический посадочный зазор.*пригодность прокладки/.test(warning)));

  const dn50Pipes = new Set(catalog.parts.filter(part => part.kind === "pipe" && part.dn === 50 && part.material === "st20" && part.outerDiameter === 57).map(part => part.id));
  const unsupported = candidates.filter(row => row.geometry === "straight" && row.bom.some(item => item.role === "base" && dn50Pipes.has(item.componentId)));
  assert.ok(unsupported.length);
  assert.ok(unsupported.every(row => row.bom.every(item => !item.componentId?.startsWith("st20-ready-bore:50-"))));
});

test("a changed mating face or drilling invalidates only the associated steel row 2 offer", () => {
  const alternate = "st20-ready-bore:50-25";
  for (const [id, column] of [[alternate, "CALC_FLANGE_PCD"], ["фланцы-003-r0055", "CALC_FLANGE_FACE_HEIGHT"]]) {
    const changed = structuredClone(enriched);
    changed.items.find(item => item.id === id).fields.find(field => field.column === column).value += 1;
    const catalog = makeInsertCatalog(changed);
    assert.ok(catalog.parts.every(part => part.id !== alternate));
    assert.ok(catalog.parts.some(part => part.id === "st20-ready-bore:50-16"));
  }
});

test("the small nominal DN applies only to the reviewed steel reducer dimensions", () => {
  const id = "переходы-001-r0049";
  const original = insertionCatalog.parts.find(part => part.id === id);
  assert.equal(original.dnSmall, 50);
  assert.match(original.dimensionSources.dnSmall, /ГОСТ 17378-2001/);

  const changed = structuredClone(enriched);
  const reducer = changed.items.find(item => item.id === id);
  reducer.fields.find(field => field.headerPath.at(-1) === "Толщина 2, мм").value = 5.7;
  const recalculated = makeInsertCatalog(changed).parts.find(part => part.id === id);
  assert.equal(recalculated.dnSmall, null);
});
