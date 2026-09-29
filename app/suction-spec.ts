import type { DnEntity, InputEntity, ProjectConfig, SettingsEntity, SpecItem } from "./project-config";
import type { CollectorsEntity } from "./collector-project";
import { collectorPressureChecks, flangeKinds, secondaryAllowed, type CollectorCatalog } from "./collector-calculations";
import { checkInletPressure, suctionHydraulics } from "./dn-defaults";
import { resolvePumpPortData } from "./pump-ports";
import { componentPressureLimit, withInletPressureChecks } from "./suction-pressure";
import { matingParts, suctionCatalogItems, type AssemblyComponent } from "./suction-catalog";
import fastenerReference from "./suction-fasteners.json";
import { selectSuctionInstruments } from "./suction-instruments";
import { selectGasket, selectFlax, gasketPressures, sealingName, sealingPrice } from "./sealing-selection";

const field = (item: AssemblyComponent, pattern: RegExp) => item.fields.find(f=>pattern.test(f.headerPath.at(-1)??""))?.value;
const number = (v:unknown) => Number(String(v??"").replace(",",".").match(/\d+(?:\.\d+)?/)?.[0]) || null;
const itemDn = (item:AssemblyComponent) => number(field(item,/^DN$/i));
const price = (item?:AssemblyComponent) => item?.prices.find(p=>p.currency==="RUB" && /(?:^|\/)\s*цен[аы]/i.test(p.label) && !/\/кг|\/м(?:\b|$)/i.test(p.label) && Number.isFinite(p.amount) && p.amount>0)?.amount ?? null;
const itemName = (item?:AssemblyComponent) => item ? String(field(item,/^Наименование$/i)??item.family) : "";
export function suctionFingerprint(project:ProjectConfig) {
  const e=project.entities, settings=e["station-settings"] as SettingsEntity;
  return JSON.stringify(["instruments-v2","seals-v2","instrument-valve-v1",settings.inletHead??null,e["station-dn"],e["system-input"],secondaryAllowed({stationType:settings.stationType,jockey:settings.jockeyPump})?e["system-input-2"]:null,settings.stationType,settings.jockeyPump,(e["station-collectors"] as CollectorsEntity).suction.configuration]);
}

export function buildSuctionSpec(project:ProjectConfig, database:{items:AssemblyComponent[]}, catalog:CollectorCatalog):SpecItem[] {
  const e=project.entities, settings=e["station-settings"] as SettingsEntity, dn=e["station-dn"] as DnEntity;
  const collector=(e["station-collectors"] as CollectorsEntity).suction.configuration;
  if (!collector || !(e["system-input"] as InputEntity).calculated) return [];
  const rows:SpecItem[]=[], fingerprint=suctionFingerprint(project);
  const add=(role:string,name:string,quantity:number,details:string,item?:AssemblyComponent,unit="шт.",fixedPrice?:number,description="",status?:SpecItem["status"])=>{
    const amount=fixedPrice??price(item);
    rows.push({position:`03.${String(30+rows.length).padStart(2,"0")}`,name,quantity:Number(quantity.toFixed(3)),unit,details,price:amount,equipmentId:item?.id,description:description || (item ? `База комплектующих: ${item.id}` : "Точное исполнение или цена отсутствуют в базе — требуется уточнение"),section:"suction",status:status??(amount===null?"clarify":"selected"),generatedBy:"suction-line",assemblyRole:role,sourceFingerprint:fingerprint});
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
    if(threads) flax(`${prefix}-flax`,count*threads*.1,`${title} · ${count} нас. × ${threads} резьбовых соединения × 0,1 м`);
  }
  if(collector.dn) {
    if(collector.connection==="flanged") {gasket("network-gaskets",collector.dn,collector.pn,2);fasteners("network-fasteners",collector.dn,collector.pn,2);}
    else flax("network-flax",.2,"Два подключения коллектора к сети × 0,1 м, независимо от числа насосов");
  }
  const instruments=settings.stationType==="fire"||settings.stationType==="combined"?2:1;
  for (const instrument of selectSuctionInstruments(database.items,settings.inletHead)) {
    add(instrument.role,instrument.name,instruments,instrument.details,instrument.item,"шт.",undefined,instrument.description,instrument.warning?"confirmation":undefined);
  }
  const instrumentValve=database.items.find(x=>x.catalogId==="шаровые-краны"&&field(x,/^Артикул$/i)==="44.15.В-В.С.Б"&&itemDn(x)===15&&(number(field(x,/^PN$/i))??0)>=collector.pn);
  add("instrument-valve",instrumentValve?`${itemName(instrumentValve)} · DN15`:"Кран LD Pride 44.15.В-В.С.Б DN15",instruments,"DN15 · PN40 · арматура КИП · дренаж и воздухоотводчик",instrumentValve,"шт.",undefined,instrumentValve?"Модель и цена заданы пользователем: 650 ₽/шт.":"Указанная модель DN15 PN40 отсутствует в базе или не подходит по PN коллектора — требуется уточнение");
  return rows;
}

export function replaceSuctionSpec(items:SpecItem[],generated:SpecItem[]):SpecItem[] {
  return [...items.filter(item=>item.generatedBy!=="suction-line" && !(item.section==="suction"&&["Манометр","Мановакуумметр","Реле давления"].includes(item.name))),...generated];
}

export function checkSuctionSpecPressure(project: ProjectConfig, items: SpecItem[], database?: { items: AssemblyComponent[] }, catalog?: CollectorCatalog): SpecItem[] {
  const settings = project.entities["station-settings"] as SettingsEntity;
  const dn = project.entities["station-dn"] as DnEntity;
  const collector = (project.entities["station-collectors"] as CollectorsEntity).suction.configuration;
  const components = new Map([...suctionCatalogItems, ...(database?.items ?? [])].map(item => [item.id, item]));
  return items.map(item => {
    if (item.option === "suctionCollector" && collector) return withInletPressureChecks(item, collectorPressureChecks(collector, settings.inletHead, catalog));
    if (item.section === "pump") {
      const secondary = item.option === "secondaryPump";
      if (secondary && (!collector || !secondaryAllowed(collector))) return item;
      const input = project.entities[secondary ? "system-input-2" : "system-input"] as InputEntity;
      const port = resolvePumpPortData(dn, { ...input, selectedPumpId: item.equipmentId ?? input.selectedPumpId }, secondary);
      return withInletPressureChecks(item, [checkInletPressure(settings.inletHead, `${item.name}: допустимое давление на входе`, port?.maxInletPressure)]);
    }
    // Fasteners and limit switches have no independent hydraulic pressure rating.
    if (item.section !== "suction" || /(?:fasteners|limit-switches|error)/.test(item.assemblyRole ?? "")) return item;
    const component = components.get(item.equipmentId ?? "");
    const rating = componentPressureLimit(component);
    const catalogPart = catalog?.components.find(part => part.id === item.equipmentId);
    const limit = rating ?? (catalogPart?.pn ? { bar: catalogPart.pn, label: `PN${catalogPart.pn}` } : null);
    return withInletPressureChecks(item, [checkInletPressure(settings.inletHead, item.name, limit?.bar, limit?.label)]);
  });
}
