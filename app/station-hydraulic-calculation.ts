import { engineeringOperation, registerOperation } from "./engineering/runtime";
import type {CollectorMaterial,DnEntity,InputEntity,SettingsEntity,ValveConnection,ValvePn,ShutoffValveType,SpecOption,SpecItem,SpecSection,SpecEntity,ProjectConfig} from "./project-config";
import type {Pump} from "./pump-catalog";
import {componentFieldLabel,type ComponentItem,type ComponentPrice,type ComponentsDatabase} from "./component-database-types";
import {isCalculated} from "./calculated-input";
import {recommendedDn,defaultCollectorMaterial,resolveDnConnection,suctionHydraulics,dischargeHydraulics} from "./dn-defaults";
import {buildSuctionSpec,replaceSuctionSpec,checkSuctionSpecPressure} from "./suction-spec";
import {buildDischargeSpec,replaceDischargeSpec,checkDischargeSpecPressure} from "./discharge-spec";
import {normalizeSpecificationItems,specificationOption} from "./specification-items";
import type {CollectorsEntity} from "./collector-project";
import {bindProjectComponents} from "./base-values-components";
const isSecondaryEnabled = (settings: SettingsEntity) => settings.stationType === "combined" || (settings.stationType === "fire" && settings.jockeyPump);

type DnField="suctionCollectorDn"|"dischargeCollectorDn"|"suctionValveDn"|"dischargeValveDn"|"secondarySuctionCollectorDn"|"secondaryDischargeCollectorDn"|"secondarySuctionValveDn"|"secondaryDischargeValveDn";
type CircuitId="primary"|"secondary";
type CircuitDnConfig={
  suction:ReturnType<typeof suctionHydraulics>;
  discharge:ReturnType<typeof dischargeHydraulics>;
  id:CircuitId;title:string;stationFlow:number;pumpFlow:number;workingPumpCount:number;totalPumpCount:number;
  values:Record<DnField,number>;connection:ValveConnection;pn:ValvePn;suctionValveType:ShutoffValveType;dischargeValveType:ShutoffValveType;
  connectionField:"connectionType"|"secondaryConnectionType";pnField:"pn"|"secondaryPn";suctionTypeField:"suctionValveType"|"secondarySuctionValveType";dischargeTypeField:"dischargeValveType"|"secondaryDischargeValveType";
  rows:Array<{field:DnField;title:string;subtitle:string;flow:number}>;
  threadedAllowed:boolean;forcedFlanged:boolean;color:"red"|"blue";
};
const isJockeyCircuit=(settings:SettingsEntity,secondary:boolean)=>secondary&&settings.stationType==="fire"&&settings.jockeyPump;

