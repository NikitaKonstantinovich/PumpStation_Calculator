import { readPumpMountingCad } from "../frame-calculation/types";
import models from "../../data/frame-stand-models.json";
import cabinets from "../../data/frame-cabinet-models.json";
import type { ProjectConfig, SpecEntity, SpecItem } from "../project-config";
import type { Assembly, Bounds, Component, Vec3 } from "./model";
import { frameBoltSeat, type FrameHardware } from "./frame-hardware";
import { composeValvePose, relativePose } from "./valve-controls";

export const FRAME_STAND_REVISION=models.revision+"-complete-v1";
const roles=["stand-left","stand-right","cabinet","profile-upper","profile-lower","hardware"] as const;
export type FrameMount={version:1;parentId:string;role:typeof roles[number];revision:string;position:Vec3;rotation:Vec3;manual?:boolean};
const vec=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==="number"&&Number.isFinite(n)&&Math.abs(n)<1e7);
export function parseFrameMount(value:unknown):FrameMount|undefined {
 if(!value||typeof value!=="object")return;
 const b=value as FrameMount;
 if(b.version!==1||typeof b.parentId!=="string"||!b.parentId||b.parentId.length>240||!roles.includes(b.role)||typeof b.revision!=="string"||b.revision.length>100||!vec(b.position)||!vec(b.rotation))return;
 return {version:1,parentId:b.parentId,role:b.role,revision:b.revision,position:[...b.position],rotation:[...b.rotation],...(b.manual?{manual:true}:{})};
}
export function retainedFrameMount(previous:Component,fresh:Component):FrameMount {
 const old=previous.frameMount,next=fresh.frameMount!;
 const samePart=previous.equipmentId===fresh.equipmentId&&!!previous.cadSource?.hash&&previous.cadSource.hash===fresh.cadSource?.hash;
 return old?.manual&&old.parentId===next.parentId&&old.role===next.role&&(old.revision===next.revision||samePart)?{...old,revision:next.revision}:next;
}
export function followFrameMounts(assembly:Assembly,editedId?:string):Assembly {
 const byId=new Map(assembly.components.map(c=>[c.id,c])),resolved=new Map<string,Component>(),visiting=new Set<string>();
 const resolve=(c:Component):Component=>{
  if(resolved.has(c.id))return resolved.get(c.id)!;
  if(!c.frameMount)return c;
  if(visiting.has(c.id))return {...c,orphaned:true};
  visiting.add(c.id);
  const original=byId.get(c.frameMount.parentId),parent=original?resolve(original):undefined;
  const binding=parent&&editedId===c.id?{...c.frameMount,...relativePose(parent,c),manual:true}:c.frameMount;
  const next=parent&&!parent.orphaned?{...c,...composeValvePose(parent,binding),frameMount:binding,orphaned:false}:{...c,orphaned:true};
  visiting.delete(c.id);resolved.set(c.id,next);return next;
 };
 return {...assembly,components:assembly.components.map(resolve)};
}
const plus=(a:Vec3,b:number[]):Vec3=>a.map((v,i)=>v+b[i]) as Vec3;
const minus=(a:Vec3,b:number[]):Vec3=>a.map((v,i)=>v-b[i]) as Vec3;
const dimensions=(b:Bounds)=>({length:b[3]-b[0],width:b[4]-b[1],height:b[5]-b[2],diameter:0,routeOffset:0});
export const legacyFrameStand=(c:Component)=>!c.frameMount&&c.id.startsWith("spec-")&&Object.values(models.assets).some(a=>a.componentId===c.equipmentId);

/** All frame attachments share the calculated mounting rows and selected BOM.
 * Native models retain their own axes, mounting holes and full-size geometry. */
