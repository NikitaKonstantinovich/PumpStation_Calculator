import models from "../../data/tank-models.json";
import { TANK_LAYOUT_REVISION, TANK_PUMP_GAP_MM, tankConnectionDn } from "../tank-connection";
import type { ProjectConfig, SettingsEntity, SpecEntity } from "../project-config";
import type { Assembly, Bounds, Component, Port, Vec3 } from "./model";
import { composeValvePose, relativePose } from "./valve-controls";
import { mountingRotation } from "./line-assembly";

type Volume = SettingsEntity["membraneTankVolume"];
export type TankMount = {
  version: 1; revision: string; parentId: string; portId: string; role: "valve" | "tank" | "hose";
  mode: "port" | "floor"; volume: Volume; specPosition: string; position: Vec3; rotation: Vec3; manual?: boolean;
};
const vec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e7);
const id = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 240;
export function parseTankMount(value: unknown): TankMount | undefined {
  if (!value || typeof value !== "object") return;
  const v=value as TankMount;
  if(v.version!==1||!id(v.revision)||!id(v.parentId)||!id(v.portId)||!id(v.specPosition)||![8,50,80,100].includes(v.volume)
    ||!["valve","tank","hose"].includes(v.role)||!["port","floor"].includes(v.mode)||!vec(v.position)||!vec(v.rotation))return;
  return {version:1,revision:v.revision,parentId:v.parentId,portId:v.portId,specPosition:v.specPosition,role:v.role,mode:v.mode,volume:v.volume,
    position:[...v.position],rotation:[...v.rotation],...(v.manual===true?{manual:true}:{})};
}
export function retainedTankMount(old: TankMount | undefined, next: TankMount): TankMount {
  if(old?.manual&&old.revision==="tank-end200-pump-gap200-v1"&&old.volume===next.volume&&old.mode===next.mode){
    if(old.volume===8){const pose=composeValvePose(next,{position:[old.position[0],old.position[1],old.position[2]+12],rotation:old.rotation});return {...next,...pose,manual:true};}
    return {...next,position:old.position,rotation:old.rotation,manual:true};
  }
  return old?.manual&&old.revision===next.revision&&old.volume===next.volume&&old.mode===next.mode
    ? {...next,position:old.position,rotation:old.rotation,manual:true}:next;
}
const add=(a:Vec3,b:Vec3):Vec3=>a.map((v,i)=>v+b[i]) as Vec3;
const dot=(a:Vec3,b:Vec3)=>a.reduce((s,v,i)=>s+v*b[i],0);
const world=(c:Pick<Component,"position"|"rotation">,point:Vec3)=>composeValvePose(c,{position:point,rotation:[0,0,0]}).position;
function corners(c:Pick<Component,"position"|"rotation"|"bounds"|"parameters">):Vec3[]{
  const p=c.parameters,b=c.bounds??[-p.length/2,-p.width/2,-p.height/2,p.length/2,p.width/2,p.height/2];
  return [b[0],b[3]].flatMap(x=>[b[1],b[4]].flatMap(y=>[b[2],b[5]].map(z=>world(c,[x,y,z]))));
}
function portFrame(c:Component,p:Port){
  return composeValvePose(c,{position:p.point,rotation:mountingRotation([0,0,1],p.axis??[0,0,1],[1,0,0],[1,0,0])});
}
/** Exact 200 mm between projected CAD envelopes along the pump row. Pump
 * centers and tank centers are never used as a substitute for body clearance. */
