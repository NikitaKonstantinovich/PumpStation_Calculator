import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mergeReducerDimensions, INSERT_LENGTH_COLUMN, INSERT_LENGTH_SOURCE_COLUMN, INSERT_LENGTH_REVIEW_COLUMNS } from "../scripts/reducer-dimensions-supplement.mjs";

const source = { source: { sha256: "fixture" }, items: [{
  id: "reducer-fixture", catalogId: "переходы", family: "Переход концентрический Сталь 20 ГОСТ 17378",
  fields: [["D", "Диаметр, мм", 60.3], ["E", "Диаметр меньший, мм", 48.3], ["F", "Толщина 1, мм", 2.9], ["G", "Толщина 2, мм", 2.6]].map(([column, label, value]) => ({ column, headerPath: [label], value })),
  prices: [{ amount: 100, currency: "RUB", label: "Цена, ₽/шт" }],
}] };
const standards = { sourceSha256: "fixture", reducerLengths: [{ componentId: "reducer-fixture", material: "st20", outerDiameter: 60.3, outerDiameterSmall: 48.3, wallThickness: 2.9, wallThicknessSmall: 2.6, lengthMm: 76, source: "Explicit fixture standard reference" }] };
const review = patch => ({ ...standards.reducerLengths[0], geometry: "concentric", status: "confirmed", candidateLengthsMm: [76], reason: "Exact dimensions and specified execution confirmed.", verifiedAt: "2026-10-04", ...patch });
const reviewed = patch => ({ ...standards, reducerLengthReviews: [review(patch)] });
const value = (data, column) => data.items[0].fields.find(field => field.column === column)?.value;

test("general catalogue gains verified lengths and sources idempotently without replacing prices", () => {
  const result = mergeReducerDimensions(source, standards);
  assert.equal(result.items[0].fields.find(field => field.column === INSERT_LENGTH_COLUMN).value, 76);
  assert.equal(result.items[0].fields.find(field => field.column === INSERT_LENGTH_SOURCE_COLUMN).value, standards.reducerLengths[0].source);
  assert.deepEqual(result.items[0].prices, source.items[0].prices);
  assert.deepEqual(mergeReducerDimensions(result, standards), result);
  assert.equal(source.items[0].fields.length, 4);
});

test("different workbook/material/wall/diameter cannot inherit sourced lengths; original lengths stay intact", () => {
  for (const patch of [{ material: "aisi304" }, { wallThickness: 3 }, { outerDiameterSmall: 42.4 }]) {
    assert.equal(mergeReducerDimensions(source, { ...standards, reducerLengths: [{ ...standards.reducerLengths[0], ...patch }] }).items[0].fields.length, 4);
  }
  const enriched = mergeReducerDimensions(source, standards);
  enriched.source.sha256 = "changed";
  assert.deepEqual(mergeReducerDimensions(enriched, standards), enriched);
  const withLength = structuredClone(source);
  withLength.items[0].fields.push({ column: "user-length", headerPath: ["Длина, мм"], value: 90 });
  assert.deepEqual(mergeReducerDimensions(withLength, standards), withLength);
});

test("confirmed reviews persist source, options, date and reason without duplicating fields", () => {
  const result = mergeReducerDimensions(source, reviewed());
  assert.equal(value(result, INSERT_LENGTH_REVIEW_COLUMNS.status), "confirmed");
  assert.equal(value(result, INSERT_LENGTH_REVIEW_COLUMNS.options), "[76]");
  assert.equal(value(result, INSERT_LENGTH_REVIEW_COLUMNS.source), review().source);
  assert.equal(value(result, INSERT_LENGTH_REVIEW_COLUMNS.checkedAt), "2026-10-04");
  assert.equal(value(result, INSERT_LENGTH_REVIEW_COLUMNS.reason), review().reason);
  assert.deepEqual(mergeReducerDimensions(result, reviewed()), result);
});

