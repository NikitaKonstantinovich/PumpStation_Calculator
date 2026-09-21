import type { DnEntity, InputEntity, ProjectConfig, SettingsEntity, SpecItem } from "./project-config";
import type { CollectorsEntity } from "./collector-project";
import { flangeKinds, secondaryAllowed, type CollectorCatalog } from "./collector-calculations";
import { suctionHydraulics } from "./dn-defaults";
import { matingParts, suctionCatalogItems, type AssemblyComponent } from "./suction-catalog";
import fastenerReference from "./suction-fasteners.json";

const field = (item: AssemblyComponent, pattern: RegExp) => item.fields.find(f=>pattern.test(f.headerPath.at(-1)??""))?.value;
const number = (v:unknown) => Number(String(v??"").replace(",",".").match(/\d+(?:\.\d+)?/)?.[0]) || null;
const itemDn = (item:AssemblyComponent) => number(field(item,/^DN$/i));
const price = (item?:AssemblyComponent) => item?.prices.find(p=>p.currency==="RUB" && /(?:^|\/)\s*цен[аы]/i.test(p.label) && !/\/кг|\/м(?:\b|$)/i.test(p.label) && Number.isFinite(p.amount) && p.amount>0)?.amount ?? null;
const itemName = (item?:AssemblyComponent) => item ? String(field(item,/^Наименование$/i)??item.family) : "";
export function suctionFingerprint(project:ProjectConfig) {
  const e=project.entities, settings=e["station-settings"] as SettingsEntity;
  return JSON.stringify([e["station-dn"],e["system-input"],secondaryAllowed({stationType:settings.stationType,jockey:settings.jockeyPump})?e["system-input-2"]:null,settings.stationType,settings.jockeyPump,(e["station-collectors"] as CollectorsEntity).suction.configuration]);
}

