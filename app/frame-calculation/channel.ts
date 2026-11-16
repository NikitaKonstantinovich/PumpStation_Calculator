import { coreFrameConstructionForPumpMass } from "../frame-selection";
import { CHANNEL_PROFILES } from "./channel-profiles";
import { CHANNEL_REVISION, type ChannelGeometry, type ChannelHole, type ChannelInputs, type ChannelMember, type ChannelPump, type ChannelResult, type ChannelRules } from "./channel-types";
import { positive, type Bounds, type Placement } from "./types";
import { calculateVerticalChannelFrame } from "./vertical-channel";

import { finite, channelBounds, channelMounting, channelCabinet, resolveChannelRules, memberBounds, channelAnchorPositions } from "./channel-common";
export { channelBounds, channelMounting, channelCabinet, resolveChannelRules, memberBounds, channelAnchorPositions } from "./channel-common";

const shift=(b:Bounds,x:number,y:number):Bounds=>({minX:b.minX+x,maxX:b.maxX+x,minY:b.minY+y,maxY:b.maxY+y});
const overlaps=(a:Bounds,b:Bounds)=>a.minX<b.maxX-1e-6&&b.minX<a.maxX-1e-6&&a.minY<b.maxY-1e-6&&b.minY<a.maxY-1e-6;
const unique=(values:number[])=>[...new Set(values.map(v=>Math.round(v*1e6)/1e6))].sort((a,b)=>a-b);

