import { DEFAULT_CHANNEL_RULES, CHANNEL_REVISION, type ChannelCabinet, type ChannelMember, type ChannelRules } from "./channel-types";
import { positive, type Bounds, type Mounting } from "./types";
export const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&Math.abs(v)<1e6;
export const channelBounds=(b:unknown):b is Bounds=>!!b&&typeof b==="object"&&["minX","minY","maxX","maxY"].every(k=>finite((b as Record<string,unknown>)[k]))&&(b as Bounds).minX<(b as Bounds).maxX&&(b as Bounds).minY<(b as Bounds).maxY;
export function channelMounting(m:unknown):m is Mounting {
 if(!m||typeof m!=="object")return false;const v=m as Mounting;
 return v.verified===true&&typeof v.source==="string"&&!!v.source&&channelBounds(v.bounds)&&Array.isArray(v.holes)&&v.holes.length>0&&v.holes.length<=64&&v.holes.every(h=>finite(h.x)&&finite(h.y)&&(h.diameterMm===null||positive(h.diameterMm)));
}
export function channelCabinet(c:unknown):c is ChannelCabinet {
 if(!c||typeof c!=="object")return false;const v=c as ChannelCabinet;
 return v.verified===true&&typeof v.equipmentId==="string"&&!!v.equipmentId&&typeof v.source==="string"&&!!v.source&&[v.widthMm,v.heightMm,v.depthMm].every(positive)&&channelMounting(v.mounting)&&channelBounds(v.bodyBounds);
}
export function resolveChannelRules(saved:Partial<ChannelRules>={}):ChannelRules {
 const rules={...DEFAULT_CHANNEL_RULES,...saved};
 if(saved.version==="horizontal-channel-frame-2026-11-14-v1"){
  if(saved.roundingMm===100)rules.roundingMm=10;
  if(saved.cabinetGapMm===50)rules.cabinetGapMm=300;
 }
 rules.cabinetGapMm=Math.max(300,rules.cabinetGapMm);
 for(const k of ["edgeMarginMm","pumpWeldOffsetMm","cabinetGapMm","roundingMm","anchorEndMm","anchorMaxPitchMm"] as const)
  if(!positive(rules[k])||rules[k]>10000)throw Error(`Некорректный параметр швеллерной рамы: ${k}`);
 rules.pumpWeldOffsetMm=Math.max(50,rules.pumpWeldOffsetMm);
 return {...rules,version:CHANNEL_REVISION};
}
export function channelAnchorPositions(length:number,end=50,maxPitch=600):number[] {
 if(!positive(length)||!positive(end)||!positive(maxPitch)||length<=2*end)return [];
 const intervals=Math.ceil((length-2*end)/maxPitch);
 return Array.from({length:intervals+1},(_,i)=>end+i*(length-2*end)/intervals);
}
export function memberBounds(m:ChannelMember,width:number):Bounds {
 return m.axis==="x"?{minX:m.start,maxX:m.end,minY:m.cross,maxY:m.cross+width}:{minX:m.cross,maxX:m.cross+width,minY:m.start,maxY:m.end};
}
