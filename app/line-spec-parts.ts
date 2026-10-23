import type { SpecItem } from "./project-config";
import { flangeKinds, type CollectorCatalog, type CollectorConfiguration } from "./collector-calculations";
import type { AssemblyComponent } from "./suction-catalog";
import fastenerReference from "./suction-fasteners.json";
import { jointFlangeThickness } from "./joint-flange-dimensions";
import { selectGasket, selectFlax, gasketPressures, sealingName, sealingPrice } from "./sealing-selection";

export const field = (item: AssemblyComponent, pattern: RegExp) => item.fields.find(f=>pattern.test(f.headerPath.at(-1)??""))?.value;
export const number = (v:unknown) => Number(String(v??"").replace(",",".").match(/\d+(?:\.\d+)?/)?.[0]) || null;
export const itemDn = (item:AssemblyComponent) => number(field(item,/^DN$/i));
export const price = (item?:AssemblyComponent) => item?.prices.find(p=>p.currency==="RUB" && /(?:^|\/)\s*цен[аы]/i.test(p.label) && !/\/кг|\/м(?:\b|$)/i.test(p.label) && Number.isFinite(p.amount) && p.amount>0)?.amount ?? null;
export const itemName = (item?:AssemblyComponent) => item ? String(field(item,/^Наименование$/i)??item.family) : "";

