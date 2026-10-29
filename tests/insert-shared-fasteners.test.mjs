import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { selectJointFasteners, lineSpecParts } = await loadTs(new URL("../app/line-spec-parts.ts", import.meta.url));
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const { generateInsertCalculations } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const calculate = (data = source, patch = {}) => generateInsertCalculations({ dnFrom: 100, dnTo: 100, materials: ["st20"], withSensorNipple: false, includeEccentric: false,
  ...patch }, makeInsertCatalog(data));
const dimension = (row, name) => row.dimensions.find(dimension => dimension.name === name)?.value;
const checkStack = (dn, pn) => {
  const selected = selectJointFasteners(source, "st20", dn, pn, true);
  return { gaskets: 2, thickness: selected.reference.wafer010CLength, fastener: "stud", source: selected.reference.checkValveSource };
};

test("insert and line hardware select the same valve bolt and check-valve stud for every DN, PN and material", () => {
  const catalog = makeInsertCatalog(source);
  for (const reference of catalog.engineering.boltReferences.filter(ref => !ref.endPartId)) {
    const stack = reference.model === "010C-line-spec" ? checkStack(reference.dn, reference.pn) : true;
    const selected = selectJointFasteners(source, reference.material, reference.dn, reference.pn, stack);
    const line = [];
    lineSpecParts(line, "suction", "fixture", { material: reference.material }, source, { components: [] })
      .fasteners("valve", reference.dn, reference.pn, 1, stack);
    const bolt = line.find(row => row.assemblyRole === (stack === true ? "valve-bolts" : "valve-studs"));
    assert.equal(reference.componentId, bolt.equipmentId ?? null);
    assert.equal(reference.minimumLengthMm, selected.length);
    assert.equal(reference.standardLengthMm, selected.standardLength);
    assert.equal(bolt.quantity, selected.reference.holes);
  }
});

test("DN100 flange clearance uses full selected check-valve studs, 1.1 and actual pipe overlaps", () => {
  const rows = calculate().filter(row => row.geometry === "straight");
  for (const [pn, bolt, stud, gap, pipe, total] of [[10, 125, 155, 170.5, 204.5, 214.5], [16, 130, 165, 181.5, 223.5, 233.5], [25, 140, 175, 192.5, 238.5, 248.5]]) {
    const row = rows.find(row => row.pn === pn);
    assert.equal(row.complete, true, row.warnings.join("; "));
    assert.equal(row.baseLengthMm, pipe);
    assert.equal(row.totalLengthMm, total);
    assert.equal(row.bom.find(part => part.kind === "pipe").quantity, pipe / 1000);
    assert.equal(dimension(row, `017W DN100 PN${pn}: полная длина выбранного крепежа`), bolt);
    assert.equal(dimension(row, `010C DN100 PN${pn}: полная длина выбранного крепежа`), stud);
    assert.equal(dimension(row, "Минимальный внутренний зазор между фланцами"), gap);
    assert.equal(dimension(row, "Фактический внутренний зазор между фланцами"), gap);
    assert.equal(row.configuration.axialLeftMm, 5);
    assert.equal(row.configuration.axialRightMm, 5);
    assert.equal(row.price, row.bom.reduce((sum, item) => sum + item.cost, 0));
    assert.ok(row.bom.every(part => !["bolt", "nut", "washer"].includes(part.kind)));
  }
});

test("large nuts and washers are not zeroed and an absent standard bolt stays incomplete", () => {
  const selected = selectJointFasteners(source, "st20", 500, 25, true);
  assert.equal(selected.diameter, 33);
  assert.equal(selected.nutWidth, 26);
  assert.equal(selected.washerWidth, 5);
  assert.equal(selected.length, 271);
  assert.equal(selected.standardLength, null);
  const row = calculate(source, { dnFrom: 500, dnTo: 500 }).find(row => row.geometry === "straight" && row.pn === 25);
  assert.equal(row.baseLengthMm, null);
  assert.equal(row.price, null);
  assert.ok(row.warnings.some(reason => /М33.*271/.test(reason)));
});

