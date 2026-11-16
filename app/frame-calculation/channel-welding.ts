import type { ChannelGeometry, ChannelWelding } from "./channel-types";
import { memberBounds } from "./channel";

/** One section perimeter per contacting member end, per the project costing rule.
 * This is seam quantity/cost, not a strength or weld-size calculation. */
export function channelWelding(g:ChannelGeometry,rateRubM:number|null,source:string):ChannelWelding {
 const p=g.profile;
 const perJointMm=2*p.height+4*p.width-2*p.web-(4-Math.PI)*(p.rootRadius+p.toeRadius);
 const joints:ChannelWelding["joints"]=[],seen=new Set<string>();
 for(const a of g.members)for(const end of [a.start,a.end])for(const b of g.members){
  if(a.id===b.id)continue;
  const bounds=memberBounds(b,p.width),along=a.axis==="x"?[bounds.minX,bounds.maxX]:[bounds.minY,bounds.maxY];
  const cross=a.axis==="x"?[bounds.minY,bounds.maxY]:[bounds.minX,bounds.maxX];
  if(!along.some(v=>Math.abs(v-end)<.001)||Math.min(a.cross+p.width,cross[1])-Math.max(a.cross,cross[0])<p.width-.001)continue;
  const members=[a.id,b.id].sort() as [string,string],key=members.join("/");
  if(!seen.has(key)){seen.add(key);joints.push({members,lengthMm:perJointMm});}
 }
 const lengthMm=joints.length*perJointMm;
 const rate=typeof rateRubM==="number"&&Number.isFinite(rateRubM)&&rateRubM>=0?rateRubM:null;
 return {joints,perJointMm,lengthMm,rateRubM:rate,costRub:rate===null?null:lengthMm/1000*rate,source};
}
