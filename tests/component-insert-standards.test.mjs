import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";

const standards = JSON.parse(await readFile(new URL("../data/component-insert-standards.json", import.meta.url), "utf8"));
const binding = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const field = (item, name) => item.fields.find(value => value.headerPath.at(-1) === name)?.value;
const { selectStandardFlatFlangeDimensions } = await loadTs(new URL("../app/component-insert-standards.ts", import.meta.url));

test("sourced reducer lengths agree with independent dimensional rows of GOST 17378", () => {
  // Independently transcribed anchors span both executions and multiple PDF pages.
  const expected = { 5: 38, 14: 51, 23: 64, 32: 76, 41: 89, 56: 75, 71: 100,
    77: 130, 95: 140, 98: 180, 102: 178, 104: 140, 107: 180, 114: 220, 132: 300 };
  for (const [row, length] of Object.entries(expected)) {
    const id = `переходы-001-r${row.padStart(4, "0")}`;
    assert.equal(standards.reducerLengths.find(value => value.componentId === id)?.lengthMm, length, id);
  }
});

test("reducer supplements retain exact geometry and separate native steel standards from adopted stainless geometry", () => {
  assert.equal(standards.sourceSha256, binding.source.sha256);
  assert.equal(new Set(standards.reducerLengths.map(value => value.componentId)).size, standards.reducerLengths.length);
  for (const value of standards.reducerLengths) {
    const item = binding.items.find(item => item.id === value.componentId);
    assert.ok(item, value.componentId);
    if (value.material === "st20") {
      assert.equal(value.basis, "catalog-standard");
      assert.match(String(field(item, "Наименование")), /ГОСТ\s*17378/);
    } else {
      assert.equal(value.material, "aisi304");
      assert.equal(value.basis, "adopted-standard-geometry");
      assert.equal(value.adoptionId, standards.reducerLengthPolicy.id);
      assert.match(value.source, /проектная длина.*материал AISI304 и PN остаются исходными/);
    }
    for (const [key, header] of [["outerDiameter", "Диаметр, мм"], ["outerDiameterSmall", "Диаметр меньший, мм"],
      ["wallThickness", "Толщина 1, мм"], ["wallThicknessSmall", "Толщина 2, мм"]]) {
      assert.equal(value[key], field(item, header), `${value.componentId}: ${key}`);
    }
    assert.match(value.source, /таблица [12], исполнение [12].*PDF стр\. \d+; https:/);
  }
});

test("ambiguous GOST reducer lengths and hybrid dimensions are never populated", () => {
  for (const row of [57, 58]) {
    const id = `переходы-001-r${String(row).padStart(4, "0")}`;
    assert.deepEqual(standards.conflicts.find(value => value.componentId === id)?.lengthsMm, [55, 75]);
    assert.equal(standards.reducerLengths.some(value => value.componentId === id), false);
  }
  // DN20 T=2.3 is absent; DN100 combines D=108 with execution-1 wall thickness.
  for (const row of [6, 12, 59, 60, 61, 62, 63, 64, 65, 66, 67]) {
    assert.equal(standards.reducerLengths.some(value => value.componentId === `переходы-001-r${String(row).padStart(4, "0")}`), false);
  }
});

