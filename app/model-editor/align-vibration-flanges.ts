import type { Assembly, Component, Vec3 } from "./model";
import type { Support } from "./flange-fasteners";
import type { FlangeMount } from "./fastener-types";
import { composeValvePose, relativePose } from "./valve-controls";
import { mountingRotation } from "./line-assembly";
import type { LineJoint } from "./line-types";

const zero:Vec3=[0,0,0];
const sub=(a:Vec3,b:Vec3)=>a.map((v,i)=>v-b[i]) as Vec3;
const dot=(a:Vec3,b:Vec3)=>a.reduce((n,v,i)=>n+v*b[i],0);
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const radial=(p:Vec3,m:FlangeMount)=>{const d=sub(p,m.face),n=dot(d,m.axis);return d.map((v,i)=>v-m.axis[i]*n) as Vec3;};
const isVibration=(c:Component)=>/-vibration-compensator$/.test(c.line?.role??"");
const circle=(m:FlangeMount)=>m.holes.map(p=>Math.hypot(...radial(p,m)));
const sameCircle=(a:FlangeMount,b:FlangeMount)=>{
  const radii=[...circle(a),...circle(b)];
  return radii.every(r=>Math.abs(r-radii[0])<.1);
};

/** Only pump-to-insertion joints, never a wafer valve or an arbitrary 4/8 pair. */
export function fourOfEightPair(ends:Support[],objects:Component[]) {
  const pump=ends.find(e=>e.owner.kind==="pump");
  const mate=ends.find(e=>isVibration(e.owner)||e.owner.insertion&&e.pieceId);
  if(ends.length!==2||pump?.mount?.holes.length!==4||mate?.mount?.holes.length!==8) return;
  if(objects.some(c=>c.id!==pump.owner.id&&c.id!==mate.owner.id&&!/gasket/.test(c.line?.role??"")&&c.shape?.kind!=="collar")) return;
  const p=pump.mount,v=mate.mount;
  if(p.holeKind!=="through"||v.holeKind!=="through"||!sameCircle(p,v)||Math.abs(p.holeDiameter-v.holeDiameter)>.2) return;
  if(pump.port.dn!==mate.port.dn || pump.port.pn&&mate.port.pn&&pump.port.pn!==mate.port.pn || dot(p.axis,v.axis)>-.999) return;
  return {pump,mate,vibration:isVibration(mate.owner)};
}

export function matchingHoles(from:FlangeMount,to:FlangeMount) {
  return from.holes.filter(h=>to.holes.some(k=>Math.hypot(...sub(radial(h,from),radial(k,to)))<.2));
}

function turnPose<T extends {position:Vec3;rotation:Vec3}>(pose:T,face:Vec3,axis:Vec3,angle:number):T {
  const frame={position:face,rotation:mountingRotation([1,0,0],axis)};
  const turned=composeValvePose(frame,composeValvePose({position:zero,rotation:[angle,0,0]},relativePose(frame,pose)));
  return {...pose,...turned};
}
function turnMount(m:FlangeMount,angle:number):FlangeMount {
  const rotation=mountingRotation([1,0,0],m.axis),frame={position:zero,rotation};
  const rotated=(v:Vec3)=>composeValvePose(frame,composeValvePose({position:zero,rotation:[angle,0,0]},relativePose(frame,{position:v,rotation:zero}))).position;
  return {...m,holes:m.holes.map(p=>rotated(radial(p,m)).map((v,i)=>v+m.face[i]) as Vec3)};
}
function alignmentAngle(moving:FlangeMount,target:FlangeMount):number|undefined {
  if(!sameCircle(moving,target)) return;
  const p=radial(target.holes[0],target);
  const angles=moving.holes.map(h=>{const q=radial(h,moving);return Math.atan2(dot(moving.axis,cross(q,p)),dot(q,p))*180/Math.PI;}).sort((a,b)=>Math.abs(a)-Math.abs(b));
  return angles.find(a=>matchingHoles(target,turnMount(moving,a)).length===target.holes.length);
}

