import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { suctionCatalogItems, insertionPrices } = await loadTs(new URL("../app/suction-catalog.ts", import.meta.url));
const { isLegacyNomenclature, markLegacyNomenclature, routeNomenclature,
  LEGACY_NOMENCLATURE_CATALOG_ID, LEGACY_NOMENCLATURE_LABEL, NOMENCLATURE_STATUS_COLUMN } = await loadTs(new URL("../app/component-nomenclature.ts", import.meta.url));

test("only seven historical inserts move to old nomenclature, keeping IDs, names, pressures and prices", () => {
  const legacy = suctionCatalogItems.filter(isLegacyNomenclature);
  assert.equal(legacy.length, 7);
  assert.deepEqual(insertionPrices, { 65: 4140, 80: 4140, 100: 4140, 125: 8000, 150: 16000, 200: 32000, 250: 50000 });
  assert.deepEqual(legacy.map(item => item.id), [65, 80, 100, 125, 150, 200, 250].map(dn => `suction-table:ff-${dn}`));
  for (const item of legacy) {
    const dn = Number(item.id.split("-").at(-1));
    assert.equal(item.catalogId, LEGACY_NOMENCLATURE_CATALOG_ID);
    assert.equal(item.family, `Вставка ФФ DN${dn}–${dn}`);
    assert.deepEqual(item.prices, [{ label: "Цена из таблицы, ₽", amount: insertionPrices[dn], currency: "RUB" }]);
    assert.equal(item.fields.find(field => field.column === "PN").value, "PN16");
    assert.equal(item.fields.find(field => field.column === NOMENCLATURE_STATUS_COLUMN).value, LEGACY_NOMENCLATURE_LABEL);
    assert.deepEqual(markLegacyNomenclature(item), item);
  }
  const other = suctionCatalogItems.filter(item => !isLegacyNomenclature(item));
  assert.equal(other.length, 9);
  assert.ok(other.every(item => item.catalogId === "ответные-части" && !item.id.includes(":ff-")));
});

test("catalogue routing depends on explicit classification, not an old name or directory alone", () => {
  const current = { id: "unknown", catalogId: "ответные-части", family: LEGACY_NOMENCLATURE_LABEL,
    fields: [{ column: "note", headerPath: ["Описание"], value: LEGACY_NOMENCLATURE_LABEL }], prices: [{ amount: 123 }] };
  assert.equal(isLegacyNomenclature(current), false);
  assert.equal(routeNomenclature(current), current);
  assert.equal(isLegacyNomenclature({ ...current, catalogId: LEGACY_NOMENCLATURE_CATALOG_ID }), false);
  const marked = markLegacyNomenclature(current);
  const imported = { ...marked, catalogId: "ответные-части" };
  assert.equal(routeNomenclature(imported).catalogId, LEGACY_NOMENCLATURE_CATALOG_ID);
  assert.equal(routeNomenclature(imported).id, current.id);
  assert.deepEqual(routeNomenclature(imported).prices, current.prices);
  assert.equal(imported.catalogId, "ответные-части");
});
