import type { AssemblyComponent } from "./suction-catalog";

export const TANK_LAYOUT_REVISION = "tank-dn20-valve-8l-v3";
export const TANK_COLLECTOR_OFFSET_MM = 200;
export const TANK_PUMP_GAP_MM = 200;
export const tankConnectionDn = () => 20;
export const TANK_ADAPTER_20_25_ID = "резьбовые-фитинги-002-r0227";
export const TANK_VALVE_20_ID = "tank-ld-pride-dn20-drain";
/** User's pictured DN20 valve has a native CAD source, but no confirmed price
 * in the purchased catalogue. Do not borrow the generic lever-valve price. */
export const tankValve20: AssemblyComponent = {
  id: TANK_VALVE_20_ID, catalogId: "шаровые-краны", tableId: "tank-valves-user-2026-11-01",
  family: "Кран LD Pride DN20 PN40 ВР/ВР с дренажем и воздухоотводчиком",
  sourceSheet: "Изображения пользователя 01.11.2026", sourceRow: 1, prices: [],
  fields: [{column:"DN",headerPath:["DN"],value:20},{column:"PN",headerPath:["PN"],value:40},
    {column:"THREAD",headerPath:["Присоединительная резьба"],value:"G3/4"},
    {column:"SOURCE",headerPath:["Источник"],value:"Equipment/Valves/3D/Шаровые/Ld_pride_44_20_40Pn Б с воздухоотводчиком.SLDPRT; цена и точный артикул требуют подтверждения"}],
};
