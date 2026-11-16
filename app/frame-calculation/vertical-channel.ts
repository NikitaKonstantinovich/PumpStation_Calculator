import { coreFrameConstructionForPumpMass } from "../frame-selection";
import { CHANNEL_PROFILES } from "./channel-profiles";
import { channelBounds, channelMounting, channelCabinet, memberBounds, channelAnchorPositions, resolveChannelRules } from "./channel-common";
import { DEFAULT_FRAME_RULES, positive, type Bounds, type Placement } from "./types";
import type { ChannelInputs, ChannelPump, ChannelRules, ChannelResult, ChannelGeometry, ChannelHole, ChannelMember } from "./channel-types";
import { fitVerticalCabinet } from "./vertical-channel-cabinet";

export const VERTICAL_CHANNEL_REVISION="vertical-channel-frame-2026-11-15-v1";
const unique=(xs:number[])=>[...new Set(xs.map(x=>Math.round(x*1000)/1000))].sort((a,b)=>a-b);
const shifted=(b:Bounds,x:number,y:number):Bounds=>({minX:b.minX+x,maxX:b.maxX+x,minY:b.minY+y,maxY:b.maxY+y});
const overlaps=(a:Bounds,b:Bounds)=>a.minX<b.maxX-.001&&b.minX<a.maxX-.001&&a.minY<b.maxY-.001&&b.minY<a.maxY-.001;

