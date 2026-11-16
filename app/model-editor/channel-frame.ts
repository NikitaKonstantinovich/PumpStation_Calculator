import type { ChannelGeometry } from "../frame-calculation/channel-types";
import { CHANNEL_PROFILES } from "../frame-calculation/channel-profiles";
import { channelCabinet, channelMounting } from "../frame-calculation/channel-common";
import { composeValvePose } from "./valve-controls";
import type { Assembly, Component, Vec3 } from "./model";
import type { ProjectConfig,SpecEntity } from "../project-config";
import { frameBoltSeat } from "./frame-hardware";
import { relativePose } from "./valve-controls";
import { parseChannelFrameAssembly } from "./channel-frame-assembly";

export function parseChannelGeometry(value:unknown):ChannelGeometry|undefined {
 if(!value||typeof value!=="object")return;const v=value as ChannelGeometry;
 const p=CHANNEL_PROFILES[v.profile?.code];
 if(v.version!==1||!p||Object.entries(p).some(([key,value])=>v.profile[key as keyof typeof p]!==value)||![v.lengthMm,v.widthMm,v.heightMm].every(n=>Number.isFinite(n)&&n>0&&n<1e6)||v.heightMm!==p.height||!Array.isArray(v.members)||v.members.length>150||!Array.isArray(v.holes)||v.holes.length>1000||!Array.isArray(v.pumps)||!Array.isArray(v.spacings))return;
 if(v.members.some(m=>!["x","y"].includes(m.axis)||![-1,1].includes(m.opening)||![m.start,m.end,m.cross].every(Number.isFinite)||m.end<=m.start||m.profileCode!==p.code))return;
 if(v.holes.some(h=>![h.x,h.y].every(Number.isFinite)||!["top","bottom"].includes(h.face)||h.diameterMm!==null&&(!Number.isFinite(h.diameterMm)||h.diameterMm<=0||h.diameterMm>100)))return;
 if(v.cabinet&&(![v.cabinet.x,v.cabinet.y].every(Number.isFinite)||!channelCabinet(v.cabinet.data)))return;
 if(v.cabinet?.data.nativeParts&&(!Array.isArray(v.cabinet.data.nativeParts)||v.cabinet.data.nativeParts.length>20||v.cabinet.data.nativeParts.some(p=>!["stand-left","stand-right","cabinet"].includes(p.role)||typeof p.meshUrl!=="string"||typeof p.source!=="string"||typeof p.hash!=="string")))return;
 if(v.arrangement!==undefined&&!["horizontal","vertical"].includes(v.arrangement))return;
 if(v.tank&&(![v.tank.x,v.tank.y,v.tank.volumeL].every(Number.isFinite)||!channelMounting(v.tank.mounting)||v.tank.mounting.holes.length!==3))return;
 if(v.cabinetAdapter&&(!v.cabinet||![600,800].includes(v.cabinetAdapter.widthMm)||![v.cabinetAdapter.levelsMm,v.cabinetAdapter.standColumnsMm,v.cabinetAdapter.cabinetColumnsMm].every(a=>Array.isArray(a)&&a.length===2&&a.every(Number.isFinite))))return;
 return structuredClone(v);
}
export function applyChannelFrame(frame:Component,g:ChannelGeometry,color:"red"|"blue",note:string):void {
 frame.channelFrameAssembly=parseChannelFrameAssembly(frame.channelFrameAssembly,g);
 frame.channelFrame=structuredClone(g);frame.frameColor=color;frame.name=`Рама ${g.profile.name} ${g.lengthMm}×${g.widthMm}×${g.heightMm}`;
 frame.bounds=[0,0,-g.lengthMm,g.widthMm,g.heightMm,0];frame.position=[0,0,0];frame.rotation=[90,0,0];
 frame.parameters={...frame.parameters,length:g.widthMm,width:g.lengthMm,height:g.heightMm};
 frame.ports=g.holes.map(h=>({id:h.id,point:[h.y,h.face==="top"?g.heightMm:0,-h.x],axis:[0,h.face==="top"?1:-1,0],provisional:!h.valid}));
 frame.sourceNote=note;delete frame.meshUrl;delete frame.cadSource;delete frame.frameDrilling;
 frame.autoPose={position:[...frame.position],rotation:[...frame.rotation],parametersKey:JSON.stringify(frame.parameters)};
}
export function addChannelCabinet(assembly:Assembly,project:ProjectConfig):Assembly {
 const frame=assembly.components.find(c=>c.id==="frame"&&c.channelFrame),cabinet=frame?.channelFrame?.cabinet;
 if(!frame)return assembly;
 if(!cabinet)return addChannelHardware(assembly,project);
 const hardware=(project.entities["station-spec"] as SpecEntity).frameCalculation?.channel?.hardwareGroups??[];
 const liftOf=(owner:string)=>{const h=hardware.find(g=>g.owner===owner)?.hardware;return h?(h.supportLift??h.head):0;};
 const baseLift=liftOf("cabinet"),wallLift=Math.max(liftOf("stand-left"),liftOf("stand-right"));
 const cabinetLift=wallLift+Math.max(liftOf("profile-0"),liftOf("profile-1"));
 const native=cabinet.data.nativeParts??[],components:Component[]=[];
 for(const p of native){
  if(!/^\/model-assets\/model-[a-f0-9]{64}-v1\.stl$/.test(p.meshUrl)||!Array.isArray(p.bounds)||p.bounds.length!==6||!p.bounds.every(Number.isFinite)||![p.position,p.rotation].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)))continue;
  const position:Vec3=[cabinet.y+p.position[0]+(p.role==="cabinet"?cabinetLift:0),frame.channelFrame!.heightMm+p.position[1]+baseLift,-cabinet.x+p.position[2]];
  const frameMount={version:1 as const,parentId:frame.id,role:p.role,revision:frame.channelFrame!.revision,position,rotation:p.rotation};
  components.push({id:`frame-${p.role}`,name:p.name,kind:"equipment",equipmentId:p.equipmentId,sourceKey:p.equipmentId,sourceNote:p.source,
   ...composeValvePose(frame,frameMount),frameMount,hidden:false,locked:false,opacity:1,meshUrl:p.meshUrl,cadSource:{path:p.source,hash:p.hash},bounds:p.bounds,ports:[],
   parameters:{length:p.bounds[3]-p.bounds[0],width:p.bounds[4]-p.bounds[1],height:p.bounds[5]-p.bounds[2],diameter:0,routeOffset:0}});
 }
 const adapter=frame.channelFrame!.cabinetAdapter;
 if(adapter)for(const [i,level]of adapter.levelsMm.entries()){
  const role=i?"profile-upper":"profile-lower",position:Vec3=[cabinet.y+wallLift,frame.channelFrame!.heightMm+level+baseLift,-cabinet.x-adapter.widthMm/2];
  const frameMount={version:1 as const,parentId:frame.id,role:role as "profile-upper"|"profile-lower",revision:frame.channelFrame!.revision,position,rotation:[0,0,0] as Vec3};
  components.push({id:`frame-${role}`,name:`С-профиль шкафа ${i?"верхний":"нижний"}`,kind:"equipment",sourceKey:`frame-${role}`,sourceNote:"С-профиль 20×40×2; монтаж шкафа при изменённом расстоянии между стойками.",...composeValvePose(frame,frameMount),frameMount,hidden:false,locked:false,opacity:1,ports:[],bounds:[0,-20,0,20,20,adapter.widthMm],parameters:{length:adapter.widthMm,width:40,height:20,diameter:0,routeOffset:0},frameProfile:{version:1,length:adapter.widthMm,holes:[...adapter.standColumnsMm,...adapter.cabinetColumnsMm].map(x=>cabinet.x+adapter.widthMm/2-x)}});
 }
 // A verified footprint can be drawn without claiming that an unavailable detailed CAD exists.
 if(!components.some(c=>c.frameMount?.role==="cabinet")){
  const d=cabinet.data,b=d.bodyBounds,position:Vec3=[cabinet.y+b.minY+cabinetLift,frame.channelFrame!.heightMm+baseLift,-cabinet.x-b.maxX];
  const frameMount={version:1 as const,parentId:frame.id,role:"cabinet" as const,revision:frame.channelFrame!.revision,position,rotation:[0,0,0] as Vec3};
  components.push({id:"frame-cabinet",name:"Шкаф — габарит без подтверждённой CAD-привязки",kind:"equipment",equipmentId:d.equipmentId,sourceNote:`${d.source}; монтажная высота корпуса и геометрия стоек требуют CAD-привязки`,...composeValvePose(frame,frameMount),frameMount,
   hidden:false,locked:false,opacity:.35,bounds:[0,0,0,b.maxY-b.minY,d.heightMm,b.maxX-b.minX],parameters:{length:d.depthMm,width:d.widthMm,height:d.heightMm,diameter:0,routeOffset:0},ports:[]});
 }
 return addChannelHardware({...assembly,components:[...assembly.components.filter(c=>!c.frameMount&&!(c.id.startsWith("spec-")&&c.equipmentId===cabinet.data.equipmentId)),...components]},project);
}
function addChannelHardware(assembly:Assembly,project:ProjectConfig):Assembly{
 const frame=assembly.components.find(c=>c.id==="frame"&&c.channelFrame);
 const groups=(project.entities["station-spec"] as SpecEntity).frameCalculation?.channel?.hardwareGroups;
 if(!frame||!groups)return assembly;
 const parts:Component[]=groups.map(g=>{
  const match=/^pump-(\d+)-(\d+)$/.exec(g.owner),parent=match?assembly.components.find(c=>c.kind==="pump"&&c.id.startsWith(`pump-${match[1]}-`)&&c.id.endsWith(`-${match[2]}`))??frame:frame;
  const absolute=composeValvePose(frame,g),pose=relativePose(parent,absolute),b=g.hardware,r=b.headDiameter/2,seat=frameBoltSeat(b);
  const bounds:Component["bounds"]=[Math.min(-b.sheet-b.tail,seat-b.length),Math.min(...b.centers.map(p=>p[1]))-r,Math.min(...b.centers.map(p=>p[2]))-r,seat+16,Math.max(...b.centers.map(p=>p[1]))+r,Math.max(...b.centers.map(p=>p[2]))+r];
  const frameMount={version:1 as const,parentId:parent.id,role:"hardware" as const,revision:frame.channelFrame!.revision,...pose};
  return {id:g.id,name:g.name,kind:"equipment",sourceKey:g.id,sourceNote:g.source,...absolute,frameMount,frameHardware:structuredClone(b),hidden:false,locked:false,opacity:1,bounds,ports:[],parameters:{length:bounds[3]-bounds[0],width:bounds[4]-bounds[1],height:bounds[5]-bounds[2],diameter:b.diameter,routeOffset:0}};
 });
 return {...assembly,components:[...assembly.components.filter(c=>!parts.some(p=>p.id===c.id)),...parts]};
}