test("a missing nut or unsupported material stack cannot acquire a steel bolt length", () => {
  const missingNut = structuredClone(source);
  missingNut.items = missingNut.items.filter(item => !(item.catalogId === "метизы" && /^Гайка /.test(String(item.fields.find(field => field.headerPath.at(-1) === "Наименование")?.value))));
  const row = calculate(missingNut).find(row => row.geometry === "straight" && row.pn === 16);
  assert.equal(row.baseLengthMm, null);
  assert.ok(row.warnings.some(reason => /размера гайки М16/.test(reason)));
  const missingFlange=structuredClone(source);
  missingFlange.items.find(item=>item.id==="фланцы-006-r0118").fields=missingFlange.items.find(item=>item.id==="фланцы-006-r0118").fields.filter(field=>field.column!=="CALC_FLANGE_B");
  const stainless = calculate(missingFlange, { materials: ["aisi304"] }).find(row => row.geometry === "straight" && row.pn === 16);
  assert.equal(stainless.baseLengthMm, null);
  assert.ok(stainless.warnings.some(reason => /толщины фланцев AISI304/.test(reason)));
  assert.equal(selectJointFasteners(source, "st20", 25, 16, true).length, null);
});

test("the maximum can be controlled by the valve bolt and changes physical identity and cost", () => {
  const changed = structuredClone(source);
  const hypotheticalBolt = structuredClone(selectJointFasteners(changed, "st20", 100, 16, true).bolt);
  hypotheticalBolt.id = "TEST-ONLY-bolt-m16x180";
  hypotheticalBolt.fields.find(field => field.headerPath.at(-1) === "Наименование").value = "Болт М16х180 TEST ONLY";
  hypotheticalBolt.fields.find(field => field.headerPath.at(-1) === "Длина болта, мм").value = 180;
  changed.items.push(hypotheticalBolt);
  changed.items = changed.items.filter(item => {
    const fields = Object.fromEntries(item.fields.filter(field => field.headerPath.length).map(field => [field.headerPath.at(-1), field.value]));
    return !(/^Болт /.test(fields.Наименование ?? "") && fields["Диаметр резьбы, мм"] === 16 && fields["Длина болта, мм"] < 180);
  });
  const next = selectJointFasteners(changed, "st20", 100, 16, true);
  const row = calculate(changed).find(row => row.geometry === "straight" && row.pn === 16);
  assert.equal(next.standardLength, 180);
  assert.equal(row.baseLengthMm, 240);
  assert.equal(row.totalLengthMm, 250);
  assert.equal(dimension(row, "Фактический внутренний зазор между фланцами"), 198);
  const previous = calculate().find(row => row.geometry === "straight" && row.pn === 16);
  assert.notEqual(row.identityKey, previous.identityKey);
  assert.ok(row.price > previous.price);
});

test("a missing check-valve stud cannot be ignored just because the valve has a bolt", () => {
  const data = structuredClone(source);
  data.items = data.items.filter(item => !item.fields.some(field => field.headerPath.at(-1) === "Наименование" && /^Шпилька /.test(String(field.value))));
  const row = calculate(data).find(row => row.geometry === "straight" && row.pn === 16);
  assert.equal(row.baseLengthMm, null);
  assert.equal(row.price, null);
  assert.ok(row.warnings.some(reason => /шпильки М16.*162/.test(reason)));
});

test("confirmed 5 mm recess cannot be overridden by an old client seating choice", () => {
  const previous = calculate().find(row => row.geometry === "straight" && row.pn === 16);
  for (const choice of [{ mode: "flush" }, { mode: "face-offset", valueMm: 2 }, { mode: "insertion-depth", valueMm: 26 }]) {
    const row = calculate(source, { seating: { flanged: choice } }).find(row => row.geometry === "straight" && row.pn === 16);
    assert.equal(row.identityKey, previous.identityKey);
    assert.deepEqual(row.configuration.seating.flanged, { mode: "face-offset", valueMm: 5 });
  }
});

