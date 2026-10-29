import { load, json } from "./station-specification.mjs";
export const { makeInsertCatalog } = await load("component-insert-catalog");
export const { generateInsertCalculations } = await load("component-insert-calculations");
export const { insertionDesign, selectStationInsertion } = await load("station-insertion-selection");
export const source = await json("public/component-insert-source.json");
export const catalog = makeInsertCatalog(source);
export const calculations = generateInsertCalculations({ dnFrom: 50, dnTo: 100, materials: ["st20", "aisi304"], withSensorNipple: false, includeEccentric: true }, catalog);
export function component(c, id = "test-saved", patch = {}) {
  return { id: `calculated-insertion:${id}`, catalogId: "ответные-части", family: c.name,
    fields: Object.entries({ DN: c.dnLarge, PN: c.pn, Материал: c.material === "st20" ? "Ст20" : "AISI304" }).map(([column, value]) => ({ column, headerPath: [column], value })),
    prices: c.price === null ? [] : [{ label: "Цена, ₽/шт", amount: c.price, currency: "RUB" }],
    calculatedInsertion: { version: 1, id, identityKey: c.identityKey, revision: 1, catalogVersion: c.catalogVersion, currentCatalogVersion: c.catalogVersion, pricedAt: "2026-10-28", calculation: structuredClone(c), ...patch } };
}
export function requirement(c, reverse = false, purpose = "after-vibration") {
  return { location: "discharge:primary-after-vibration-insertion", purpose, material: c.material, pn: c.pn, geometry: c.geometry,
    from: { dn: reverse ? c.dnSmall : c.dnLarge, connection: reverse ? c.rightConnection : c.leftConnection },
    to: { dn: reverse ? c.dnLarge : c.dnSmall, connection: reverse ? c.leftConnection : c.rightConnection }, design: insertionDesign(c) };
}
