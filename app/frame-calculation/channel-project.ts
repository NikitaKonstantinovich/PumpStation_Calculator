import type { StationWork } from "../station-specification";
import type { InputEntity, SpecEntity, SpecItem, SettingsEntity } from "../project-config";
import type { CollectorsEntity } from "../collector-project";
import { componentField, componentMass,componentPrice, bindFramePart } from "./components";
import { stationMass } from "./mass";
import { frameManagedOptions, specificationMassParts } from "./specification-mass";
import { automaticFrameItem } from "../frame-selection";
import { calculateChannelFrame } from "./channel";
import type { ChannelCabinet, ChannelInputs, ChannelPump, ChannelPumpMount, ChannelResult } from "./channel-types";
import type { FrameWork } from "./project";
import type { Part } from "./types";
import { reviewedChannelMount } from "./channel-mountings";
import { channelCabinetForWidth } from "./channel-cabinet";
import { channelWelding } from "./channel-welding";
import { channelMetrePrice } from "./channel-pricing";
import { nonnegative } from "./types";
import { channelPaintingCost } from "../channel-painting";
import { channelFasteners,channelFastenerRadius } from "./channel-fasteners";
import { WELD_RATES } from "../collector-calculations";
import { standHardware } from "./hardware";
import { channelManufacturingMass } from "./channel-mass";
import type { Support } from "./types";