test("pump reducer ignores valve lengths at both DN while keeping bore-fit validation", () => {
  const catalog = makeInsertCatalog(source);
  delete catalog.engineering.reducerExtension;
  const reducer = catalog.parts.find(part => part.kind === "reducer" && part.material === "st20" && part.dn === 300 && part.dnSmall === 250 && part.pn === 16 && part.lengthMm);
  assert.ok(reducer);
  // Isolate the axial-clearance rule from the independent missing profile data.
  Object.assign(reducer, { cylindricalLengthLargeMm: 50, cylindricalLengthSmallMm: 50 });
  Object.assign(reducer.dimensionSources, { cylindricalLengthLargeMm: "TEST measured profile", cylindricalLengthSmallMm: "TEST measured profile" });
  const request = { dnFrom: 300, dnTo: 300, materials: ["st20"], withSensorNipple: false, includeEccentric: true };
  const row = generateInsertCalculations(request, catalog).find(row => row.bom.some(item => item.componentId === reducer.id));
  assert.equal(row.baseLengthMm, reducer.lengthMm);
  assert.equal(row.totalLengthMm, reducer.lengthMm + 10);
  assert.equal(row.bom.filter(item => item.kind === "pipe").length, 0);
  assert.equal(row.price, null);
  assert.ok(row.warnings.every(reason => !/Недостаточный внутренний зазор/.test(reason)));
  assert.equal(dimension(row, "Фактический внутренний зазор между фланцами"), undefined); // b300=32, b250=31, two recesses=10
  const smallerCheck = catalog.engineering.boltReferences.find(ref => ref.model === "010C-line-spec" && ref.dn === 250 && ref.pn === 16 && ref.material === "st20" && ref.endPartId);
  catalog.standardBolts.push({ id: "TEST-ONLY-long-stud", diameterMm: smallerCheck.threadDiameterMm, lengthMm: 400, source: "TEST ONLY" });
  Object.assign(smallerCheck, { componentId: "TEST-ONLY-long-stud", standardLengthMm: 400 });
  const longer = generateInsertCalculations(request, catalog).find(row => row.bom.some(item => item.componentId === reducer.id));
  assert.equal(dimension(longer, "Минимальный внутренний зазор между фланцами"), undefined);
  assert.equal(longer.identityKey, row.identityKey);
  // A different manufactured reducer retains its own catalogue length.
  reducer.lengthMm = 493;
  reducer.dimensionSources.lengthMm = "TEST manufactured reducer, not GOST catalogue data";
  const boundary = generateInsertCalculations(request, catalog).find(row => row.bom.some(item => item.componentId === reducer.id));
  assert.ok(boundary.warnings.every(reason => !reason.includes("Недостаточный внутренний зазор")));
  assert.equal(dimension(boundary, "Фактический внутренний зазор между фланцами"), undefined);
  // A sufficient axial gap cannot override the independent bore-fit constraint.
  assert.ok(boundary.warnings.some(reason => reason.includes("диаметральный посадочный зазор")));
  assert.ok(boundary.machining.some(operation => operation.targetBoreMm === null));
  assert.equal(boundary.totalLengthMm, 503);
  assert.equal(boundary.bom.filter(item => item.kind === "pipe").length, 0);
});

test("missing sourced flange thickness does not produce an exportable clearance calculation", () => {
  const catalog = makeInsertCatalog(source);
  for (const part of catalog.parts.filter(part => part.kind === "weldFlange" && part.dn === 100)) delete part.dimensionSources.thicknessMm;
  const row = generateInsertCalculations({ dnFrom: 100, dnTo: 100, materials: ["st20"], withSensorNipple: false, includeEccentric: false }, catalog).find(row => row.geometry === "straight" && row.pn === 16);
  assert.equal(row.baseLengthMm, null);
  assert.equal(row.price, null);
  assert.ok(row.warnings.some(reason => /толщин обоих фланцев/.test(reason)));
});