test("ambiguous and unconfirmed reviews revoke only managed lengths and never choose an alternative", () => {
  const enriched = mergeReducerDimensions(source, reviewed());
  for (const patch of [{ status: "ambiguous", candidateLengthsMm: [75, 55] }, { status: "unconfirmed", candidateLengthsMm: [] }, { status: "invalid", candidateLengthsMm: [] }]) {
    const references = { ...reviewed(patch), reducerLengths: [] };
    const result = mergeReducerDimensions(enriched, references);
    assert.equal(value(result, INSERT_LENGTH_COLUMN), undefined);
    assert.equal(value(result, INSERT_LENGTH_SOURCE_COLUMN), undefined);
    assert.equal(value(result, INSERT_LENGTH_REVIEW_COLUMNS.status), patch.status);
    assert.equal(value(result, INSERT_LENGTH_REVIEW_COLUMNS.options), JSON.stringify([...patch.candidateLengthsMm].sort((a, b) => a - b)));
    assert.deepEqual(result.items[0].prices, source.items[0].prices);
    assert.deepEqual(mergeReducerDimensions(result, references), result);
  }
});

test("reviews cannot revoke old managed lengths outside their exact source, material, geometry and dimension scope", () => {
  const enriched = mergeReducerDimensions(source, reviewed());
  for (const patch of [{ material: "aisi304" }, { geometry: "eccentric" }, { outerDiameter: 61 }, { outerDiameterSmall: 49 }, { wallThickness: 3 }, { wallThicknessSmall: 3 }]) {
    const references = { ...reviewed({ ...patch, status: "unconfirmed", candidateLengthsMm: [] }), reducerLengths: [] };
    assert.deepEqual(mergeReducerDimensions(enriched, references), enriched);
  }
  assert.deepEqual(mergeReducerDimensions(enriched, { ...reviewed(), sourceSha256: "another" }), enriched);
});

test("existing native lengths and their sources survive review; conflicting values do not retain confirmed status", () => {
  const input = mergeReducerDimensions(source, reviewed());
  input.items[0].fields.push({ column: "native-L", headerPath: ["Длина перехода, мм"], value: 90 }, { column: "native-source", headerPath: ["Источник длины"], value: "User drawing" });
  const result = mergeReducerDimensions(input, reviewed());
  assert.equal(value(result, "native-L"), 90);
  assert.equal(value(result, "native-source"), "User drawing");
  assert.equal(value(result, INSERT_LENGTH_COLUMN), undefined);
  assert.equal(value(result, INSERT_LENGTH_SOURCE_COLUMN), undefined);
  assert.equal(value(result, INSERT_LENGTH_REVIEW_COLUMNS.status), "invalid");
  assert.match(value(result, INSERT_LENGTH_REVIEW_COLUMNS.reason), /90 мм.*Требуется уточнение/);
  assert.deepEqual(mergeReducerDimensions(result, reviewed()), result);
  input.items[0].fields.find(field => field.column === "native-L").value = 76;
  assert.equal(value(mergeReducerDimensions(input, reviewed()), INSERT_LENGTH_REVIEW_COLUMNS.status), "confirmed");
});

test("malformed, duplicate and contradictory reviews are rejected before supplementing a catalogue", () => {
  for (const patch of [{ status: "invented" }, { status: "ambiguous", candidateLengthsMm: [76] }, { candidateLengthsMm: [0] }, { candidateLengthsMm: [76, 76] }, { material: "brass" }, { verifiedAt: "yesterday" }, { source: "" }, { wallThicknessSmall: 0 }, { candidateLengthsMm: [80] }, { outerDiameter: 63 }]) {
    assert.throws(() => mergeReducerDimensions(source, reviewed(patch)), /Invalid|contradicts/);
  }
  assert.throws(() => mergeReducerDimensions(source, { ...reviewed(), reducerLengths: [] }), /lacks verified length/);
  assert.throws(() => mergeReducerDimensions(source, { ...reviewed(), reducerLengthReviews: [review(), review()] }), /duplicate/);
});

