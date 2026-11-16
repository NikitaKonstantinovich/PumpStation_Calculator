import shapes from "../../data/fastener-shapes.json";
import type { ComponentItem } from "../component-database-types";
import type { FrameHardware } from "../model-editor/frame-hardware";
import type { Mounting } from "./types";
import { componentField as field, numeric } from "./components";

type Rivet={verified:boolean;source:string;threadMm:number;gripMinMm:number;gripMaxMm:number;headThicknessMm:number;installedProjectionMm:number;holeDiameterMm:number;headDiameterMm:number;maxEngagementMm?:number|null};
const name=(i:ComponentItem)=>String(field(i,"Наименование")??i.family);
const positive=(n:unknown):n is number=>typeof n==="number"&&Number.isFinite(n)&&n>0;
export const channelRivetData=(item:ComponentItem):Rivet|undefined=>{
 const r=field(item,"FRAME_RIVET") as Rivet|undefined;
 return r?.verified&&r.source&&[r.threadMm,r.gripMaxMm,r.headThicknessMm,r.installedProjectionMm,r.holeDiameterMm,r.headDiameterMm].every(positive)&&
  Number.isFinite(r.gripMinMm)&&r.gripMinMm>=0&&r.gripMinMm<=r.gripMaxMm&&r.holeDiameterMm>r.threadMm&&r.headDiameterMm>r.holeDiameterMm?r:undefined;
};

/** Receiving metal thickness is independent of the clamped pump/stand thickness. */
export function selectChannelRivet(items:ComponentItem[],diameter:number,clamp:number,sheet:number,pocket?:Mounting["rivetHeadPocket"],accept?:(radius:number,depth:number)=>boolean){
 const shape=shapes.rows.find(r=>r.d===diameter);
 if(!shape||!positive(clamp)||!positive(sheet))return null;
 const washers=items.filter(i=>i.catalogId==="метизы"&&numeric(field(i,"Диаметр резьбы, мм"))===diameter&&/^Шайба плоская .*DIN\s*125/i.test(name(i)));
 if(washers.length!==1)return null;
 const washer=washers[0],height=numeric(field(washer,"Ширина, мм"));if(!positive(height))return null;
 const candidates=items.flatMap(rivet=>{
  const r=channelRivetData(rivet);
  if(!r||r.threadMm!==diameter||sheet<r.gripMinMm||sheet>r.gripMaxMm)return [];
  const lift=pocket&&pocket.diameterMm>=r.headDiameterMm&&pocket.depthMm>=r.headThicknessMm?0:r.headThicknessMm;
  const minimum=clamp+height+lift+sheet+r.installedProjectionMm;
  return items.flatMap(bolt=>{
   if(bolt.catalogId!=="метизы"||numeric(field(bolt,"Диаметр резьбы, мм"))!==diameter||!/^Болт М\d+[хx×]\d+ DIN\s*933/i.test(name(bolt)))return [];
   const length=numeric(field(bolt,"Длина болта, мм")??field(bolt,"Длина, мм"));
   if(!positive(length)||length<minimum-.001||r.maxEngagementMm!=null&&length-clamp-height-lift>r.maxEngagementMm)return [];
   if(accept&&!accept(Math.max(shape.washerOuter/2,shape.flats/Math.sqrt(3),r.headDiameterMm/2),Math.max(length-clamp-height-lift,sheet+r.installedProjectionMm)))return [];
   return [{rivet,r,bolt,length,lift,minimum}];
  });
 }).sort((a,b)=>a.length-b.length||a.r.gripMaxMm-b.r.gripMaxMm||a.rivet.id.localeCompare(b.rivet.id)||a.bolt.id.localeCompare(b.bolt.id));
 const p=candidates[0];if(!p)return null;
 const hardware:Omit<FrameHardware,"centers">={version:1,diameter,length:p.length,clamp,sheet,washer:height,hole:p.r.holeDiameterMm,
  head:p.r.headThicknessMm,headDiameter:p.r.headDiameterMm,tail:p.r.installedProjectionMm,supportLift:p.lift,
  parts:{bolt:{id:p.bolt.id,name:name(p.bolt)},washer:{id:washer.id,name:name(washer)},rivet:{id:p.rivet.id,name:name(p.rivet)}}};
 return {hardware,bolt:p.bolt,rivet:p.rivet,washer,radius:Math.max(shape.washerOuter/2,shape.flats/Math.sqrt(3),p.r.headDiameterMm/2),
  source:`Гайка-заклёпка М${diameter}: толщина принимающей детали ${sheet} мм входит в диапазон ${p.r.gripMinMm}–${p.r.gripMaxMm} мм; отверстие Ø${p.r.holeDiameterMm} мм. Монтажная высота ${clamp} мм, шайба ${height} мм, подъём на буртик ${p.lift} мм; болт не короче ${p.minimum.toFixed(2)} мм, выбран ${p.length} мм. ${p.r.source}`};
}
