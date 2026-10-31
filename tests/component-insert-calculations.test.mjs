import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const calc = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const adapter = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const provenance = "TEST FIXTURE ONLY — explicitly verified hypothetical dimensions";
const input = patch => ({ dnFrom: 50, dnTo: 50, materials: ["st20"], withSensorNipple: false, includeEccentric: false, ...patch });
const dims = Object.fromEntries(["outerDiameter", "outerDiameterSmall", "wallThickness", "wallThicknessSmall", "lengthMm"].map(key => [key, provenance]));
function part(kind, dn, pn = 16, patch = {}) {
  const diameter = { 15: 21.3, 25: 33.7, 50: 60.3, 65: 76.1, 100: 114.3, 200: 219.1, 250: 273 }[dn];
  return { id: `${kind}-${dn}-${pn}`, kind, name: `${kind} DN${dn}`, material: "st20", dn, dnSmall: kind === "pipe" ? dn : null, pn,
    geometry: "straight", outerDiameter: diameter, outerDiameterSmall: kind === "pipe" ? diameter : null,
    wallThickness: 3, wallThicknessSmall: kind === "pipe" ? 3 : null, lengthMm: null, thicknessMm: null,
    thread: null, threadGender: null, standard: "TEST-ONLY", price: kind === "pipe" ? 1000 : 100,
    source: provenance, dimensionSources: { ...dims }, warnings: [], ...patch };
}
function fixture() {
  const parts = [];
  for (const pn of [10, 16, 25]) {
    for (const dn of [25, 50]) parts.push(part("pipe", dn, pn), part("weldFlange", dn, pn));
    for (const geometry of ["concentric", "eccentric"]) parts.push(part("reducer", 50, pn, { id: `${geometry}-50-25-${pn}`, geometry, dnSmall: 25, outerDiameterSmall: 33.7, wallThicknessSmall: 3, lengthMm: 75 }));
  }
  return { version: "fixture-1", parts, nominalDns: [25, 50], materials: ["st20"], issues: [],
    paintingRates: [25, 50].map(dn => ({ id: `paint-${dn}`, dn, material: "st20", pricePerMeter: dn === 50 ? 450 : 300, source: provenance, warnings: [] })),
    standardBolts: [{ id: "bolt-m16x130", diameterMm: 16, lengthMm: 130, source: provenance }],
    engineering: {
      connectionPairs: ["flanged", "collar", "threaded"].flatMap(left => ["flanged", "collar", "threaded"].map(right => ({ left, right, source: provenance }))),
      straightLength: { model: "017W-FIXTURE", basis: "standard-bolt", source: provenance },
      boltReferences: [10, 16, 25].flatMap(pn => [25, 50].map(dn => ({ dn, pn, material: "st20", model: "017W-FIXTURE", threadDiameterMm: 16, minimumLengthMm: 129, standardLengthMm: 130, componentId: "bolt-m16x130", source: provenance }))),
      endRules: [10, 16, 25].flatMap(pn => [25, 50].flatMap(dn => ["flanged", "collar", "threaded"].map(connection => ({ connection, material: "st20", dn, pn, axialAdditionMm: connection === "threaded" ? 35 : connection === "collar" ? 4 : 20, weldFactor: 1, source: provenance })))),
      looseFlangeInBom: { include: false, source: provenance }, sensorNipple: null,
    } };
}
const rows = (catalog = fixture(), patch) => calc.generateInsertCalculations(input({ materials: catalog.materials.length === 1 ? catalog.materials : ["st20"], ...patch }), catalog);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

function compactFixture(material = "st20") {
  const c = fixture();
  c.parts = [part("threadEnd", 50, 16, { lengthMm: 38, thread: '2"', threadGender: "male" }),
    ...[10,16].map(pn => part(material === "st20" ? "weldFlange" : "collar", 50, pn, { lengthMm: 23, thicknessMm: 20, boreDiameterMm: 61.1, dimensionSources: { ...dims, thicknessMm: provenance, boreDiameterMm: provenance } }))];
  c.engineering.compactThreaded = { source: provenance, weldFactor: 2 };
  c.engineering.flangeAssembly = { faceOffsetMm: 5, clearanceFactor: 1.1, fastenerModels: [], source: provenance };
  c.engineering.collarAssembly = { insertionDepthMm: 0, weldGapMm: 0, weldFactor: 2, source: provenance, weldSource: provenance };
  c.engineering.boltReferences = []; c.standardBolts = [];
  if (material === "aisi304") asStainless(c);
  return c;
}

test("compact ready ends: one weld, actual purchased pieces, no pipe or bolt length, PN10/16 only", () => {
  for (const material of ["st20", "aisi304"]) {
    const c = compactFixture(material), actual = rows(c);
    assert.equal(actual.length, 4);
    for (const row of actual) {
      assert.equal(row.complete, true, row.warnings.join("; "));
      assert.equal(row.baseLengthMm, 38); assert.equal(row.configuration.axialLeftMm, 0);
      const threaded = row.rightConnection === "threaded";
      assert.equal(row.totalLengthMm, threaded ? 76 : material === "st20" ? 43 : 61);
      assert.ok([10,16].includes(row.pn)); assert.equal(row.welds.length, 1);
      near(row.weldLengthMm, 2 * Math.PI * 60.3);
      assert.equal(row.bom.filter(b => !["welding","painting"].includes(b.kind)).length, 2);
      assert.ok(row.bom.every(b => b.kind !== "pipe" && b.kind !== "machining"));
      if (material === "st20") near(row.bom.find(b => b.kind === "painting").quantity, threaded ? .076 : .038);
      near(row.price, row.bom.reduce((n,b) => n+b.cost,0));
    }
  }
});

test("compact ends reject missing dimensions/prices, mismatched weld ends and oversized threads", () => {
  for (const patch of [{ lengthMm:null }, { price:null }, { dimensionSources:{} }]) {
    const c=compactFixture(); Object.assign(c.parts[0],patch);
    assert.ok(rows(c).every(r => !r.complete && r.price === null));
  }
  const c=compactFixture(); c.parts.push({ ...c.parts[0], id:"different-wall", wallThickness:4 });
  const mixed=rows(c).filter(r => r.rightConnection === "threaded" && r.configuration.base !== r.configuration.right.part);
  assert.ok(mixed.length); assert.ok(mixed.every(r => !r.complete && r.warnings.some(w => /стенки/.test(w))));
  c.parts[0].thread='2 1/2"'; c.parts=c.parts.slice(0,1);
  assert.equal(rows(c).length,0);
});