export function channelProjectInputs(work:StationWork):ChannelInputs {
 const spec=work.next.entities["station-spec"] as SpecEntity;
 const row=spec.items.find(r=>r.option==="controlCabinet"&&r.quantity>0);
 const item=work.resources.components?.items.find(c=>c.id===row?.equipmentId);
 const data=componentField(item,"FRAME_CHANNEL_MOUNTING");
 return {cabinet:data&&typeof data==="object"?{...data as ChannelCabinet,equipmentId:row!.equipmentId!}:null};
}
export function placeChannelFrame(state:FrameWork):FrameWork {
 const work=state.work,collectors=work.next.entities["station-collectors"] as CollectorsEntity;
 const pumps:ChannelPump[]=state.pumps.map((p):ChannelPump=>{
  const catalog=work.resources.pumps?.find(v=>v.id===p.id);
  const input=work.next.entities[p.circuit===1?"system-input":"system-input-2"] as InputEntity;
  const side=p.circuit===1?"primary":"secondary",a=collectors?.suction?.configuration?.[side],b=collectors?.discharge?.configuration?.[side];
  const circuit=b??a;
  const conflict=a&&b&&a.spacing!==b.spacing;
  const raw=state.channelInputs?.pumpMountings?.[p.id]??(catalog?.mounting?.frameChannelV1 as ChannelPumpMount|undefined)??reviewedChannelMount(catalog,p.mounting);
  const data=raw?structuredClone(raw):null,radius=channelFastenerRadius(data?.mounting.boltDiameterMm??undefined,state.components);
  if(data&&radius)data.mounting.holes=data.mounting.holes.map(h=>({...h,clearanceMm:Math.max(h.clearanceMm??0,radius)}));
  const status=circuit?.spacingResult?.status??circuit?.spacingStatus;
  return {...p,type:catalog?.type??"unknown",mounting:data??null,
   spacing:{mm:circuit?.spacing??null,status:conflict?"conflict":status&&["confirmed","conditional","missing","conflict","stale"].includes(status)?status as ChannelPump["spacing"]["status"]:"conditional",
    source:circuit?.spacingResult?.message??circuit?.spacingNote??(circuit?.spacingManual?"Ручное значение компоновки":"Сохранённое межосевое расстояние; статус не подтверждён"),
    fingerprint:JSON.stringify([input.selectedPumpId,circuit?.spacingResult?.fingerprint,circuit?.spacingConfirmation])}};
 });
 const selectedCabinet=(work.next.entities["station-spec"] as SpecEntity).items.find(r=>r.option==="controlCabinet"&&r.quantity>0);
 const inputs=structuredClone(state.channelInputs??{});
 const support=componentField(state.components.find(c=>c.id===inputs.vibrationSupportId),"FRAME_SUPPORT") as Support|undefined;
 if(support?.verified&&support.threadMm>0){inputs.foundationHoleMm=support.threadMm+(support.threadMm<=10?1:2);inputs.foundationSource=`Виброопора ${support.name}; отверстие под шпильку M${support.threadMm}. ${support.source}`;}
 const separate=(work.next.entities["station-settings"] as SettingsEntity).cabinetSeparate;
 if(typeof separate==="boolean")inputs.cabinetSeparate=separate;
 if(pumps.every(p=>p.type==="vertical_multistage")){
  inputs.tank=state.tank;inputs.tankRules=state.result.rules;
  if(inputs.tank?.mounting){const radius=channelFastenerRadius(inputs.tank.mounting.boltDiameterMm??undefined,state.components);if(radius)inputs.tank.mounting.holes=inputs.tank.mounting.holes.map(h=>({...h,clearanceMm:radius}));}
 }
 // The normalized mounting includes fastener envelopes; do not reapply a raw override.
 inputs.pumpMountings=Object.fromEntries(pumps.filter(p=>p.mounting).map(p=>[p.id,p.mounting!]));
 if(selectedCabinet?.equipmentId&&[600,800].includes(inputs.cabinetEnclosureWidthMm??0))inputs.cabinet=channelCabinetForWidth(selectedCabinet.equipmentId,inputs.cabinetEnclosureWidthMm!);
 const radius=channelFastenerRadius(inputs.cabinet?.mounting.boltDiameterMm??undefined,state.components);
 if(inputs.cabinet&&radius)inputs.cabinet.mounting.holes=inputs.cabinet.mounting.holes.map(h=>({...h,clearanceMm:Math.max(h.clearanceMm??0,radius)}));
 if(!inputs.cabinetSeparate&&inputs.cabinet&&inputs.cabinet.equipmentId!==selectedCabinet?.equipmentId){inputs.cabinet=null;state.result.issues.push({code:"channel-cabinet-stale",message:"Монтажная схема шкафа не соответствует выбранной каталожной позиции",blocking:true});}
 const channel=calculateChannelFrame(pumps,inputs,state.result.rules.channel);
 state.result.channel=channel;state.result.issues.push(...channel.issues);
 const g=channel.geometry;
 state.result.layout=g?{lengthMm:g.lengthMm,pumps:g.pumps,...(g.tank?{tank:g.tank}:{}),stands:[],standDistanceMm:null,profiles:!!g.cabinetAdapter,holes:g.holes,issues:channel.issues}:null;
 state.result.sourceFingerprint=JSON.stringify([state.result.sourceFingerprint,pumps,state.channelInputs,state.result.rules.channel]);
 return state;
}
export function channelFrameParts(state:FrameWork):FrameWork {
 const channel=state.result.channel,g=channel?.geometry;if(!g)return state;
 // The frame owns the actual through-bolts; remove the earlier generic tank kit
 // from both hydraulic accounting and station mass so it is never counted twice.
 if(g.tank){
  const spec=state.work.next.entities["station-spec"] as SpecEntity;
  const tankKit=(p:SpecItem)=>/tank-mount-(bolts|nuts|washers)$/.test(p.assemblyRole??p.hydraulicPart?.role??"");
  const items=spec.items.filter(p=>!tankKit(p)).map(p=>{
   if(p.equipmentId!==g.tank!.equipmentId||!p.hydraulicAssembly)return p;
   return {...p,hydraulicAssembly:{...p.hydraulicAssembly,parts:p.hydraulicAssembly.parts.filter(p=>!tankKit(p)),requiredRoles:p.hydraulicAssembly.requiredRoles.filter(r=>!/tank-mount-(bolts|nuts|washers)$/.test(r))}};
  });
  state.work={...state.work,next:{...state.work.next,entities:{...state.work.next.entities,"station-spec":{...spec,items}}}};
  state.base=specificationMassParts(state.work);
 }
 const material=channelMetrePrice(state.components,g.profile.name);
 channel!.material={...material,costRub:material.rateRubM===null?null:channel!.stockLengthMm/1000*material.rateRubM};
 const grouped=new Map<number,Part>();
 for(const m of g.members){
  const lengthMm=Number((m.end-m.start).toFixed(6)),existing=grouped.get(lengthMm);
  if(existing)existing.quantity++;else grouped.set(lengthMm,{id:`frame/channel/${lengthMm}`,name:`Швеллер ${g.profile.name}, L=${Number(lengthMm.toFixed(3))} мм`,role:"frame-member",lengthMm,quantity:1,unit:"шт.",unitMassKg:lengthMm/1000*g.profile.kgM,unitPriceRub:material.rateRubM===null?null:lengthMm/1000*material.rateRubM,componentId:material.componentId,specified:true,source:`${g.profile.source}; ${material.source}; цена заготовки = длина в метрах × цена за метр`});
 }
 const children=[...grouped.values()].sort((a,b)=>b.lengthMm!-a.lengthMm!);
 for(const part of children)part.massSource=`${g.profile.source}; ${g.profile.kgM} кг/м × ${part.lengthMm} мм / 1000; заготовка до сверления.`;
 if(g.cabinetAdapter){const part=standHardware(true,g.cabinetAdapter.widthMm).find(p=>p.role==="profile")!;children.push(bindFramePart({...part,unit:"шт."},state.components));}
 const rates=state.work.resources.components?.collectorCatalog?.weldRates??WELD_RATES;
 channel!.welding=channelWelding(g,rates.st20,"Тариф сварки Ст20 из базовых значений конструктора");
 const welding=channel!.welding;
 const manufacturing=channelManufacturingMass(g,welding,state.channelInputs);
 children.push({id:"frame/welding",name:"Сварные соединения рамы · Ст20",role:"frame-welding",quantity:welding.lengthMm/1000,unit:"м",unitMassKg:manufacturing.weldingKgM,unitPriceRub:welding.rateRubM,specified:true,
  source:`${welding.joints.length} соединений × периметр сечения ${welding.perJointMm.toFixed(3)} мм. ${welding.source}. ${manufacturing.weldingSource}`});
 channel!.painting=channelPaintingCost(state.work.resources.components?.collectorCatalog?.channelPaintingRates,g.profile.name,channel!.stockLengthMm);
 const painting=channel!.painting;
 children.push({id:"frame/painting",name:`Окраска рамы · швеллер ${g.profile.name}`,role:"frame-painting",quantity:painting.lengthMm/1000,unit:"м",unitMassKg:manufacturing.paintingKgM,unitPriceRub:painting.rateRubM,specified:true,source:painting.source+". "+manufacturing.paintingSource});
 const fastening=channelFasteners(state);channel!.hardwareGroups=fastening.groups;
 channel!.hardwareCostRub=fastening.parts.every(p=>nonnegative(p.unitPriceRub))?fastening.parts.reduce((sum,p)=>sum+p.quantity*p.unitPriceRub!,0):null;
 if(fastening.parts.every(p=>p.specified)&&g.holes.filter(h=>h.owner!=="foundation").every(h=>h.clearanceMm!==undefined)){
  channel!.issues=channel!.issues.filter(i=>i.code!=="channel-fasteners");state.result.issues=state.result.issues.filter(i=>i.code!=="channel-fasteners");
 }
 const extra=state.channelInputs?.additionalFrameMassKg,additional=typeof extra==="number"&&Number.isFinite(extra)&&extra>=0?extra:0;
 const adapters=children.filter(p=>p.role==="profile"),adapterMass=adapters.every(p=>nonnegative(p.unitMassKg))?adapters.reduce((sum,p)=>sum+p.quantity*p.unitMassKg!,0):null;
 const price=children.every(p=>nonnegative(p.unitPriceRub))?children.reduce((sum,p)=>sum+p.quantity*p.unitPriceRub!,0):null;
 const processMass=welding.lengthMm/1000*manufacturing.weldingKgM+painting.lengthMm/1000*manufacturing.paintingKgM;
 channel!.frameCostRub=price;
 const parts:Part[]=[{id:"frame/body",name:`Рама-основание, швеллер ${g.profile.name} ${g.lengthMm}×${g.widthMm}×${g.heightMm}`,role:"frame",quantity:1,unitMassKg:channel!.drilledMassKg===null||adapterMass===null?null:channel!.drilledMassKg+additional+adapterMass+processMass,unitPriceRub:price,specified:true,children,massAccounting:"self",
  source:`Расчётная масса. ${g.profile.source}; длина заготовок ${channel!.stockLengthMm.toFixed(1)} мм; масса заготовок ${channel!.stockMassKg?.toFixed(3)} кг. Вычтены отверстия; сварной металл и сухое покрытие включены. Крепёж учтён отдельными позициями. Дополнительный металл вне состава: ${additional} кг.`},...fastening.parts];
 for(const native of g.cabinet?.data.nativeParts??[]){
  if(native.role==="cabinet")continue;
  const item=state.components.find(c=>c.id===native.equipmentId);
  parts.push({id:`frame/${native.role}`,name:native.name,role:native.role,quantity:1,unitMassKg:componentMass(item),unitPriceRub:componentPrice(item),componentId:item?.id,source:native.source,specified:true});
 }
 if(g.cabinet&&!g.cabinet.data.nativeParts?.some(p=>p.role.startsWith("stand-")))parts.push({id:"frame/channel-stands",name:"Стойки шкафа по монтажной схеме — уточнить состав и массу",role:"stands",quantity:1,unitMassKg:null,unitPriceRub:null});
 const supportItem=state.components.find(c=>c.id===state.channelInputs?.vibrationSupportId),support=componentField(supportItem,"FRAME_SUPPORT") as Support|undefined;
 const supportCount=g.holes.filter(h=>h.owner==="foundation").length;
 if(supportItem&&support?.verified){
  parts.push({id:"frame/supports",name:support.name,role:"supports",quantity:supportCount,unitMassKg:componentMass(supportItem),unitPriceRub:componentPrice(supportItem),componentId:supportItem.id,specified:true,source:support.source});
  for(const kind of ["Гайка","Шайба"])parts.push(bindFramePart({id:`frame/support-${kind==="Гайка"?"nuts":"washers"}`,role:"support-fasteners",name:`${kind} М${support.threadMm}`,quantity:supportCount,unitMassKg:null,unitPriceRub:null,specified:true,source:"Крепление верхней шпильки виброопоры к нижней полке рамы"},state.components));
 }else parts.push({id:"frame/channel-anchor-kit",name:"Крепление рамы к основанию — уточнить исполнение",role:"anchors",quantity:supportCount,unitMassKg:null,unitPriceRub:null});
 state.result.parts=parts.map(p=>bindFramePart(p,state.components));return state;
}
export function weighChannelFrame(state:FrameWork):FrameWork {
 const fluid=state.channelInputs?.fluidMassKg,known=typeof fluid==="number"&&Number.isFinite(fluid)&&fluid>=0;
 const mass=stationMass([...state.base,...state.result.parts],known?fluid:0);
 // Zero is only the known subtotal, never a claim that an unknown fill is empty.
 if(!known){mass.waterKg=0;mass.operatingKg=null;mass.liftingKg=null;mass.missing.push("Эксплуатационная масса рабочей жидкости");}
 state.result.mass=mass;return state;
}
export function finishChannelFrame(state:FrameWork):StationWork & {frameResult:FrameWork["result"]} {
 const r=state.result,c=r.channel!,g=c.geometry,spec=state.work.next.entities["station-spec"] as SpecEntity;
 r.status="incomplete";
 const manual=spec.items.some(row=>row.option==="frame"&&!automaticFrameItem(row));
 const rows:SpecItem[]=state.result.parts.map((p,i)=>({position:`05.${String(i+1).padStart(3,"0")}`,name:p.name,quantity:p.quantity,unit:p.unit??"шт.",price:p.unitPriceRub,
  ...(p.children?{frameAssembly:{version:1 as const,parts:p.children.map(c=>({name:c.name,quantity:c.quantity,unit:c.unit??"шт.",lengthMm:c.lengthMm,unitPriceRub:c.unitPriceRub,source:c.source??""}))}}:{}),
  equipmentId:p.componentId,section:"frame",generatedBy:"station",assemblyRole:p.id,...(p.role==="frame"?{option:"frame" as const}:{}),
  status:p.specified?"selected":"clarify",technicalStatus:!p.specified||p.role==="frame"&&r.issues.length>0?"incomplete":"ready",sourceFingerprint:r.sourceFingerprint,
  details:p.source??"Исполнение требует уточнения",technicalNotes:p.role==="frame"?r.issues.map(i=>i.message):p.specified?[]:["Нет подтверждённого исполнения крепежа"]}));
 const fallback:SpecItem={position:"05.01",name:c.profile?`Рама из швеллера ${c.profile.name}`:"Рама насосной установки",option:"frame",quantity:0,unit:"шт.",price:null,section:"frame",generatedBy:"station",status:"clarify",technicalStatus:"incomplete",details:"Нет полной монтажной геометрии",technicalNotes:r.issues.map(i=>i.message),sourceFingerprint:r.sourceFingerprint};
 const items=manual?spec.items:[...spec.items.filter(row=>!(frameManagedOptions.has(row.option??"")&&row.generatedBy==="station")&&row.option!=="frame"&&!row.assemblyRole?.startsWith("frame/")),...(g&&rows.length?rows:[fallback])];
 return {...state.work,frameResult:r,next:{...state.work.next,entities:{...state.work.next.entities,"station-spec":{...spec,items,frameCalculation:r}}}};
}
export type { ChannelResult };