test("stainless numeric length needs an explicit matching standard and geometry already in the catalogue", () => {
  const input = structuredClone(source);
  input.items[0].family = "Переход концентрический AISI304";
  const reference = { ...standards.reducerLengths[0], material: "aisi304", geometry: "concentric", standard: "DIN 2616-1" };
  const references = { ...standards, reducerLengths: [reference], reducerLengthReviews: [review({ material: "aisi304" })] };
  const noStandard = mergeReducerDimensions(input, references);
  assert.equal(value(noStandard, INSERT_LENGTH_COLUMN), undefined);
  assert.equal(value(noStandard, INSERT_LENGTH_REVIEW_COLUMNS.status), "invalid");
  input.items[0].fields.push({ column: "native-standard", headerPath: ["Стандарт"], value: "DIN 2616-1" });
  assert.equal(value(mergeReducerDimensions(input, references), INSERT_LENGTH_COLUMN), 76);
  const wrongStandard = { ...references, reducerLengths: [{ ...reference, standard: "ГОСТ 17378-2001" }] };
  assert.equal(value(mergeReducerDimensions(input, wrongStandard), INSERT_LENGTH_COLUMN), undefined);
  input.items[0].family = "Переход эксцентрический AISI304";
  assert.deepEqual(mergeReducerDimensions(input, references), input);
});

test("an explicitly adopted GOST geometry supplies stainless L without claiming a native material standard", () => {
  const input = structuredClone(source);
  input.items[0].family = "Переход концентрический AISI304";
  const policy = { id: "fixture-approved-geometry", standard: "ГОСТ 17378-2001", materials: ["aisi304"], source: "Explicit fixture instruction" };
  const reference = { ...standards.reducerLengths[0], material: "aisi304", geometry: "concentric", standard: policy.standard, execution: 1, basis: "adopted-standard-geometry", adoptionId: policy.id };
  const references = { ...standards, reducerLengths: [reference], reducerLengthPolicy: policy,
    referenceGroups: [{ execution: 1, outerDiameter: 60.3, outerDiameterSmall: 48.3, lengthMm: 76, wallPairs: [[2.9, 2.6]] }],
    reducerLengthReviews: [review({ material: "aisi304" })] };
  const result = mergeReducerDimensions(input, references);
  assert.equal(value(result, INSERT_LENGTH_COLUMN), 76);
  assert.equal(value(result, INSERT_LENGTH_REVIEW_COLUMNS.status), "confirmed");
  assert.equal(result.items[0].family, input.items[0].family);
  assert.equal(result.items[0].fields.some(field => field.headerPath.at(-1) === "Стандарт"), false);
  assert.deepEqual(result.items[0].prices, input.items[0].prices);
  assert.deepEqual(mergeReducerDimensions(result, references), result);
  assert.throws(() => mergeReducerDimensions(input, { ...references, reducerLengthPolicy: undefined }), /Invalid adopted/);
  assert.throws(() => mergeReducerDimensions(input, { ...references, referenceGroups: [] }), /Invalid adopted/);
  const differentWall = structuredClone(references);
  differentWall.referenceGroups[0].wallPairs[0][1] = 3.2;
  assert.throws(() => mergeReducerDimensions(input, differentWall), /Invalid adopted/);
});

test("production reducer supplement contains only exact sourced matches of the original catalogue", async () => {
  const data = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
  const references = JSON.parse(await readFile(new URL("../data/component-insert-standards.json", import.meta.url), "utf8"));
  const result = mergeReducerDimensions(data, references), byId = new Map(result.items.map(item => [item.id, item]));
  assert.ok(references.reducerLengths.length > 0);
  assert.equal(references.reducerLengthReviews.length, 486);
  assert.equal(new Set(references.reducerLengths.map(row => row.componentId)).size, references.reducerLengths.length);
  for (const reference of references.reducerLengths) {
    assert.match(reference.source, /ГОСТ|https:/);
    const field = byId.get(reference.componentId).fields.find(field => field.column === INSERT_LENGTH_COLUMN);
    assert.equal(field?.value, reference.lengthMm, reference.componentId);
  }
  for (const review of references.reducerLengthReviews) {
    const item = byId.get(review.componentId);
    assert.equal(item.fields.find(field => field.column === INSERT_LENGTH_REVIEW_COLUMNS.status)?.value, review.status, review.componentId);
    assert.equal(item.fields.find(field => field.column === INSERT_LENGTH_REVIEW_COLUMNS.options)?.value, JSON.stringify([...review.candidateLengthsMm].sort((a, b) => a - b)), review.componentId);
    if (review.status !== "confirmed") assert.equal(item.fields.find(field => field.column === INSERT_LENGTH_COLUMN), undefined, review.componentId);
    assert.deepEqual(item.prices, data.items.find(original => original.id === review.componentId).prices);
  }
  assert.deepEqual(mergeReducerDimensions(result, references), result);
});
