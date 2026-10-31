import defaults from "../data/collector-nipple-rules.json";
import type { BaseValues } from "./base-values";

export type CollectorNippleRules = { suctionDn15:number; dischargeDn15:number; dischargeSt20OrTwoCircuitsDn15:number; dischargeDn20:number };
export type NippleConditions = {
  side:"all"|"suction"|"discharge"; material:"all"|"aisi304"|"st20";
  circuits:"all"|"1"|"2"; stationType:"all"|"utility"|"fire"|"combined"|"smart";
  pn:"all"|"10"|"16"|"25"; dnFrom:number|null; dnTo:number|null; tank:"all"|"on"|"off";
};
export type NippleOutput = {
  id:string; dn:number; quantity:number; lengthMm:number; threaded:boolean;
  purpose:"instrument"|"tank"|"reserve"; state:"auto"|"occupied"|"capped"|"open";
  threadPitchMm?:number|null; threadLengthMm?:number|null;
};
export type CollectorNippleRule = { id:string; name:string; enabled:boolean; when:NippleConditions; outputs:NippleOutput[] };
export type CollectorNippleRuleSet = { version:2; rules:CollectorNippleRule[] };
export type CollectorCombination = { side:"suction"|"discharge"; circuits:1|2; material:"aisi304"|"st20" };
export type CollectorNippleCombination = CollectorCombination & { outputs:NippleOutput[] };
export type CollectorNippleSettings = { version:3; combinations:CollectorNippleCombination[] };
export type CollectorNippleConfiguration = CollectorNippleRules|CollectorNippleRuleSet|CollectorNippleSettings;
export type NippleContext = { side:"suction"|"discharge"; material:string; circuits:1|2; stationType:string; pn:number; dn:number|null; tank:boolean };
export const SUPPORTED_NIPPLE_DNS = [15,20,25,32,40,50] as const;
export const DEFAULT_COLLECTOR_NIPPLES:Readonly<CollectorNippleRules> = defaults;
export const collectorNippleRules = (values?:BaseValues):CollectorNippleConfiguration => structuredClone(values?.preferences.collectorNipples??DEFAULT_COLLECTOR_NIPPLES);
export const anyNippleConditions = ():NippleConditions => ({side:"all",material:"all",circuits:"all",stationType:"all",pn:"all",dnFrom:null,dnTo:null,tank:"all"});
export const newNippleOutput = (id:string):NippleOutput => ({id,dn:15,quantity:1,lengthMm:60,threaded:true,purpose:"instrument",state:"auto"});
export const COLLECTOR_COMBINATIONS:ReadonlyArray<CollectorCombination> = (["suction","discharge"] as const).flatMap(side=>([1,2] as const).flatMap(circuits=>(["aisi304","st20"] as const).map(material=>({side,circuits,material}))));
export const collectorCombinationKey = (c:CollectorCombination):string => `${c.side}-${c.circuits}-${c.material}`;
export const collectorCombinationLabel = (c:CollectorCombination):string => `${c.side==="suction"?"Всасывающий":"Напорный"} · ${c.circuits===1?"1 контур":"2 контура"} · ${c.material==="aisi304"?"AISI304":"Ст20"}`;
const combinationRule = (c:CollectorNippleCombination):CollectorNippleRule => ({id:collectorCombinationKey(c),name:collectorCombinationLabel(c),enabled:true,when:{...anyNippleConditions(),side:c.side,material:c.material,circuits:String(c.circuits) as "1"|"2"},outputs:structuredClone(c.outputs)});
export function collectorNippleCounts(type:"suction"|"discharge",material:string,twoCircuits:boolean,rules:CollectorNippleRules=DEFAULT_COLLECTOR_NIPPLES) {
  return {dn15:type==="suction"?rules.suctionDn15:material==="st20"||twoCircuits?rules.dischargeSt20OrTwoCircuitsDn15:rules.dischargeDn15,dn20:type==="discharge"?rules.dischargeDn20:0};
}
/** Runtime conversion only: immutable publications and project JSON are untouched. */
export function collectorRuleSet(value:CollectorNippleConfiguration=DEFAULT_COLLECTOR_NIPPLES):CollectorNippleRuleSet {
  if("version" in value&&value.version===3)return {version:2,rules:COLLECTOR_COMBINATIONS.map(c=>value.combinations.find(entry=>collectorCombinationKey(entry)===collectorCombinationKey(c))).filter((c):c is CollectorNippleCombination=>Boolean(c)).map(combinationRule)};
  if("version" in value&&value.version===2)return structuredClone(value);
  const legacy=value as CollectorNippleRules;
  const output=(dn:number,quantity:number):NippleOutput=>({...newNippleOutput(`dn-${dn}`),dn,quantity,purpose:dn===20?"tank":"instrument"});
  const rule=(id:string,name:string,when:Partial<NippleConditions>,dn15:number,dn20:number):CollectorNippleRule=>({id,name,enabled:true,when:{...anyNippleConditions(),...when},outputs:[output(15,dn15),...(dn20?[output(20,dn20)]:[])]});
  return {version:2,rules:[rule("suction","Всасывающий коллектор",{side:"suction"},legacy.suctionDn15,0),
    rule("discharge-steel","Напорный · Ст20",{side:"discharge",material:"st20"},legacy.dischargeSt20OrTwoCircuitsDn15,legacy.dischargeDn20),
    rule("discharge-two-circuits","Напорный · два контура",{side:"discharge",circuits:"2"},legacy.dischargeSt20OrTwoCircuitsDn15,legacy.dischargeDn20),
    rule("discharge-other","Остальные напорные коллекторы",{side:"discharge"},legacy.dischargeDn15,legacy.dischargeDn20)]};
}
/** Expand old broad rules without changing the stored publication. */
export function collectorCombinationSettings(value:CollectorNippleConfiguration=DEFAULT_COLLECTOR_NIPPLES):CollectorNippleSettings {
  if("version" in value&&value.version===3)return structuredClone(value);
  const rules=collectorRuleSet(value).rules;
  return {version:3,combinations:COLLECTOR_COMBINATIONS.map(c=>({...c,outputs:structuredClone(rules.find(r=>r.enabled&&matchesNippleRule(r.when,{...c,stationType:"utility",pn:16,dn:null,tank:false}))?.outputs??[])}))};
}
/** Narrow legacy conditions cannot be silently flattened into a combination. */
export function collectorCombinationConversionIssue(value?:CollectorNippleConfiguration):string {
  if(!value||!("version" in value)||value.version===3)return "";
  const rules=value.rules.filter(r=>r.enabled);
  if(rules.some(r=>r.when.stationType!=="all"||r.when.pn!=="all"||r.when.dnFrom!==null||r.when.dnTo!==null||r.when.tank!=="all"))return "Прежние правила содержат дополнительные условия по типу станции, DN/PN или баку. Их нельзя однозначно перенести в настройки по типу, контурам и материалу. Сохранённые параметры продолжают действовать до явной замены начальной схемой.";
  if(COLLECTOR_COMBINATIONS.some(c=>!rules.some(r=>matchesNippleRule(r.when,{...c,stationType:"utility",pn:16,dn:null,tank:false}))))return "В прежних правилах настроены не все комбинации коллекторов. Сохранённые параметры продолжают действовать; для перехода заполните комбинации на основе начальной схемы.";
  return "";
}
export function matchesNippleRule(when:NippleConditions,c:NippleContext):boolean {
  return (when.side==="all"||when.side===c.side)&&(when.material==="all"||when.material===c.material)
    &&(when.circuits==="all"||Number(when.circuits)===c.circuits)&&(when.stationType==="all"||when.stationType===c.stationType)
    &&(when.pn==="all"||Number(when.pn)===c.pn)&&(when.tank==="all"||(when.tank==="on")===c.tank)
    &&(when.dnFrom===null||c.dn!==null&&c.dn>=when.dnFrom)&&(when.dnTo===null||c.dn!==null&&c.dn<=when.dnTo);
}
export function resolveNippleRule(value:CollectorNippleConfiguration|undefined,context:NippleContext) {
  const errors=validateCollectorNippleRules(value);
  if(errors.length)return {rule:null,outputs:[],error:errors.join(" ")};
  const rules=collectorRuleSet(value),rule=rules.rules.find(r=>r.enabled&&matchesNippleRule(r.when,context));
  return rule?{rule,outputs:rule.outputs.filter(o=>o.quantity>0),error:""}:{rule:null,outputs:[],error:"Не найдено подходящее правило сгонов коллектора в базовых значениях. Добавьте правило для выбранных параметров."};
}
const record=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==="object"&&!Array.isArray(v);
const dimension=(v:unknown,max=1000):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>0&&v<=max;
export function validateCollectorNippleRules(raw:unknown):string[] {
  if(raw===undefined)return [];
  if(!record(raw))return ["Количество сгонов: некорректная структура правил."];
  if(!Object.hasOwn(raw,"version"))return Object.keys(raw).length===4&&Object.keys(DEFAULT_COLLECTOR_NIPPLES).every(k=>Number.isInteger(raw[k])&&Number(raw[k])>=1&&Number(raw[k])<=8)?[]:["Количество сгонов: прежний формат требует четыре целых значения от 1 до 8."];
  if(raw.version===3){
    if(!Array.isArray(raw.combinations)||raw.combinations.length!==COLLECTOR_COMBINATIONS.length)return ["Настройки коллекторов: требуется восемь комбинаций типа, контуров и материала."];
    const keys=new Set<string>(),errors:string[]=[];
    for(const c of raw.combinations){
      if(!record(c)||!["suction","discharge"].includes(String(c.side))||!["aisi304","st20"].includes(String(c.material))||(c.circuits!==1&&c.circuits!==2)||!Array.isArray(c.outputs)){errors.push("Настройки коллекторов: некорректный тип, число контуров, материал или состав.");continue;}
      const entry=c as CollectorNippleCombination,key=collectorCombinationKey(entry);
      if(keys.has(key))errors.push(`Настройки коллекторов: повторяется комбинация «${collectorCombinationLabel(entry)}».`);
      keys.add(key);
      errors.push(...validateCollectorNippleRules({version:2,rules:[combinationRule(entry)]}).map(error=>`${collectorCombinationLabel(entry)}: ${error}`));
    }
    if(COLLECTOR_COMBINATIONS.some(c=>!keys.has(collectorCombinationKey(c))))errors.push("Настройки коллекторов: заполните все восемь комбинаций.");
    return [...new Set(errors)];
  }
  if(raw.version!==2||!Array.isArray(raw.rules)||raw.rules.length>100)return ["Правила сгонов: ожидается список не более 100 правил версии 2."];
  const errors:string[]=[],ids=new Set<string>();
  for(const [i,r]of raw.rules.entries()){
    const label=`Правило сгонов ${i+1}`;
    if(!record(r)||typeof r.id!=="string"||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(r.id)||ids.has(r.id)||typeof r.name!=="string"||!r.name.trim()||r.name.length>200||typeof r.enabled!=="boolean"||!record(r.when)||!Array.isArray(r.outputs)||r.outputs.length>32){errors.push(`${label}: проверьте имя, ID, условия и список сгонов.`);continue;}
    ids.add(r.id);const w=r.when;
    if(!["all","suction","discharge"].includes(String(w.side))||!["all","aisi304","st20"].includes(String(w.material))||!["all","1","2"].includes(String(w.circuits))||!["all","utility","fire","combined","smart"].includes(String(w.stationType))||!["all","10","16","25"].includes(String(w.pn))||!["all","on","off"].includes(String(w.tank))
      ||![w.dnFrom,w.dnTo].every(v=>v===null||dimension(v,1200)&&Number.isInteger(v))||w.dnFrom!==null&&w.dnTo!==null&&Number(w.dnFrom)>Number(w.dnTo))errors.push(`${label}: некорректные условия применения или диапазон DN.`);
    const outputs=new Set<string>();let count=0;
    for(const o of r.outputs){
      if(!record(o)||typeof o.id!=="string"||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(o.id)||outputs.has(o.id)||!SUPPORTED_NIPPLE_DNS.includes(o.dn as typeof SUPPORTED_NIPPLE_DNS[number])||!Number.isInteger(o.quantity)||Number(o.quantity)<0||Number(o.quantity)>32||!dimension(o.lengthMm)||typeof o.threaded!=="boolean"||!["instrument","tank","reserve"].includes(String(o.purpose))||!["auto","occupied","capped","open"].includes(String(o.state))
        ||o.threadPitchMm!==undefined&&o.threadPitchMm!==null&&!dimension(o.threadPitchMm,10)||o.threadLengthMm!==undefined&&o.threadLengthMm!==null&&(!dimension(o.threadLengthMm)||Number(o.threadLengthMm)>=Number(o.lengthMm))){errors.push(`${label}: проверьте DN, количество 0–32, длину до 1000 мм, назначение и резьбу сгона.`);continue;}
      outputs.add(o.id);count+=Number(o.quantity);
    }
    if(count>32)errors.push(`${label}: всего допускается не более 32 сгонов.`);
  }
  return [...new Set(errors)];
}
export function describeNippleRules(value:CollectorNippleConfiguration|undefined):string {
  const labels:Record<string,string>={side:"сторона",suction:"всас",discharge:"напор",material:"материал",st20:"Ст20",aisi304:"AISI304",circuits:"контуры",stationType:"тип станции",utility:"хоз.",fire:"пожарная",combined:"совмещённая",smart:"Smart",pn:"PN",dnFrom:"DN от",dnTo:"DN до",tank:"бак",on:"вкл.",off:"выкл.",instrument:"КИП",reserve:"резерв",auto:"по оборудованию",occupied:"занят",capped:"заглушка",open:"открыт"};
  return collectorRuleSet(value).rules.map((r,i)=>{
    const conditions=Object.entries(r.when).filter(([,v])=>v!=="all"&&v!==null).map(([k,v])=>`${labels[k]}: ${labels[String(v)]??v}`).join(", ")||"любые параметры";
    return `${value&&"version" in value&&value.version===3?"":`${i+1}. `}${r.enabled?"":"Выключено: "}${r.name} [${conditions}]: ${describeNippleOutputs(r.outputs)}`;
  }).join("\n");
}
export function describeNippleOutputs(outputs:NippleOutput[]):string {
  const labels={instrument:"КИП",tank:"бак",reserve:"резерв",auto:"по оборудованию",occupied:"занят",capped:"заглушка",open:"открыт"};
  return outputs.filter(o=>o.quantity).map(o=>`${o.quantity} × DN${o.dn}, ${o.lengthMm} мм, ${o.threaded?`резьба${o.threadPitchMm?` шаг ${o.threadPitchMm} мм`:""}${o.threadLengthMm?` участок ${o.threadLengthMm} мм`:""}`:"без резьбы"}, ${labels[o.purpose]}, ${labels[o.state]}`).join("; ")||"без сгонов";
}