test("compact 3D has two actual pieces and one butt joint with no duplicate left stub", async () => {
  const core=await loadTs(new URL("../app/model-editor/insertion-template.ts",import.meta.url));
  const c=compactFixture("aisi304"), row=rows(c).find(r => r.pn===16 && r.rightConnection==="threaded");
  const t=core.prepareInsertionTemplate(row,{catalog:c,flanges:{},models:{}});
  assert.equal(t.geometry.totalLengthMm,76); assert.equal(t.geometry.pieces.length,2);
  assert.equal(t.geometry.joints.length,1); assert.equal(t.geometry.joints[0].kind,"butt");
  assert.deepEqual(t.geometry.ports.map(p=>p.point.map(n=>n || 0)),[[0,0,0],[76,0,0]]);
  assert.ok(t.geometry.ports.every(p=>p.thread==='2"' && p.gender==="male" && p.provisional));
  assert.equal(t.geometry.pieces.find(p=>p.id==="base").ports[0].id,"thread");
});

function asStainless(catalog) {
  catalog.materials = ["aisi304"];
  for (const item of [...catalog.parts, ...catalog.engineering.endRules, ...catalog.engineering.boltReferences]) item.material = "aisi304";
  return catalog;
}

// Mixed welded-flange/collar ends are valid across DN200: DN250 -> DN200.
// Keep fixture IDs so each test can still modify its original source record.
function asBoundaryReducer(catalog) {
  asStainless(catalog);
  const dn = value => value === 50 ? 250 : value === 25 ? 200 : value;
  const diameter = value => value === 60.3 ? 273 : value === 33.7 ? 219.1 : value;
  for (const item of catalog.parts) {
    item.dn = dn(item.dn); item.dnSmall = dn(item.dnSmall);
    item.outerDiameter = diameter(item.outerDiameter); item.outerDiameterSmall = diameter(item.outerDiameterSmall);
  }
  for (const rule of [...catalog.engineering.endRules, ...catalog.engineering.boltReferences]) rule.dn = dn(rule.dn);
  catalog.nominalDns = catalog.nominalDns.map(dn);
  return catalog;
}

test("insert request rejects malformed ranges, unsupported materials and nonboolean flags", () => {
  for (const patch of [{ dnFrom: 60 }, { dnFrom: 0 }, { dnTo: 10001 }, { materials: [] }, { materials: ["brass"] }, { withSensorNipple: "true" }]) assert.throws(() => calc.parseInsertRequest(input(patch)));
  assert.deepEqual(calc.parseInsertRequest(input({ materials: ["st20", "st20"] })).materials, ["st20"]);
});

test("one straight and every reducer geometry per supported PN, inclusive nominal range", () => {
  assert.equal(rows().length, 6);
  assert.equal(rows(fixture(), { includeEccentric: true }).length, 9);
  assert.deepEqual([...new Set(rows().map(row => row.pn))], [10, 16, 25]);
  assert.equal(rows(fixture(), { dnFrom: 26, dnTo: 49 }).length, 0);
  assert.equal(rows(fixture(), { dnFrom: 25, dnTo: 50 }).length, 9);
});

test("collector flange policy chooses one execution at DN200/250 for both materials and PN10/16/25", () => {
  for (const material of ["st20", "aisi304"]) for (const pn of [10, 16, 25]) for (const dn of [50, 200, 250]) {
    const catalog = fixture();
    catalog.nominalDns = [dn];
    catalog.parts = [part("pipe", dn, pn), part("weldFlange", dn, pn), part("collar", dn, pn, { lengthMm: 23 })];
    if (material === "aisi304") asStainless(catalog);
    const actual = rows(catalog, { dnFrom: dn, dnTo: dn });
    const expected = material === "aisi304" && [50, 200].includes(dn) && [10, 16].includes(pn) ? "collar" : "flanged";
    assert.equal(actual.length, 1, `${material} DN${dn} PN${pn}`);
    assert.deepEqual([actual[0].leftConnection, actual[0].rightConnection], [expected, expected]);
    assert.equal(actual[0].bom.filter(item => item.kind === (expected === "collar" ? "collar" : "weldFlange")).length, 2);
    assert.ok(actual[0].bom.every(item => item.kind !== (expected === "collar" ? "weldFlange" : "collar")));
  }
});

test("missing required end stays incomplete and cannot be replaced by the other flange execution", () => {
  for (const pn of [16, 25]) {
    const catalog = asStainless(fixture());
    catalog.parts = [part("pipe", 50, pn), part(pn === 16 ? "weldFlange" : "collar", 50, pn)];
    asStainless(catalog);
    const [row] = rows(catalog);
    assert.equal(row.leftConnection, pn === 16 ? "collar" : "flanged");
    assert.equal(row.complete, false); assert.equal(row.price, null);
    assert.ok(row.warnings.some(message => /по правилу коллекторов/.test(message)));
    assert.ok(row.bom.every(item => !["weldFlange", "collar"].includes(item.kind)));
  }
});

test("production scope excludes DN15/20/25 flange and collar ends for every material and PN", () => {
  const catalog = adapter.makeInsertCatalog(source);
  assert.deepEqual(catalog.engineering.flangedEndExclusions.dns, [15, 20, 25]);
  const results = rows(catalog, { dnFrom: 15, dnTo: 200, materials: ["st20", "aisi304"], includeEccentric: true });
  assert.ok(results.length > 0);
  for (const row of results) {
    if ([15, 20, 25].includes(row.dnLarge)) assert.equal(row.leftConnection, "threaded");
    if ([15, 20, 25].includes(row.dnSmall)) assert.equal(row.rightConnection, "threaded");
  }
  const small = rows(catalog, { dnFrom: 15, dnTo: 25, materials: ["st20", "aisi304"] });
  assert.equal(small.length, 12);
  assert.ok(small.every(r => r.leftConnection === "threaded" && r.rightConnection === "threaded" && r.dnLarge === r.dnSmall));
  assert.ok(results.some(row => row.dnLarge === 32 && row.dnSmall === 32 && row.leftConnection === "collar"));
  assert.match(calc.insertCatalogMetadata(catalog).connectionNotes.join(" "), /DN15, DN20, DN25.*только в резьбовом/);
});