test("length verification covers every original reducer; supplemental ST20 executions have their own evidence", async () => {
  const allReducers = binding.items.filter(item => item.catalogId === "переходы" && typeof field(item, "Диаметр, мм") === "number");
  const supplement = JSON.parse(await readFile(new URL("../data/st20-concentric-reducers.json", import.meta.url), "utf8"));
  const added = allReducers.filter(item => item.tableId === supplement.id);
  assert.deepEqual(added.map(item => item.id).sort(), supplement.rows.map(row => row.id).sort());
  assert.equal(added.length, 162);
  const reducers = allReducers.filter(item => item.tableId !== supplement.id);
  const reviews = standards.reducerLengthReviews;
  assert.equal(reducers.length, 486);
  assert.equal(reviews.length, reducers.length);
  assert.equal(new Set(reviews.map(value => value.componentId)).size, reviews.length);
  const counts = {};
  for (const review of reviews) {
    const item = reducers.find(value => value.id === review.componentId);
    assert.ok(item, review.componentId);
    assert.equal(review.material, /AISI304/.test(item.family) ? "aisi304" : "st20");
    assert.equal(review.geometry, /эксцентр/.test(item.family) ? "eccentric" : "concentric");
    for (const [key, header] of [["outerDiameter", "Диаметр, мм"], ["outerDiameterSmall", "Диаметр меньший, мм"],
      ["wallThickness", "Толщина 1, мм"], ["wallThicknessSmall", "Толщина 2, мм"]]) {
      assert.equal(review[key], field(item, header), `${review.componentId}: ${key}`);
    }
    assert.ok(review.reason.length > 30);
    assert.match(review.source, /https:\/\//);
    assert.ok(["2026-10-04", "2026-10-05"].includes(review.verifiedAt));
    counts[review.status] = (counts[review.status] ?? 0) + 1;
    const numeric = standards.reducerLengths.find(value => value.componentId === review.componentId);
    if (review.status === "confirmed") {
      assert.deepEqual(review.candidateLengthsMm, [numeric.lengthMm]);
    } else {
      assert.equal(numeric, undefined, `${review.componentId}: unconfirmed options must not supply an actual length`);
    }
  }
  assert.deepEqual(counts, { confirmed: 251, unconfirmed: 221, ambiguous: 2, invalid: 12 });
  assert.deepEqual(standards.reducerLengthReviewSummary.statuses, counts);
});

test("ambiguous lengths retain both standard options while invalid reducer diameters stay blocked", () => {
  for (const row of [57, 58]) {
    const review = standards.reducerLengthReviews.find(value => value.componentId === `переходы-001-r${String(row).padStart(4, "0")}`);
    assert.equal(review.status, "ambiguous");
    assert.deepEqual(review.candidateLengthsMm, [55, 75]);
    assert.match(review.reason, /55.*75/);
  }
  const invalid = standards.reducerLengthReviews.filter(value => value.status === "invalid");
  assert.equal(invalid.length, 12);
  for (const review of invalid) {
    assert.equal(review.outerDiameter, review.outerDiameterSmall);
    assert.deepEqual(review.candidateLengthsMm, []);
  }
});

test("adopted GOST stainless lengths require both walls and a unique verified geometry", () => {
  const reviews = standards.reducerLengthReviews.filter(value => value.material === "aisi304");
  const confirmed = reviews.filter(value => value.status === "confirmed");
  assert.equal(confirmed.length, 182);
  assert.equal(standards.reducerLengthReviewSummary.adoptedStainlessLengths, 182);
  for (const review of confirmed) {
    const reference = standards.reducerLengths.find(value => value.componentId === review.componentId);
    const groups = standards.referenceGroups.filter(group => group.outerDiameter === review.outerDiameter && group.outerDiameterSmall === review.outerDiameterSmall
      && group.wallPairs.some(([large, small]) => large === review.wallThickness && small === review.wallThicknessSmall));
    assert.deepEqual([...new Set(groups.map(group => group.lengthMm))], [reference.lengthMm]);
    assert.equal(reference.adoptionId, standards.reducerLengthPolicy.id);
  }
  const anchors = { 170: 38, 215: 89, 224: 102, 233: 127, 242: 140, 251: 152, 261: 178, 273: 203 };
  for (const [row, length] of Object.entries(anchors)) {
    for (const [table, offset] of [["003", 0], ["005", 165]]) {
      assert.equal(standards.reducerLengths.find(value => value.componentId === `переходы-${table}-r${String(Number(row) + offset).padStart(4, "0")}`).lengthMm, length);
    }
  }
  // The 2.3/2.3 walls are not interchangeable with the 2/2 GOST row.
  assert.deepEqual(reviews.find(value => value.componentId === "переходы-003-r0170").candidateLengthsMm, [38]);
  assert.deepEqual(reviews.find(value => value.componentId === "переходы-003-r0171").candidateLengthsMm, []);
  // A short 304L cone is not silently accepted as the catalogue's AISI304 item.
  const concentric = reviews.find(value => value.componentId === "переходы-005-r0335");
  assert.deepEqual(concentric.candidateLengthsMm, [38]);
  assert.match(concentric.reason, /проектная длина.*ГОСТ 17378/);
});

test("flat-flange table keeps full thickness, bore and radial chamfer distinct from assembly length", () => {
  const expected = [
    [15, 10, 12, 19, 2], [25, 16, 18, 33, 3], [50, 25, 24, 59, 3],
    [65, 16, 24, 78, 4], [100, 16, 26, 110, 4], [125, 25, 30, 135, 4],
    [150, 10, 24, 161, 4], [250, 16, 31, 273, 6], [350, 25, 42, 377, 7],
    [500, 16, 48, 530, 7], [600, 25, 54, 630, 7], [800, 25, 68, 820, 9],
  ];
  for (const [dn, pn, b, bore, chamfer] of expected) {
    const dimensions = selectStandardFlatFlangeDimensions({ name: `Фланец плоский ${dn}-${pn}-01-1-B-Ст.20-IV`, dn, pn, material: "st20", sourceSha256: standards.sourceSha256 });
    assert.ok(dimensions);
    assert.deepEqual([dimensions.thicknessMm, dimensions.boreDiameterMm, dimensions.radialChamferMm], [b, bore, chamfer]);
    assert.equal(Object.hasOwn(dimensions, "axialAdditionMm"), false);
    assert.match(dimensions.source, /таблица 3.*PDF стр\. \d+; https:/);
  }
});

test("flange dimensions require matching material, code, DN, PN and verified catalog revision", () => {
  const input = { name: "Фланец плоский 100-16-01-1-B-Ст.20-IV", dn: 100, pn: 16, material: "st20", sourceSha256: standards.sourceSha256 };
  assert.ok(selectStandardFlatFlangeDimensions(input));
  for (const patch of [{ material: "aisi304" }, { dn: 125 }, { pn: 25 }, { sourceSha256: "changed" },
    { name: input.name.replace("01-1", "11-1") }, { name: input.name.replace("01-1", "01-2") },
    { name: input.name.replace("-B-", "-A-") }, { name: `${input.name}-dв116` }]) {
    assert.equal(selectStandardFlatFlangeDimensions({ ...input, ...patch }), null);
  }
  const currentSteelFlanges = binding.items.filter(item => item.catalogId === "фланцы" && item.family === "Фланец плоский Сталь 20");
  assert.ok(currentSteelFlanges.length > 0);
  for (const item of currentSteelFlanges) {
    const name = field(item, "Наименование"), designation = name.match(/(\d+)-(\d+)-01-1/);
    if (!designation || Number(designation[1]) > 800) continue;
    assert.ok(selectStandardFlatFlangeDimensions({ ...input, name, dn: Number(designation[1]), pn: Number(designation[2]) }), item.id);
  }
});
