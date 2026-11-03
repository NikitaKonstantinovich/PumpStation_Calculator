import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { EMPTY_PUMP_FILTERS, matchesPumpFilters, pumpFilterOptions, changePumpFilter } = await loadTs(new URL("../app/pump-filters.ts", import.meta.url));
const rows = [
  { type: "vertical_multistage", manufacturer: "CNP", series: "CDM" },
  { type: "vertical_multistage", manufacturer: "LEO", series: "LVR" },
  { type: "inline", manufacturer: "CNP", series: "TD" },
  { type: "inline", manufacturer: "ONIS", series: "TD" },
  { type: "end_suction", manufacturer: "LEO", series: "XST" },
];

test("spacing rows use the same multi-value predicates as pump selection", () => {
  const spacingRows = rows.map((row, i) => ({ ...row, id: String(i), spacing: i % 2 ? null : 600 }));
  const filters = { type: ["vertical_multistage", "inline"], manufacturer: ["CNP", "LEO"], series: ["CDM", "LVR", "TD"] };
  assert.deepEqual(spacingRows.filter(row => matchesPumpFilters(row, filters)).map(row => row.id), ["0", "1", "2"]);
  assert.deepEqual(spacingRows.filter(row => matchesPumpFilters(row, { ...filters, series: ["TD"] })).map(row => row.id), ["2"]);
  assert.equal(spacingRows.filter(row => matchesPumpFilters(row, EMPTY_PUMP_FILTERS)).length, rows.length);
});

test("dependent options combine all selected types and manufacturers and deduplicate shared series", () => {
  const filters = { type: ["inline", "vertical_multistage"], manufacturer: ["CNP", "ONIS"], series: [] };
  const options = pumpFilterOptions(rows, filters);
  assert.equal(options.type.length, 3);
  assert.deepEqual(options.manufacturer, ["CNP", "LEO", "ONIS"]);
  assert.deepEqual(options.series, ["CDM", "TD"]);
  assert.deepEqual(pumpFilterOptions(rows, { ...filters, type: ["end_suction"], manufacturer: [] }).series, ["XST"]);
});

test("changing a parent keeps compatible selections and removes only unavailable children", () => {
  const original = { type: [], manufacturer: ["CNP", "LEO", "ONIS"], series: ["CDM", "TD", "XST"] };
  const snapshot = structuredClone(original);
  const changedType = changePumpFilter(rows, original, "type", ["vertical_multistage", "end_suction"]);
  assert.deepEqual(changedType, { type: ["vertical_multistage", "end_suction"], manufacturer: ["CNP", "LEO"], series: ["CDM", "XST"] });
  const changedManufacturer = changePumpFilter(rows, changedType, "manufacturer", ["LEO"]);
  assert.deepEqual(changedManufacturer.series, ["XST"]);
  const allManufacturers = changePumpFilter(rows, changedManufacturer, "manufacturer", []);
  assert.deepEqual(allManufacturers.series, ["XST"]);
  assert.deepEqual(pumpFilterOptions(rows, allManufacturers).series, ["CDM", "LVR", "XST"]);
  assert.deepEqual(original, snapshot);
});
