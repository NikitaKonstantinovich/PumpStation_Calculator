import type { ChannelGeometry } from "../frame-calculation/channel-types";
import type { Component } from "./model";

/** Presentation state is separate from the calculated cut list and drilling. */
export type ChannelFrameAssembly = {version:1;hiddenPieceIds:string[];pieceOpacities?:Record<string,number>};
export function parseChannelFrameAssembly(value:unknown,geometry:ChannelGeometry|undefined):ChannelFrameAssembly|undefined {
 if(!geometry||!value||typeof value!=="object"||(value as ChannelFrameAssembly).version!==1)return;
 const v=value as ChannelFrameAssembly,ids=new Set(geometry.members.map(m=>m.id));
 const hiddenPieceIds=Array.isArray(v.hiddenPieceIds)?[...new Set(v.hiddenPieceIds.filter(id=>ids.has(id)))]:[];
 const pieceOpacities=v.pieceOpacities&&typeof v.pieceOpacities==="object"&&!Array.isArray(v.pieceOpacities)?Object.fromEntries(Object.entries(v.pieceOpacities).filter(([id,n])=>ids.has(id)&&Number.isFinite(n)&&n>=.1&&n<=1)):{};
 return {version:1,hiddenPieceIds,...(Object.keys(pieceOpacities).length?{pieceOpacities}:{})};
}
export function channelFramePieces(c:Component){
 const g=c.channelFrame;if(!g)return [];
 return g.members.map(m=>({id:m.id,name:`${m.name} · швеллер ${g.profile.name} · L=${Number((m.end-m.start).toFixed(3))} мм`,lengthMm:m.end-m.start,stockMassKg:(m.end-m.start)/1000*g.profile.kgM,holes:g.holes.filter(h=>h.memberId===m.id&&h.valid).length}));
}
export function setChannelFramePiece(c:Component,id:string,change:{hidden?:boolean;opacity?:number}):Component {
 if(!c.channelFrame?.members.some(m=>m.id===id))return c;
 const state=c.channelFrameAssembly??{version:1 as const,hiddenPieceIds:[]};
 const next={...state,hiddenPieceIds:change.hidden===undefined?state.hiddenPieceIds:change.hidden?[...new Set([...state.hiddenPieceIds,id])]:state.hiddenPieceIds.filter(p=>p!==id),
  ...(change.opacity===undefined?{}:{pieceOpacities:{...state.pieceOpacities,[id]:change.opacity}})};
 return {...c,channelFrameAssembly:parseChannelFrameAssembly(next,c.channelFrame)};
}
