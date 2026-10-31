import { suctionCatalogItems, type AssemblyComponent } from "./suction-catalog";
import { componentPressureLimit } from "./suction-pressure";
import { field, itemDn, number } from "./line-spec-parts";
import type { CollectorCatalog, CollectorConfiguration } from "./collector-calculations";

export const PUMP_LINE_RULES_REVISION = "pump-connections-v4-side-geometry-fire-sensor";

/** The same exact reducer selection serves both sides and both vibration modes. */
export function selectLineReducer(items: AssemblyComponent[], catalog: CollectorCatalog, material: CollectorConfiguration["material"], pumpDn: number, valveDn: number, pn: number, geometry: "concentric" | "eccentric" = "eccentric") {
  const outer = (dn: number) => catalog.components.find(item => item.kind === "pipe" && item.dn === dn && item.material === material)?.outerDiameter;
  const largeDn = Math.max(valveDn, pumpDn), smallDn = Math.min(valveDn, pumpDn);
  const large = outer(largeDn), small = outer(smallDn);
  const execution = geometry === "concentric" ? /концентр/i : /эксцентр/i;
  return items.find(item => item.catalogId === "переходы" && execution.test(item.family) && itemDn(item) === largeDn && number(field(item, /^PN$/i)) === pn &&
    (material === "aisi304" ? /AISI\s*304/i : /Сталь\s*20/i).test(item.family) && large !== undefined && small !== undefined &&
    number(field(item, /^Диаметр, мм$/i)) === large && number(field(item, /^Диаметр меньший, мм$/i)) === small);
}

// The table prices only the insertion body. Material and length need explicit evidence.
export function selectLineInsertion(items: AssemblyComponent[], dn: number, pn: number, material: "st20" | "aisi304") {
  const part = [...items, ...suctionCatalogItems].find(item => item.id === `suction-table:ff-${dn}`);
  const rating = componentPressureLimit(part)?.bar;
  const requested = material === "aisi304" ? "AISI 304" : "Ст20";
  if (!part || !rating || rating < pn) return { description: `В таблице вставок нет исполнения DN${dn} PN${pn} · ${requested}. Исполнение, длину и цену уточнить.` };
  const text = String(field(part, /^Материал$/i) ?? "");
  const actual = /AISI\s*304/i.test(text) ? "aisi304" : /(?:сталь|ст)\s*20/i.test(text) ? "st20" : null;
  if (text && actual !== material) return { description: `Материал вставки в таблице (${text}) не соответствует ${requested}. Исполнение и цену уточнить.` };
  return { item: part, description: actual ? `Предварительная цена тела: ${part.id}; длина и комплектность не подтверждены; фланцы отдельно.` : `Материал вставки в таблице не указан: применимость к ${requested} и длину уточнить. Цена тела вставки из таблицы; фланцы отдельно.`, status: "clarify" as const };
}