export function calculateChannelFrame(pumps:ChannelPump[],inputs:ChannelInputs={},saved:Partial<ChannelRules>={}):ChannelResult {
 if(pumps.length&&pumps.every(p=>p.type==="vertical_multistage"))return calculateVerticalChannelFrame(pumps,inputs,saved);
 const rules=resolveChannelRules(saved);
 const result:ChannelResult={geometry:null,profile:null,issues:[],geometryStatus:"incomplete",dataStatus:"confirmed",strengthStatus:"not-checked",fastenersStatus:"incomplete",stockLengthMm:0,stockMassKg:null,drilledMassKg:null,massNote:"Теоретическая масса заготовок; сварные швы и дополнительный металл требуют данных."};
 const issue=(code:string,message:string,blocking=true)=>{result.issues.push({code:`channel-${code}`,message,blocking});};
 if(!pumps.length||pumps.some(p=>!positive(p.massKg))){issue("mass","Нет корректной массы каждого учитываемого насоса");result.dataStatus="missing";return result;}
 const construction=coreFrameConstructionForPumpMass(Math.max(...pumps.map(p=>p.massKg!)));
 const profile=construction&&CHANNEL_PROFILES[construction.code];
 if(!profile){issue("type","По действующей массовой таблице требуется гнутая рама");return result;}
 result.profile={...profile};
 const supported=pumps.filter(p=>["end_suction","horizontal_multistage"].includes(p.type));
 if(supported.length!==pumps.length)issue("scope","Есть насосы вне области применения: их опоры не рассчитаны");
 if(!supported.length){result.dataStatus="missing";return result;}
 const {width:b,web:s,rootRadius:R,toeRadius:r,height:h}=profile,flat=(s+R+b-r)/2;
 const placements:Placement[]=[],holes:ChannelHole[]=[],footprints:Bounds[]=[],bodies:Bounds[]=[],spacings:ChannelGeometry["spacings"]=[];
 let axis=0,ordinal=0,missing=false;
 for(const pump of supported){
  if(!Number.isInteger(pump.count)||pump.count<1||pump.count>32){issue("count",`${pump.name}: некорректное количество`);missing=true;continue;}
  const data=inputs.pumpMountings?.[pump.id]??pump.mounting;
  if(!data||data.verified!==true||!data.source||!channelMounting(data.mounting)||!finite(data.axisX)||!finite(data.flowOffsetMm)||
    !["factory-base","feet"].includes(data.target)||pump.type==="end_suction"&&data.target!=="factory-base"){
   issue("mounting",`${pump.name}: нужны подтверждённые крепления ${pump.type==="end_suction"?"заводского основания":"основания или лап"}, привязка к оси и положение по глубине`);missing=true;continue;
  }
  if(!channelBounds(data.bodyBounds)){issue("body",`${pump.name}: полный габарит для проверки пересечений не подтверждён`);result.dataStatus="missing";}
  for(let index=0;index<pump.count;index++,ordinal++){
   if(ordinal){
    const spacing=inputs.spacings?.[ordinal-1]??(index>0?pump.spacing:null);
    if(!spacing||!positive(spacing.mm)||!spacing.source||!["confirmed","conditional"].includes(spacing.status)){
     issue("spacing",`${pump.name}, агрегат ${index+1}: межосевое расстояние отсутствует, устарело или конфликтует`);missing=true;break;
    }
    axis+=spacing.mm;spacings.push(structuredClone(spacing));
    if(spacing.status==="conditional"){issue("spacing-conditional","Межосевое расстояние предварительное; компоновка требует подтверждения");if(result.dataStatus!=="missing")result.dataStatus="conditional";}
   }
   const x=axis-data.axisX,y=data.flowOffsetMm,id=`pump-${pump.circuit}-${index}`;
   const bounds=shift(data.mounting.bounds,x,y);footprints.push(bounds);
   if(channelBounds(data.bodyBounds))bodies.push(shift(data.bodyBounds,x,y));
   placements.push({id,kind:"pump",equipmentId:pump.id,x,axisXMm:axis,y,bounds,...(data.mounting.cad?{cad:structuredClone(data.mounting.cad)}:{})});
   for(const [i,hole] of data.mounting.holes.entries())holes.push({...hole,id:`${id}-hole-${i}`,owner:id,x:x+hole.x,y:y+hole.y,face:"top",valid:false});
  }
 }
 if(missing||!placements.length){result.dataStatus="missing";return result;}
 for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++)if(overlaps(bodies[i],bodies[j]))issue("collision","Габариты насосов пересекаются при заданных межосевых расстояниях");
 for(let i=0;i<footprints.length;i++)for(let j=i+1;j<footprints.length;j++)if(overlaps(footprints[i],footprints[j]))issue("base-collision","Основания насосов пересекаются; исходные расстояния сохранены");
 let cabinet:ChannelGeometry["cabinet"]=null,cabinetCross:number|null=null;
 if(!inputs.cabinetSeparate&&channelCabinet(inputs.cabinet)){
  const data=structuredClone(inputs.cabinet),bounds=data.mounting.bounds;
  const x=Math.max(...footprints.map(v=>v.maxX))-Math.max(bounds.maxX,data.bodyBounds.maxX);
  const rear=Math.max(...[...footprints,...bodies].map(v=>v.maxY));
  const upright=channelBounds(data.uprightBounds)?data.uprightBounds:null;
  if(!upright){issue("upright","Не определён габарит вертикальной части стойки для проверки зазора 300 мм");result.dataStatus="missing";}
  if(data.doorDirection!=="rear")issue("door","Не подтверждено открывание шкафа в сторону от насосов");
  // The old rear rail becomes a transverse separator. Feet lie on two
  // longitudinal rails between it and the new rear perimeter member.
  const y=Math.max(rear+rules.edgeMarginMm+b-bounds.minY,rear+rules.cabinetGapMm-(upright?.minY??bounds.minY));
  cabinetCross=y+bounds.minY-b;
  cabinet={x,y,data,...(upright?{uprightClearanceMm:y+upright.minY-rear}:{})};footprints.push(shift(bounds,x,y));
  for(const [i,hole] of data.mounting.holes.entries())holes.push({...hole,id:`cabinet-hole-${i}`,owner:"cabinet",x:x+hole.x,y:y+hole.y,face:"top",valid:false});
 }else if(!inputs.cabinetSeparate){issue("cabinet","Нет подтверждённых габаритов шкафа и монтажной схемы его стоек");result.dataStatus="missing";}
 const minFootX=Math.min(...footprints.map(v=>v.minX)),minFootY=Math.min(...footprints.map(v=>v.minY));
 const envelope=(v:ChannelHole)=>Math.max((v.diameterMm??0)/2,v.clearanceMm??0);
 const minHoleX=Math.min(...holes.map(v=>v.x-envelope(v))),maxHoleX=Math.max(...holes.map(v=>v.x+envelope(v)));
 const minHoleY=Math.min(...holes.map(v=>v.y-envelope(v))),maxHoleY=Math.max(...holes.map(v=>v.y+envelope(v)));
 // Pump support beams meet the side channels at X=b and X=length-b.
 // Measure the weld offset to hole centres, independently of flange-edge and washer clearances.
 const pumpHoleX=holes.filter(v=>v.owner.startsWith("pump-")).map(v=>v.x);
 const dx=Math.max(rules.edgeMarginMm-minFootX,b-minHoleX,b+rules.pumpWeldOffsetMm-Math.min(...pumpHoleX)),dy=Math.max(rules.edgeMarginMm-minFootY,2*b-minHoleY);
 const round=(v:number)=>Math.ceil(v/rules.roundingMm)*rules.roundingMm;
 const cabinetColumns=holes.filter(v=>v.owner==="cabinet").map(v=>v.x);
 const cabinetSpan=cabinetColumns.length?Math.max(...cabinetColumns)-Math.min(...cabinetColumns)+2*b+rules.edgeMarginMm:0;
 const length=round(Math.max(...footprints.map(v=>v.maxX+dx+rules.edgeMarginMm),maxHoleX+dx+b,Math.max(...pumpHoleX)+dx+b+rules.pumpWeldOffsetMm,2*rules.anchorEndMm+1,3*b,cabinetSpan));
 const cabinetRear=cabinet?cabinet.y+cabinet.data.mounting.bounds.maxY+dy+b:0;
 const width=round(Math.max(...footprints.map(v=>v.maxY+dy+rules.edgeMarginMm),maxHoleY+dy+2*b,3*b,cabinetRear));
 for(const v of placements){v.x+=dx;v.y+=dy;if(v.axisXMm!==undefined)v.axisXMm+=dx;if(v.bounds)v.bounds=shift(v.bounds,dx,dy);}
 for(const v of holes){v.x+=dx;v.y+=dy;}if(cabinet){cabinet.x+=dx;cabinet.y+=dy;}if(cabinetCross!==null)cabinetCross+=dy;
 if(cabinet){
  // Reuse the outer longitudinal member for one stand; its fixing axis is
  // exactly at half flange width. The second stand determines the inner rail.
  const shiftX=length-b/2-Math.max(...holes.filter(v=>v.owner==="cabinet").map(v=>v.x));
  cabinet.x+=shiftX;for(const hole of holes.filter(v=>v.owner==="cabinet"))hole.x+=shiftX;
  // Seat the rear fixing row on the rear transverse flange, with its bolts
  // centred across that flange. Move the native stands and their holes together.
  const shiftY=width-b/2-Math.max(...holes.filter(v=>v.owner==="cabinet").map(v=>v.y));
  cabinet.y+=shiftY;
  if(cabinet.uprightClearanceMm!==undefined)cabinet.uprightClearanceMm+=shiftY;
  for(const hole of holes.filter(v=>v.owner==="cabinet"))hole.y+=shiftY;
 }
 const members:ChannelMember[]=[];
 const member=(id:string,name:string,axis:"x"|"y",start:number,end:number,cross:number,opening:1|-1)=>members.push({id,name,axis,start,end,cross,opening,profileCode:profile.code});
 member("front","Передний швеллер","x",0,length,0,-1);member("rear","Задний швеллер","x",0,length,width-b,1);
 member("left","Левый швеллер","y",b,width-b,0,-1);member("right","Правый швеллер","y",b,width-b,length-b,1);
 const rows=unique(holes.filter(v=>v.owner.startsWith("pump-")).map(v=>v.y));
 rows.forEach((row,i)=>{const opening:1|-1=i<rows.length/2?-1:1;member(`pump-row-${i}`,`Балка под насосами ${i+1}`,"x",b,length-b,opening===1?row-flat:row-b+flat,opening);});
 if(cabinet){
  member("cabinet-front","Поперечный швеллер перед опорами шкафа","x",b,length-b,cabinetCross!,-1);
  const start=cabinetCross!+b;
  unique(holes.filter(v=>v.owner==="cabinet").map(v=>v.x)).forEach((x,i)=>{
   const existing=members.find(m=>m.axis==="y"&&Math.abs(m.cross+b/2-x)<.001);
   if(!existing)member(`cabinet-${i}`,`Швеллер под ножку шкафа ${i+1}`,"y",start,width-b,x-b/2,1);
  });
 }
 for(const y of [b-flat,width-b+flat])for(const [i,x] of channelAnchorPositions(length,rules.anchorEndMm,rules.anchorMaxPitchMm).entries())
  holes.push({id:`anchor-${y===b-flat?"front":"rear"}-${i}`,owner:"foundation",x,y,diameterMm:positive(inputs.foundationHoleMm)?inputs.foundationHoleMm:null,face:"bottom",valid:false});
 if(!positive(inputs.foundationHoleMm)||!inputs.foundationSource){issue("anchors","Тип и диаметр крепления к основанию не подтверждены; показаны предварительные оси");result.dataStatus="missing";}
 for(let i=0;i<members.length;i++){
  if(members[i].end<=members[i].start)issue("joint","Недопустимая длина перемычки");
  for(let j=i+1;j<members.length;j++)if(overlaps(memberBounds(members[i],b),memberBounds(members[j],b)))issue("joint",`Пересечение элементов: ${members[i].name} / ${members[j].name}`);
 }
 for(const hole of holes){
  if(!positive(hole.diameterMm)){issue("hole",`${hole.id}: диаметр отверстия не определён`);continue;}
  const radius=hole.diameterMm/2,clearance=Math.max(radius,hole.clearanceMm??radius);
  const candidates=members.filter(m=>{
   const along=m.axis==="x"?hole.x:hole.y,cross=m.axis==="x"?hole.y:hole.x;
   const offset=m.opening===1?cross-m.cross:m.cross+b-cross;
   return along-clearance>=m.start-.001&&along+clearance<=m.end+.001&&offset-clearance>=s+R-.001&&offset+clearance<=b-r+.001;
  });
  if(candidates.length===1){hole.memberId=candidates[0].id;hole.valid=true;}else issue("hole",`${hole.id}: крепление не помещается на пригодной части единственной полки`);
 }
 for(let i=0;i<holes.length;i++)for(let j=i+1;j<holes.length;j++){
  const a=holes[i],c=holes[j];if(a.face===c.face&&a.memberId&&a.memberId===c.memberId&&Math.hypot(a.x-c.x,a.y-c.y)<((a.diameterMm??0)+(c.diameterMm??0))/2){a.valid=false;c.valid=false;issue("hole-collision",`Пересечение отверстий ${a.id} / ${c.id}`);}
 }
 if(holes.some(v=>v.owner!=="foundation"&&v.clearanceMm===undefined))issue("fasteners","Габариты шайб, гаек и инструмента не заданы; проверено только размещение отверстий");
 const geometry:ChannelGeometry={version:1,revision:CHANNEL_REVISION,profile:{...profile},lengthMm:length,widthMm:width,heightMm:h,members,holes,pumps:placements,cabinet,cabinetSeparate:inputs.cabinetSeparate===true,spacings};
 result.geometry=geometry;result.stockLengthMm=members.reduce((sum,m)=>sum+m.end-m.start,0);result.stockMassKg=result.stockLengthMm/1000*profile.kgM;
 const drillingKnown=holes.every(v=>v.valid&&positive(v.diameterMm));
 result.drilledMassKg=drillingKnown?result.stockMassKg-holes.reduce((sum,v)=>sum+Math.PI*(v.diameterMm!/2)**2*profile.flange*7.85e-6,0):null;
 result.geometryStatus=result.issues.some(i=>i.blocking&&!["channel-service","channel-fasteners","channel-anchors","channel-spacing-conditional","channel-body","channel-cabinet","channel-scope"].includes(i.code))?"incomplete":"ready";
 return result;
}
