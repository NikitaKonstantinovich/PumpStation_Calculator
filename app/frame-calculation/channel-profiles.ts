import type { ChannelProfile } from "./channel-types";

// GOST 8240-97, table 2 (series P), including the root and toe radii.
// Fixed source edition, not a claim about applicability to a particular supply contract.
export const CHANNEL_PROFILE_SOURCE="ГОСТ 8240-97, таблица 2: https://tula.oboronmet.ru/f/gost/pdf/619e09c1ec3b7.pdf";
export const CHANNEL_PROFILES:Readonly<Record<string,ChannelProfile>>=Object.freeze(Object.fromEntries([
 [8,80,40,4.5,7.4,6.5,3.5,7.05], [10,100,46,4.5,7.6,7,4,8.59],
 [12,120,52,4.8,7.8,7.5,4.5,10.4], [14,140,58,4.9,8.1,8,4.5,12.3],
].map(([n,height,width,web,flange,rootRadius,toeRadius,kgM])=>{
 const code=`channel-${n}p`;return [code,{code,name:`${n}П`,height,width,web,flange,rootRadius,toeRadius,kgM,source:CHANNEL_PROFILE_SOURCE}];
})));

/** Clockwise boundary in (distance from outer web, height), sampled tangent arcs. */
export function channelSection(p:ChannelProfile,steps=8):[number,number][] {
 const {height:h,width:b,web:s,flange:t,rootRadius:R,toeRadius:r}=p;
 const pts:[number,number][]=[[0,0],[b,0],[b,t-r]];
 const arc=(cx:number,cy:number,radius:number,from:number,to:number)=>{for(let i=1;i<=steps;i++){const a=from+(to-from)*i/steps;pts.push([cx+radius*Math.cos(a),cy+radius*Math.sin(a)]);}};
 arc(b-r,t-r,r,0,Math.PI/2);pts.push([s+R,t]);arc(s+R,t+R,R,-Math.PI/2,-Math.PI);
 pts.push([s,h-t-R]);arc(s+R,h-t-R,R,Math.PI,Math.PI/2);pts.push([b-r,h-t]);arc(b-r,h-t+r,r,-Math.PI/2,0);
 pts.push([b,h],[0,h]);return pts;
}
