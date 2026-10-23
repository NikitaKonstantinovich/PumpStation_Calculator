import { suctionCatalogItems, type AssemblyComponent } from "./suction-catalog";
import { componentPressureLimit } from "./suction-pressure";
import { field } from "./line-spec-parts";

// The table prices only the insertion body. Material and length need explicit evidence.
export function selectLineInsertion(items: AssemblyComponent[], dn: number, pn: number, material: "st20" | "aisi304") {
  const part = [...items, ...suctionCatalogItems].find(item => item.id === `suction-table:ff-${dn}`);
  const rating = componentPressureLimit(part)?.bar;
  const requested = material === "aisi304" ? "AISI 304" : "Ст20";
  if (!part || !rating || rating < pn) return { description: `В таблице вставок нет исполнения DN${dn} PN${pn} · ${requested}. Исполнение, длину и цену уточнить.` };
  const text = String(field(part, /^Материал$/i) ?? "");
  const actual = /AISI\s*304/i.test(text) ? "aisi304" : /(?:сталь|ст)\s*20/i.test(text) ? "st20" : null;
  if (text && actual !== material) return { description: `Материал вставки в таблице (${text}) не соответствует ${requested}. Исполнение и цену уточнить.` };
  return { item: part, description: actual ? `База комплектующих: ${part.id}; фланцы отдельно.` : `Материал вставки в таблице не указан: применимость к ${requested} и длину уточнить. Цена тела вставки из таблицы; фланцы отдельно.`, status: actual ? undefined : "clarify" as const };
}
