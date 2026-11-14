import type { ComponentItem } from "../component-database-types";
import type { Part, Mounting } from "./types";
import { nonnegative, positive } from "./types";
export const componentField = (item:ComponentItem|undefined,key:string) => item?.fields.find(f=>f.column===key||f.headerPath.at(-1)===key)?.value;
export const numeric = (value:unknown):number|null => {
  if(value===null||value===undefined||value==="")return null;
  const n=typeof value==="number"?value:Number(String(value).replace(/\s/g,"").replace(",","."));
  return Number.isFinite(n)?n:null;
};
export const componentMass = (item:ComponentItem|undefined,unit="шт.") => {
  const perMetre=["м","м.","м.п.","м.п"].includes(unit.trim());
  // These are actual catalogue headers. Do not mix piece and linear masses,
  // or substitute an unconfirmed CAD mass / one of several actuator variants.
  const keys=perMetre?["Масса 1 м, кг","Масса, кг/м","Вес 1 кг/метр"]:["Масса, кг","Вес, кг","Масса по каталогу, кг","weightKg"];
  return numeric(keys.map(key=>componentField(item,key)).find(value=>value!==undefined&&value!==null));
};
export function componentPrice(item:ComponentItem|undefined):number|null {
  const prices=item?.prices.filter(p=>p.currency==="RUB"&&nonnegative(p.amount))??[];
  const single=prices.find(p=>/(?:\/|за\s*)\s*(?:1\s*)?шт/i.test(p.label));if(single)return single.amount;
  const explicit=prices.find(p=>!/100|1000|упак|кг/.test(p.label));if(explicit)return explicit.amount;
  const bulk=prices.find(p=>/\/\s*100\s*шт/.test(p.label));return bulk?bulk.amount/100:null;
}
const name=(c:ComponentItem)=>String(componentField(c,"Наименование")??componentField(c,"Название")??c.family);
const normalize=(s:string)=>s.toLowerCase().replace(/ё/g,"е").replace(/[×x]/g,"х").replace(/\s+/g," ").trim();
export function bindFramePart(p:Part,items:ComponentItem[]):Part {
  if(p.componentId)return p;
  // An incomplete pump bolt/rivet must not accidentally bind by diameter
  // alone. The mounting-specific selector owns its length and grip range.
  if(p.role==="pump-bolts"||p.role==="pump-rivets")return p;
  const requested=normalize(p.name),thread=requested.match(/м(\d+)(?:х(\d+))?/);
  const kind=/^болт /.test(requested)?"bolt":/^гайка-заклепка/.test(requested)?"rivet":/^шайба /.test(requested)?"washer":/^гровер /.test(requested)?"spring":/^гайка /.test(requested)?"nut":null;
  const patterns={bolt:/^болт /,rivet:/заклепк.*резьб|гайка.?заклепк/,washer:/^шайба (?!пружин)/,spring:/гровер|шайба пружин/,nut:/^гайка (?!заклеп)/};
  const matches=items.filter(c=>{
    if(componentField(c,"FRAME_PUMP_FASTENER")===true)return false;
    const n=normalize(name(c));if(n===requested)return true;
    if(!kind||!thread||!patterns[kind].test(n))return false;
    const size=n.match(/м(\d+)(?:х(\d+))?/);
    // DIN washer names commonly omit «М». Use the catalogue's nominal thread,
    // not the bore diameter (e.g. an M8 washer has a larger clearance hole).
    const nominal=numeric(componentField(c,"Диаметр резьбы, мм"));
    if(nominal!==null&&size&&nominal!==Number(size[1]))return false;
    return (nominal??(size?Number(size[1]):null))===Number(thread[1])&&(!thread[2]||size?.[2]===thread[2]);
  });
  if(matches.length!==1)return p;
  const c=matches[0];return {...p,componentId:c.id,name:name(c),unitMassKg:componentMass(c),unitPriceRub:componentPrice(c),source:["Каталог комплектующих: "+c.id,componentField(c,"Источник цены")].filter(Boolean).join("; ")};
}
type Rivet = {verified:boolean;source:string;threadMm:number;gripMinMm:number;gripMaxMm:number;headThicknessMm:number;minEngagementMm?:number;maxEngagementMm?:number|null;installedProjectionMm?:number;holeDiameterMm?:number;headDiameterMm?:number};
/** Grip and engagement come from the exact rivet specification, never from thread diameter. */
export function pumpFasteners(m:Mounting|null,thickness:number,count:number,id:string,items:ComponentItem[]):{parts:Part[];issue?:string} {
  const make=(suffix:string,label:string):Part=>({id:`frame/${id}-${suffix}`,role:"pump-"+suffix,name:label,quantity:count,unitMassKg:null,unitPriceRub:null});
  const unavailable=(message:string)=>({parts:[make("bolts","Крепление насоса: болты — уточнить"),make("rivets","Крепление насоса: гайки-заклёпки — уточнить")],issue:message});
  if(!m?.verified||!positive(m.boltDiameterMm))return unavailable("Не определён диаметр крепёжного болта насоса");
  const clampHeight=m.clampHeightMm??m.footThicknessMm;
  const partial=(message:string)=>({parts:[{...make("bolts",`Болт М${m.boltDiameterMm} — длина не определена`),source:m.fastenerSource??m.source},{...make("rivets",`Гайка-заклёпка М${m.boltDiameterMm} — диапазон обжима не определён`),source:m.fastenerSource??m.source}],issue:message});
  if(!positive(clampHeight))return partial("Известен диаметр болта; нет монтажной высоты от рамы до опорной поверхности головки");
  const rivets=items.flatMap(c=>{const r=componentField(c,"FRAME_RIVET") as Rivet|undefined;return r?.verified&&r.source&&r.threadMm===m.boltDiameterMm&&nonnegative(r.gripMinMm)&&positive(r.gripMaxMm)&&r.gripMinMm<=thickness&&r.gripMaxMm>=thickness&&nonnegative(r.headThicknessMm)&&(positive(r.installedProjectionMm)||positive(r.minEngagementMm))?[{c,r}]:[];});
  const pairs=rivets.flatMap(({c,r})=>items.flatMap(b=>{
    const n=normalize(name(b)),size=n.match(/^болт м(\d+)х(\d+)(?:\D|$)/);
    if(!size||Number(size[1])!==m.boltDiameterMm)return [];
    const pocket=m.rivetHeadPocket;
    const supportLift=pocket&&positive(r.headDiameterMm)&&r.headDiameterMm<=pocket.diameterMm&&r.headThicknessMm<=pocket.depthMm?0:r.headThicknessMm;
    const length=Number(size[2]),engagement=length-clampHeight-supportLift;
    // A published installed tail length permits full-thread reach. A hollow
    // foot must use its entire clamp height, not merely its upper wall thickness.
    const required=positive(r.installedProjectionMm)?thickness+r.installedProjectionMm:r.minEngagementMm!;
    if(engagement<required||r.maxEngagementMm!=null&&(!positive(r.maxEngagementMm)||engagement>r.maxEngagementMm))return [];
    return [{b,c,r,length,supportLift,source:`${m.fastenerSource??m.source}; монтажная высота ${clampHeight} мм, рама ${thickness} мм; ${r.source}`}];
  })).sort((a,b)=>a.length-b.length||a.b.id.localeCompare(b.b.id));
  const pair=pairs[0];if(!pair)return partial("Нет подходящей гайки-заклёпки по толщине рамы или стандартной длины болта");
  const r=pair.r,fastening=positive(r.holeDiameterMm)&&positive(r.headDiameterMm)&&positive(r.installedProjectionMm)?{diameter:m.boltDiameterMm,length:pair.length,clamp:clampHeight,hole:r.holeDiameterMm,head:r.headThicknessMm,headDiameter:r.headDiameterMm,tail:r.installedProjectionMm,...(pair.supportLift!==r.headThicknessMm?{supportLift:pair.supportLift}:{})}:undefined;
  return {parts:[["bolts",pair.b],["rivets",pair.c]].map(([role,c])=>{const item=c as ComponentItem;return {...make(String(role),name(item)),componentId:item.id,unitMassKg:componentMass(item),unitPriceRub:componentPrice(item),fastening,source:[pair.source,componentField(item,"Источник цены")].filter(Boolean).join("; ")};})};
}
