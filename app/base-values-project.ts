import { BASE_SECTIONS, BASE_LABELS, baseEqual, collectorNippleRules, legacyBaseSnapshot, spacingForPump, type AppliedBaseValues, type BaseSection } from "./base-values";
import { collectorRuleSet, describeNippleRules } from "./collector-nipple-rules";
import type { ProjectConfig, SettingsEntity, SpecEntity } from "./project-config";
import type { CollectorsEntity } from "./collector-project";

export type BaseChange = { section:BaseSection; label:string; before:string; after:string; unit:string; impact:string; manual:boolean };
const show=(v:unknown)=>v===null||v===undefined?"Не задано":typeof v==="object"?JSON.stringify(v):String(v);
export function projectBaseChanges(project:ProjectConfig, latest:AppliedBaseValues):BaseChange[] {
  const settings=project.entities["station-settings"] as SettingsEntity, old=settings.baseValues??legacyBaseSnapshot(), changes:BaseChange[]=[];
  const add=(section:BaseSection,label:string,before:unknown,after:unknown,unit:string,impact:string,manual=false)=>{if(!baseEqual(before,after))changes.push({section,label,before:show(before),after:show(after),unit,impact,manual});};
  for(const key of ["usdRate","cnyRate"] as const)if(old.values.financial[key]!==latest.values.financial[key])add("financial",key==="usdRate"?"USD/RUB":"CNY/RUB",settings[key],latest.values.financial[key],"₽/ед.","Закупочная стоимость насосов",settings[key]!==old.values.financial[key]);
  for(const key of new Set([...Object.keys(old.values.financial.discounts),...Object.keys(latest.values.financial.discounts)]))if(old.values.financial.discounts[key]!==latest.values.financial.discounts[key])add("financial",`Скидка ${key}`,settings.manufacturerDiscounts[key],latest.values.financial.discounts[key],"%","Стоимость насосов с прайс-листовой ценой",settings.manufacturerDiscounts[key]!==old.values.financial.discounts[key]);
  for(const [index,id] of ["system-input","system-input-2"].entries()) {
    if(index===1&&settings.stationType!=="combined"&&!(settings.stationType==="fire"&&settings.jockeyPump))continue;
    const input=project.entities[id];if(input?.kind!=="input"||!input.selectedPumpId)continue;
    const before=spacingForPump(old.values,input.selectedPumpId,Boolean(index)),after=spacingForPump(latest.values,input.selectedPumpId,Boolean(index));
    if(!baseEqual([before.spacing,before.radius,before.status],[after.spacing,after.radius,after.status])) {
      const collectors=project.entities["station-collectors"] as CollectorsEntity;
      for(const side of ["suction","discharge"] as const){const card=collectors[side];add("spacing",`${side==="suction"?"Всас":"Напор"}, контур ${index+1}: шаг / R / статус`,[index?card.spacing2:card.spacing1,before.radius,before.status],[after.spacing,after.radius,after.status],"мм","Геометрия, длина, стоимость коллектора и компоновка",Boolean(index?card.spacing2Manual:card.spacing1Manual));}
    }
  }
  for(const key of ["aisi304","st20"] as const)add("welding",`Сварка ${key}`,old.values.welding[key],latest.values.welding[key],"₽/м","Стоимость коллекторов и вставок");
  const oldThreads=old.values.welding.threadCutting??[],newThreads=latest.values.welding.threadCutting??[];
  for(const id of new Set([...oldThreads,...newThreads].map(row=>row.id))){const before=oldThreads.find(r=>r.id===id),after=newThreads.find(r=>r.id===id),row=after??before!;add("welding",`Нарезка резьбы ${row.material==="aisi304"?"AISI304":"Ст20"} DN${row.dn} ${row.thread}`,before?.pricePerEnd,after?.pricePerEnd,"₽/конец","Стоимость нарезки; готовая резьбовая деталь не тарифицируется повторно");add("welding",`Условия нарезки DN${row.dn} ${row.material}`,before&&{priceKind:before.priceKind,source:before.source,note:before.note,date:before.date},after&&{priceKind:after.priceKind,source:after.source,note:after.note,date:after.date},"","Применимость и достоверность тарифа");}
  if(!baseEqual(old.values.velocity,latest.values.velocity))add("velocity","Диапазоны DN и пределы скорости",old.values.velocity,latest.values.velocity,"м/с","Автоподбор DN и проверка скорости");
  for(const row of latest.values.painting){const prior=old.values.painting.find(p=>p.id===row.id);add("painting",`Окраска Ст20 DN${row.dn}`,prior?.pricePerMeter,row.pricePerMeter,"₽/м","Стоимость окраски коллекторов и вставок");}
  const oldProducts={hoseLengthMm:old.values.preferences.hoseLengthMm,rules:old.values.preferences.rules},newProducts={hoseLengthMm:latest.values.preferences.hoseLengthMm,rules:latest.values.preferences.rules};
  if(!baseEqual(oldProducts,newProducts))add("preferences","Предпочтительные изделия и подводка",oldProducts,newProducts,"","Подбор совместимых комплектующих",Boolean(Object.keys(settings.hydraulicOptions?.products??{}).length||settings.hydraulicOptions?.hoseLengthMm));
  const beforeNipples=collectorNippleRules(old.values),afterNipples=collectorNippleRules(latest.values);
  if(!baseEqual(collectorRuleSet(beforeNipples),collectorRuleSet(afterNipples)))add("preferences","Настройки коллекторов",describeNippleRules(beforeNipples),describeNippleRules(afterNipples),"","Состав, длины, резьба, сварка, стоимость и 3D коллекторов");
  return changes;
}
export function applyProjectBaseUpdate(project:ProjectConfig, latest:AppliedBaseValues, sections:BaseSection[], replaceManual=false):ProjectConfig {
  const next=structuredClone(project),settings=next.entities["station-settings"] as SettingsEntity,old=settings.baseValues??legacyBaseSnapshot();
  const applied=structuredClone(old);
  for(const section of BASE_SECTIONS)if(sections.includes(section)){Object.assign(applied.values,{[section]:structuredClone(latest.values[section])});applied.versions[section]=latest.versions[section];}
  if(sections.includes("financial")) {
    for(const key of ["usdRate","cnyRate"] as const)if(replaceManual||settings[key]===old.values.financial[key])settings[key]=latest.values.financial[key];
    for(const [key,value]of Object.entries(latest.values.financial.discounts))if(replaceManual||settings.manufacturerDiscounts[key]===old.values.financial.discounts[key]||settings.manufacturerDiscounts[key]===undefined)settings.manufacturerDiscounts[key]=value;
  }
  const collectors=next.entities["station-collectors"] as CollectorsEntity;
  if(sections.includes("spacing"))for(const card of [collectors.suction,collectors.discharge]){delete card.spacing1Confirmation;delete card.spacing2Confirmation;if(replaceManual){card.spacing1Manual=false;card.spacing2Manual=false;}}
  if(sections.includes("preferences")) {
    if(!baseEqual(collectorRuleSet(collectorNippleRules(old.values)),collectorRuleSet(collectorNippleRules(latest.values))))for(const card of [collectors.suction,collectors.discharge]){card.status=card.calculation?"stale":"uncalculated";card.database=null;card.databaseStatus="unchecked";card.calculationSourceFingerprint=undefined;}
    if(replaceManual)settings.hydraulicOptions={products:{}};
    else {
      // Preserve explicitly chosen products; automatic selections may be rebuilt
      // only because the user has selected this section for updating.
      settings.hydraulicOptions={...settings.hydraulicOptions,products:{...settings.hydraulicOptions?.products}};
    }
    const spec=next.entities["station-spec"] as SpecEntity;spec.items=spec.items.filter(item=>item.generatedBy!=="hydraulic-options");
  }
  settings.baseValues=applied;
  if(sections.some(s=>["spacing","welding","velocity","painting"].includes(s)))for(const card of [collectors.suction,collectors.discharge]){card.status=card.calculation?"stale":"uncalculated";card.database=null;card.databaseStatus="unchecked";card.currentCatalogVersion=undefined;card.calculationSourceFingerprint=undefined;}
  const spec=next.entities["station-spec"] as SpecEntity;
  if(sections.some(s=>["welding","painting"].includes(s)))for(const item of spec.items)if(item.insertionAssembly){item.technicalStatus="stale";item.technicalNotes=[`Обновлены ${sections.map(s=>BASE_LABELS[s]).join(", ")}. Требуется расчёт вставки по выбранным тарифам.`];item.price=null;}
  spec.synchronization=undefined;
  return next;
}