test("threaded inserts require equal DN, preserve straight mixed ends, exclude both reducer geometries", () => {
  const catalog = fixture();
  catalog.engineering.flangedEndExclusions = structuredClone(adapter.CONFIRMED_INSERT_ENGINEERING.flangedEndExclusions);
  for (const pn of [10, 16, 25]) {
    for (const dn of [25, 50]) {
      catalog.parts.push(part("collar", dn, pn));
      catalog.parts.push(part("threadEnd", dn, pn, { thread: dn === 25 ? '1"' : '2"', threadGender: "male" }));
    }
  }
  const results = rows(catalog, { dnFrom: 25, dnTo: 50, includeEccentric: true });
  for (const row of results) {
    if (row.dnLarge === 25) assert.equal(row.leftConnection, "threaded");
    if (row.dnSmall === 25) assert.equal(row.rightConnection, "threaded");
  }
  for (const pn of [10, 16, 25]) {
    assert.ok(results.some(row => row.dnLarge === 25 && row.pn === pn && row.leftConnection === "threaded" && row.rightConnection === "threaded"));
    assert.ok(results.every(row => row.geometry === "straight" || row.leftConnection !== "threaded" && row.rightConnection !== "threaded"));
    assert.ok(results.some(row => row.dnLarge === 50 && row.dnSmall === 50 && row.pn === pn && [row.leftConnection,row.rightConnection].includes("threaded") && [row.leftConnection,row.rightConnection].includes("flanged")));
  }
  assert.equal(new Set(results.map(row => row.identityKey)).size, results.length);
});

test("legacy explicit pipe-length policy remains readable independently of the new flange clearance rule", () => {
  const result = rows().find(row => row.geometry === "straight" && row.pn === 16);
  assert.equal(result.complete, true, result.warnings.join("; "));
  assert.equal(result.baseLengthMm, 130);
  assert.equal(result.totalLengthMm, 170);
  assert.equal(result.bom.find(row => row.kind === "pipe").quantity, 0.13);
  assert.ok(result.dimensions.some(dimension => dimension.name.includes("минимум") && dimension.value === 129));
  const catalog = fixture(); catalog.engineering.straightLength.basis = "minimum-bolt";
  assert.equal(rows(catalog).find(row => row.geometry === "straight").baseLengthMm, 129);
});

test("reducer uses catalog length only, actual end axial additions and no extending pipe", () => {
  const result = rows().find(row => row.geometry === "concentric");
  assert.equal(result.baseLengthMm, 75); assert.equal(result.totalLengthMm, 115);
  assert.equal(result.bom.filter(row => row.kind === "pipe").length, 0);
  assert.equal(result.bom.find(row => row.kind === "reducer").quantity, 1);
  near(result.weldLengthMm, 2 * Math.PI * (60.3 + 33.7));
  near(result.weldCost, result.weldLengthMm / 1000 * 2400);
  near(result.price, 300 + result.weldCost + 0.075 * 450);
});

test("a supplied length cannot make equal or reversed reducer diameters valid", () => {
  for (const smaller of [60.3, 76.1]) {
    const catalog = fixture();
    for (const reducer of catalog.parts.filter(value => value.kind === "reducer")) reducer.outerDiameterSmall = smaller;
    for (const result of rows(catalog).filter(value => value.geometry === "concentric")) {
      assert.equal(result.baseLengthMm, 75);
      assert.equal(result.complete, false);
      assert.equal(result.price, null);
      assert.ok(result.warnings.some(value => /Недостоверная геометрия перехода/.test(value)));
    }
  }
});

test("both reducer geometries use the larger DN painting tariff and their catalog length only", () => {
  for (const result of rows(fixture(), { includeEccentric: true }).filter(row => row.geometry !== "straight")) {
    const paint = result.bom.find(item => item.kind === "painting");
    assert.equal(result.complete, true, result.warnings.join("; "));
    assert.equal(paint.componentId, "paint-50"); assert.equal(paint.unitPrice, 450);
    assert.equal(paint.quantity, 0.075); assert.equal(paint.cost, 33.75);
    assert.equal(result.totalLengthMm, 115);
    near(result.price, 300 + result.weldCost + 33.75);
  }
});

test("free flanges excluded by confirmed scope, collar contributes one weld per end", () => {
  const catalog = fixture(); catalog.parts = catalog.parts.filter(part => part.kind !== "weldFlange");
  for (const pn of [10, 16, 25]) for (const dn of [25, 50]) catalog.parts.push(part("collar", dn, pn), part("looseFlange", dn, pn, { price: 1e8, thicknessMm: 500 }));
  asStainless(catalog);
  const result = rows(catalog).find(row => row.geometry === "concentric");
  assert.equal(result.complete, true, result.warnings.join("; ")); assert.equal(result.totalLengthMm, 83);
  assert.ok(result.bom.every(row => row.kind !== "looseFlange")); assert.equal(result.welds.length, 2);
  near(result.price, 300 + 2 * Math.PI * (60.3 + 33.7) / 1000 * 5000);
});

test("physical duplicate source rows collapse; inconsistent source prices are blocked", () => {
  const catalog = fixture(), reducer = catalog.parts.find(part => part.kind === "reducer");
  catalog.parts.push({ ...structuredClone(reducer), id: "duplicate-source", name: "Renamed same physical reducer" });
  assert.equal(rows(catalog).length, 6);
  const key = rows(catalog).find(row => row.geometry === "concentric" && row.pn === 10).identityKey;
  catalog.parts.at(-1).price = 200;
  const result = rows(catalog).find(row => row.identityKey === key);
  assert.equal(result.complete, false); assert.equal(result.price, null);
  assert.ok(result.warnings.some(message => message.includes("цены физических дублей")));
});

test("identity distinguishes PN, wall thickness, eccentricity and sensor; price and source IDs do not", () => {
  const catalog = fixture(), initial = rows(catalog);
  assert.equal(new Set(initial.map(row => row.identityKey)).size, initial.length);
  assert.equal(new Set(initial.filter(row => row.geometry === "straight").map(row => row.name)).size, 1);
  catalog.parts.forEach(part => { part.id = `reimport-${part.id}`; part.price *= 2; });
  assert.deepEqual(rows(catalog).map(row => row.identityKey), initial.map(row => row.identityKey));
  assert.ok(rows(fixture(), { withSensorNipple: true }).every(row => !initial.some(previous => previous.identityKey === row.identityKey)));
  catalog.parts.find(part => part.kind === "pipe" && part.dn === 50 && part.pn === 10).wallThickness = 4;
  assert.notEqual(rows(catalog).find(row => row.geometry === "straight" && row.pn === 10).identityKey, initial.find(row => row.geometry === "straight" && row.pn === 10).identityKey);
});

test("missing dimension, price or provenance blocks final price instead of substituting zero", () => {
  for (const field of ["lengthMm", "outerDiameterSmall", "wallThicknessSmall", "price"]) {
    const catalog = fixture(); catalog.parts.find(part => part.id === "concentric-50-25-16")[field] = null;
    const result = rows(catalog).find(row => row.geometry === "concentric" && row.pn === 16);
    assert.equal(result.complete, false, field); assert.equal(result.price, null, field);
    assert.ok(result.warnings.length);
    if (field === "lengthMm") assert.equal(result.totalLengthMm, null);
    if (field === "outerDiameterSmall") assert.equal(result.weldLengthMm, null);
  }
  const catalog = fixture(); catalog.parts.find(part => part.id === "concentric-50-25-16").dimensionSources = {};
  const result = rows(catalog).find(row => row.geometry === "concentric" && row.pn === 16);
  assert.equal(result.complete, false); assert.ok(result.warnings.some(message => message.includes("источника")));
});

