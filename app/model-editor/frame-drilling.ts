import type { Vec3 } from "./model";

export type FrameHole={id:string;owner:string;point:Vec3;diameter:number};
/** Coordinates refer to the native frame CAD. Y is the sheet normal. */
export type FrameDrilling={version:1;top:number;thickness:number;holes:FrameHole[]};
export function parseFrameDrilling(value:unknown):FrameDrilling|undefined {
 if(!value||typeof value!=="object")return;
 const v=value as FrameDrilling;
 if(v.version!==1||!Number.isFinite(v.top)||!Number.isFinite(v.thickness)||v.thickness<=0||v.thickness>20||!Array.isArray(v.holes)||v.holes.length>500)return;
 const ids=new Set<string>();
 for(const h of v.holes){
  if(!h||typeof h.id!=="string"||!h.id||h.id.length>240||ids.has(h.id)||typeof h.owner!=="string"||h.owner.length>240||!Array.isArray(h.point)||h.point.length!==3||h.point.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)||!Number.isFinite(h.diameter)||h.diameter<=0||h.diameter>100)return;
  ids.add(h.id);
 }
 return structuredClone(v);
}
