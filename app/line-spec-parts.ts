import type { DnEntity, SpecItem, ValveConnection } from "./project-config";
import { flangeKinds, type CollectorCatalog, type CollectorConfiguration } from "./collector-calculations";
import type { AssemblyComponent } from "./suction-catalog";
import fastenerReference from "./suction-fasteners.json";
import { jointFlangeThickness } from "./joint-flange-dimensions";
import { selectGasket, selectFlax, gasketPressures, sealingName, sealingPrice } from "./sealing-selection";
import { selectStationInsertion, type InsertionRequirement } from "./station-insertion-selection";
import { insertionPrice } from "./calculated-insertion";
import { jointFastenerLength } from "./joint-fastener-length";

export const field = (item: AssemblyComponent, pattern: RegExp) => item.fields.find(f=>pattern.test(f.headerPath.at(-1)??""))?.value;
export const number = (v:unknown) => Number(String(v??"").replace(",",".").match(/\d+(?:\.\d+)?/)?.[0]) || null;
export const itemDn = (item:AssemblyComponent) => number(field(item,/^DN$/i));
export const price = (item?:AssemblyComponent) => item?.prices.find(p=>p.currency==="RUB" && /(?:^|\/)\s*цен[аы]/i.test(p.label) && !/\/кг|\/м(?:\b|$)/i.test(p.label) && Number.isFinite(p.amount) && p.amount>0)?.amount ?? null;
export const itemName = (item?:AssemblyComponent) => item ? String(field(item,/^Наименование$/i)??item.family) : "";