test("missing base PN remains a visible incomplete row, never inherited from another size", () => {
  const catalog = fixture(); catalog.parts.find(part => part.id === "concentric-50-25-16").pn = null;
  const result = rows(catalog).find(row => row.geometry === "concentric" && row.pn === null);
  assert.ok(result); assert.equal(result.complete, false); assert.equal(result.price, null);
  assert.ok(result.warnings.some(message => message.includes("Не подтверждён PN")));
  const raw = structuredClone(source);
  const reducer = raw.items.find(item => item.id === "переходы-001-r0006");
  reducer.fields = reducer.fields.filter(field => field.headerPath.at(-1) !== "PN");
  assert.equal(adapter.makeInsertCatalog(raw).parts.find(part => part.id === reducer.id).pn, null);
});

test("standard bolt needs exact SKU and verified minimum; steel reference never applies to stainless", () => {
  for (const mutate of [catalog => { catalog.standardBolts = []; }, catalog => { catalog.standardBolts[0].diameterMm = 8; }, catalog => { catalog.engineering.boltReferences.forEach(ref => { ref.minimumLengthMm = 131; }); }, catalog => { catalog.engineering.boltReferences.forEach(ref => { ref.material = "aisi304"; }); }]) {
    const catalog = fixture(); mutate(catalog);
    assert.ok(rows(catalog).filter(row => row.geometry === "straight").every(row => !row.complete && row.baseLengthMm === null));
  }
});

test("stainless uses its own tariff, and flat flange bore rejects physically oversized base", () => {
  const catalog = fixture(); catalog.parts.forEach(part => { part.material = "aisi304"; }); catalog.materials = ["aisi304"];
  catalog.engineering.endRules.forEach(rule => { rule.material = "aisi304"; }); catalog.engineering.boltReferences.forEach(ref => { ref.material = "aisi304"; });
  let result = rows(catalog, { materials: ["aisi304"] }).find(row => row.geometry === "concentric" && row.pn === 25);
  assert.equal(result.complete, true); near(result.weldCost, 2 * Math.PI * (60.3 + 33.7) / 1000 * 5000);
  catalog.parts.find(part => part.id === "weldFlange-50-25").boreDiameterMm = 60;
  result = rows(catalog, { materials: ["aisi304"] }).find(row => row.geometry === "concentric" && row.pn === 25);
  assert.equal(result.complete, false); assert.ok(result.warnings.some(message => message.includes("не проходит")));
});

test("manufacturer 017W executions remain scoped to PN and mounting, body is not bolt length", () => {
  const engineering = structuredClone(adapter.CONFIRMED_INSERT_ENGINEERING);
  delete engineering.flangeAssembly;
  engineering.straightLength.model = "017W-series";
  const catalog = adapter.makeInsertCatalog(source, engineering), results = rows(catalog, { dnFrom: 100, dnTo: 100 });
  const low = results.find(row => row.geometry === "straight" && row.pn === 16), high = results.find(row => row.geometry === "straight" && row.pn === 25);
  assert.ok(low.dimensions.some(dimension => dimension.name.includes("широкая манжета") && dimension.value === 52));
  assert.ok(high.dimensions.some(dimension => dimension.name.includes("017W.ZS") && dimension.value === 52));
  assert.equal(low.baseLengthMm, null); assert.equal(high.baseLengthMm, null);
  assert.ok(high.warnings.some(message => message.includes("PN25")));
  assert.ok(low.dimensions.some(dimension => dimension.name.includes("Толщина концевой") && dimension.value > 0 && dimension.source.includes("ГОСТ")));
  assert.equal(low.totalLengthMm, null);
});

test("threaded and mixed ends format each end, contribute own axial addition and no flange thickness", () => {
  const catalog = fixture();
  for (const dn of [25, 50]) catalog.parts.push(part("threadEnd", dn, 16, { thread: dn === 50 ? '2"' : '1"', threadGender: "male", lengthMm: 35 }));
  const result = rows(catalog).find(row => row.geometry === "straight" && row.leftConnection === "threaded" && row.rightConnection === "threaded");
  assert.equal(result.name, 'Вставка 2"-2" СТ20'); assert.equal(result.totalLengthMm, 200); assert.equal(result.complete, true, result.warnings.join("; "));
  assert.ok(result.bom.every(row => row.kind !== "weldFlange"));
  assert.ok(rows(catalog).some(row => row.name === 'Вставка Dn50-2" СТ20' || row.name === 'Вставка 2"-Dn50 СТ20'));
  assert.ok(rows(catalog).some(row => row.geometry === "concentric" && row.leftConnection === "flanged" && row.rightConnection === "flanged"), "non-threaded reducers remain available");
  assert.equal(calc.insertName("eccentric", 100, 50, "aisi304", "flanged", "threaded", true, null, '2"'), 'Вставка Э Dn100-2" AISI304 t');
});

test("no threaded nominal size beyond two inches is generated", () => {
  const catalog = fixture(); catalog.nominalDns.push(65);
  catalog.parts.push(part("pipe", 65, 16), part("threadEnd", 65, 16, { thread: '2½"', threadGender: "male" }));
  assert.ok(rows(catalog, { dnFrom: 65, dnTo: 65 }).every(row => row.leftConnection !== "threaded" && row.rightConnection !== "threaded"));
  catalog.parts.push(part("threadEnd", 50, 16, { thread: '4"', threadGender: "male" }));
  assert.ok(rows(catalog).every(row => row.leftConnection !== "threaded" && row.rightConnection !== "threaded"));
});

test("straight mirror ends collapse, including loose-flange variants, while one allowed orientation survives", () => {
  const catalog = fixture(); catalog.parts = [part("pipe", 50), part("collar", 50), part("looseFlange", 50, 16, { thicknessMm: 10 }), part("looseFlange", 50, 16, { id: "loose-other", thicknessMm: 12 })];
  catalog.engineering.looseFlangeInBom.include = true;
  asStainless(catalog);
  assert.equal(rows(catalog).length, 3);
  catalog.parts = [part("pipe", 50), part("weldFlange", 50), part("threadEnd", 50, 16, { thread: '2"', threadGender: "male" })];
  catalog.materials = ["st20"];
  catalog.engineering.connectionPairs = [{ left: "threaded", right: "flanged", source: provenance }];
  assert.equal(rows(catalog).length, 1);
});

