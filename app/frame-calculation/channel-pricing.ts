import type { ComponentItem } from "../component-database-types";
import { componentField } from "./components";
import { nonnegative } from "./types";

/** Catalogue prices include tonnes, kilograms and metres in the same row.
 * Cut lengths must use the explicitly labelled metre price, never the first price. */
export function channelMetrePrice(items:ComponentItem[],profileName:string) {
 const matches=items.filter(item=>item.catalogId==="металл"&&
  String(componentField(item,"Наименование")??"").trim().toLowerCase()==="швеллер"&&
  String(componentField(item,"Марка")??"").trim().toUpperCase()===profileName.toUpperCase());
 const item=matches.length===1?matches[0]:undefined;
 const prices=item?.prices.filter(p=>p.currency==="RUB"&&nonnegative(p.amount)&&
  /^цена\s+(?:за\s+)?(?:1\s+)?м(?:\s|,|$)/i.test(p.label.split("/").at(-1)?.trim()??""))??[];
 const price=prices.length===1?prices[0]:undefined;
 return {componentId:item?.id,rateRubM:price?.amount??null,
  source:price?`Каталог «Металл», ${item!.id}; ${price.label}: ${price.amount} ₽/м`:
   `Каталог «Металл»: нет однозначной цены за метр швеллера ${profileName} в рублях`};
}