export function buildSuctionSpec(project:ProjectConfig, database:{items:AssemblyComponent[]}, catalog:CollectorCatalog):SpecItem[] {
  const e=project.entities, settings=e["station-settings"] as SettingsEntity, dn=e["station-dn"] as DnEntity;
  const collector=(e["station-collectors"] as CollectorsEntity).suction.configuration;
  if (!collector || !(e["system-input"] as InputEntity).calculated) return [];
  const rows:SpecItem[]=[], fingerprint=suctionFingerprint(project);
  const add=(role:string,name:string,quantity:number,details:string,item?:AssemblyComponent,unit="шт.",fixedPrice?:number,description="")=>{
    const amount=fixedPrice??price(item);
    rows.push({position:`03.${String(30+rows.length).padStart(2,"0")}`,name,quantity:Number(quantity.toFixed(3)),unit,details,price:amount,equipmentId:item?.id,description:description || (item ? `База комплектующих: ${item.id}` : "Точное исполнение или цена отсутствуют в базе — требуется уточнение"),section:"suction",status:amount===null?"clarify":"selected",generatedBy:"suction-line",assemblyRole:role,sourceFingerprint:fingerprint});
  };
  const gasket=(role:string,size:number,pn:number,count:number)=>{
    const item=database.items.find(x=>x.catalogId==="прокладки"&&itemDn(x)===size&&number(field(x,/^PN$/i))===pn&&/паронит/i.test(x.family));
    add(role,`Прокладка паронитовая DN${size}`,count,`DN${size} · PN${pn}`,item);
  };
  const flanges=(role:string,size:number,pn:number,count:number)=>{
    for(const kind of flangeKinds(collector.material,size,pn)) {
      const part=catalog.components.find(x=>x.kind===kind&&x.dn===size&&x.pn===pn&&x.material===collector.material);
      const item=database.items.find(x=>x.id===part?.id);
      add(`${role}-${kind}`,part?.name??`${kind==="collar"?"Воротник":"Фланец"} DN${size}`,count,`DN${size} · PN${pn} · ${collector.material==="aisi304"?"AISI 304":"Ст20"}`,item, "шт.",part?.price??undefined);
    }
  };
  const fasteners=(role:string,size:number,pn:number,joints:number,wafer=false)=>{
    const reference=fastenerReference.find(x=>x.dn===size&&x.pn===pn);
    if(!reference){for(const [key,name] of [["bolts","Болты"],["nuts","Гайки"]])add(`${role}-${key}`,`${name} для фланцев DN${size}`,joints,`DN${size} · PN${pn} · нет таблицы сверловки`,undefined,"компл.");return;}
    const diameter=reference.boltDiameter, count=joints*reference.holes;
    const hardware=database.items.filter(x=>x.catalogId==="метизы"&&number(field(x,/^Диаметр резьбы, мм$/i))===diameter);
    const nut=hardware.find(x=>/^Гайка /i.test(itemName(x))), washer=hardware.find(x=>/^Шайба /i.test(itemName(x)));
    const nutWidth=number(nut&&field(nut,/^Ширина, мм$/i)),washerWidth=number(washer&&field(washer,/^Ширина, мм$/i));
    // Count BOTH flanges, the requested gaskets, nut, washer and 5 mm thread
    // protrusion. Source P:R formulas only include one flange, so are not reused.
    const length=collector.material==="st20"&&nutWidth&&washerWidth&&(!wafer||reference.wafer017WLength)
      ? 2*reference.steelFlangeThickness+(wafer?reference.wafer017WLength!+4:2)+nutWidth+washerWidth+5 : null;
    const bolt=length?hardware.filter(x=>/^Болт /i.test(itemName(x))&&(number(field(x,/^Длина болта, мм$/i))??0)>=length).sort((a,b)=>number(field(a,/^Длина болта, мм$/i))!-number(field(b,/^Длина болта, мм$/i))!)[0]:undefined;
    const details=`DN${size} · PN${pn} · ${reference.holes} шт. × ${joints} стыков${length?` · длина не менее ${length} мм`:" · длину болта уточнить по толщине фланцев"}`;
    add(`${role}-bolts`,bolt?itemName(bolt):`Болт М${diameter} для фланцев DN${size}`,count,details,bolt,"шт.",undefined,reference.source);
    add(`${role}-nuts`,nut?itemName(nut):`Гайка М${diameter}`,count,details,nut,"шт.",undefined,reference.source);
    if(washer)add(`${role}-washers`,itemName(washer),count,details,washer,"шт.",undefined,reference.source);
  };
  const circuits=[false,...(secondaryAllowed(collector)?[true]:[])];
  for(const secondary of circuits) {
    const input=e[secondary?"system-input-2":"system-input"] as InputEntity;
    if(!input.calculated) continue;
    const h=suctionHydraulics(dn,input,settings,secondary), prefix=secondary?"secondary":"primary", title=secondary?"Контур 2":"Контур 1", count=(input.workingPumpCount??0)+(input.reservePumpCount??0), branch=secondary?collector.secondary:collector.primary;
    const errors=[...h.errors];
    if(branch && (branch.dn!==h.dn || branch.connection!==h.connection || branch.pn!==h.pn)) errors.push("Параметры отвода коллектора не совпадают с арматурой. Исправьте переопределения в конструкторе коллекторов.");
    if(errors.length || !h.port) {add(`${prefix}-error`,`${title}: ошибка комплектации всасывающей линии`,1,errors.join(" "),undefined,"компл.");continue;}
    const p=h.port, v=h.dn, pn=h.pn;
    let threads=0;
    if(p.connection==="threaded" && h.connection==="threaded") {
      const part=pn<=16?suctionCatalogItems.find(x=>x.id===`suction-table:union-${v}`):undefined;
      add(`${prefix}-union`,part?.family??`Американка НР-НР DN${v}`,count,`${title} · DN${v} · PN${pn}`,part);
      threads=3;
    } else if(p.connection!==h.connection) {
      const flangeDn=p.connection==="flanged"?p.dn:v, threadDn=p.connection==="threaded"?p.dn:v;
      const matching=matingParts.find(x=>x.dn===flangeDn&&x.threadDn===threadDn);
      const part=pn<=16&&matching?suctionCatalogItems.find(x=>x.id===`suction-table:rf-${flangeDn}`):undefined;
      add(`${prefix}-adapter`,`Ответная часть РФ DN${flangeDn} — резьба DN${threadDn}`,count,`${title} · PN${pn} · ${p.connection==="threaded"?"развёрнута резьбой к насосу":"фланцем к насосу"}`,part);
      flanges(`${prefix}-adapter-flange`,flangeDn,pn,count);
      if(p.connection==="flanged") {gasket(`${prefix}-pump-gasket`,p.dn,pn,count);fasteners(`${prefix}-pump-fasteners`,p.dn,pn,count);threads=2;}
      else threads=1;
    } else {
      if(p.dn===v) {
        const part=pn<=16?suctionCatalogItems.find(x=>x.id===`suction-table:ff-${v}`):undefined;
        add(`${prefix}-insertion`,`Вставка ФФ DN${v}–${v}`,count,`${title} · PN${pn} · фланцы отдельными позициями`,part);
      } else {
        const outer=(size:number)=>catalog.components.find(x=>x.kind==="pipe"&&x.dn===size&&x.material===collector.material)?.outerDiameter;
        const small=outer(p.dn),large=outer(v);
        const reducer=database.items.find(x=>x.catalogId==="переходы"&&/эксцентр/i.test(x.family)&&itemDn(x)===v&&number(field(x,/^PN$/i))===pn&&(collector.material==="aisi304"?/AISI\s*304/i:/Сталь\s*20/i).test(x.family)&&large!==undefined&&small!==undefined&&number(field(x,/^Диаметр, мм$/i))===large&&number(field(x,/^Диаметр меньший, мм$/i))===small);
        add(`${prefix}-reducer`,`Переход с фланцами DN${v}–${p.dn}`,count,`${title} · PN${pn} · ${collector.material} · цена тела перехода, фланцы отдельно`,reducer);
      }
      flanges(`${prefix}-pump-flange`,p.dn,pn,count);
      flanges(`${prefix}-valve-flange`,v,pn,count);
      gasket(`${prefix}-pump-gasket`,p.dn,pn,count);
      fasteners(`${prefix}-pump-fasteners`,p.dn,pn,count);
    }
    if(h.connection==="flanged") {
      gasket(`${prefix}-valve-gaskets`,v,pn,2*count);
      fasteners(`${prefix}-valve-fasteners`,v,pn,count,true);
      if(!secondary&&(settings.stationType==="fire"||settings.stationType==="combined")&&h.valveType==="butterfly") add(`${prefix}-limit-switches`,"Комплект концевых выключателей на затвор",count,`${title} · 1 комплект на 1 затвор`,undefined,"компл.",3000,"Стоимость комплекта задана пользователем: 3000 ₽");
    }
    if(threads) add(`${prefix}-flax`,"Лён для уплотнения труб",count*threads*.1,`${title} · ${threads} резьбовых соединения × 0,1 м на насос`,undefined,"м");
  }
  if(collector.dn) {
    if(collector.connection==="flanged") {gasket("network-gaskets",collector.dn,collector.pn,2);fasteners("network-fasteners",collector.dn,collector.pn,2);}
    else add("network-flax","Лён для уплотнения труб",.2,"Два подключения коллектора к сети × 0,1 м, независимо от числа насосов",undefined,"м");
  }
  const instruments=settings.stationType==="fire"||settings.stationType==="combined"?2:1;
  // The suction pressure/range and switch setpoint are not supplied by pump head.
  add("gauge","Манометр",instruments,"Всасывающий коллектор · диапазон входного давления требуется указать",undefined,"шт.",undefined,"В базе есть манометры Экомера МД02. Диапазон нельзя определить по напору насоса; требуется уточнение.");
  add("pressure-switch","Реле давления",instruments,"Всасывающий коллектор · защита от сухого хода · диапазон и уставка требуют уточнения",undefined,"шт.",undefined,"В базе есть реле РД-2Р. Подбор исполнения после уточнения входного давления и уставки.");
  const instrumentValve=database.items.find(x=>/латун/i.test(x.family)&&/тр[её]хход/i.test(x.family)&&/воздухоотвод/i.test(x.family)&&itemDn(x)===15);
  add("instrument-valve","Кран шаровой латунный трёхходовой с воздухоотводчиком DN15",instruments,"DN15 · арматура КИП",instrumentValve);
  return rows;
}

export function replaceSuctionSpec(items:SpecItem[],generated:SpecItem[]):SpecItem[] {
  return [...items.filter(item=>item.generatedBy!=="suction-line" && !(item.section==="suction"&&["Манометр","Реле давления"].includes(item.name))),...generated];
}
