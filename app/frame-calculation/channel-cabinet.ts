import stands from "../../data/frame-stand-models.json";
import cabinets from "../../data/frame-cabinet-models.json";
import type { ChannelCabinet, ChannelNativePart } from "./channel-types";

/** Native left/right stands exchange positions. Align their cabinet holes first;
 * derive the foot grid from that placement instead of forcing the previous grid. */
export function channelCabinetForWidth(equipmentId:string,width:600|800):ChannelCabinet {
 const cabinet=cabinets.assets[String(width) as "600"|"800"],nativeParts:ChannelNativePart[]=[],holes=[];
 const height=width===800?1800:1500,footX:number[]=[],bodyDepth=cabinet.bounds[5]-cabinet.bounds[2];let centerY=0;
 const source=`Корпус ${width}×${cabinet.heightMm}; исходные CAD стоек ${height}×400. Стойки переставлены: правая слева, левая справа. Крепления корпуса совмещены с CAD; дверца от насосов.`;
 for(const [side,assetSide] of [["left","right"],["right","left"]] as const){
  const a=stands.assets[`${assetSide}${width===800?"1800":""}` as keyof typeof stands.assets];
  const cabinetColumn=(side==="left"?Math.min:Math.max)(...cabinet.mountingPoints.map(p=>p[0]));
  const z=cabinetColumn-a.cabinetPoints[0][2];
  centerY=a.cabinetPoints.reduce((sum,p)=>sum+p[1],0)/a.cabinetPoints.length+6;
  nativeParts.push({id:a.componentId,equipmentId:a.componentId,name:`Стойка шкафа ${assetSide==="left"?"левая":"правая"} ${height}×400`,role:`stand-${side}`,source:a.source,hash:a.sourceHash,meshUrl:a.meshUrl,bounds:a.bounds as ChannelNativePart["bounds"],position:[-6,6,-z],rotation:[0,180,0]});
  footX.push(a.bounds[2]+z,a.bounds[5]+z);
  for(const p of a.mountingPoints)holes.push({id:`${side}-${holes.length}`,owner:"cabinet",x:p[2]+z,y:-p[0]-6,diameterMm:9});
 }
 nativeParts.push({id:equipmentId,equipmentId,name:`Шкаф управления — корпус ${width}×${cabinet.heightMm}`,role:"cabinet",source:cabinet.source,hash:cabinet.sourceHash,meshUrl:cabinet.meshUrl,bounds:cabinet.bounds as ChannelNativePart["bounds"],position:[0,centerY,0],rotation:[0,90,0]});
 const minX=Math.min(...footX),maxX=Math.max(...footX);
 return {equipmentId,source,verified:true,widthMm:width,heightMm:cabinet.heightMm,depthMm:bodyDepth,doorDirection:"rear",
  mounting:{verified:true,source,bounds:{minX,maxX,minY:-404,maxY:0},holes,footThicknessMm:6,boltDiameterMm:8},
  bodyBounds:{minX:-width/2,maxX:width/2,minY:0,maxY:bodyDepth},
  // Upright native X envelope above the foot/gusset: -6…40 mm;
  // placement +6 and a half-turn give -46…0 mm in frame depth.
  uprightBounds:{minX,maxX,minY:-46,maxY:0},nativeParts};
}