export function addFrameStands(assembly:Assembly,project:ProjectConfig):Assembly {
 const spec=project.entities["station-spec"] as SpecEntity,calculation=spec.frameCalculation;
 const frame=assembly.components.find(c=>c.id==="frame"&&c.kind==="frame"&&c.meshUrl),layout=calculation?.layout;
 if(!frame?.bounds||!calculation?.variant||!layout?.lengthMm||!Array.isArray(layout.holes)||!Array.isArray(layout.stands)||!Array.isArray(calculation.parts))return assembly;
 const top=frame.bounds[4],length=layout.lengthMm,sheet=calculation.variant.thicknessMm;
 const children:Component[]=[],row=(role:string)=>spec.items.find(r=>r.assemblyRole===`frame/${role}`);
 function component(id:string,name:string,role:FrameMount["role"],parent:Component,position:Vec3,rotation:Vec3,bounds:Bounds,source?:SpecItem):Component {
  const frameMount:FrameMount={version:1,parentId:parent.id,role,revision:FRAME_STAND_REVISION,position,rotation};
  const c:Component={id,name,kind:"equipment",sourceKey:id,equipmentId:source?.equipmentId,...composeValvePose(parent,frameMount),hidden:false,locked:false,opacity:1,frameMount,bounds,parameters:dimensions(bounds),ports:[],sourceNote:"Монтаж по расчёту рамы."};
  children.push(c);return c;
 }
 function hardware(id:string,name:string,parent:Component,position:Vec3,rotation:Vec3,data:Omit<FrameHardware,"version"|"centers">,centers:Vec3[]=[[0,0,0]]){
  const seat=frameBoltSeat(data),max=seat+10,min=Math.min(-data.sheet-data.tail,seat-data.length),r=data.headDiameter/2;
  const bounds:Bounds=[min,Math.min(...centers.map(p=>p[1]))-r,Math.min(...centers.map(p=>p[2]))-r,max,Math.max(...centers.map(p=>p[1]))+r,Math.max(...centers.map(p=>p[2]))+r];
  const c=component(id,name,"hardware",parent,position,rotation,bounds);
  c.frameHardware={version:1,...data,centers};c.sourceNote="Болт, шайба (если предусмотрена) и гайка-заклёпка по выбранной комплектации. Резьба показана номинальным цилиндром; деформация заклёпки условная.";
  return c;
 }
 const standard={diameter:8,length:25,clamp:3,sheet,washer:2,hole:11,head:1.5,headDiameter:16,tail:11};
 const partByOwner = new Map(layout.pumps.flatMap(placement=>{
  if (!placement.cad) return [];
  const [, circuit, index] = placement.id.split("-");
  const pump = assembly.components.find(c=>c.id===`pump-${circuit}-${placement.equipmentId}-${index}`&&c.kind==="pump");
  const ports = pump?.ports.filter(p=>p.id.startsWith("frame-foot-"));
  const cad = readPumpMountingCad(placement.cad);
  return [[placement.id, !!cad && !!ports && pump?.cadSource?.hash===cad.sourceHash && ports.length===cad.pointsMm.length]] as const;
 }));
 const flatHalf=calculation.variant.widthMm/2-sheet-2;
 const outsideSheet=(h:typeof layout.holes[number])=>{
  const radius=(h.diameterMm??0)/2;
  return Math.abs(h.y)+radius>flatHalf||h.x<radius||h.x+radius>length;
 };
 const incompatibleOwners=new Set(layout.holes.filter(h=>partByOwner.has(h.owner)&&outsideSheet(h)).map(h=>h.owner));
 const pointFor = (x:number,y:number):Vec3 => [y,top,length/2-x];
 // Axes of the calculated mounting grid are also available before a rivet nut is selected.
 frame.ports = layout.holes.flatMap(h=>partByOwner.get(h.owner)?[
  {id:h.id,point:pointFor(h.x,h.y),axis:[0,1,0] as Vec3}
 ]:[]);
 frame.frameDrilling={version:1,top,thickness:sheet,holes:layout.holes.flatMap(h=>{
  const circuit=/^pump-(\d+)-/.exec(h.owner)?.[1];
  if(partByOwner.get(h.owner)===false||incompatibleOwners.has(h.owner))return [];
  if(circuit&&!calculation.parts.find(p=>p.id===`frame/pump-${circuit}-bolts`)?.fastening)return [];
  if(outsideSheet(h))return [];
  return h.diameterMm?[{id:h.id,owner:h.owner,point:pointFor(h.x,h.y),diameter:h.diameterMm}]:[];
 })};
 frame.sourceNote="Каталожная гнутая рама со сквозными монтажными отверстиями по расчёту. Диаметры под гайки-заклёпки отличаются от отверстий в лапах. "+calculation.issues.map(i=>i.message).join("; ");
 if([...partByOwner.values()].some(ok=>!ok))frame.sourceNote+=" Есть насос без совпадающей CAD-модели. Его отверстия в раме требуют пересчёта.";
 for(const placement of layout.pumps){
  const circuit=/^pump-(\d+)-/.exec(placement.id)?.[1],index=placement.id.split("-").at(-1);
  const pump=assembly.components.find(c=>c.kind==="pump"&&c.id.startsWith(`pump-${circuit}-`)&&c.id.endsWith(`-${index}`));
  const f=calculation.parts.find(p=>p.id===`frame/pump-${circuit}-bolts`)?.fastening;
  if(!pump||!f)continue;
  const points=frame.frameDrilling.holes.filter(h=>h.owner===placement.id).map(h=>h.point);
  if(!points.length)continue;
  const pose=relativePose(pump,composeValvePose(frame,{position:points[0],rotation:[0,0,90]}));
  const centers=points.map(p=>[0,-(p[0]-points[0][0]),p[2]-points[0][2]] as Vec3);
  hardware(`frame-hardware-${placement.id}`,`Крепление насоса · ${pump.name}`,pump,pose.position,pose.rotation,{...f,sheet,washer:0},centers);
 }
 if(layout.stands.length===2&&Math.abs(calculation.rules.standPitchMm-350)<.001){
  const tall=row("stand-left")?.equipmentId===models.assets.left1800.componentId;
  const pair=tall?[models.assets.left1800,models.assets.right1800]:[models.assets.left,models.assets.right];
  const placed:Component[]=[],mounts:Vec3[][]=[];
  for(const [index,side] of (["left","right"] as const).entries()){
   const role=`stand-${side}` as const,asset=pair[index],source=row(role);
   if(!source||source.quantity!==1||source.equipmentId!==asset.componentId)continue;
   const anchor:Vec3=[layout.stands[index].y,top+standard.head,length/2-layout.stands[index].x];
   const position=minus(anchor,asset.mountingCenter);
   const c=component(`frame-${role}`,source.name,role,frame,position,[0,0,0],asset.bounds as Bounds,source);
   c.frameColor=frame.frameColor;c.meshUrl=asset.meshUrl;c.cadSource={path:asset.source,hash:asset.sourceHash};
   c.ports=[...asset.mountingPoints.map((p,i)=>({id:`base-${i}`,point:p as Vec3,axis:[0,-1,0] as Vec3,provisional:false})),...asset.cabinetPoints.map((p,i)=>({id:`cabinet-${i}`,point:p as Vec3,axis:[-1,0,0] as Vec3,provisional:false}))];
   c.sourceNote=`Стойка ${asset.heightMm} мм из выбранного STEP без масштабирования. Основание опирается на головки гаек-заклёпок высотой 1,5 мм.`;
   placed.push(c);mounts.push(asset.cabinetPoints.map(p=>plus(position,p)));
   const base=asset.mountingPoints[0] as Vec3;
   hardware(`frame-hardware-${role}`,`Крепление ${source.name}`,c,[base[0],base[1]-standard.head,base[2]],[0,0,90],standard,asset.mountingPoints.map(p=>[0,-(p[0]-base[0]),p[2]-base[2]] as Vec3));
  }
  const cabinetRow=spec.items.find(r=>r.option==="controlCabinet"&&r.quantity>0);
  if(placed.length===2&&cabinetRow){
   const asset=tall?cabinets.assets[800]:cabinets.assets[600],width=asset.widthMm;
   const centerZ=(mounts[0][0][2]+mounts[1][0][2])/2,centerY=(mounts[0][0][1]+mounts[0][1][1])/2;
   const standFace=mounts[0][0][0],cabinetFace=standFace-standard.head-(layout.profiles?20:0);
   const cab=component("frame-cabinet",cabinetRow.name,"cabinet",frame,[cabinetFace,centerY,centerZ],[0,-90,0],asset.bounds as Bounds,cabinetRow);
   cab.meshUrl=asset.meshUrl;cab.cadSource={path:asset.source,hash:asset.sourceHash};
   cab.ports=asset.mountingPoints.map((p,i)=>({id:`mount-${i}`,point:p as Vec3,axis:[0,0,-1] as Vec3,provisional:false}));
   cab.sourceNote=`Корпус ШУ ${asset.widthMm}×${asset.heightMm} из выбранной CAD-модели, без масштабирования. Внутреннее электрическое наполнение условное.`;
   if(layout.profiles){
    const start=centerZ-width/2,source=row("profile");
    for(const [i,role] of (["profile-lower","profile-upper"] as const).entries()){
     const y=mounts[0][i][1],profile=component(`frame-${role}`,`${source?.name??"С-профиль"} · ${i?"верхний":"нижний"}`,role,frame,[standFace-standard.head,y,start],[0,0,180],[0,-20,0,20,20,width],source);
     const cabZ=asset.mountingPoints.filter(p=>p[1]===asset.mountingPoints[0][1]).map(p=>centerZ+p[0]);
     profile.frameProfile={version:1,length:width,holes:[...mounts.map(p=>p[i][2]),...cabZ].map(z=>z-start)};
     profile.sourceNote="С-профиль 20×40×2 по сечению CAD L600; длина по ШУ. Перфорация дополнена под фактические оси крепления стоек и шкафа.";
     for(let side=0;side<2;side++){
      const stand=placed[side],p=pair[side].cabinetPoints[i] as Vec3;
      hardware(`frame-hardware-${role}-${side}`,"Крепление профиля к стойке",stand,p,[0,0,180],{...standard,sheet:3,clamp:2});
     }
     hardware(`frame-hardware-cabinet-${i}`,"Крепление ШУ к профилю",profile,[2,0,0],[0,0,0],{...standard,length:35,sheet:2,clamp:17.5},cabZ.map(z=>[0,0,z-start] as Vec3));
    }
   }else{
    for(let side=0;side<2;side++){
     const stand=placed[side],points=pair[side].cabinetPoints;
     hardware(`frame-hardware-cabinet-${side}`,"Крепление ШУ к стойке",stand,points[0] as Vec3,[0,0,180],{...standard,sheet:3,clamp:1},points.map(p=>[0,-(p[1]-points[0][1]),p[2]-points[0][2]] as Vec3));
    }
   }
  }
 }
 const components=assembly.components.filter(c=>!c.frameMount&&!legacyFrameStand(c)&&!children.some(n=>n.equipmentId&&n.equipmentId===c.equipmentId&&c.id.startsWith("spec-")));
 return followFrameMounts({...assembly,components:[...components,...children]});
}