export function floorTankAnchor(assembly:Assembly,pump:Component,tank:Component){
  const pumps=assembly.components.filter(c=>c.kind==="pump"),first=pumps[0]??pump;
  const delta:Vec3=[pump.position[0]-first.position[0],pump.position[1]-first.position[1],0],length=Math.hypot(...delta);
  const axis:Vec3=length>1e-6?delta.map(v=>v/length) as Vec3:[0,1,0];
  const volume=tank.tankMount!.volume as 50|80|100,rotation=models.assets[`tank${volume}`].rotation as Vec3;
  const native=corners({...tank,position:[0,0,0],rotation}),body=corners(pump);
  const center=body.reduce((s,p)=>add(s,p),[0,0,0] as Vec3).map(v=>v/8) as Vec3;
  const target=Math.max(...body.map(p=>dot(p,axis)))+TANK_PUMP_GAP_MM-Math.min(...native.map(p=>dot(p,axis)));
  const position=add(center,axis.map(v=>v*(target-dot(center,axis))) as Vec3);
  const frame=assembly.components.find(c=>c.kind==="frame");
  const floor=frame?Math.max(...corners(frame).map(p=>p[2])):Math.min(...body.map(p=>p[2]));
  position[2]=floor-Math.min(...native.map(p=>p[2]));
  return {position,rotation};
}
function fitAutomaticFrame(assembly:Assembly):Assembly{
  const tanks=assembly.components.filter(c=>c.tankMount?.role==="tank"&&c.tankMount.mode==="floor");
  if(!tanks.length)return assembly;
  return {...assembly,components:assembly.components.map(c=>{
    if(c.kind!=="frame"||c.locked||!c.autoPose||JSON.stringify(c.position)!==JSON.stringify(c.autoPose.position)
      ||JSON.stringify(c.rotation)!=="[0,0,0]"||c.autoPose.parametersKey!==JSON.stringify(c.parameters))return c;
    const points=[...corners(c),...tanks.flatMap(corners)];
    const lo=[0,1].map(i=>Math.min(...points.map(p=>p[i]))),hi=[0,1].map(i=>Math.max(...points.map(p=>p[i])));
    const position:Vec3=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,c.position[2]],parameters={...c.parameters,length:hi[0]-lo[0],width:hi[1]-lo[1]};
    return {...c,position,parameters,autoPose:{position:[...position],rotation:[...c.rotation],parametersKey:JSON.stringify(parameters)},
      sourceNote:c.sourceNote.includes("Рама охватывает бак")?c.sourceNote:`${c.sourceNote} Рама охватывает бак с зазором 200 мм от последнего насоса; показан компоновочный контур. Несущая способность, отверстия и стоимость расширения требуют подтверждения.`};
  })};
}
/** Keep the 8 L body at its previous mounting height while omitting the valve
 * from the scene. This is a layout offset, not a direct rigid pipe joint. */
function directTankPose(){
  const valve=models.assets.valve20,outlet=valve.ports.find(p=>p.id==="outlet")!;
  const frame=composeValvePose({position:valve.position as Vec3,rotation:valve.rotation as Vec3},
    {position:outlet.point as Vec3,rotation:mountingRotation([0,0,1],outlet.axis as Vec3,[1,0,0],[1,0,0])});
  return composeValvePose(frame,{position:[0,0,-12],rotation:[0,0,0]});
}

/** Old valve/hose components are removed even when locked or retained by a
 * resource refresh. The tank body alone remains bound to its layout anchor. */
export function followTankConnections(assembly:Assembly,editedId?:string):Assembly{
  const components=assembly.components.filter(c=>!c.tankMount||c.tankMount.role==="tank");
  const next=components.map(c=>{
    let binding=c.tankMount;if(!binding)return c;
    if(binding.volume===8&&binding.parentId==="tank-discharge-valve"){
      const collector=components.find(p=>p.id==="collector-discharge"),port=collector?.ports.find(p=>p.id==="instrument-tank-0");
      if(!collector||!port)return {...c,orphaned:true};
      const fresh={...binding,...directTankPose(),parentId:collector.id,portId:port.id,revision:TANK_LAYOUT_REVISION};
      binding=binding.manual?{...fresh,...relativePose(portFrame(collector,port),c),manual:true}:fresh;
    }
    const parent=components.find(p=>p.id===binding.parentId);if(!parent)return {...c,orphaned:true};
    const port=parent.ports.find(p=>p.id===binding.portId);
    if(binding.mode==="port"&&!port)return {...c,orphaned:true};
    const anchor=binding.mode==="floor"?floorTankAnchor({...assembly,components},parent,c):portFrame(parent,port!);
    const updated=editedId===c.id?{...binding,...relativePose(anchor,c),manual:true}:binding;
    return {...c,...composeValvePose(anchor,updated),tankMount:updated,orphaned:false};
  });
  return fitAutomaticFrame({...assembly,components:next,...(assembly.lineJoints?{lineJoints:assembly.lineJoints.filter(j=>!j.id.startsWith("tank-joint-"))}:{})});
}