/** Clock a rigid insertion's pump-side flange, or the KMS and its opposite
 * mating ring. The pump, insertion body, route and sealing planes stay fixed. */
export function alignPumpFlanges(assembly:Assembly,groups:{ends:Support[];links:LineJoint[]}[]):Assembly {
  const byId=new Map(assembly.components.map(c=>[c.id,c]));
  for(const {ends,links} of groups) {
    const objects=[...new Set(links.flatMap(j=>[j.a.componentId,j.b.componentId]))].map(id=>byId.get(id)!).filter(Boolean);
    const pair=fourOfEightPair(ends,objects);
    if(!pair) continue;
    const {pump,mate:vibration}=pair,p=pump.mount!,v=vibration.mount!;
    if(matchingHoles(p,v).length===4) continue;
    if(!links.length||links.some(j=>{
      const a=byId.get(j.a.componentId),b=byId.get(j.b.componentId);
      const pa=a?.ports.find(p=>p.id===j.a.portId),pb=b?.ports.find(p=>p.id===j.b.portId);
      return !a||!b||!pa||!pb||Math.hypot(...sub(composeValvePose(a,{position:pa.point,rotation:zero}).position,composeValvePose(b,{position:pb.point,rotation:zero}).position))>.2;
    })) continue;
    const angle=alignmentAngle(v,p);
    if(angle===undefined) continue;
    if(!pair.vibration) {
      // Clock only this flange, keeping both sealing planes and the other end fixed.
      const changed=structuredClone(vibration.owner);
      const piece=changed.insertion?.template.geometry.pieces.find(p=>p.id===vibration.pieceId);
      if(!piece||piece.shape.kind!=="flange") continue;
      Object.assign(piece,relativePose(changed,turnPose(composeValvePose(changed,piece),v.face,v.axis,angle)));
      return {...assembly,components:assembly.components.map(c=>c.id===changed.id?changed:c)};
    }
    const worldPort=(s:Support)=>composeValvePose(s.owner,{position:s.port.point,rotation:zero}).position;
    if(Math.hypot(...sub(worldPort(pump),worldPort(vibration)))>.2) continue;
    const otherGroup=groups.find(g=>g.ends!==ends && g.ends.length===2 && g.ends.some(s=>s.owner.id===vibration.owner.id))?.ends;
    const otherV=otherGroup?.find(s=>s.owner.id===vibration.owner.id),other=otherGroup?.find(s=>s.owner.id!==vibration.owner.id);
    if(!otherV?.mount||!other?.mount||other.mount.holes.length!==8||other.mount.holeKind!=="through") continue;
    const pieces=other.owner.insertion?.template.geometry.pieces??other.owner.collector?.template.pieces;
    const piece=pieces?.find(p=>p.id===other.pieceId);
    if(piece ? piece.shape.kind!=="flange" : other.owner.shape?.kind!=="flange") continue;
    // Opposite KMS ends have opposite axes: use the same world rotation.
    const target=turnMount(otherV.mount,-angle);
    const otherAngle=alignmentAngle(other.mount,target);
    if(otherAngle===undefined) continue;
    const changedV=turnPose(vibration.owner,v.face,v.axis,angle);
    if(changedV.line && JSON.stringify(changedV.line.baseline)===JSON.stringify({position:vibration.owner.position,rotation:vibration.owner.rotation}))
      changedV.line={...changedV.line,baseline:{position:changedV.position,rotation:changedV.rotation}};
    let changedOther:Component;
    if(piece) {
      changedOther=structuredClone(other.owner);
      const targetPiece=(changedOther.insertion?.template.geometry.pieces??changedOther.collector!.template.pieces).find(p=>p.id===piece.id)!;
      const pose=relativePose(other.owner,turnPose(composeValvePose(other.owner,piece),other.mount.face,other.mount.axis,otherAngle));
      Object.assign(targetPiece,pose);
    } else changedOther=turnPose(other.owner,other.mount.face,other.mount.axis,otherAngle);
    return {...assembly,components:assembly.components.map(c=>c.id===changedV.id?changedV:c.id===changedOther.id?changedOther:c)};
  }
  return assembly;
}
