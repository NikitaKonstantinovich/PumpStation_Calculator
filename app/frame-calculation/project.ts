import { frameTankConnection } from "./tank-connection";
import { tankFrameMounting } from "./tank-mountings";
import { cabinetFrameWidth } from "./cabinet-mountings";
import { specificationMassParts, frameManagedOptions } from "./specification-mass";
import { componentField, numeric, componentMass, bindFramePart, pumpFasteners } from "./components";
import type { ComponentItem } from "../component-database-types";
import type { InputEntity, SettingsEntity, SpecEntity, SpecItem } from "../project-config";
import type { CollectorsEntity } from "../collector-project";
import type { StationWork } from "../station-specification";
import { coreFrameConstructionForPumpMass, automaticFrameItem } from "../frame-selection";
import { coreVisibleSpecificationItems } from "../specification-presentation";
import { DEFAULT_FRAME_RULES, resolveFrameRules, positive, readPumpMountingCad, type Rules, type Part, type PumpInput, type TankInput, type Mounting, type FrameVariant, type Layout, type MassResult, type Issue, type Support, type Eyelet } from "./types";
import { frameAnchors, frameVariants, supportCount } from "./catalog";
import { layoutFrame, eyeletHoles, supportHoles } from "./layout";
import { stationMass } from "./mass";
import { standHardware, chooseLoadHardware } from "./hardware";
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const field=componentField,number=numeric,itemMass=componentMass;
export function readMounting(value:unknown):Mounting|null {
 const m=object(value),b=object(m.bounds);
 if(typeof m.verified!=="boolean"||typeof m.source!=="string"||!m.source||!Array.isArray(m.holes)||!m.holes.length||![b.minX,b.maxX,b.minY,b.maxY].every(v=>typeof v==="number"&&Number.isFinite(v))||Number(b.minX)>=Number(b.maxX)||Number(b.minY)>=Number(b.maxY))return null;
 if(m.holes.some(h=>{const p=object(h);return ![p.x,p.y].every(v=>typeof v==="number"&&Number.isFinite(v))||!(positive(p.diameterMm)||m.scope==="catalogue_layout"&&p.diameterMm===null);} ))return null;
 const cad=readPumpMountingCad(m.cad);
 if(m.cad&&!cad)return null;
 if(cad&&(Math.abs(cad.anchorMm[2]-cad.boundsMm[2])>.15||
  (["minX","minY","maxX","maxY"] as const).some((key,i)=>{
   const coordinate=[1,0,4,3][i];
   return Math.abs(Number(b[key])-cad.boundsMm[coordinate]+cad.anchorMm[coordinate%3])>.05;
  })||cad.pointsMm.length!==m.holes.length||cad.pointsMm.some(([x,y,z],i)=>{
  const h=object((m.holes as unknown[])[i]),[flow,row,support]=cad.anchorMm;
  return Math.abs(y-row-Number(h.x))>.05||Math.abs(x-flow-Number(h.y))>.05||Math.abs(z-support)>.15;
 })))return null;
 const pocket=object(m.rivetHeadPocket),{diameterMm,depthMm}=pocket;
 return {verified:m.verified,source:m.source,bounds:b as Mounting["bounds"],holes:m.holes.map((h,i)=>({...object(h),id:`mount-${i}`,owner:"mount"})) as Mounting["holes"],footThicknessMm:number(m.footThicknessMm),clampHeightMm:number(m.clampHeightMm),boltDiameterMm:number(m.boltDiameterMm),...(cad?{cad}:{}),...(typeof m.fastenerSource==="string"?{fastenerSource:m.fastenerSource}:{}),...(positive(diameterMm)&&positive(depthMm)?{rivetHeadPocket:{diameterMm,depthMm}}:{})};
}
export type FrameResult={version:string;status:"ready"|"incomplete"|"unsupported";variant:FrameVariant|null;layout:Layout|null;parts:Part[];mass:MassResult|null;issues:Issue[];liftingApproved:boolean;rules:Rules;sourceFingerprint:string};
export type FrameWork={work:StationWork;pumps:PumpInput[];tank:TankInput|null;cabinetWidth:number|null;components:ComponentItem[];base:Part[];result:FrameResult;maxPumpMassKg:number|null;thicknessMm:3|4|5|null};
export function beginFrame(work:StationWork,rules:Rules=DEFAULT_FRAME_RULES):FrameWork {
 rules=resolveFrameRules(rules);
 work=frameTankConnection(work);
 const p=work.next,s=p.entities["station-settings"] as SettingsEntity,spec=p.entities["station-spec"] as SpecEntity;
 const components=work.resources.components?.items??[],collectors=p.entities["station-collectors"] as CollectorsEntity;
 const active=s.stationType==="combined"||s.stationType==="fire"&&s.jockeyPump;
 const inputs=[p.entities["system-input"],...(active?[p.entities["system-input-2"]]:[])] as InputEntity[];
 const pumps:PumpInput[]=inputs.map((input,i)=>{
  const pump=work.resources.pumps?.find(v=>v.id===input.selectedPumpId),extra=components.find(c=>field(c,"FRAME_PUMP_ID")===pump?.id);
  const circuit=i?collectors?.discharge?.configuration?.secondary:collectors?.discharge?.configuration?.primary;
  return {id:pump?.id??`missing-${i}`,name:pump?.model??"Насос не выбран",count:(input.workingPumpCount??0)+(input.reservePumpCount??0),massKg:pump?.weightKg??null,spacingMm:circuit?.spacing??null,mounting:readMounting(field(extra,"FRAME_MOUNTING")??object(pump?.mounting).frameV1),circuit:(i?2:1) as 1|2};
 });
 const cabinetRow=spec.items.find(v=>v.option==="controlCabinet"),cabinetWidth=cabinetFrameWidth(work);
 const tankRow=coreVisibleSpecificationItems(spec,s).find(v=>v.option==="membraneTank"||v.hydraulicPart?.role==="tank"),tankItem=components.find(c=>c.id===tankRow?.equipmentId);
 const tank=s.membraneTank&&[50,80,100].includes(s.membraneTankVolume??0)?{id:tankRow?.equipmentId??"tank",volumeL:s.membraneTankVolume!,dryMassKg:itemMass(tankItem),mounting:readMounting(tankFrameMounting(tankItem,s.membraneTankVolume!))}:null;
 const base=specificationMassParts(work);
 const maxPumpMassKg=pumps.every(p=>positive(p.massKg))?Math.max(...pumps.map(p=>p.massKg!)):null;
 const result:FrameResult={version:rules.version,status:"incomplete",variant:null,layout:null,parts:[],mass:null,issues:[],liftingApproved:false,rules:structuredClone(rules),sourceFingerprint:JSON.stringify([rules,inputs,pumps,base,tank,cabinetRow?.equipmentId,collectors?.discharge?.configuration,cabinetWidth])};
 if(spec.items.some(row=>row.option==="frame"&&!automaticFrameItem(row)))result.issues.push({code:"manual-frame",message:"Ручная рама сохранена: требуется проверка применимости новой компоновки",blocking:true});
 return {work,pumps,tank,cabinetWidth,components,base,result,maxPumpMassKg,thicknessMm:null};
}
export function selectFrameConstruction(state:FrameWork):FrameWork {
 const construction=coreFrameConstructionForPumpMass(state.maxPumpMassKg);
 if(!construction)state.result.issues.push({code:"pump-mass",message:"Нет подтверждённой массы каждого активного насоса",blocking:true});
 else if(!construction.sheetThicknessMm){state.result.status="unsupported";state.result.issues.push({code:"channel",message:`Требуется другой тип рамы: ${construction.label}`,blocking:true});}
 else state.thicknessMm=construction.sheetThicknessMm;
 return state;
}
export function placeFrame(state:FrameWork):FrameWork {
 if(state.result.status==="unsupported")return state;
 state.result.layout=layoutFrame(state.pumps,state.cabinetWidth,state.tank,state.result.rules);
 state.result.issues.push(...state.result.layout.issues);return state;
}
export function selectFrameVariant(state:FrameWork):FrameWork {
 const length=state.result.layout?.lengthMm;if(!length||!state.thicknessMm)return state;
 const settings=state.work.next.entities["station-settings"] as SettingsEntity,color=settings.stationType==="fire"||settings.stationType==="combined"?"red":"blue";
 const calculated=frameVariants(frameAnchors(state.components),state.result.rules.priceWidthTransferApproved).find(v=>v.lengthMm===length&&v.thicknessMm===state.thicknessMm&&v.color===color)!;
 const published=state.components.find(c=>c.id===calculated.id),data=object(field(published,"FRAME_VARIANT"));
 state.result.variant={...calculated,massKg:number(data.massKg),...(typeof data.cad==="string"?{cad:data.cad}:{}),...(typeof data.stl==="string"?{stl:data.stl}:{}),...(typeof data.hash==="string"?{hash:data.hash}:{}),...(Array.isArray(data.boundsMm)&&data.boundsMm.length===6&&data.boundsMm.every(v=>typeof v==="number"&&Number.isFinite(v))?{boundsMm:data.boundsMm as number[]}: {})};
 if(!published)state.result.issues.push({code:"catalog",message:"Размер рамы рассчитан, но позиция ещё не опубликована в закреплённом каталоге",blocking:true});
 return state;
}
const bindPart=bindFramePart;
export function frameParts(state:FrameWork):FrameWork {
 const r=state.result,v=r.variant,l=r.layout;if(!v||!l)return state;
 const parts:Part[]=[{id:"frame/body",role:"frame",name:`Рама гнутая 410×${v.lengthMm}×${v.thicknessMm}, ${v.color==="blue"?"синяя":"красная"}`,quantity:1,unitMassKg:v.massKg,unitPriceRub:v.price.transferApproved?v.price.value:null,componentId:v.id,source:v.price.rule},...standHardware(l.profiles,state.cabinetWidth!)];
 for(const p of state.pumps){
  const count=(p.mounting?.holes.length??4)*p.count;
  const fasteners=pumpFasteners(p.mounting,v.thicknessMm,count,`pump-${p.circuit}`,state.components);
  parts.push(...fasteners.parts);
  if(fasteners.issue)r.issues.push({code:"pump-fasteners",message:`${p.name}: ${fasteners.issue}`,blocking:true});
 }
 // Tank mounting hardware is owned by the tank hydraulic assembly and is counted once.
 r.parts=parts.map(p=>bindPart(p,state.components));
 // Receiving rivet bores differ from the clearance holes in pump feet.
 l.holes=l.holes.map(h=>{
  if(h.owner.startsWith("stand-"))return {...h,diameterMm:11};
  const circuit=/^pump-(\d+)-/.exec(h.owner)?.[1];
  const fastening=circuit?r.parts.find(p=>p.id===`frame/pump-${circuit}-bolts`)?.fastening:undefined;
  return fastening?{...h,diameterMm:fastening.hole}:h;
 });
 const flatHalf=v.widthMm/2-v.thicknessMm-2;
 if(l.holes.some(h=>h.diameterMm&&(Math.abs(h.y)+h.diameterMm/2>flatHalf||h.x<h.diameterMm/2||h.x+h.diameterMm/2>v.lengthMm)))
  r.issues.push({code:"frame-drilling",message:"Монтажное отверстие выходит на гиб или за край листа рамы. Требуется изменить размещение или основание; такое отверстие в 3D не вырезается.",blocking:true});
 for(const p of r.parts.filter(p=>!p.componentId))r.issues.push({code:"unbound-component",message:p.name+(p.specified?": размеры заданы; нет каталожных данных цены и массы":": не найдена однозначная каталожная позиция"),blocking:!p.specified});
 return state;
}
export function weighFrame(state:FrameWork):FrameWork {state.result.mass=stationMass([...state.base,...state.result.parts],(state.tank?.volumeL??0)*state.result.rules.waterDensityKgL);return state;}
export function loadFrame(state:FrameWork):FrameWork {
 const r=state.result;if(!r.layout?.lengthMm)return state;
 const supports=state.components.flatMap(c=>{const s=field(c,"FRAME_SUPPORT");return s?[s as Support]:[];}),eyes=state.components.flatMap(c=>{const e=field(c,"FRAME_EYELET");return e?[e as Eyelet]:[];});
 const selected=chooseLoadHardware([...state.base,...r.parts],(state.tank?.volumeL??0)*r.rules.waterDensityKgL,supportCount(r.layout.lengthMm),supports,eyes,r.rules,(diameter,quantity,kind)=>["Шайба",...(kind==="support"?["Гровер"]:[]),"Гайка"].map((name,i)=>bindPart({id:`frame/${kind}-hardware-${i}`,role:`${kind}-hardware`,name:`${name} М${diameter}`,quantity,unitMassKg:null,unitPriceRub:null},state.components)));
 r.parts.push(...selected.parts);r.mass=selected.mass;r.liftingApproved=selected.liftingApproved;
 r.issues.push(...selected.diagnostics.map(message=>({code:"loads",message,blocking:true})));
 if(selected.support){const holes=supportHoles(r.layout,r.rules,supportCount(r.layout.lengthMm),selected.support.threadMm+1);if(holes){r.layout.holes.push(...holes);r.layout.supports=holes.map(h=>({id:h.id,kind:"support",x:h.x,y:h.y}));}else r.issues.push({code:"support-holes",message:"Не удалось разместить крепления виброопор без пересечений",blocking:true});}
 if(selected.eyelet){const holes=eyeletHoles(r.layout,r.rules,selected.eyelet.threadMm+1,selected.eyelet.baseDiameterMm??0);if(holes){r.layout.holes.push(...holes);r.layout.eyelets=holes.map(h=>({id:h.id,kind:"eyelet",x:h.x,y:h.y}));}else r.issues.push({code:"eyelet-holes",message:"Не удалось разместить рым-болты без пересечения крепежа",blocking:true});}
 return state;
}
export function finishFrame(state:FrameWork):StationWork & {frameResult:FrameResult} {
 const r=state.result;if(r.status!=="unsupported")r.status=r.variant&&r.layout?.lengthMm&&positive(r.mass?.operatingKg)&&r.parts.every(p=>!!p.componentId)&&!r.issues.some(i=>i.blocking)?"ready":"incomplete";
 const spec=state.work.next.entities["station-spec"] as SpecEntity;
 const manual=spec.items.some(row=>row.option==="frame"&&!automaticFrameItem(row));
 const rows:SpecItem[]=r.parts.map((p,i)=>{
  // A known M8×25 bolt does not become undefined because another part lacks data.
  const specified=!!p.componentId||p.specified===true;
  const placementNotes=r.issues.filter(issue=>(p.role==="frame"||!p.role.startsWith("pump-"))&&["stand-placement","stand-pitch","frame-drilling"].includes(issue.code)).map(issue=>issue.message);
  const layoutNote=p.role==="frame"&&r.layout?.stationAlignment
   ? `Насосная установка ${r.layout.stationAlignment==="centered"?"центрирована на раме":"размещена под крепление шкафа"}; смещение ${r.layout.stationOffsetMm?.toFixed(1)} мм.${r.layout.standDistanceMm!==null?` Шаг стоек ${r.layout.standDistanceMm} мм, ${r.layout.profiles?"два поперечных профиля":"прямое крепление"}.`:""}` : "";
  return {position:`05.${String(i+1).padStart(3,"0")}`,name:p.name,quantity:p.quantity,unit:"шт.",price:p.unitPriceRub,equipmentId:p.componentId,section:"frame",generatedBy:"station",assemblyRole:p.id,...(p.role==="frame"?{option:"frame" as const}:{}),details:[p.source??(specified?"Задано правилом комплектации рамы":"Не определено исполнение"),layoutNote,...placementNotes].filter(Boolean).join(" "),description:p.source,status:specified?"selected":"clarify",technicalStatus:specified&&!placementNotes.length?"ready":"incomplete",technicalNotes:[...placementNotes,...(specified?[]:r.issues.filter(issue=>issue.message.includes(p.name)||p.role.startsWith("pump-")&&issue.code==="pump-fasteners").map(issue=>issue.message))],sourceFingerprint:r.sourceFingerprint};
 });
 const items=manual?spec.items:[...spec.items.filter(row=>!(frameManagedOptions.has(row.option??"")&&row.generatedBy==="station")&&row.option!=="frame"&&!row.assemblyRole?.startsWith("frame/")),...(rows.length?rows:[{position:"05.01",option:"frame" as const,name:"Рама насосной установки",quantity:0,price:null,section:"frame" as const,generatedBy:"station" as const,details:r.issues.map(i=>i.message).join("; "),status:"clarify" as const,technicalStatus:"incomplete" as const}])];
 return {...state.work,frameResult:r,next:{...state.work.next,entities:{...state.work.next.entities,"station-spec":{...spec,items,frameCalculation:r}}}};
}