export function addTankConnections(assembly:Assembly,project:ProjectConfig):Assembly{
  const settings=project.entities["station-settings"] as SettingsEntity,rows=(project.entities["station-spec"] as SpecEntity).items;
  const row=rows.find(r=>r.assemblyRole==="discharge:tank"&&r.hydraulicAssembly&&r.quantity===1);
  const base={...assembly,components:assembly.components.filter(c=>!c.tankMount),lineJoints:assembly.lineJoints?.filter(j=>!j.id.startsWith("tank-joint-"))};
  if(!settings.membraneTank||!row)return base;
  const volume=settings.membraneTankVolume,expected=({8:"мембранный-бак-001-r0004",50:"мембранный-бак-001-r0005",80:"мембранный-бак-001-r0006",100:"мембранный-бак-001-r0007"} as const)[volume];
  const collector=base.components.find(c=>c.id==="collector-discharge"),port=collector?.ports.find(p=>p.id==="instrument-tank-0");
  if(row.equipmentId!==expected||!collector||port?.dn!==tankConnectionDn()||port.occupiedBy!=="tank"||port.gender!=="male")return base;
  const binding=(parentId:string,portId:string,mode:TankMount["mode"],position:Vec3,rotation:Vec3):TankMount=>({version:1,revision:TANK_LAYOUT_REVISION,parentId,portId,role:"tank",mode,volume,specPosition:row.position,position,rotation});
  const make=(name:string,bounds:Bounds,mount:TankMount,ports:Port[],sourceNote:string):Component=>({id:"tank-discharge",name,kind:"equipment",equipmentId:row.equipmentId,sourceKey:`equipment:${row.equipmentId}`,sourceNote,
    position:[0,0,0],rotation:[0,0,0],hidden:false,locked:false,opacity:1,bounds,ports,tankMount:mount,
    parameters:{length:bounds[3]-bounds[0],width:bounds[4]-bounds[1],height:bounds[5]-bounds[2],diameter:1,routeOffset:0}});
  const omitted="Соединительная арматура и подводка учтены в спецификации и не отрисовываются в 3D по указанию пользователя; показаны сгон DN20 и бак.";
  if(volume===8){
    const d=models.tank8.diameterMm/2,bounds:Bounds=[-d,-d,0,d,d,models.tank8.heightMm],pose=directTankPose();
    base.components.push(make("Мембранный бак WAV 8 · на коллекторе",bounds,binding(collector.id,port.id,"port",pose.position,pose.rotation),
      [{id:"inlet",point:[0,0,0],axis:[0,0,-1],dn:20,connection:"threaded",thread:"G3/4",gender:"male",provisional:true}],`${models.tank8.source}. ${models.tank8.note}. ${omitted}`));
  }else{
    const last=base.components.filter(c=>c.kind==="pump").at(-1);if(!last)return base;
    const asset=models.assets[`tank${volume}`],tank=make(`Мембранный бак WAV ${volume} · у последнего насоса`,asset.bounds as Bounds,
      binding(last.id,"floor","floor",[0,0,0],[0,0,0]),structuredClone(asset.ports) as Port[],`Исходная CAD-сетка Wester без масштабирования. Зазор между габаритами последнего насоса и бака 200 мм; опорная плоскость — верх рамы. Отличия габаритов CAD от паспорта требуют проверки. ${omitted}`);
    tank.meshUrl=asset.meshUrl;tank.cadSource={path:asset.source,hash:asset.sourceHash};base.components.push(tank);
  }
  base.components=base.components.filter(c=>!(c.id.startsWith(`spec-${row.position}-equipment:${row.equipmentId}-`)&&!c.tankMount));
  return followTankConnections(base);
}