export const coreGetCircuitDnConfig=(entity:DnEntity,input:InputEntity,settings:SettingsEntity,secondary=false,pump?:Pump):CircuitDnConfig|null=>{
  if(!isCalculated(input))return null;
  const stationFlow=input.flowRate,pumpFlow=stationFlow/Math.max(1,input.workingPumpCount),collectorDn=recommendedDn(stationFlow,settings.baseValues?.values.velocity),pumpDn=recommendedDn(pumpFlow,settings.baseValues?.values.velocity);
  const values:Record<DnField,number>={
    suctionCollectorDn:entity.suctionCollectorDn??collectorDn,dischargeCollectorDn:entity.dischargeCollectorDn??collectorDn,suctionValveDn:entity.suctionValveDn??pumpDn,dischargeValveDn:entity.dischargeValveDn??pumpDn,
    secondarySuctionCollectorDn:entity.secondarySuctionCollectorDn??collectorDn,secondaryDischargeCollectorDn:entity.secondaryDischargeCollectorDn??collectorDn,secondarySuctionValveDn:entity.secondarySuctionValveDn??pumpDn,secondaryDischargeValveDn:entity.secondaryDischargeValveDn??pumpDn,
  };
  const suction=suctionHydraulics(entity,input,settings,secondary,pump);
  const discharge=dischargeHydraulics(entity,input,settings,secondary,pump);
  values[secondary?"secondarySuctionValveDn":"suctionValveDn"]=suction.dn;
  values[secondary?"secondaryDischargeValveDn":"dischargeValveDn"]=discharge.dn;
  const valveDns=secondary?[values.secondarySuctionValveDn,values.secondaryDischargeValveDn]:[values.suctionValveDn,values.dischargeValveDn],maxValveDn=Math.max(...valveDns);
  const jockey=isJockeyCircuit(settings,secondary);
  const savedConnection=secondary?entity.secondaryConnectionType:entity.connectionType;
  const {connection,forcedFlanged,threadedAllowed}=resolveDnConnection(settings,maxValveDn,secondary,savedConnection);
  const suctionValveType:ShutoffValveType=suction.valveType,dischargeValveType:ShutoffValveType=discharge.valveType;
  const fields=secondary?{suctionCollector:"secondarySuctionCollectorDn" as const,dischargeCollector:"secondaryDischargeCollectorDn" as const,suctionValve:"secondarySuctionValveDn" as const,dischargeValve:"secondaryDischargeValveDn" as const}:{suctionCollector:"suctionCollectorDn" as const,dischargeCollector:"dischargeCollectorDn" as const,suctionValve:"suctionValveDn" as const,dischargeValve:"dischargeValveDn" as const};
  return {suction,discharge,id:secondary?"secondary":"primary",title:secondary?(jockey?"Контур 2 · жокей-насос":"Контур 2 · совмещённая НС"):"Основной контур",stationFlow,pumpFlow,workingPumpCount:input.workingPumpCount,totalPumpCount:input.workingPumpCount+input.reservePumpCount,values,connection,pn:(secondary?entity.secondaryPn:entity.pn)??16,suctionValveType,dischargeValveType,connectionField:secondary?"secondaryConnectionType":"connectionType",pnField:secondary?"secondaryPn":"pn",suctionTypeField:secondary?"secondarySuctionValveType":"suctionValveType",dischargeTypeField:secondary?"secondaryDischargeValveType":"dischargeValveType",threadedAllowed,forcedFlanged,color:settings.stationType==="fire"||settings.stationType==="combined"&&!secondary?"red":"blue",rows:[
    {field:fields.suctionCollector,title:"Всасывающий коллектор",subtitle:"Расход контура",flow:stationFlow},{field:fields.dischargeCollector,title:"Напорный коллектор",subtitle:"Расход контура",flow:stationFlow},{field:fields.suctionValve,title:"Арматура на всасе насоса",subtitle:"Расход одного рабочего насоса",flow:pumpFlow},{field:fields.dischargeValve,title:"Арматура на напоре насоса",subtitle:"Расход одного рабочего насоса",flow:pumpFlow},
  ]};
};

