import type { Vec3 } from "./model";

/** Joint coordinates: X points out of the receiving sheet; X=0 is its front. */
export type FrameHardwarePart={id?:string;name:string};
export type FrameHardware={version:1;joint?:"through";nut?:number;diameter:number;length:number;clamp:number;sheet:number;washer:number;hole:number;head:number;headDiameter:number;tail:number;supportLift?:number;centers:Vec3[];parts?:Partial<Record<"bolt"|"washer"|"rivet"|"nut",FrameHardwarePart>>};
export type FrameProfile={version:1;length:number;holes:number[]};
export const FRAME_PROFILE_SLOT_RADIUS_MM = 5.5;

/** Ranges between the centres of the semicircular ends, in local Z. */
export function frameProfileSlots(profile: FrameProfile): [number, number][] {
 const radius = FRAME_PROFILE_SLOT_RADIUS_MM;
 // A slot tangent to an end face creates a zero-thickness edge in the CAD solid.
 const min = radius + 0.01, max = profile.length - min;
 const intervals: [number, number][] = profile.holes.map(z => {
  const center = Math.min(max, Math.max(min, z));
  return [center, center];
 });
 for (let z = 20; z <= max; z += 70) {
  intervals.push([z, Math.min(z + 30, max)]);
 }
 intervals.sort(([a], [b]) => a - b);
 const merged: [number, number][] = [];
 for (const [lo, hi] of intervals) {
  const last = merged.at(-1);
  if (last && lo - last[1] <= 2 * radius) last[1] = Math.max(last[1], hi);
  else merged.push([lo, hi]);
 }
 return merged;
}
/** A recessed rivet head retains its geometry but can sit inside the pump foot. */
export function frameBoltSeat(hardware: Pick<FrameHardware,"supportLift"|"head"|"clamp"|"washer">):number {
 return (hardware.supportLift??hardware.head)+hardware.clamp+hardware.washer;
}
export function parseFrameHardware(value:unknown):FrameHardware|undefined {
 if(!value||typeof value!=="object")return;
 const v=value as FrameHardware;
 if(v.version!==1||![6,8,10,12,14,16,20,24].includes(v.diameter)||![v.length,v.clamp,v.sheet,v.hole,v.headDiameter,v.tail].every(n=>Number.isFinite(n)&&n>0&&n<500)||(!Number.isFinite(v.head)||v.head>=500)||(v.joint==="through"?v.head!==0:v.head<=0)||!Number.isFinite(v.washer)||v.washer<0||v.washer>10||!Array.isArray(v.centers)||v.centers.length>100||v.centers.some(p=>!Array.isArray(p)||p.length!==3||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)))return;
 if(v.joint!==undefined&&v.joint!=="through")return;
 if(v.joint==="through"&&(!v.nut||!Number.isFinite(v.nut)||v.nut<=0||v.nut>100||v.washer<=0||v.length<v.clamp+v.sheet+2*v.washer+v.nut+5-.001))return;
 if(v.supportLift!==undefined&&(!Number.isFinite(v.supportLift)||v.supportLift<0||v.supportLift>v.head))return;
 if(v.parts&&(typeof v.parts!=="object"||Array.isArray(v.parts)||Object.entries(v.parts).some(([k,p])=>!["bolt","washer","rivet","nut"].includes(k)||!p||typeof p.name!=="string"||p.name.length>1000||p.id!==undefined&&(typeof p.id!=="string"||p.id.length>240))))return;
 return structuredClone(v);
}
export function parseFrameProfile(value:unknown):FrameProfile|undefined {
 if(!value||typeof value!=="object")return;
 const v=value as FrameProfile;
 if(v.version!==1||![600,800].includes(v.length)||!Array.isArray(v.holes)||v.holes.length>20||v.holes.some(n=>!Number.isFinite(n)||n<FRAME_PROFILE_SLOT_RADIUS_MM||n>v.length-FRAME_PROFILE_SLOT_RADIUS_MM))return;
 return structuredClone(v);
}