test("sensor nipple requires complete execution and compatible priced plug; plug adds no weld", () => {
  const catalog = fixture(); catalog.engineering.sensorNipple = { dn: 15, threadGender: "male", withPlug: true, source: provenance };
  catalog.parts.push(part("nipple", 15, 16, { lengthMm: 110, thread: '1/2"', threadGender: "male", price: 44 }));
  catalog.sensorPlugs = [{ id: "plug", name: "Brass cap", dn: 15, pn: 40, threadGender: "female", physicalIdentity: "FIXTURE:manufacturer-SKU-material-G1/2", price: 56.12, source: provenance }];
  let result = rows(catalog, { withSensorNipple: true }).find(row => row.geometry === "concentric" && row.pn === 16);
  assert.equal(result.complete, true, result.warnings.join("; ")); assert.ok(result.name.endsWith(" t"));
  assert.equal(result.welds.length, 3); assert.equal(result.bom.find(row => row.kind === "plug").cost, 56.12);
  near(result.weldLengthMm, 2 * Math.PI * (60.3 + 33.7) + Math.PI * 21.3);
  catalog.sensorPlugs[0].name = "Display name corrected";
  assert.equal(rows(catalog, { withSensorNipple: true }).find(row => row.geometry === "concentric" && row.pn === 16).identityKey, result.identityKey);
  const beforeLengthChange = result;
  catalog.parts.find(part => part.kind === "nipple").lengthMm = null;
  result = rows(catalog, { withSensorNipple: true }).find(row => row.geometry === "concentric" && row.pn === 16);
  assert.equal(result.complete, true, result.warnings.join("; "));
  assert.equal(result.totalLengthMm, beforeLengthChange.totalLengthMm);
  assert.equal(result.price, beforeLengthChange.price);
  assert.equal(result.weldLengthMm, beforeLengthChange.weldLengthMm);
  assert.equal(result.bom.find(row => row.role === "sensor-nipple").quantity, 1);
  assert.ok(result.dimensions.every(row => !row.name.includes("длина сгона")));
  const lowerPn = rows(catalog, { withSensorNipple: true }).find(row => row.geometry === "concentric" && row.pn === 10);
  assert.equal(lowerPn.complete, true, lowerPn.warnings.join("; "));
  const higherPn = rows(catalog, { withSensorNipple: true }).find(row => row.geometry === "concentric" && row.pn === 25);
  assert.equal(higherPn.complete, false); assert.equal(higherPn.price, null);
  assert.ok(higherPn.warnings.some(reason => /допустимым давлением/.test(reason)));
  catalog.parts.find(part => part.kind === "nipple").thread = '3/4"';
  result = rows(catalog, { withSensorNipple: true }).find(row => row.geometry === "concentric" && row.pn === 16);
  assert.equal(result.complete, false);
  assert.ok(result.bom.every(row => row.role !== "sensor-nipple"));
});

test("sensor nipple and plug require opposite thread genders in both directions", () => {
  for (const [nippleGender, plugGender, label] of [["male", "female", "ВР"], ["female", "male", "НР"]]) {
    const catalog = fixture();
    catalog.engineering.sensorNipple = { dn: 15, threadGender: nippleGender, withPlug: true, source: provenance };
    catalog.parts.push(part("nipple", 15, 16, { lengthMm: 110, thread: '1/2"', threadGender: nippleGender, price: 44 }));
    catalog.sensorPlugs = ["female", "male"].map(threadGender => ({ id: `plug-${threadGender}`, name: `Test cap ${threadGender}`, dn: 15, pn: 40, threadGender, physicalIdentity: `FIXTURE:cap-${threadGender}`, price: 50, source: provenance }));
    let result = concentric16(rows(catalog, { withSensorNipple: true }));
    assert.equal(result.complete, true, result.warnings.join("; "));
    assert.equal(result.bom.find(item => item.kind === "plug").componentId, `plug-${plugGender}`);
    catalog.sensorPlugs = catalog.sensorPlugs.filter(plug => plug.threadGender !== plugGender);
    result = concentric16(rows(catalog, { withSensorNipple: true }));
    assert.equal(result.complete, false); assert.equal(result.price, null);
    assert.ok(result.warnings.some(message => message.includes(`заглушки ${label}`)));
    assert.ok(result.bom.every(item => item.kind !== "plug"));
  }
});

test("axial rule cannot silently apply to distinct physical end variants", () => {
  const catalog = fixture(); catalog.parts.push(part("weldFlange", 50, 16, { id: "flange-other", thicknessMm: 30 }));
  const results = rows(catalog).filter(row => row.geometry === "concentric" && row.pn === 16);
  assert.equal(results.length, 2); assert.ok(results.every(row => !row.complete && row.warnings.some(message => message.includes("Несколько физических исполнений"))));
  for (const part of catalog.parts.filter(part => part.kind === "weldFlange" && part.dn === 50 && part.pn === 16)) catalog.engineering.endRules.push({ connection: "flanged", dn: 50, pn: 16, material: "st20", partIdentity: calc.insertPartIdentity(part), axialAdditionMm: part.thicknessMm ?? 20, source: provenance });
  assert.ok(rows(catalog).filter(row => row.geometry === "concentric" && row.pn === 16).every(row => row.complete));
});

test("real adapter uses actual price label, preserves unknown dimensions, supports all source PN", () => {
  const catalog = adapter.makeInsertCatalog(source);
  const reducer = catalog.parts.find(part => part.id === "переходы-001-r0005");
  assert.equal(reducer.price, 398); assert.equal(reducer.dnSmall, 15);
  // Some exact GOST additions may be supplied by the build, but no fabricated zero is accepted.
  assert.notEqual(reducer.lengthMm, 0);
  assert.equal(catalog.parts.find(part => part.kind === "collar" && part.dn === 15 && part.pn === 10).thicknessMm, 3);
  assert.equal(catalog.parts.find(part => part.kind === "collar" && part.dn === 15 && part.pn === 16).thicknessMm, 3);
  assert.equal(catalog.parts.find(part => part.id === "сгоны-резьба-001-r0005").pn, 16);
  assert.deepEqual(calc.insertCatalogMetadata(catalog).pressures, [10, 16, 25]);
  const bolt = adapter.selectStandardInsertBolt(source, 16, 129);
  assert.equal(bolt.id, "метизы-001-r0027"); assert.equal(bolt.lengthMm, 130);
  assert.equal(adapter.selectStandardInsertBolt(source, 16, 125).lengthMm, 125);
});

test("real source duplicate conflicting price remains one blocked geometry; unmapped smaller DN remains visible", () => {
  const catalog = adapter.makeInsertCatalog(source);
  const results = rows(catalog, { dnFrom: 700, dnTo: 800, materials: ["aisi304", "st20"], includeEccentric: true });
  const duplicate = results.filter(row => row.geometry === "eccentric" && row.dnLarge === 700 && row.dnSmall === 600 && row.pn === 10 && row.material === "aisi304");
  assert.equal(duplicate.length, 1); assert.ok(duplicate[0].warnings.some(message => message.includes("цены физических дублей")));
  const unknown = results.filter(row => row.dnSmall === null);
  assert.ok(unknown.length); assert.ok(unknown.every(row => !row.complete && row.price === null));
});

