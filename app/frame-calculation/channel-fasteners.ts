import shapes from "../../data/fastener-shapes.json";
import stands from "../../data/frame-stand-models.json";
import profileBolt from "../../data/channel-profile-bolt.json";
import type { ComponentItem } from "../component-database-types";
import type { FrameHardware } from "../model-editor/frame-hardware";
import type { FrameWork } from "./project";
import type { Part } from "./types";
import { positive } from "./types";
import { componentField as field,componentMass,componentPrice,numeric } from "./components";
import type { ChannelHardwareGroup,ChannelPumpMount } from "./channel-types";
import { channelRivetData, selectChannelRivet } from "./channel-rivets";
import type { Mounting } from "./types";

const name=(item:ComponentItem)=>String(field(item,"Наименование")??field(item,"Название")??"");
const nut8Source="DIN 934 M8, высота 6,5 мм: https://eshop.wuerth.com.mt/hexagon-nut-12";
const nut10Source="DIN 934 M10, высота 8 мм: https://eshop.wuerth.de/Hexagon-nut-DIN-934-steel-I6I-I8I-zinc-plated-blue-passivated-A2K-NUT-HEX-DIN934-I8I-WS17-A2K-M10/031710.sku/en/US/EUR/";
/** Reserve the real washer/nut envelope before frame extents are rounded. */
export function channelFastenerRadius(diameter:number|undefined,items:ComponentItem[]=[]):number|undefined{
 const shape=shapes.rows.find(r=>r.d===diameter);
 return shape?Math.max(shape.washerOuter/2,shape.flats/Math.sqrt(3),...items.flatMap(i=>{const r=channelRivetData(i);return r&&r.threadMm===diameter?[r.headDiameterMm/2]:[];})):undefined;
}
/** Two flat washers, one nut, and the existing project rule of 5 mm thread reserve. */
export function selectChannelBolting(items:ComponentItem[],diameter:number,clamp:number,sheet:number){
 const shape=shapes.rows.find(r=>r.d===diameter);
 if(!shape||!positive(clamp)||!positive(sheet))return null;
 const candidates=items.filter(i=>i.catalogId==="метизы"&&numeric(field(i,"Диаметр резьбы, мм"))===diameter);
 const nuts=candidates.filter(i=>/^Гайка М\d+ DIN\s*934/i.test(name(i))),washers=candidates.filter(i=>/^Шайба плоская .*DIN\s*125/i.test(name(i)));
 if(nuts.length!==1||washers.length!==1)return null;
 const nut=nuts[0],washer=washers[0],nutHeight=numeric(field(nut,"Ширина, мм"))??(diameter===8?6.5:diameter===10?8:null),washerHeight=numeric(field(washer,"Ширина, мм"));
 if(!positive(nutHeight)||!positive(washerHeight))return null;
 const minimum=clamp+sheet+2*washerHeight+nutHeight+5;
 const bolts=candidates.flatMap(item=>{
  if(!/^Болт М\d+[хx×]\d+ DIN\s*933/i.test(name(item)))return [];
  const length=numeric(field(item,"Длина болта, мм")??field(item,"Длина, мм"));
  return positive(length)&&length>=minimum?[{item,length}]:[];
 }).sort((a,b)=>a.length-b.length||a.item.id.localeCompare(b.item.id));
 const bolt=bolts[0];if(!bolt)return null;
 const source=`Сквозное крепление: пакет ${clamp}+${sheet} мм, 2 шайбы по ${washerHeight} мм, гайка ${nutHeight} мм, запас резьбы 5 мм; минимум ${minimum.toFixed(2)} мм, выбран болт ${bolt.length} мм. ${!field(nut,"Ширина, мм")?(diameter===8?nut8Source:diameter===10?nut10Source:""):"Размеры гайки и шайб из каталога."}`;
 const hardware:Omit<FrameHardware,"centers">={version:1,joint:"through",diameter,length:bolt.length,clamp,sheet,washer:washerHeight,nut:nutHeight,hole:diameter+2,head:0,headDiameter:Math.max(shape.washerOuter,2*shape.flats/Math.sqrt(3)),tail:nutHeight+washerHeight+5,
  parts:{bolt:{id:bolt.item.id,name:name(bolt.item)},nut:{id:nut.id,name:name(nut)},washer:{id:washer.id,name:name(washer)}}};
 return {hardware,bolt:bolt.item,nut,washer,source,radius:Math.max(shape.washerOuter/2,shape.flats/Math.sqrt(3))};
}