// Thickness is the sum of all elements captured by this set of bolts.
// null means dimensions are missing; no bolt length may be guessed.
export type JointStack = { gaskets: number; thickness: number | null; flangeThickness?: number | null; fastener?: "bolt" | "stud"; source?: string };
/** Shared by station valve hardware and insert pipe sizing. Keeps the same catalogue selection. */
export function selectJointFasteners(database: { items: AssemblyComponent[] }, material: CollectorConfiguration["material"], size: number, pn: number, wafer: boolean | JointStack = false, collarComponentId?: string, weldFlangeComponentId?: string) {
  const reference = fastenerReference.find(row => row.dn === size && row.pn === pn);
  if (!reference) return null;
  const diameter = reference.boltDiameter;
  const hardware = database.items.filter(item => item.catalogId === "метизы" && number(field(item, /^Диаметр резьбы, мм$/i)) === diameter);
  const nut = hardware.find(item => /^Гайка /i.test(itemName(item))), washer = hardware.find(item => /^Шайба /i.test(itemName(item)));
  const nutWidth = number(nut && field(nut, /^Ширина, мм$/i)), washerWidth = number(washer && field(washer, /^Ширина, мм$/i));
  const stack: JointStack = typeof wafer === "object" ? wafer : { gaskets: wafer ? 2 : 1, thickness: wafer ? reference.wafer017WLength : 0 };
  const ends = stack.fastener === "stud" ? 2 : 1;
  // An explicit grip changes thickness, not the confirmed drilling pattern.
  const flange = jointFlangeThickness(database, material, size, pn, collarComponentId, weldFlangeComponentId);
  const legacySteel = !weldFlangeComponentId && !flange?.found && material === "st20";
  const flangeThickness = stack.flangeThickness === undefined ? (legacySteel ? 2 * reference.steelFlangeThickness : flange?.thicknessMm ?? null) : stack.flangeThickness;
  const length = flangeThickness !== null && nutWidth && washerWidth && stack.thickness !== null
    ? jointFastenerLength(flangeThickness + stack.thickness + stack.gaskets * 2, nutWidth, washerWidth, ends) : null;
  const kind = stack.fastener === "stud" ? /^Шпилька /i : /^Болт /i;
  const lengthField = /^Длина (?:болта|шпильки), мм$/i;
  const bolt = length ? hardware.filter(item => kind.test(itemName(item)) && (number(field(item, lengthField)) ?? 0) >= length)
    .sort((a, b) => number(field(a, lengthField))! - number(field(b, lengthField))!)[0] : undefined;
  return { reference: flange?.holes ? { ...reference, holes: flange.holes } : reference, diameter, nut, washer, nutWidth, washerWidth, stack, ends, flangeThickness, length, bolt,
    standardLength: bolt ? number(field(bolt, lengthField)) : null,
    warnings: legacySteel || stack.flangeThickness !== undefined ? [] : flange?.warnings ?? [], flangeDimensions: flange?.dimensions ?? [],
    source: [stack.source ?? reference.source, flange?.source].filter(Boolean).join("; ") };
}
export function lineSpecParts(rows: SpecItem[], section: "suction" | "discharge", fingerprint: string, collector: CollectorConfiguration, database: { items: AssemblyComponent[] }, catalog: CollectorCatalog, designs: DnEntity["insertionDesigns"] = {}, firstSensorCircuits: readonly string[] = []) {
  const reducerGeometry: "concentric" | "eccentric" = section === "discharge" ? "concentric" : "eccentric";
  const sensorPending = new Set(section === "discharge" ? firstSensorCircuits : []);
  const add=(role:string,name:string,quantity:number,details:string,item?:AssemblyComponent,unit="шт.",fixedPrice?:number,description="",status?:SpecItem["status"])=>{
    const amount=fixedPrice??price(item);
    const row: SpecItem = {position:`${section === "suction" ? "03" : "04"}.${String(30+rows.length).padStart(2,"0")}`,name,quantity:Number(quantity.toFixed(3)),unit,details,price:amount,equipmentId:item?.id,description:description || (item ? `База комплектующих: ${item.id}` : "Точное исполнение или цена отсутствуют в базе — требуется уточнение"),section,technicalStatus:role.endsWith("-error")?"error":status&&status!=="selected"?"unverified":item||fixedPrice!==undefined?"ready":"unverified",status:status??(amount===null?"clarify":"selected"),generatedBy:section === "suction" ? "suction-line" : "discharge-line",assemblyRole:role,sourceFingerprint:fingerprint};
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
  const flanges=(role:string,size:number,pn:number,count:number,insertion?:SpecItem,end?:"from"|"to")=>{
    const assembly=insertion?.insertionAssembly;
    const side=end ? (end==="from" !== Boolean(assembly?.reversed) ? "left" : "right") : null;
    for(const kind of flangeKinds(collector.material,size,pn)) {
      const supplied=assembly?.snapshot.calculation.bom.filter(part=>part.kind===kind && (!side || part.role.startsWith(`${side}-`))).reduce((sum,part)=>sum+(part.quantity??0),0)??0;
      const remaining=Math.max(0,count-supplied*(insertion?.quantity??0));
      if(!remaining)continue;
      const part=catalog.components.find(x=>x.kind===kind&&x.dn===size&&x.pn===pn&&x.material===collector.material);
      const item=database.items.find(x=>x.id===part?.id);
      if(assembly&&kind==="looseFlange"&&item){
        assembly.externalFlanges??={};
        for(const target of end?[end]:["from","to"] as const) assembly.externalFlanges[target]=item.id;
      }
      add(`${role}-${kind}`,part?.name??`${kind==="collar"?"Воротник":"Фланец"} DN${size}`,remaining,`DN${size} · PN${pn} · ${collector.material==="aisi304"?"AISI 304":"Ст20"}`,item, "шт.",part?.price??undefined);
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
  const insertion=(role:string,name:string,count:number,details:string,need:{fromDn:number;toDn:number;fromConnection:ValveConnection;toConnection:ValveConnection;pn:number;purpose:InsertionRequirement["purpose"]},fallback?:AssemblyComponent)=>{
    const connection=(dn:number,value:ValveConnection)=>value==="threaded"?"threaded":flangeKinds(collector.material,dn,need.pn).includes("collar")?"collar":"flanged";
    const location=`${section}:${role}`;
    // Insertions are emitted in mounting order, away from each pump. Consume
    // the sensor requirement once per circuit, even when its product is missing.
    const prefix = role.split("-")[0];
    const withSensorNipple = sensorPending.delete(prefix);
    const requirement:InsertionRequirement={location,purpose:need.purpose,material:collector.material,pn:need.pn,
      from:{dn:need.fromDn,connection:connection(need.fromDn,need.fromConnection)},to:{dn:need.toDn,connection:connection(need.toDn,need.toConnection)},
      geometry:need.fromDn===need.toDn?"straight":reducerGeometry,withSensorNipple,design:designs[location]};
    const selected=selectStationInsertion(database.items,requirement);
    const item=selected.item??fallback;
    const row=add(role,selected.item?.family??name,count,`${details} · ${requirement.geometry === "straight" ? "прямая" : requirement.geometry === "concentric" ? "концентрическая" : "эксцентрическая"} вставка · ${withSensorNipple ? "со сгоном DN15 под реле давления" : "без сгона"}`,item,"шт.",undefined,selected.explanation,"clarify");
    row.insertionRequirement=requirement;
    row.technicalStatus=selected.technicalStatus;
    row.technicalNotes=selected.findings.map(f=>f.message);
    if(selected.item?.calculatedInsertion){
      row.insertionAssembly={snapshot:selected.item.calculatedInsertion,reversed:selected.reversed,accounting:"assembly"};
      row.price=insertionPrice(selected.item.calculatedInsertion);
      row.status=row.technicalStatus==="ready"&&row.price!==null?"selected":"clarify";
      row.details += " · расчётная сборка; вложенный состав учитывается внутри изделия";
    }else{
      row.technicalStatus="unverified";
      row.description += fallback ? ` Предварительный вариант: ${fallback.id}. Источник: ${String(field(fallback,/^Источник$/i)??"база комплектующих")}. Цена тела; материал, PN, длина, концы и комплектность требуют проверки; фланцы отдельно.` : " Предварительный узел: изделие не найдено.";
      row.technicalNotes.push(row.description!);
    }
    return row;
  };
  return { add, gasket, flax, flanges, fasteners, insertion, reducerGeometry };
}
