import { positive, nonnegative, type Part, type Support, type Eyelet, type Rules } from "./types";
import { stationMass } from "./mass";
export function standHardware(profiles:boolean,cabinetWidth:number):Part[] {
 const make=(id:string,name:string,quantity:number):Part=>({id:`frame/${id}`,role:id,name,quantity,unitMassKg:null,unitPriceRub:null,specified:true,source:"Задано правилом комплектации рамы"});
 const suffix=cabinetWidth===800?" 1800 мм":"";
 return [make("stand-left","Стойка шкафа управления левая"+suffix,1),make("stand-right","Стойка шкафа управления правая"+suffix,1),make("bolt-m8-25","Болт М8×25",8),make("washer-m8","Шайба М8",profiles?12:8),make("rivet-m8","Гайка-заклёпка М8",profiles?12:8),...(profiles?[make("bolt-m8-35","Болт М8×35",4),{...make("profile","Профиль С-образный 40×40×20, L="+cabinetWidth+" мм",2),source:"Цена за штуку не зависит от длины 600/800 мм"}]:[])];
}
/** Enumerate complete pairs: their own weight can change feasibility. Never iterate stale outputs. */
export function chooseLoadHardware(base:Part[],waterKg:number,count:number,supports:Support[],eyes:Eyelet[],r:Rules,fasteners:(diameter:number,quantity:number,kind:"support"|"eyelet")=>Part[]) {
 const diagnostics:string[]=[];
 const initial=stationMass(base,waterKg);
 if(initial.operatingKg===null)return {support:null,eyelet:null,mass:initial,parts:[] as Part[],liftingApproved:false,diagnostics:["Не определена полная масса: "+initial.missing.join(", ")]};
 if(![4,6,8].includes(count))return {support:null,eyelet:null,mass:initial,parts:[] as Part[],liftingApproved:false,diagnostics:["Не определено количество опор"]};
 const eligible=supports.filter(s=>s.verified&&s.mounting==="two-studs"&&positive(s.capacityKg)&&nonnegative(s.massKg));
 const lifting=positive(r.liftingEffectiveLegs)&&r.liftingEffectiveLegs<=4;
 const eyecandidates=lifting?eyes.filter(e=>e.verified&&positive(e.capacity45Kg)&&nonnegative(e.massKg)):[];
 const combinations=[];
 for(const support of eligible)for(const eyelet of eyecandidates.length?eyecandidates:[null]){
  const parts:Part[]=[{id:"frame/supports",role:"supports",name:support.name,quantity:count,unitMassKg:support.massKg,unitPriceRub:support.priceRub,componentId:support.id,source:support.source},...fasteners(support.threadMm,count*2,"support")];
  if(eyelet)parts.push({id:"frame/eyelets",role:"eyelets",name:eyelet.name,quantity:4,unitMassKg:eyelet.massKg,unitPriceRub:eyelet.priceRub,componentId:eyelet.id,source:eyelet.source},...fasteners(eyelet.threadMm,4,"eyelet"));
  else parts.push({id:"frame/eyelets",role:"eyelets",name:"Рым-болты: схема подъёма не подтверждена",quantity:4,unitMassKg:null,unitPriceRub:null});
  const mass=stationMass([...base,...parts],waterKg);
  if(mass.operatingKg===null)continue;
  if(mass.operatingKg/count>support.capacityKg!)continue;
  if(eyelet&&mass.liftingKg!/r.liftingEffectiveLegs!>eyelet.capacity45Kg)continue;
  const price=parts.every(p=>nonnegative(p.unitPriceRub))?parts.reduce((s,p)=>s+p.quantity*p.unitPriceRub!,0):null;
  combinations.push({support,eyelet,mass,parts,price,liftingApproved:!!eyelet&&r.liftingAttachmentVerified});
 }
 combinations.sort((a,b)=>(a.price??Infinity)-(b.price??Infinity)||a.support.capacityKg!-b.support.capacityKg!||a.support.id.localeCompare(b.support.id));
 if(!lifting)diagnostics.push("Не подтверждены схема подъёма и число несущих ветвей; деление массы на четыре не применяется");
 if(!r.liftingAttachmentVerified)diagnostics.push("Крепление рым-болтов к листу требует подтверждения; подъём не разрешён расчётом");
 const selected=combinations[0];
 if(!selected)diagnostics.push("Нет подтверждённой комплектации опор и рым-болтов по полной массе, включая крепёж");
 return selected?{...selected,diagnostics}:{support:null,eyelet:null,mass:initial,parts:[] as Part[],liftingApproved:false,diagnostics};
}