test("length research explains ambiguity and missing standards only for the reviewed geometry", () => {
  const withoutAdoption = structuredClone(source);
  for (const item of withoutAdoption.items) item.fields = item.fields.filter(field => !field.column.startsWith("CALC_ANALOG_"));
  const catalog = adapter.makeInsertCatalog(withoutAdoption);
  const ambiguous = catalog.parts.find(part => part.id === "переходы-001-r0057");
  assert.equal(ambiguous.lengthMm, null);
  assert.ok(ambiguous.warnings.some(reason => /Проверка длины:.*55.*75/.test(reason)));
  const unsupported = catalog.parts.find(part => part.id === "переходы-001-r0006");
  assert.equal(unsupported.lengthMm, null);
  assert.ok(unsupported.warnings.some(reason => /Проверка длины:.*стенок/.test(reason)));

  const edited = structuredClone(source);
  const item = edited.items.find(item => item.id === unsupported.id);
  item.fields.find(field => field.headerPath.at(-1) === "Толщина 1, мм").value = 3.3;
  assert.equal(adapter.makeInsertCatalog(edited).parts.find(part => part.id === item.id).warnings.some(reason => reason.startsWith("Проверка длины:")), false);
  edited.source.sha256 = "unreviewed-workbook";
  assert.equal(adapter.makeInsertCatalog(edited).parts.find(part => part.id === ambiguous.id).warnings.some(reason => reason.startsWith("Проверка длины:")), false);

  const measured = structuredClone(source), measuredItem = measured.items.find(item => item.id === unsupported.id);
  measuredItem.fields.push({ column: "measured-L", headerPath: ["Длина, мм"], value: 40 }, { column: "measured-source", headerPath: ["Источник длины"], value: "Approved manufacturer drawing, fixture" });
  const actual = adapter.makeInsertCatalog(measured).parts.find(part => part.id === unsupported.id);
  assert.equal(actual.lengthMm, 40);
  assert.equal(actual.warnings.some(reason => reason.startsWith("Проверка длины:")), false);
});

test("confirmed user scope excludes loose flanges and does not invent pressure relay fitting or bolt stack", () => {
  const catalog = adapter.makeInsertCatalog(source);
  assert.equal(catalog.engineering.looseFlangeInBom.include, false);
  assert.equal(catalog.engineering.connectionPairs.length, 9);
  const results = rows(catalog, { dnFrom: 50, dnTo: 50, materials: ["aisi304"] });
  assert.ok(results.every(row => row.bom.every(item => item.kind !== "looseFlange")));
  assert.equal(results.find(row => row.geometry === "straight" && row.pn === 10 && row.leftConnection === "collar" && row.rightConnection === "collar").complete, true);
  assert.ok(results.filter(row => row.geometry === "straight" && row.pn === 16 && row.bom.filter(item => /^(left|right)-collar$/.test(item.role)).length === 2).every(row => row.complete));
  const pn25 = results.filter(row => row.geometry === "straight" && row.pn === 25);
  assert.ok(pn25.some(row => row.complete));
  for (const row of pn25) assert.equal(row.complete, row.bom.filter(item => item.componentId === "newkey-din2503:NK-FDh50-4").length === 2);
  const withNipple = rows(catalog, { dnFrom: 50, dnTo: 50, materials: ["aisi304"], withSensorNipple: true });
  assert.ok(withNipple.some(row => row.pn === 16 && row.complete));
  assert.ok(withNipple.some(row => row.pn === 25 && row.complete));
  assert.ok(withNipple.filter(row => row.pn === 25).every(row => row.assumptions?.some(item => item.code === "sensor-pn25-pressure")));
});

function buttCollarFixture() {
  const catalog = fixture();
  catalog.engineering.collarAssembly = { insertionDepthMm: 0, weldGapMm: 0, source: provenance, weldFactor: 2, weldSource: provenance };
  catalog.engineering.endRules = [];
  catalog.parts = catalog.parts.filter(p => p.kind !== "weldFlange");
  for (const pn of [10,16,25]) for (const dn of [25,50]) catalog.parts.push(part("collar",dn,pn,{ lengthMm: dn===50 ? 23 : 15, thicknessMm: 3 }));
  catalog.parts = catalog.parts.filter(p => p.pn !== 25);
  return asStainless(catalog);
}

test("confirmed butt assembly uses actual collar lengths automatically and preserves the double welding work norm", () => {
  const catalog=buttCollarFixture(), results=rows(catalog,{includeEccentric:true});
  assert.ok(results.every(r=>r.complete),results.flatMap(r=>r.warnings).join('; '));
  const straight=results.find(r=>r.geometry==="straight" && r.pn===16);
  assert.equal(straight.baseLengthMm,130); assert.equal(straight.totalLengthMm,176);
  for (const row of results.filter(r=>r.geometry!=="straight")) {
    assert.equal(row.baseLengthMm,75); assert.equal(row.totalLengthMm,113);
    assert.equal(row.configuration.axialLeftMm,23); assert.equal(row.configuration.axialRightMm,15);
    assert.ok(row.bom.every(p=>!["pipe","looseFlange"].includes(p.kind)));
    assert.deepEqual(row.welds.map(w=>[w.count,w.factor]),[[1,2],[1,2]]);
    near(row.weldLengthMm,2*Math.PI*(60.3+33.7));
    assert.equal(row.dimensions.filter(d=>d.name.includes("Прибавка на сварочный зазор") && d.value===0 && d.source===provenance).length,2);
    assert.equal(row.price,row.bom.reduce((n,p)=>n+p.cost,0));
  }
  assert.ok(!calc.insertCatalogMetadata(catalog).engineeringIssues.some(w=>w.includes("осевые добавки")));
});

test("legacy client seating cannot override the approved butt assembly or create a different identity", () => {
  const catalog=buttCollarFixture(), expected=rows(catalog);
  for (const choice of [{mode:"source"},{mode:"flush"},{mode:"face-offset",valueMm:5},{mode:"insertion-depth",valueMm:12}]) {
    const actual=rows(catalog,{seating:{collar:choice}});
    assert.deepEqual(actual.map(r=>[r.identityKey,r.totalLengthMm,r.price]),expected.map(r=>[r.identityKey,r.totalLengthMm,r.price]));
    assert.ok(actual.every(r=>r.configuration.seating.collar.mode==="insertion-depth" && r.configuration.seating.collar.valueMm===0));
  }
});

