import type { BindingCatalog } from "./collector-catalog";

export type PipePaintingRate = { id: string; dn: number; material: "st20"; pricePerMeter: number | null; source: string; warnings: string[] };
export type InsertPaintingRate = PipePaintingRate;

export function readPipePaintingRates(data: BindingCatalog): PipePaintingRate[] {
  return data.items.filter(item => item.catalogId === "работы" && item.tableId === "pipe-painting-st20-v1").map(item => {
    const value = (column: string) => item.fields.find(field => field.column === column)?.value;
    const dn = Number(value("DN")), warnings: string[] = [];
    const prices = item.prices.filter(price => price.currency === "RUB" && price.sourceColumn === "PAINTING_PRICE");
    const price = prices.length === 1 ? prices[0].amount : null;
    if (!Number.isInteger(dn) || dn <= 0) warnings.push("Не подтверждён DN тарифа окраски");
    if (value("PRICE_UNIT") !== "м") warnings.push(`Не подтверждена единица цены окраски DN${dn}: требуется ₽/м`);
    if (value("MATERIAL") !== "СТ20") warnings.push(`Не подтверждён материал тарифа окраски DN${dn}`);
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) warnings.push(`Нет однозначной положительной цены окраски DN${dn}, ₽/м`);
    const source = [value("SOURCE"), value("MAPPING"), value("METHOD"), value("FORMULA")].filter(Boolean).join("; ");
    if (typeof value("SOURCE") !== "string" || !String(value("SOURCE")).trim()) warnings.push(`Нет источника тарифа окраски DN${dn}`);
    return { id: item.id, dn, material: "st20", pricePerMeter: warnings.length ? null : price, source, warnings };
  });
}

export const readInsertPaintingRates = readPipePaintingRates;