export function channelFasteners(state:FrameWork):{groups:ChannelHardwareGroup[];parts:Part[]}{
 const g=state.result.channel!.geometry!,groups:ChannelHardwareGroup[]=[],parts=new Map<string,Part>();
 const issue=(owner:string,message:string)=>{
  const problem={code:`channel-fastener-${owner}`,message,blocking:true};
  state.result.issues.push(problem);state.result.channel!.issues.push(problem);
  parts.set(`missing-${owner}`,{id:`frame/hardware-missing-${owner}`,name:message,role:"frame-fastener",quantity:1,unit:"компл.",unitMassKg:null,unitPriceRub:null,specified:false,source:message});
 };
 const add=(id:string,label:string,owner:string,points:[number,number,number][],rotation:[number,number,number],d:number,clamp:number,sheet:number,source:string,footprintOwner?:string,pocket?:Mounting["rivetHeadPocket"])=>{
  if(!points.length){issue(owner,`${label}: нет монтажных отверстий`);return;}
  const items=owner.startsWith("profile-")?[...state.components,profileBolt]:state.components;
  const holes=footprintOwner?g.holes.filter(h=>h.owner===footprintOwner):[];
  const fits=(r:number,depth:number)=>!footprintOwner||depth<=g.heightMm-g.profile.flange&&holes.every(h=>{
   const m=g.members.find(m=>m.id===h.memberId);if(!m)return false;
   const cross=m.axis==="x"?h.y:h.x,along=m.axis==="x"?h.x:h.y,offset=m.opening===1?cross-m.cross:m.cross+g.profile.width-cross;
   return offset-r>=g.profile.web+g.profile.rootRadius-.001&&offset+r<=g.profile.width-g.profile.toeRadius+.001&&along-r>=m.start-.001&&along+r<=m.end+.001;
  });
  const selected=selectChannelRivet(items,d,clamp,sheet,pocket,fits)??selectChannelBolting(items,d,clamp,sheet);
  if(!selected){issue(owner,`${label}: не определены размеры пакета или подходящий каталожный крепёж М${d}`);return;}
  if(selected.bolt.id===profileBolt.id)source+=`; ${field(profileBolt,"Источник")}; стандартный болт, цена и масса отсутствуют в закреплённом каталоге`;
  if(footprintOwner&&(holes.length!==points.length||holes.some(h=>!h.valid||h.diameterMm===null||h.diameterMm<d))){issue(owner,`${label}: отверстия крепления не подтверждены`);return;}
  if(holes.some(h=>{
   const m=g.members.find(m=>m.id===h.memberId)!;const cross=m.axis==="x"?h.y:h.x,along=m.axis==="x"?h.x:h.y,offset=m.opening===1?cross-m.cross:m.cross+g.profile.width-cross,r=selected.radius;
   return offset-r<g.profile.web+g.profile.rootRadius-.001||offset+r>g.profile.width-g.profile.toeRadius+.001||along-r<m.start-.001||along+r>m.end+.001;
  })){issue(owner,`${label}: шайба или гайка не помещается на плоской части полки швеллера`);return;}
  const lift=selected.hardware.supportLift??selected.hardware.head;
  if(footprintOwner&&Math.max(selected.hardware.length-clamp-selected.hardware.washer-lift,sheet+selected.hardware.tail)>g.heightMm-g.profile.flange){issue(owner,`${label}: крепёж упирается в нижнюю полку швеллера`);return;}
  for(const h of holes){h.clearanceMm=selected.radius;h.diameterMm=selected.hardware.hole;}
  const p=points[0],centers=points.map(q=>rotation[2]===90?[0,-(q[0]-p[0]),q[2]-p[2]] as [number,number,number]:[0,q[1]-p[1],q[2]-p[2]] as [number,number,number]);
  groups.push({id,name:label,owner,position:p,rotation,hardware:{...selected.hardware,centers},source:`${source}; ${selected.source}`});
  const kit="rivet" in selected?[[selected.bolt,1],[selected.rivet,1],[selected.washer,1]] as const:[[selected.bolt,1],[selected.nut,1],[selected.washer,2]] as const;
  for(const [item,multiplier]of kit){
   const existing=parts.get(item.id);if(existing){existing.quantity+=points.length*multiplier;continue;}
   parts.set(item.id,{id:`frame/hardware/${item.id}`,role:"frame-fastener",name:name(item),componentId:item.id,quantity:points.length*multiplier,unit:"шт.",unitMassKg:componentMass(item),unitPriceRub:componentPrice(item),specified:true,source:`${source}; ${selected.source}; цена каталога ${item.id}; ${field(item,"Источник цены")??""}`});
  }
 };
 for(const p of g.pumps){
  const input=state.pumps.find(v=>v.id===p.equipmentId),catalog=state.work.resources.pumps?.find(v=>v.id===p.equipmentId);
  const mount=state.channelInputs?.pumpMountings?.[p.equipmentId??""]?.mounting??(catalog?.mounting?.frameChannelV1 as ChannelPumpMount|undefined)?.mounting??input?.mounting;
  if(!mount?.verified||!positive(mount.boltDiameterMm)||!positive(mount.clampHeightMm??mount.footThicknessMm)){issue(p.id,`Крепление ${input?.name??p.id}: нет диаметра болта или монтажной высоты основания`);continue;}
  add(`frame-hardware-${p.id}`,`Крепление насоса · ${input?.name}`,p.id,g.holes.filter(h=>h.owner===p.id).map(h=>[h.y,g.heightMm,-h.x]),[0,0,90],mount.boltDiameterMm,(mount.clampHeightMm??mount.footThicknessMm)!,g.profile.flange,mount.fastenerSource??mount.source,p.id,mount.rivetHeadPocket);
 }
 if(g.tank){
  const mount=g.tank.mounting;
  add("frame-hardware-tank","Крепление мембранного бака к раме","tank",g.holes.filter(h=>h.owner==="tank").map(h=>[h.y,g.heightMm,-h.x]),[0,0,90],mount.boltDiameterMm??NaN,mount.clampHeightMm??mount.footThicknessMm??NaN,g.profile.flange,mount.source,"tank");
 }
 const cabinet=g.cabinet;
 if(cabinet){
  const mount=cabinet.data.mounting;
  add("frame-hardware-stand-bases","Крепление стоек шкафа к раме","cabinet",g.holes.filter(h=>h.owner==="cabinet").map(h=>[h.y,g.heightMm,-h.x]),[0,0,90],mount.boltDiameterMm??NaN,mount.clampHeightMm??mount.footThicknessMm??NaN,g.profile.flange,mount.source,"cabinet");
  for(const native of cabinet.data.nativeParts??[]){
   if(!native.role.startsWith("stand-"))continue;
   const asset=Object.values(stands.assets).find(a=>a.sourceHash===native.hash);
   if(!asset||native.rotation.join(',')!=='0,180,0'){issue(native.role,"Крепление шкафа: нет проверенной монтажной схемы стойки");continue;}
   const points=asset.cabinetPoints.map(p=>[cabinet.y+native.position[0]-p[0],g.heightMm+native.position[1]+p[1],-cabinet.x+native.position[2]-p[2]] as [number,number,number]);
   add(`frame-hardware-cabinet-${native.role}`,g.cabinetAdapter?"Крепление С-профиля к стойке":"Крепление шкафа к стойке",native.role,points,[0,0,0],8,g.cabinetAdapter?2:1,3,`CAD ${native.source}: стенка стойки 3 мм; ${g.cabinetAdapter?"стенка С-профиля 2 мм":"задняя стенка корпуса 1 мм"}.`);
  }
  if(g.cabinetAdapter)for(const [i,y]of g.cabinetAdapter.levelsMm.entries())add(`frame-hardware-cabinet-profile-${i}`,"Крепление шкафа к С-профилю",`profile-${i}`,g.cabinetAdapter.cabinetColumnsMm.map(x=>[cabinet.y+2,g.heightMm+y,-x]),[0,0,0],8,19,2,"С-профиль 20×40×2; задняя стенка шкафа 1 мм, пакет до стенки профиля 19 мм.");
 }
 // Mounting coordinates of each kit stay on the receiving metal surface.
 // Raising the stands also raises the cabinet and its mounting kits.
 const standLift=groups.find(g=>g.owner==="cabinet")?.hardware.head??0;
 const liftOf=(owner:string)=>{const h=groups.find(g=>g.owner===owner)?.hardware;return h?(h.supportLift??h.head):0;};
 const wallLift=Math.max(liftOf("stand-left"),liftOf("stand-right"));
 for(const group of groups){
  if(group.owner.startsWith("stand-"))group.position[1]+=standLift;
  if(group.owner.startsWith("profile-")){group.position[0]+=wallLift;group.position[1]+=standLift;}
 }
 state.result.channel!.drilledMassKg=g.holes.every(h=>h.valid&&positive(h.diameterMm))?state.result.channel!.stockMassKg!-g.holes.reduce((sum,h)=>sum+Math.PI*(h.diameterMm!/2)**2*g.profile.flange*7.85e-6,0):null;
 return {groups,parts:[...parts.values()]};
}