test("butt policy does not replace missing collar length, provenance or incompatible tube diameter", () => {
  for (const mutate of [p=>{p.lengthMm=null;},p=>{delete p.dimensionSources.lengthMm;},p=>{p.outerDiameter=57;}]) {
    const catalog=buttCollarFixture(); mutate(catalog.parts.find(p=>p.kind==="collar" && p.dn===50 && p.pn===16));
    const row=rows(catalog).find(r=>r.geometry==="straight" && r.pn===16);
    assert.equal(row.complete,false); assert.equal(row.price,null);
    assert.ok(row.warnings.some(w=>/осевого размера|диаметр воротника/.test(w)));
  }
});

test("mixed connection keeps the flat flange recess and adds the complete butt collar length", () => {
  const catalog=buttCollarFixture();
  catalog.engineering.connectionPairs=[{left:"flanged",right:"collar",source:provenance}];
  catalog.engineering.flangeAssembly={faceOffsetMm:5,clearanceFactor:1.1,fastenerModels:["017W-FIXTURE"],source:provenance};
  catalog.parts.push(part("weldFlange",50,16,{thicknessMm:20,dimensionSources:{...dims,thicknessMm:provenance}}));
  const reducer=catalog.parts.find(p=>p.id==="concentric-50-25-16");
  reducer.cylindricalLengthLargeMm=20; reducer.dimensionSources.cylindricalLengthLargeMm=provenance;
  asBoundaryReducer(catalog);
  const row=rows(catalog,{dnFrom:250,dnTo:250}).find(r=>r.geometry==="concentric" && r.pn===16);
  assert.equal(row.complete,true,row.warnings.join('; '));
  assert.equal(row.totalLengthMm,75+5+15);
  assert.equal(row.configuration.axialLeftMm,5); assert.equal(row.configuration.axialRightMm,15);
});

test("normative length is invalidated when its source revision or exact dimensions change", () => {
  const reference = { id: "переходы-001-r0005", lengthMm: 38 };
  const raw = structuredClone(source), item = raw.items.find(item => item.id === reference.id);
  item.fields = item.fields.filter(field => !["CALC_INSERT_LENGTH_MM", "CALC_INSERT_LENGTH_SOURCE"].includes(field.column));
  item.fields.push({ column: "CALC_INSERT_LENGTH_MM", headerPath: ["Длина, мм"], value: reference.lengthMm }, { column: "CALC_INSERT_LENGTH_SOURCE", headerPath: ["Источник длины"], value: "Temporary text must be replaced by verified standard source" });
  let result = adapter.makeInsertCatalog(raw).parts.find(part => part.id === reference.id);
  assert.equal(result.lengthMm, 38); assert.match(result.dimensionSources.lengthMm, /ГОСТ 17378-2001/);
  raw.source.sha256 = "different-revision";
  result = adapter.makeInsertCatalog(raw).parts.find(part => part.id === reference.id);
  assert.equal(result.lengthMm, null); assert.ok(result.warnings.some(message => message.includes("устарела")));
  raw.source.sha256 = source.source.sha256;
  item.fields.find(field => field.headerPath.at(-1) === "Толщина 1, мм").value = 7;
  result = adapter.makeInsertCatalog(raw).parts.find(part => part.id === reference.id);
  assert.equal(result.lengthMm, null);
});

function seatingFixture() {
  const catalog = fixture();
  for (const component of catalog.parts.filter(part => part.kind === "weldFlange")) {
    component.thicknessMm = 20;
    component.dimensionSources.thicknessMm = provenance;
  }
  for (const component of catalog.parts.filter(part => part.kind === "reducer")) {
    component.cylindricalLengthLargeMm = 30; component.cylindricalLengthSmallMm = 30;
    component.dimensionSources.cylindricalLengthLargeMm = provenance; component.dimensionSources.cylindricalLengthSmallMm = provenance;
  }
  return catalog;
}
const concentric16 = results => results.find(row => row.geometry === "concentric" && row.pn === 16);

test("seating parser validates modes and finite bounded dimensions and retains backward compatibility", () => {
  assert.equal(calc.parseInsertRequest(input()).seating, undefined);
  assert.deepEqual(calc.parseInsertRequest(input({ seating: { flanged: { mode: "flush" } } })).seating, { flanged: { mode: "flush" }, collar: { mode: "source" } });
  for (const seating of [null, [], "flush", { flanged: [] }, { flanged: { mode: "guess" } }, { threaded: { mode: "flush" } },
    ...[-1, 1001, Infinity, NaN, "2", null].map(valueMm => ({ flanged: { mode: "face-offset", valueMm } })),
    { flanged: { mode: "face-offset" } }, { collar: { mode: "insertion-depth" } }]) assert.throws(() => calc.parseInsertRequest(input({ seating })));
  assert.equal(calc.parseInsertRequest(input({ seating: { collar: { mode: "face-offset", valueMm: 1000 } } })).seating.collar.valueMm, 1000);
});

test("explicit flush, face offset and depth calculate actual length and preserve user provenance", () => {
  const catalog = seatingFixture(); catalog.engineering.endRules = [];
  const before = structuredClone(catalog);
  assert.equal(concentric16(rows(catalog)).complete, false);
  for (const [mode, valueMm, expected] of [["flush", undefined, 75], ["face-offset", 2, 79], ["insertion-depth", 5, 105]]) {
    const result = concentric16(rows(catalog, { seating: { flanged: { mode, ...(valueMm === undefined ? {} : { valueMm }) } } }));
    assert.equal(result.complete, true, result.warnings.join("; "));
    assert.equal(result.totalLengthMm, expected);
    assert.equal(result.configuration.seating.flanged.mode, mode);
    assert.ok(result.dimensions.some(dimension => dimension.name.includes("Осевая добавка") && /пользоват/.test(dimension.source)));
  }
  assert.deepEqual(catalog, before, "seating request must not mutate shared engineering rules or catalogue");
});

test("seating methods describing the same physical addition share identity and price", () => {
  const catalog = seatingFixture();
  const results = [
    { flanged: { mode: "flush" } }, { flanged: { mode: "face-offset", valueMm: 0 } }, { flanged: { mode: "insertion-depth", valueMm: 20 } },
  ].map(seating => concentric16(rows(catalog, { seating })));
  assert.equal(new Set(results.map(result => result.identityKey)).size, 1);
  assert.equal(new Set(results.map(result => result.price)).size, 1);
  assert.deepEqual(results.map(result => result.configuration.seating.flanged.mode), ["flush", "face-offset", "insertion-depth"]);
  assert.equal(concentric16(rows(catalog)).identityKey, concentric16(rows(catalog, { seating: { flanged: { mode: "source" }, collar: { mode: "source" } } })).identityKey);
});