const componentDn=(item:ComponentItem)=>{for(const field of item.fields){const label=componentFieldLabel(field),match=String(field.value??"").match(/(?:DN|Ду)\s*(\d+)/i);if(/^DN$|условн|диаметр/i.test(label)&&match)return Number(match[1]);}return null;};
const componentText=(item:ComponentItem)=>`${item.family} ${item.fields.flatMap(field=>[...field.headerPath,String(field.value??"")]).join(" ")}`;
const componentPns=(item:ComponentItem)=>[...componentText(item).matchAll(/PN\s*(10|16|25)(?:\s*\/\s*(10|16|25))?/gi)].flatMap(match=>[Number(match[1]),match[2]?Number(match[2]):null]).filter((value):value is number=>value!==null);
const checkValvePns=(item:ComponentItem):ValvePn[]=>{
  const explicit=componentPns(item) as ValvePn[];if(explicit.length)return explicit;
  const text=componentText(item);
  if(/латунн.*сердечник/i.test(text)||/010C\.Y.*красн/i.test(text))return [16];
  if(/\b(?:010C(?:\.Y)?|012F(?:\.[ZM])?)\b/i.test(text))return [10,16];
  return [];
};
const checkValveMaterial=(material:CollectorMaterial,connection:ValveConnection)=>connection==="threaded"?"Латунь":material==="aisi304"?"Нержавеющая сталь":"Чугун";
const componentColor=(item:ComponentItem):"red"|"blue"|"neutral"=>/красн/i.test(componentText(item))?"red":/син/i.test(componentText(item))?"blue":"neutral";
type ValveSelectionKind="butterfly"|"ball"|"check";
type ValveSelection={item:ComponentItem;price:ComponentPrice|null;execution:string;material:string|null};
export const coreSelectValveComponent=(items:ComponentItem[],kind:ValveSelectionKind,dn:number,connection:ValveConnection,pn:ValvePn,color:"red"|"blue",collectorMaterial:CollectorMaterial):ValveSelection|null=>{
  const catalogId=kind==="butterfly"?"затворы":kind==="ball"?"шаровые-краны":"обратные-клапаны";
  return rankValve(valvesByDn(items,catalogId,dn),kind,dn,connection,pn,color,collectorMaterial);
};
export function coreValvesByDn(items:ComponentItem[],category:string,dn:number){return items.filter(item=>item.catalogId===category&&componentDn(item)===dn);}
export const coreRankValve=(candidates:ComponentItem[],kind:ValveSelectionKind,dn:number,connection:ValveConnection,pn:ValvePn,color:"red"|"blue",collectorMaterial:CollectorMaterial):ValveSelection|null=>{
  if(kind==="ball"){
    // Ball valves are always the brass lever-handle catalogue series. Colour
    // and collector material do not apply; DN, PN and connection still do.
    if(connection!=="threaded")return null;
    const ranked=candidates.filter(item=>/латун/i.test(item.family)&&/ручка[\s—–-]*рычаг/i.test(item.family))
      .filter(item=>{const pns=componentPns(item);return !pns.length||pns.includes(pn);})
      .map(item=>({item,price:item.prices.find(price=>Number.isFinite(price.amount)&&price.amount>0)??null}))
      .filter(candidate=>candidate.price)
      .sort((a,b)=>a.price!.amount-b.price!.amount||a.item.id.localeCompare(b.item.id));
    const best=ranked[0];
    return best?{...best,execution:"резьбовое · ручка-рычаг",material:"Латунь"}:null;
  }
  candidates=candidates.filter(item=>connection==="threaded"?(kind==="check"&&/латун/i.test(componentText(item))):(kind==="butterfly"||kind==="check"&&/фланц/i.test(componentText(item))));
  candidates=candidates.filter(item=>{const pns=kind==="check"?checkValvePns(item):componentPns(item);return !pns.length||pns.includes(pn);});
  const actuation=kind==="butterfly"?(dn<=150?/рукоятк/i:/редуктор/i):null;
  const material=kind==="check"?checkValveMaterial(collectorMaterial,connection):null;
  const ranked=candidates.map(item=>{const price=actuation?item.prices.find(entry=>actuation.test(entry.label))??null:material?item.prices.find(entry=>entry.label.toLocaleLowerCase("ru-RU").includes(material.toLocaleLowerCase("ru-RU")))??null:item.prices[0]??null,colorRank=color==="red"?(componentColor(item)==="red"?0:1):(componentColor(item)==="blue"?0:componentColor(item)==="neutral"?1:2),pnRank=(kind==="check"?checkValvePns(item):componentPns(item)).includes(pn)?0:1;return {item,price,colorRank,pnRank};}).filter(candidate=>(kind!=="butterfly"&&kind!=="check")||candidate.price).sort((a,b)=>a.colorRank-b.colorRank||a.pnRank-b.pnRank||(a.price?.amount??Number.MAX_VALUE)-(b.price?.amount??Number.MAX_VALUE));
  const best=ranked[0];if(!best)return null;
  return {item:best.item,price:best.price,execution:kind==="butterfly"?(dn<=150?"с рукояткой":"с редуктором"):connection==="threaded"?"резьбовое":"фланцевое",material};
};

