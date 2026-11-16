import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
const { emptyInsertFilters, filterInsertRows, selectInsertRows, insertSelectionCounts } = await loadTs(new URL("../app/component-calculator-selection.ts", import.meta.url));
const rows = Array.from({ length: 80 }, (_, index) => ({ identityKey: `row-${index}`, name: `Вставка ${index % 2 ? "Э " : ""}Dn100-Dn80 AISI304${index % 3 ? "" : " t"}`, dnLarge: 100, dnSmall: 80, material: "aisi304", pn: index < 60 ? 16 : 25, geometry: index % 2 ? "eccentric" : "concentric", withSensorNipple: index % 3 === 0, isNew: index % 4 === 0, exportable: index !== 0 }));

test("bulk selection includes all filtered pages and preserves hidden selections", () => {
  const filtered = filterInsertRows(rows, { ...emptyInsertFilters, pn: "16" });
  const selected = selectInsertRows(new Set(["row-70"]), filtered, "all");
  assert.equal(selected.size, 60); // 59 eligible rows, plus hidden selection.
  assert.ok(selected.has("row-59"));
  assert.ok(!selected.has("row-0"));
  assert.deepEqual(insertSelectionCounts(selected, filtered), { total: 60, visible: 59, hidden: 1 });
  assert.deepEqual([...selectInsertRows(selected, filtered, "none")], ["row-70"]);
});

test("select new adds only eligible new rows without discarding prior selections", () => {
  const selected = selectInsertRows(new Set(["row-3", "row-75"]), filterInsertRows(rows, { ...emptyInsertFilters, pn: "16" }), "new");
  assert.equal(selected.size, 16);
  assert.ok(selected.has("row-56"));
  assert.ok(!selected.has("row-60"));
  assert.ok(!selected.has("row-0"));
  assert.ok(selected.has("row-3"));
  assert.ok(selected.has("row-75"));
});

test("all filter fields combine, Cyrillic search is case insensitive", () => {
  const filter = { query: "  ВСТАВКА Э  ", dnLarge: "100", dnSmall: "80", pn: "25", material: "aisi304", geometry: "eccentric", nipple: "yes", status: "existing" };
  assert.deepEqual(filterInsertRows(rows, filter).map(row => row.identityKey), ["row-63", "row-69", "row-75"]);
  assert.equal(filterInsertRows(rows, { ...filter, material: "st20" }).length, 0);
  assert.equal(filterInsertRows(rows, { ...filter, status: "new" }).length, 0);
});

test("clearing an empty filter result cannot clear hidden selections", () => {
  const selected = new Set(["row-1", "row-79"]);
  const filtered = filterInsertRows(rows, { ...emptyInsertFilters, dnSmall: "50" });
  assert.deepEqual(selectInsertRows(selected, filtered, "none"), selected);
  assert.deepEqual(insertSelectionCounts(selected, filtered), { total: 2, visible: 0, hidden: 2 });
});
