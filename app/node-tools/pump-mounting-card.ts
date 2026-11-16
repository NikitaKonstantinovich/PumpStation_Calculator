import type { Pump } from "../pump-catalog";
import type { PumpDetailSection } from "./pump-card-presentation";

/** Show base holes independently of flange drilling and of frame width checks. */
export function pumpMountingSection(pump:Pump):PumpDetailSection|null {
 const data=pump.mounting?.frameV1;
 if(!data||typeof data!=="object"||Array.isArray(data)||data.verified!==true||!Array.isArray(data.holes))return null;
 const holes=data.holes.filter((h):h is {x:number;y:number;diameterMm:number|null}=>!!h&&typeof h==="object"&&!Array.isArray(h)&&typeof h.x==="number"&&Number.isFinite(h.x)&&typeof h.y==="number"&&Number.isFinite(h.y));
 if(holes.length<2||holes.length!==data.holes.length)return null;
 const mm=(n:unknown)=>typeof n==="number"&&Number.isFinite(n)?n.toLocaleString("ru-RU",{maximumFractionDigits:2})+" мм":"Нет данных";
 const pitch=(key:"x"|"y")=>Math.max(...holes.map(h=>h[key]))-Math.min(...holes.map(h=>h[key]));
 const bores=[...new Set(holes.map(h=>h.diameterMm))];
 const origin=typeof data.source==="string"?data.source:undefined;
 return {id:"mounting",title:"Монтажная сетка основания",rows:[
  {key:"mountingPitchTransverse",label:"Шаг отверстий поперёк потока",value:mm(pitch("x")),origin},
  {key:"mountingPitchFlow",label:"Шаг отверстий вдоль потока",value:mm(pitch("y")),origin},
  {key:"mountingCount",label:"Отверстий в основании",value:String(holes.length),origin},
  {key:"mountingBore",label:"Диаметр отверстий в лапах",value:bores.map(mm).join(" / "),origin},
  {key:"mountingClamp",label:"Монтажная высота под болт",value:mm(data.clampHeightMm??data.footThicknessMm),origin},
  {key:"mountingBolt",label:"Резьба крепления к раме",value:typeof data.boltDiameterMm==="number"&&data.boltDiameterMm>0?"M"+data.boltDiameterMm:"Нет данных",origin:typeof data.fastenerSource==="string"?data.fastenerSource:origin},
 ],...(typeof data.note==="string"?{note:data.note}:{})};
}
