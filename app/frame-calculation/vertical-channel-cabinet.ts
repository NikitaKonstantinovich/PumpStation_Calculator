import stands from "../../data/frame-stand-models.json";
import cabinets from "../../data/frame-cabinet-models.json";
import type { ChannelCabinet, ChannelGeometry } from "./channel-types";

/** Preserve native stand feet; adapt only the distance between the two stands. */
export function fitVerticalCabinet(input:ChannelCabinet,columns:[number,number],width:number,flange:number){
 const data=structuredClone(input),old=[...new Set(data.mounting.holes.map(h=>h.x))].sort((a,b)=>a-b),x=(columns[0]+columns[1])/2;
 const moved=columns.map(v=>v-x),deltas=moved.map((v,i)=>v-old[i]);
 data.mounting.holes=data.mounting.holes.map(h=>({...h,x:h.x+deltas[Math.abs(h.x-old[0])<.01?0:1]}));
 data.mounting.bounds={...data.mounting.bounds,minX:moved[0]-20,maxX:moved[1]+20};
 if(data.uprightBounds)data.uprightBounds={...data.uprightBounds,minX:moved[0]-20,maxX:moved[1]+20};
 for(const p of data.nativeParts??[])if(p.role.startsWith("stand-"))p.position[2]-=deltas[p.role==="stand-left"?0:1];
 const y=width-flange/2-Math.max(...data.mounting.holes.map(h=>h.y));
 let adapter:ChannelGeometry["cabinetAdapter"];
 if(Math.abs(columns[1]-columns[0]-(old[1]-old[0]))>.1){
  const native=data.nativeParts?.filter(p=>p.role.startsWith("stand-"))??[],body=data.nativeParts?.find(p=>p.role==="cabinet");
  const asset=cabinets.assets[String(data.widthMm) as "600"|"800"];
  if(native.length===2&&body&&asset){
   const points=native.map(p=>{const a=Object.values(stands.assets).find(a=>a.sourceHash===p.hash)!;return a.cabinetPoints.map(q=>[p.position[0]-q[0],p.position[1]+q[1],-p.position[2]+q[2]]);});
   body.position[0]+=20;
   data.bodyBounds={...data.bodyBounds,minY:data.bodyBounds.minY+20,maxY:data.bodyBounds.maxY+20};
   adapter={widthMm:data.widthMm,levelsMm:points[0].map(q=>q[1]),standColumnsMm:points.map(p=>p[0][2]+x),cabinetColumnsMm:[...new Set(asset.mountingPoints.map(p=>p[0]+x))].sort((a,b)=>a-b)};
   data.source+=" Расстояние между стойками по свободному промежутку насосов; шкаф закреплён через два горизонтальных С-профиля.";
  }
 }
 return {cabinet:{x,y,data},adapter};
}