/** Row axis X, flow axis Y. All beams use the existing single-pump mass rule. */
export function calculateVerticalChannelFrame(pumps:ChannelPump[],inputs:ChannelInputs={},saved:Partial<ChannelRules>={}):ChannelResult {
 const rules=resolveChannelRules(saved),tankRules={...DEFAULT_FRAME_RULES,...inputs.tankRules};
 const result:ChannelResult={geometry:null,profile:null,issues:[],geometryStatus:"incomplete",dataStatus:"confirmed",strengthStatus:"not-checked",fastenersStatus:"incomplete",stockLengthMm:0,stockMassKg:null,drilledMassKg:null,massNote:"Теоретическая масса заготовок рамы."};
 const issue=(code:string,message:string,blocking=true)=>result.issues.push({code:`channel-${code}`,message,blocking});
 if(!pumps.length||pumps.some(p=>!positive(p.massKg))){issue("mass","Нет массы каждого учитываемого насоса");result.dataStatus="missing";return result;}
 const construction=coreFrameConstructionForPumpMass(Math.max(...pumps.map(p=>p.massKg!))),profile=construction&&CHANNEL_PROFILES[construction.code];
 if(!profile){issue("type","По массовой таблице требуется гнутая рама");return result;}result.profile={...profile};
 const {width:b,height:h,web:s,rootRadius:R,toeRadius:r}=profile;
 const prepared=pumps.map(p=>({...p,mounting:inputs.pumpMountings?.[p.id]??p.mounting}));
 for(const p of prepared){
  if(p.type!=="vertical_multistage"||!Number.isInteger(p.count)||p.count<1||p.count>32)issue("scope",`${p.name}: некорректный тип или количество насосов`);
  if(!p.mounting?.verified||!channelMounting(p.mounting.mounting)||!channelBounds(p.mounting.bodyBounds)||!Number.isFinite(p.mounting.axisX))issue("mounting",`${p.name}: нет подтверждённой монтажной сетки и габаритов`);
  if(!positive(p.mounting?.flangeFaceToFaceMm)||!p.mounting?.flangeSource)issue("flange-span",`${p.name}: нет расстояния между плоскостями фланцев`);
 }
 if(result.issues.length){result.dataStatus="missing";return result;}
 const span=Math.max(...prepared.map(p=>p.mounting!.flangeFaceToFaceMm!)),width=Math.ceil(2*span/10)*10;
 if(width<=2*b){issue("width","Межфланцевый размер недостаточен для двух поперечных швеллеров");return result;}
 const members:ChannelMember[]=[],holes:ChannelHole[]=[],placements:Placement[]=[],bodies:Bounds[]=[],spacings:ChannelGeometry["spacings"]=[];
 const add=(id:string,name:string,axis:"x"|"y",start:number,end:number,cross:number,opening:1|-1=1)=>members.push({id,name,axis,start,end,cross,opening,profileCode:profile.code});
 const shared=!inputs.cabinetSeparate;let axis=0,ordinal=0;
 for(const p of prepared)for(let i=0;i<p.count;i++,ordinal++){
  const data=p.mounting!,m=data.mounting;
  if(!ordinal)axis=(shared?1.5*b+10:b/2)-Math.min(...m.holes.map(h=>h.x))+data.axisX;
  else {const spacing=inputs.spacings?.[ordinal-1]??(i>0?p.spacing:null);
   if(!spacing||!positive(spacing.mm)||!spacing.source||!["confirmed","conditional"].includes(spacing.status)){issue("spacing",`${p.name}: нет актуального межосевого расстояния`);return result;}
   axis+=spacing.mm;spacings.push(structuredClone(spacing));if(spacing.status==="conditional"){issue("spacing-conditional",spacing.source);result.dataStatus="conditional";}
  }
  const x=axis-data.axisX,y=width/2,id=`pump-${p.circuit}-${i}`,bounds=shifted(m.bounds,x,y);
  placements.push({id,kind:"pump",equipmentId:p.id,x,y,axisXMm:axis,bounds,...(m.cad?{cad:structuredClone(m.cad)}:{})});bodies.push(shifted(data.bodyBounds!,x,y));
  for(const [j,hole]of m.holes.entries())holes.push({...hole,id:`${id}-hole-${j}`,owner:id,x:x+hole.x,y:y+hole.y,face:"top",valid:false});
  unique(m.holes.map(h=>h.x)).forEach((column,j)=>add(`${id}-support-${j}`,`Швеллер крепления насоса ${ordinal+1}.${j+1}`,"y",b,width-b,x+column-b/2));
 }
 for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++)if(overlaps(bodies[i],bodies[j]))issue("collision","Габариты насосов пересекаются при заданном межосевом расстоянии");
 let cabinet:ChannelGeometry["cabinet"]=null,cabinetAdapter:ChannelGeometry["cabinetAdapter"];
 if(shared){
  add("cabinet-first","Швеллер первой стойки шкафа","y",b,width-b,0);
  if(!channelCabinet(inputs.cabinet)){issue("cabinet","Нет габаритов и монтажной схемы шкафа");result.dataStatus="missing";}
  else {
   const first=holes.filter(h=>h.owner===placements[0].id),second=placements[1]&&holes.filter(h=>h.owner===placements[1].id);
   const min=Math.max(...first.map(h=>h.x))+b+10,lower=Math.max(min,bodies[0].maxX+Math.max(20,b/2));
   const upper=second?Math.min(Math.min(...second.map(h=>h.x))-b-10,bodies[1].minX-Math.max(20,b/2)):Infinity;
   const columns=unique(inputs.cabinet.mounting.holes.map(h=>h.x)),target=b/2+columns.at(-1)!-columns[0];
   if(lower>upper+.001)issue("stand-placement","Между первым и вторым насосами нет места для второй стойки шкафа при заданном межосевом расстоянии");
   else {
    const stand2=Math.min(upper,Math.max(lower,target));
    const fitted=fitVerticalCabinet(inputs.cabinet,[b/2,stand2],width,b);
    cabinet=fitted.cabinet;cabinetAdapter=fitted.adapter;
    if(second){
     const frontRow=cabinet.y+Math.min(...cabinet.data.mounting.holes.map(h=>h.y));
     add("cabinet-second","Перемычка второй стойки между опорами насосов","x",Math.max(...first.map(h=>h.x))+b/2,Math.min(...second.map(h=>h.x))-b/2,frontRow-b/2);
    }else add("cabinet-second","Швеллер второй стойки после единственного насоса","y",b,width-b,stand2-b/2);
    if(Math.abs(stand2-b/2-(columns.at(-1)!-columns[0]))>.1&&!cabinetAdapter)issue("cabinet-adapter","Нет подтверждённой схемы крепления шкафа через С-профили");
    if(cabinetAdapter&&[...cabinetAdapter.standColumnsMm,...cabinetAdapter.cabinetColumnsMm].some(x=>Math.abs(x-cabinet!.x)+8>cabinetAdapter!.widthMm/2))issue("cabinet-adapter","Крепление выходит за длину С-профиля выбранного шкафа");
    for(const [i,hole]of cabinet.data.mounting.holes.entries())holes.push({...hole,id:`cabinet-hole-${i}`,owner:"cabinet",x:cabinet.x+hole.x,y:cabinet.y+hole.y,face:"top",valid:false});
   }
  }
 }
 let tank:ChannelGeometry["tank"];
 if(inputs.tank&&inputs.tank.volumeL>=50){
  const t=inputs.tank,m=t.mounting;
  if(!m?.verified||!channelMounting(m)||m.holes.length!==3)issue("tank-mounting","Для бака нужны три подтверждённых крепления и габариты");
  else {
   const cols=unique(m.holes.map(h=>h.x)),min=cols[0],max=cols.at(-1)!;
   if(cols.length!==2||m.holes.filter(h=>Math.abs(h.x-max)<.1).length!==2)issue("tank-orientation","Одна ножка бака должна быть к насосу, две — к торцу рамы");
   else {
    let x=Math.max(...holes.filter(h=>h.owner.startsWith("pump-")).map(h=>h.x))+tankRules.tankFootGapMm-min;
    x+=Math.max(0,Math.ceil((Math.max(...bodies.map(v=>v.maxX))+tankRules.tankBodyGapMm-x-m.bounds.minX)/tankRules.tankStepMm))*tankRules.tankStepMm;
    tank={id:"tank",kind:"tank",equipmentId:t.id,volumeL:t.volumeL,mounting:structuredClone(m),x,y:width/2,bounds:shifted(m.bounds,x,width/2)};
    for(const [i,hole]of m.holes.entries())holes.push({...hole,id:`tank-hole-${i}`,owner:"tank",x:x+hole.x,y:width/2+hole.y,face:"top",valid:false});
    cols.forEach((column,i)=>add(`tank-support-${i}`,i?"Швеллер двух ножек бака у торца":"Швеллер ножки бака со стороны насоса","y",b,width-b,x+column-b/2));
   }
  }
 }
 const end=Math.max(...members.map(m=>m.axis==="y"?m.cross+b:m.end),...bodies.map(b=>b.maxX+rules.edgeMarginMm),...(tank?[tank.bounds!.maxX+tankRules.endMarginMm]:[]));
 const length=Math.ceil(end/10)*10;
 add("front","Передний поперечный швеллер","x",0,length,0,-1);add("rear","Задний поперечный швеллер","x",0,length,width-b,1);
 // A very long foot can meet a perimeter member; assign each drilled hole to
 // its one actual flange, never to the extension of a beam through a weld.
 for(const y of [b-(s+R+b-r)/2,width-b+(s+R+b-r)/2])for(const [i,x]of channelAnchorPositions(length,rules.anchorEndMm,rules.anchorMaxPitchMm).entries())holes.push({id:`anchor-${y<width/2?"front":"rear"}-${i}`,owner:"foundation",x,y,diameterMm:positive(inputs.foundationHoleMm)?inputs.foundationHoleMm:null,face:"bottom",valid:false});
 if(!positive(inputs.foundationHoleMm)||!inputs.foundationSource){issue("anchors","Тип и диаметр крепления к основанию не подтверждены; показаны предварительные оси");result.dataStatus="missing";}
 for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++)if(overlaps(memberBounds(members[i],b),memberBounds(members[j],b)))issue("joint",`Пересечение швеллеров: ${members[i].name} / ${members[j].name}`);
 for(const hole of holes){
  if(!positive(hole.diameterMm)){issue("hole",`${hole.id}: диаметр отверстия не определён`);continue;}
  const radius=hole.diameterMm/2,clearance=hole.owner.startsWith("pump-")?radius:Math.max(radius,hole.clearanceMm??radius);
  const matches=members.filter(m=>{const along=m.axis==="x"?hole.x:hole.y,cross=m.axis==="x"?hole.y:hole.x,offset=m.opening===1?cross-m.cross:m.cross+b-cross;
   return along-clearance>=m.start-.001&&along+clearance<=m.end+.001&&offset-clearance>=s+R-.001&&offset+clearance<=b-r+.001;});
  if(matches.length===1){hole.memberId=matches[0].id;hole.valid=true;}else issue("hole",`${hole.id}: отверстие не помещается на полке выбранного швеллера`);
 }
 for(let i=0;i<holes.length;i++)for(let j=i+1;j<holes.length;j++){
  const a=holes[i],c=holes[j];
  if(a.face===c.face&&a.memberId&&a.memberId===c.memberId&&Math.hypot(a.x-c.x,a.y-c.y)<(a.diameterMm??0)/2+(c.diameterMm??0)/2+.001){a.valid=c.valid=false;issue("hole-collision",`Пересечение отверстий ${a.id} и ${c.id}`);}
 }
 const geometry:ChannelGeometry={version:1,revision:VERTICAL_CHANNEL_REVISION,arrangement:"vertical",profile:{...profile},lengthMm:length,widthMm:width,heightMm:h,members,holes,pumps:placements,cabinet,cabinetSeparate:!shared,spacings,...(tank?{tank}:{}),...(cabinetAdapter?{cabinetAdapter}:{}),flangeSpanMm:span};
 result.geometry=geometry;result.stockLengthMm=members.reduce((sum,m)=>sum+m.end-m.start,0);result.stockMassKg=result.stockLengthMm/1000*profile.kgM;
 result.drilledMassKg=holes.every(h=>h.valid&&positive(h.diameterMm))?result.stockMassKg-holes.reduce((sum,h)=>sum+Math.PI*(h.diameterMm!/2)**2*profile.flange*7.85e-6,0):null;
 result.geometryStatus=result.issues.some(i=>i.blocking&&!['channel-anchors','channel-spacing-conditional'].includes(i.code))?"incomplete":"ready";
 return result;
}
