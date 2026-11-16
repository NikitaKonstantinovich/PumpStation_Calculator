import type { ComponentItem } from "../component-database-types";
import { positive, nonnegative, type PriceAnchor, type PriceResult, type FrameVariant } from "./types";
export const FRAME_LENGTHS=Array.from({length:15},(_,i)=>600+i*100);
export function frameAnchors(items:ComponentItem[]):PriceAnchor[] {
 return items.flatMap(item=>{
  if(item.catalogId!=="рама"||item.fields.some(f=>f.column==="FRAME_VARIANT"))return [];
  const name=String(item.fields.find(f=>/^(Название|Наименование)$/.test(f.headerPath.at(-1)??""))?.value??"");
  const match=name.match(/(?:400|410)[хx×](\d+)[хx×]([345])(?:\D|$)/i);
  const price=item.prices.find(p=>p.currency==="RUB"&&nonnegative(p.amount));
  return match&&price?[{id:item.id,lengthMm:Number(match[1]),thicknessMm:Number(match[2]),priceRub:price.amount}]:[];
 });
}
function lengthPrice(length:number,thickness:number,anchors:PriceAnchor[]):{value:number;method:string;anchors:PriceAnchor[]}|null {
 const rows=anchors.filter(a=>a.thicknessMm===thickness&&positive(a.lengthMm)&&nonnegative(a.priceRub)).sort((a,b)=>a.lengthMm-b.lengthMm);
 if(new Set(rows.map(a=>a.lengthMm)).size!==rows.length)throw Error("Повторяются опорные длины цен рам; выберите актуальный источник");
 const exact=rows.find(a=>a.lengthMm===length); if(exact)return {value:exact.priceRub,method:"source",anchors:[exact]};
 if(rows.length<2)return null;
 let end=rows.findIndex(a=>a.lengthMm>length); if(end<0)end=rows.length-1; if(end===0)end=1;
 const [a,b]=[rows[end-1],rows[end]];
 return {value:a.priceRub+(b.priceRub-a.priceRub)*(length-a.lengthMm)/(b.lengthMm-a.lengthMm),method:length<a.lengthMm||length>b.lengthMm?"extrapolation":"interpolation",anchors:[a,b]};
}
export function framePrice(length:number,thickness:number,anchors:PriceAnchor[],approved:boolean):PriceResult {
 if(!FRAME_LENGTHS.includes(length)||![3,4,5].includes(thickness))throw Error("Размер рамы вне стандартного ряда");
 let p=lengthPrice(length,thickness,anchors);
 if(!p&&thickness===4){const a=lengthPrice(length,3,anchors),b=lengthPrice(length,5,anchors);if(a&&b)p={value:(a.value+b.value)/2,method:`thickness-interpolation/${a.method}/${b.method}`,anchors:[...a.anchors,...b.anchors]};}
 return {value:p&&nonnegative(p.value)?Math.round(p.value*100)/100:null,method:p?.method??"missing",anchors:p?.anchors??[],sourceWidthMm:400,targetWidthMm:410,transferApproved:approved,rule:"piecewise-linear-length-and-thickness-v1"};
}
export function frameVariants(anchors:PriceAnchor[],approved:boolean):FrameVariant[] {
 return FRAME_LENGTHS.flatMap(lengthMm=>([3,4,5] as const).flatMap(thicknessMm=>(["blue","red"] as const).map(color=>({id:`bent-frame-410-${lengthMm}-${thicknessMm}-${color}`,lengthMm,thicknessMm,widthMm:410,color,price:framePrice(lengthMm,thicknessMm,anchors,approved),massKg:null}))));
}
export const supportCount=(length:number):number=>!FRAME_LENGTHS.includes(length)?0:length<=800?4:length<=1300?6:8;