const HYDRAULIC_SPEC_OPTIONS:SpecOption[]=["primarySuctionValve","primaryDischargeValve","primaryCheckValve","secondarySuctionValve","secondaryDischargeValve","secondaryCheckValve"];
export const valveSpecItem=(selection:ValveSelection|null,kind:ValveSelectionKind,circuit:CircuitDnConfig,dn:number,section:SpecSection,position:string,option:SpecOption,collectorMaterial:CollectorMaterial):SpecItem=>{
  if(kind==="ball")return {
    position,name:selection?.item.family??"Кран шаровой латунный · ручка-рычаг",
    details:`DN${dn} · PN${circuit.pn} · ${circuit.connection==="threaded"?"Резьбовое до 2″":"Требуется фланцевое соединение"} · Материал: Латунь · Ручка-рычаг`,
    quantity:circuit.totalPumpCount,unit:"шт.",price:selection?.price?.amount??null,equipmentId:selection?.item.id,
    description:selection?`${circuit.title} · латунный кран с ручкой-рычагом; цвет и материал коллектора не учитываются`:`${circuit.title} · латунный кран с ручкой-рычагом по DN, PN и соединению не найден в базе`,
    section,option,technicalStatus:selection?"ready":"unverified",status:selection?.price?"selected":"clarify",
  };
  const connectionLabel=circuit.connection==="threaded"?"Резьбовое до 2″":"Фланцевое",colorLabel=selection&&componentColor(selection.item)!==circuit.color?`Подобрано совместимое исполнение другого цвета`:(circuit.color==="red"?"Красное исполнение":"Синее исполнение в приоритете"),typeLabel=kind==="butterfly"?"Затвор дисковый":"Клапан обратный",execution=kind==="butterfly"?(dn<=150?"рукоятка":"редуктор"):circuit.connection==="threaded"?"резьбовой":"фланцевый";
  const material=kind==="check"?(selection?.material??checkValveMaterial(collectorMaterial,circuit.connection)):null,materialDetails=material?` · Материал: ${material}`:"";
  return {position,name:selection?.item.family??typeLabel,details:`DN${dn} · PN${circuit.pn} · ${connectionLabel} · ${colorLabel} · ${execution}${materialDetails}`,quantity:circuit.totalPumpCount,unit:"шт.",price:selection?.price?.amount??null,equipmentId:selection?.item.id,description:selection?`${circuit.title} · подобрано из базы комплектующих по DN, PN и материалу коллектора`:`${circuit.title} · точное исполнение по DN, PN, соединению, цвету и материалу коллектора не найдено в базе`,section,option,technicalStatus:selection?"ready":"unverified",status:selection?.price?"selected":"clarify"};
};
export const coreBuildValveSpecItems=(database:ComponentsDatabase,entity:DnEntity,input:InputEntity,secondaryInput:InputEntity,settings:SettingsEntity,dischargeMaterial?:CollectorMaterial,pumps?:readonly Pump[]|null)=>{
  const primary=getCircuitDnConfig(entity,input,settings,false,pumps?.find(p=>p.id===input.selectedPumpId)),secondary=isSecondaryEnabled(settings)?getCircuitDnConfig(entity,secondaryInput,settings,true,pumps?.find(p=>p.id===secondaryInput.selectedPumpId)):null,circuits=[primary,...(secondary?[secondary]:[])].filter((item):item is CircuitDnConfig=>Boolean(item)),collectorMaterial=entity.collectorMaterial??defaultCollectorMaterial(settings);
  return circuits.flatMap(circuit=>{const secondaryCircuit=circuit.id==="secondary",suctionDn=circuit.values[secondaryCircuit?"secondarySuctionValveDn":"suctionValveDn"],dischargeDn=circuit.values[secondaryCircuit?"secondaryDischargeValveDn":"dischargeValveDn"],prefix=secondaryCircuit?"secondary":"primary";
    const suctionKind:ValveSelectionKind=circuit.suctionValveType,dischargeKind:ValveSelectionKind=circuit.dischargeValveType;
    return [
      valveSpecItem(selectValveComponent(database.items,suctionKind,suctionDn,circuit.suction.connection,circuit.pn,circuit.color,collectorMaterial),suctionKind,{...circuit,connection:circuit.suction.connection},suctionDn,"suction",secondaryCircuit?"03.20":"03.10",`${prefix}SuctionValve` as SpecOption,collectorMaterial),
      valveSpecItem(selectValveComponent(database.items,dischargeKind,dischargeDn,circuit.discharge.connection,circuit.pn,circuit.color,dischargeMaterial??collectorMaterial),dischargeKind,{...circuit,connection:circuit.discharge.connection},dischargeDn,"discharge",secondaryCircuit?"04.20":"04.10",`${prefix}DischargeValve` as SpecOption,dischargeMaterial??collectorMaterial),
      valveSpecItem(selectValveComponent(database.items,"check",dischargeDn,circuit.discharge.connection,circuit.pn,circuit.color,dischargeMaterial??collectorMaterial),"check",{...circuit,connection:circuit.discharge.connection},dischargeDn,"discharge",secondaryCircuit?"04.21":"04.11",`${prefix}CheckValve` as SpecOption,dischargeMaterial??collectorMaterial),
    ];
  });
};