// Thickness is the sum of all elements captured by this set of bolts.
// null means dimensions are missing; no bolt length may be guessed.
export type JointStack = { gaskets: number; thickness: number | null; flangeThickness?: number | null; fastener?: "bolt" | "stud"; source?: string };
/** Shared by station valve hardware and insert pipe sizing. Keeps the same catalogue selection. */
export function selectJointFasteners(database: { items: AssemblyComponent[] }, material: CollectorConfiguration["material"], size: number, pn: number, wafer: boolean | JointStack = false) {
  const reference = fastenerReference.find(row => row.dn === size && row.pn === pn);
  if (!reference) return null;
  const diameter = reference.boltDiameter;
  const hardware = database.items.filter(item => item.catalogId === "метизы" && number(field(item, /^Диаметр резьбы, мм$/i)) === diameter);
  const nut = hardware.find(item => /^Гайка /i.test(itemName(item))), washer = hardware.find(item => /^Шайба /i.test(itemName(item)));
  const nutWidth = number(nut && field(nut, /^Ширина, мм$/i)), washerWidth = number(washer && field(washer, /^Ширина, мм$/i));
  const stack: JointStack = typeof wafer === "object" ? wafer : { gaskets: wafer ? 2 : 1, thickness: wafer ? reference.wafer017WLength : 0 };
  const ends = stack.fastener === "stud" ? 2 : 1;
  const flange = stack.flangeThickness === undefined ? jointFlangeThickness(database, material, size, pn) : null;
  const legacySteel = !flange?.found && material === "st20";
  const flangeThickness = stack.flangeThickness === undefined ? (legacySteel ? 2 * reference.steelFlangeThickness : flange?.thicknessMm ?? null) : stack.flangeThickness;
  const length = flangeThickness !== null && nutWidth && washerWidth && stack.thickness !== null
    ? flangeThickness + stack.thickness + stack.gaskets * 2 + ends * (nutWidth + washerWidth + 5) : null;
  const kind = stack.fastener === "stud" ? /^Шпилька /i : /^Болт /i;
  const lengthField = /^Длина (?:болта|шпильки), мм$/i;
  const bolt = length ? hardware.filter(item => kind.test(itemName(item)) && (number(field(item, lengthField)) ?? 0) >= length)
    .sort((a, b) => number(field(a, lengthField))! - number(field(b, lengthField))!)[0] : undefined;
  return { reference, diameter, nut, washer, nutWidth, washerWidth, stack, ends, flangeThickness, length, bolt,
    standardLength: bolt ? number(field(bolt, lengthField)) : null,
    warnings: legacySteel ? [] : flange?.warnings ?? [], flangeDimensions: flange?.dimensions ?? [],
    source: [stack.source ?? reference.source, flange?.source].filter(Boolean).join("; ") };
}
export function lineSpecParts(rows: SpecItem[], section: "suction" | "discharge", fingerprint: string, collector: CollectorConfiguration, database: { items: AssemblyComponent[] }, catalog: CollectorCatalog) {
  const add=(role:string,name:string,quantity:number,details:string,item?:AssemblyComponent,unit="шт.",fixedPrice?:number,description="",status?:SpecItem["status"])=>{
    const amount=fixedPrice??price(item);
    const row: SpecItem = {position:`${section === "suction" ? "03" : "04"}.${String(30+rows.length).padStart(2,"0")}`,name,quantity:Number(quantity.toFixed(3)),unit,details,price:amount,equipmentId:item?.id,description:description || (item ? `База комплектующих: ${item.id}` : "Точное исполнение или цена отсутствуют в базе — требуется уточнение"),section,status:status??(amount===null?"clarify":"selected"),generatedBy:section === "suction" ? "suction-line" : "discharge-line",assemblyRole:role,sourceFingerprint:fingerprint};
    rows.push(row);
    return row;
  };
  const gasket=(role:string,size:number,pn:number,count:number)=>{
    const item=selectGasket(database.items,size,pn);
    const pressures=item?gasketPressures(item):[],fallback=Boolean(item&&!pressures.includes(pn));
    const warning=fallback?`Предупреждение: для DN${size} требуется PN${pn}, выбрана прокладка PN${pressures.join("/")}. ${Math.max(...pressures)<pn?"PN прокладки ниже требуемого. ":""}Проверьте размеры и допустимое давление перед применением.`:"";
    add(role,`Прокладка паронитовая DN${size}`,count,`DN${size} · соединение PN${pn}${item?` · ${sealingName(item)} · PN прокладки ${pressures.join("/")}`:" · исполнения этого DN в базе нет"}${warning?` · ⚠ ${warning}`:""}`,item,"шт.",item?sealingPrice(item)??undefined:undefined,warning,fallback?"confirmation":undefined);
  };
  const flaxItem=selectFlax(database.items);
  const flax=(role:string,quantity:number,details:string)=>add(role,"Лён для уплотнения труб",quantity,details,flaxItem,"м",flaxItem?sealingPrice(flaxItem)??undefined:undefined,flaxItem?"Цена за метр из базы уплотнений; расход 0,1 м на резьбовое соединение.":"Цена льна за метр отсутствует в базе — требуется уточнение");
  const flanges=(role:string,size:number,pn:number,count:number)=>{
    for(const kind of flangeKinds(collector.material,size,pn)) {
      const part=catalog.components.find(x=>x.kind===kind&&x.dn===size&&x.pn===pn&&x.material===collector.material);
      const item=database.items.find(x=>x.id===part?.id);
      add(`${role}-${kind}`,part?.name??`${kind==="collar"?"Воротник":"Фланец"} DN${size}`,count,`DN${size} · PN${pn} · ${collector.material==="aisi304"?"AISI 304":"Ст20"}`,item, "шт.",part?.price??undefined);
    }
  };
  const fasteners=(role:string,size:number,pn:number,joints:number,wafer: boolean | JointStack = false)=>{
    const selected = selectJointFasteners(database, collector.material, size, pn, wafer);
    if(!selected){for(const [key,name] of [["bolts","Болты"],["nuts","Гайки"],["washers","Шайбы"]])add(`${role}-${key}`,`${name} для фланцев DN${size}`,joints,`DN${size} · PN${pn} · нет таблицы сверловки`,undefined,"компл.");return;}
    const { reference, diameter, nut, washer, stack, ends, length, bolt, source, warnings } = selected;
    const count=joints*reference.holes;
    const details=`DN${size} · PN${pn} · ${reference.holes} шт. × ${joints} стыков${length?` · длина не менее ${length} мм`:" · длину болта уточнить по толщине фланцев и межфланцевых элементов"}`;
    add(`${role}-${stack.fastener === "stud" ? "studs" : "bolts"}`,bolt?itemName(bolt):`${stack.fastener === "stud" ? "Шпилька" : "Болт"} М${diameter} для фланцев DN${size}`,count,details,bolt,"шт.",undefined,[source,...warnings].join("; "),warnings.length?"clarify":undefined);
    add(`${role}-nuts`,nut?itemName(nut):`Гайка М${diameter}`,count * ends,details,nut,"шт.",undefined,source);
    add(`${role}-washers`,washer?itemName(washer):`Шайба М${diameter}`,count * ends,details,washer,"шт.",undefined,source);
  };
  return { add, gasket, flax, flanges, fasteners };
}
