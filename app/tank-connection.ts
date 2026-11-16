import type { AssemblyComponent } from "./suction-catalog";
import pricing from "../data/tank-valve-pricing.json";

export const TANK_LAYOUT_REVISION = "tank-dn20-valve-8l-v3";
export const TANK_PRICE_REVISION = `tank-valve-price-${pricing.checkedOn}-v1`;
export const TANK_PUMP_GAP_MM = 200;
export const tankConnectionDn = () => 20;
export const TANK_ADAPTER_20_25_ID = "резьбовые-фитинги-002-r0227";
export const TANK_VALVE_20_ID = "tank-ld-pride-dn20-drain";
const estimatedPrice = Math.round(pricing.offers.reduce((sum, offer) => sum + offer.priceRub, 0) / pricing.offers.length * 100) / 100;
const priceSource = `${pricing.basis} ${pricing.method} Проверено ${pricing.checkedOn}: ${pricing.offers.map(offer => `${offer.seller} — ${offer.priceRub} ₽/шт. (${offer.kind}); ${offer.url}`).join("; ")}. Принято ${estimatedPrice} ₽/шт.`;
/** User-approved cost estimate by a functional DN20 analogue. This does not
 * confirm an LD article or replace the user's native CAD model. */
export const tankValve20: AssemblyComponent = {
  id: TANK_VALVE_20_ID, catalogId: "шаровые-краны", tableId: "tank-valves-user-2026-11-01",
  family: "Кран LD Pride DN20 PN40 ВР/ВР с дренажем и воздухоотводчиком",
  sourceSheet: "Изображения пользователя 01.11.2026", sourceRow: 1,
  prices: [{label:`Цена ориентировочная по аналогу, ₽/шт. (${pricing.checkedOn})`,amount:estimatedPrice,currency:pricing.currency}],
  fields: [{column:"DN",headerPath:["DN"],value:20},{column:"PN",headerPath:["PN"],value:40},
    {column:"THREAD",headerPath:["Присоединительная резьба"],value:"G3/4"},
    {column:"SOURCE",headerPath:["Источник"],value:"Equipment/Valves/3D/Шаровые/Ld_pride_44_20_40Pn Б с воздухоотводчиком.SLDPRT"},
    {column:"ARTICLE_REVIEW",headerPath:["Подтверждение артикула"],value:"не подтвержден"},
    {column:"PRICE_SOURCE",headerPath:["Источник цены"],value:priceSource}],
};