export function coreRefreshSuctionSpecification(project:ProjectConfig,database?:ComponentsDatabase,force=false,pumps?:readonly Pump[]|null):ProjectConfig {
  if(database)database=bindProjectComponents(project,database);
  const spec=project.entities["station-spec"] as SpecEntity;
  const primary=project.entities["system-input"] as InputEntity;
  const managed=spec.items.filter(item=>(item.generatedBy==="suction-line"||item.generatedBy==="discharge-line"));
  // This module belongs to the full workspace. Legacy/test autoHydraulics=false
  // must not disable filling a calculated project; beta has its own workspace.
  // Leave an uncalculated draft intact, but clear stale generated lines if its
  // working point is later invalidated.
  if(!database || (!force&&!isCalculated(primary)&&!managed.length)) {
    const items=checkDischargeSpecPressure(project,checkSuctionSpecPressure(project,spec.items,database,database?.collectorCatalog,pumps),database,database?.collectorCatalog,pumps);
    return JSON.stringify(items)===JSON.stringify(spec.items)?project:{...project,entities:{...project.entities,"station-spec":{...spec,items}}};
  }
  const dn=project.entities["station-dn"] as DnEntity,settings=project.entities["station-settings"] as SettingsEntity,secondary=project.entities["system-input-2"] as InputEntity;
  const valves=buildValveSpecItems(database,dn,primary,secondary,settings,(project.entities["station-collectors"] as CollectorsEntity).discharge.configuration?.material,pumps);
  const base=spec.items.filter(item=>!HYDRAULIC_SPEC_OPTIONS.includes(specificationOption(item) as SpecOption));
  const suction=replaceSuctionSpec(base,buildSuctionSpec(project,database,database.collectorCatalog,valves,pumps));
  const discharge=replaceDischargeSpec(suction,buildDischargeSpec(project,database,database.collectorCatalog,valves,pumps));
  const items=checkDischargeSpecPressure(project,checkSuctionSpecPressure(project,normalizeSpecificationItems([...discharge,...valves]),database,database.collectorCatalog,pumps),database,database.collectorCatalog,pumps);
  // A current selection fingerprint does not guarantee current catalogue prices.
  if(spec.autoHydraulics&&JSON.stringify(items)===JSON.stringify(spec.items))return project;
  return {...project,entities:{...project.entities,"station-spec":{...spec,items,autoHydraulics:true}}};
}

export function getCircuitDnConfig(...args: Parameters<typeof coreGetCircuitDnConfig>): ReturnType<typeof coreGetCircuitDnConfig> {
  return engineeringOperation("getCircuitDnConfig", coreGetCircuitDnConfig, args);
}

registerOperation("getCircuitDnConfig", ["entity","input","settings","secondary","pump"], coreGetCircuitDnConfig);

export function selectValveComponent(...args: Parameters<typeof coreSelectValveComponent>): ReturnType<typeof coreSelectValveComponent> {
  return engineeringOperation("selectValveComponent", coreSelectValveComponent, args);
}

registerOperation("selectValveComponent", ["items","kind","dn","connection","pn","color","collectorMaterial"], coreSelectValveComponent);

export function buildValveSpecItems(...args: Parameters<typeof coreBuildValveSpecItems>): ReturnType<typeof coreBuildValveSpecItems> {
  return engineeringOperation("buildValveSpecItems", coreBuildValveSpecItems, args);
}

registerOperation("buildValveSpecItems", ["database","entity","input","secondaryInput","settings","dischargeMaterial","pumps"], coreBuildValveSpecItems);

export function refreshSuctionSpecification(...args: Parameters<typeof coreRefreshSuctionSpecification>): ReturnType<typeof coreRefreshSuctionSpecification> {
  return engineeringOperation("refreshSuctionSpecification", coreRefreshSuctionSpecification, args);
}

registerOperation("refreshSuctionSpecification", ["project","database","force","pumps"], coreRefreshSuctionSpecification);

export function valvesByDn(...args:Parameters<typeof coreValvesByDn>):ReturnType<typeof coreValvesByDn>{return engineeringOperation("valvesByDn",coreValvesByDn,args);}
registerOperation("valvesByDn",["items","category","dn"],coreValvesByDn);

export function rankValve(...args:Parameters<typeof coreRankValve>):ReturnType<typeof coreRankValve>{return engineeringOperation("rankValve",coreRankValve,args);}
registerOperation("rankValve",["items","kind","dn","connection","pn","color","collectorMaterial"],coreRankValve);