test("depth overflow, gap and zero overlap cannot yield a ready welded insert", () => {
  const catalog = seatingFixture();
  for (const [mode, valueMm, reason] of [["insertion-depth", 21, "превышает"], ["face-offset", 21, "зазор"], ["insertion-depth", 0, "Нулевой заход"], ["face-offset", 20, "Нулевой заход"]]) {
    const result = concentric16(rows(catalog, { seating: { flanged: { mode, valueMm } } }));
    assert.equal(result.complete, false); assert.equal(result.price, null);
    assert.ok(result.warnings.some(message => message.includes(reason)));
    if (mode === "insertion-depth" && valueMm === 21) assert.equal(result.totalLengthMm, null);
  }
});

test("unknown flange thickness stays missing even for explicit flush and does not become zero", () => {
  const catalog = seatingFixture(); catalog.parts.find(part => part.id === "weldFlange-50-16").thicknessMm = null;
  const result = concentric16(rows(catalog, { seating: { flanged: { mode: "flush" } } }));
  assert.equal(result.totalLengthMm, 75); assert.equal(result.configuration.axialLeftMm, 0);
  assert.equal(result.complete, false); assert.ok(result.warnings.some(message => message.includes("толщина фланца b")));
});

test("collar depth uses full sourced axial length, never wall or lip thickness, and requires its assembly section", () => {
  const catalog = seatingFixture(); catalog.parts = catalog.parts.filter(part => part.kind !== "weldFlange");
  for (const dn of [25, 50]) catalog.parts.push(part("collar", dn, 16, { thicknessMm: 4, wallThickness: 3 }));
  asStainless(catalog);
  const seating = { collar: { mode: "insertion-depth", valueMm: 5 } };
  let result = concentric16(rows(catalog, { seating }));
  assert.equal(result.totalLengthMm, null); assert.ok(result.warnings.some(message => message.includes("полного осевого размера воротника")));
  catalog.parts.filter(part => part.kind === "collar").forEach(part => { part.lengthMm = 40; part.dimensionSources.lengthMm = provenance; });
  result = concentric16(rows(catalog, { seating }));
  assert.equal(result.totalLengthMm, 145); assert.equal(result.complete, false);
  assert.ok(result.warnings.some(message => message.includes("схемы сечения")));
  const sameGeometry = concentric16(rows(catalog, { seating: { collar: { mode: "face-offset", valueMm: 35 } } }));
  assert.equal(sameGeometry.identityKey, result.identityKey); assert.equal(sameGeometry.complete, false);
  catalog.engineering.endRules.filter(rule => rule.connection === "collar").forEach(rule => { rule.allowsCollarInsertion = true; });
  result = concentric16(rows(catalog, { seating }));
  assert.equal(result.complete, true, result.warnings.join("; "));
  catalog.parts.find(part => part.kind === "collar").dimensionSources.lengthMm = "";
  assert.equal(concentric16(rows(catalog, { seating })).complete, false);
});

test("flange and collar settings are independent; explicit seating cannot remove other missing-data barriers", () => {
  const catalog = seatingFixture();
  catalog.parts = catalog.parts.filter(part => part.kind !== "weldFlange" || part.dn === 50);
  catalog.parts.push(part("collar", 25, 16, { lengthMm: 3 }));
  asBoundaryReducer(catalog);
  let result = concentric16(rows(catalog, { dnFrom: 250, dnTo: 250, seating: { flanged: { mode: "flush" }, collar: { mode: "face-offset", valueMm: 3 } } }));
  assert.equal(result.totalLengthMm, 78); assert.equal(result.complete, true, result.warnings.join("; "));
  catalog.parts.find(part => part.id === "concentric-50-25-16").price = null;
  result = concentric16(rows(catalog, { dnFrom: 250, dnTo: 250, seating: { flanged: { mode: "flush" }, collar: { mode: "face-offset", valueMm: 3 } } }));
  assert.equal(result.complete, false); assert.ok(result.warnings.some(message => message.includes("цены")));
  const other = seatingFixture(); other.parts.find(part => part.id === "weldFlange-50-16").boreDiameterMm = 60.3;
  result = concentric16(rows(other, { seating: { flanged: { mode: "flush" } } }));
  assert.equal(result.complete, false); assert.ok(result.warnings.some(message => message.includes("посадочный зазор и допуски")));
});

test("reducer insertion checks sourced cylindrical ends through full depth, including sourced seating rules", () => {
  const catalog = seatingFixture(), reducer = catalog.parts.find(part => part.id === "concentric-50-25-16");
  reducer.cylindricalLengthSmallMm = null;
  let result = concentric16(rows(catalog, { seating: { flanged: { mode: "face-offset", valueMm: 2 } } }));
  assert.equal(result.complete, false); assert.ok(result.warnings.some(message => message.includes("нет подтверждённой длины цилиндрического")));
  reducer.cylindricalLengthSmallMm = 10;
  result = concentric16(rows(catalog, { seating: { flanged: { mode: "face-offset", valueMm: 2 } } }));
  assert.equal(result.complete, false); assert.ok(result.warnings.some(message => message.includes("превышает подтверждённую длину цилиндрического")));
  catalog.engineering.endRules.forEach(rule => { rule.axialAdditionMm = 2; });
  result = concentric16(rows(catalog));
  assert.equal(result.complete, false, "source rule must not bypass reducer profile check");
  reducer.cylindricalLengthSmallMm = 18;
  result = concentric16(rows(catalog));
  assert.equal(result.complete, true, result.warnings.join("; "));
  reducer.dimensionSources.cylindricalLengthSmallMm = "";
  assert.equal(concentric16(rows(catalog)).complete, false);
});

test("without an adopted assembly policy DN80 to DN65 cannot claim flange fit solely from its terminal diameter", () => {
  const catalog = adapter.makeInsertCatalog(source);
  delete catalog.engineering.reducerReadyBoreSeating;
  for (const choice of [{ mode: "flush" }, { mode: "face-offset", valueMm: 2 }]) {
    const result = rows(catalog, { dnFrom: 80, dnTo: 80, includeEccentric: true, seating: { flanged: choice } }).find(row => row.geometry === "eccentric" && row.dnSmall === 65 && row.pn === 10);
    assert.ok(result); assert.equal(result.baseLengthMm, 75); assert.equal(result.complete, false); assert.equal(result.price, null);
    assert.ok(result.warnings.some(message => message.includes("профиля по КД изготовителя")));
  }
});

test("ready insert thread ends never replace collector sensor sgons", async () => {
  const {makeCollectorCatalog}=await loadTs(new URL('../app/collector-catalog.ts',import.meta.url));
  const actual=makeCollectorCatalog(source);
  const previous=makeCollectorCatalog({...source,items:source.items.filter(i=>!i.id.startsWith('thread-end:'))});
  assert.deepEqual(actual,previous);
});
