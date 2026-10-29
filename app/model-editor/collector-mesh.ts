import type { Vec3 } from "./model";
import type { CollectorBranch, CollectorTemplate } from "./collector-types";
import { branchFrame, saddleRings, type SaddleRings } from "./collector-intersection";
import { collectorGeometryKey } from "./collector-types";
export type MetalMesh = { positions: number[]; indices: number[] };
export type CollectorMetal = { main: MetalMesh | null; branches: Record<string, MetalMesh>; rings: Record<string, SaddleRings>; issues: string[] };
type Loop = { points: Vec3[]; params: number[] };
type UV = [number,number];
const TAU=2*Math.PI,EPS=1e-8;
const add=(a:Vec3,b:Vec3):Vec3=>a.map((v,i)=>v+b[i]) as Vec3;
const mix=(a:Vec3,b:Vec3,t:number):Vec3=>a.map((v,i)=>v+(b[i]-v)*t) as Vec3;
const mesh=():MetalMesh=>({positions:[],indices:[]});
const wrap=(a:number,start:number)=>start+((a-start)%TAU+TAU)%TAU;
function triangle(m:MetalMesh,a:number,b:number,c:number,reverse=false){
  const p=m.positions,ab=[0,1,2].map(i=>p[b*3+i]-p[a*3+i]),ac=[0,1,2].map(i=>p[c*3+i]-p[a*3+i]);
  if(Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])<1e-10)return;
  m.indices.push(a,reverse?c:b,reverse?b:c);
}
/** Join differently subdivided loops without T-junctions. */
function zipBand(m:MetalMesh,a:Loop,b:Loop,reverse=false){
  const base=m.positions.length/3;for(const p of [...a.points,...b.points])m.positions.push(...p);
  let i=0,j=0;const na=a.points.length,nb=b.points.length;
  while(i<na||j<nb){const ai=base+i%na,bj=base+na+j%nb,at=i+1===na?1:a.params[i+1],bt=j+1===nb?1:b.params[j+1];
    if(j===nb||i<na&&at<=bt+EPS){triangle(m,ai,base+(i+1)%na,bj,reverse);i++;}
    else{triangle(m,ai,base+na+(j+1)%nb,bj,reverse);j++;}
  }
}
const regular=(p:Vec3[]):Loop=>({points:p,params:p.map((_,i)=>i/p.length)});
function validateThread(r:SaddleRings,b:CollectorBranch){
  const thread=b.thread;if(!thread)return;
  const topOfSaddle=Math.max(...r.outer.map(p=>p.reduce((sum,x,i)=>sum+(x-b.origin[i])*b.axis[i],0)));
  if(![thread.pitchMm,thread.lengthMm,thread.depthMm].every(Number.isFinite)||!(thread.pitchMm>0&&thread.lengthMm>0&&thread.lengthMm/thread.pitchMm<=100&&thread.depthMm>0&&thread.depthMm<(b.outerMm-b.innerMm)/2&&b.endMm-thread.lengthMm>topOfSaddle))throw new Error(`${b.name}: резьба выходит за свободный участок или стенку сгона`);
}
function branchMesh(r:SaddleRings,b:CollectorBranch):MetalMesh{
  const m=mesh(),thread=b.thread;
  if(thread){
    const [u,v]=branchFrame(b.axis),start=b.endMm-thread.lengthMm;
    // A single helical groove is part of the same closed hollow body, not
    // floating rings or an extra BOM component. Taper the run-in/out to OD.
    const steps=Math.ceil(thread.lengthMm/thread.pitchMm*12),n=r.outer.length;
    let previous=regular(r.outer);
    for(let j=0;j<=steps;j++){
      const height=thread.lengthMm*j/steps,z=start+height,envelope=Math.min(1,height/(thread.pitchMm*.4),(thread.lengthMm-height)/(thread.pitchMm*.4));
      const points=Array.from({length:n},(_,i)=>{
        const phi=TAU*i/n,phase=TAU*height/thread.pitchMm-phi,radius=b.outerMm/2-thread.depthMm*envelope*(.5-.5*Math.cos(phase));
        return b.origin.map((x,k)=>x+b.axis[k]*z+radius*(u[k]*Math.cos(phi)+v[k]*Math.sin(phi))) as Vec3;
      });
      const next=regular(points);zipBand(m,previous,next);previous=next;
    }
  }else zipBand(m,regular(r.outer),regular(r.outerEnd));
  zipBand(m,regular(r.innerEnd),regular(r.inner));zipBand(m,regular(r.inner),regular(r.outer));zipBand(m,regular(r.outerEnd),regular(r.innerEnd));return m;
}
function seamFor(rings:SaddleRings[]){
  const angles=rings.map(r=>{const p=r.inner.reduce((s,p)=>add(s,p),[0,0,0] as Vec3);return wrap(Math.atan2(p[2],p[1]),0);}).sort((a,b)=>a-b);
  if(!angles.length)return -Math.PI;let gap=-1,seam=0;
  for(let i=0;i<angles.length;i++){const end=angles[(i+1)%angles.length]+(i===angles.length-1?TAU:0),d=end-angles[i];if(d>gap){gap=d;seam=angles[i]+d/2;}}return seam;
}
/** Sweep angular bands of an unrolled cylinder. Hole vertices delimit bands;
 * adjacent bands share every boundary vertex. Bounded subdivision, no exponential refinement. */
function surface(m:MetalMesh,radius:number,length:number,loops:Vec3[][],seam:number,inward:boolean):{holes:Loop[];ends:[Loop,Loop]}{
  const holes=loops.map(loop=>loop.map(p=>[p[0],wrap(Math.atan2(p[2],p[1]),seam)] as UV));
  if(holes.some(h=>Math.max(...h.map(p=>p[1]))-Math.min(...h.map(p=>p[1]))>Math.PI))throw new Error("Контур врезки пересекает шов развёртки");
  const raw=[...Array.from({length:129},(_,i)=>seam+TAU*i/128),...holes.flat().map(p=>p[1])].sort((a,b)=>a-b);
  const levels=raw.filter((v,i)=>i===0||v-raw[i-1]>EPS),rows=levels.map(()=>[-length/2,length/2]);
  const boundary=new Map<string,Vec3>(),vertex=new Map<string,number>(),key=(x:number,phi:number)=>`${x.toFixed(8)}:${phi.toFixed(10)}`;
  const enriched:Loop[]=loops.map(()=>({points:[],params:[]}));
  const edges=holes.flatMap((loop,h)=>loop.map((a,i)=>({a,b:loop[(i+1)%loop.length],pa:loops[h][i],pb:loops[h][(i+1)%loop.length],h,i,n:loop.length})));
  const at=(e:typeof edges[number],phi:number)=>{const f=(phi-e.a[1])/(e.b[1]-e.a[1]);return {x:e.a[0]+(e.b[0]-e.a[0])*f,p:mix(e.pa,e.pb,f),t:(e.i+f)/e.n};};
  for(const e of edges){
    enriched[e.h].points.push(e.pa);enriched[e.h].params.push(e.i/e.n);
    for(let k=0;k<levels.length;k++){
      const phi=levels[k];if(phi<Math.min(e.a[1],e.b[1])-EPS||phi>Math.max(e.a[1],e.b[1])+EPS)continue;
      if(Math.abs(e.b[1]-e.a[1])<EPS){rows[k].push(e.a[0],e.b[0]);boundary.set(key(e.a[0],phi),e.pa);boundary.set(key(e.b[0],phi),e.pb);continue;}
      const v=at(e,phi);rows[k].push(v.x);boundary.set(key(v.x,phi),v.p);
      if(v.t>e.i/e.n+EPS&&v.t<(e.i+1)/e.n-EPS){enriched[e.h].points.push(v.p);enriched[e.h].params.push(v.t);}
    }
  }
  for(const loop of enriched){const order=loop.params.map((t,i)=>({t,p:loop.points[i]})).sort((a,b)=>a.t-b.t);loop.params=order.map(v=>v.t);loop.points=order.map(v=>v.p);}
  for(let k=0;k<rows.length;k++)rows[k]=rows[k].sort((a,b)=>a-b).filter((v,i,a)=>i===0||v-a[i-1]>EPS);
  const index=(x:number,k:number)=>{const phi=levels[k],id=key(x,phi);let i=vertex.get(id);if(i===undefined){i=m.positions.length/3;vertex.set(id,i);m.positions.push(...(boundary.get(id)??[x,radius*Math.cos(phi),radius*Math.sin(phi)]));}return i;};
  for(let k=0;k<levels.length-1;k++){
    const lo=levels[k],hi=levels[k+1],mid=(lo+hi)/2;
    const crossings=edges.filter(e=>mid>Math.min(e.a[1],e.b[1])&&mid<Math.max(e.a[1],e.b[1])).map(e=>({mid:at(e,mid).x,lo:at(e,lo).x,hi:at(e,hi).x})).sort((a,b)=>a.mid-b.mid);
    if(crossings.length%2)throw new Error("Незамкнутый контур отверстия магистрали");
    const limits=[{lo:-length/2,hi:-length/2},...crossings,{lo:length/2,hi:length/2}];
    for(let cell=0;cell<limits.length-1;cell+=2){const a=limits[cell],b=limits[cell+1];
      const values=(row:number,left:number,right:number)=>rows[row].filter(x=>x>=left-EPS&&x<=right+EPS);
      const bottom=values(k,a.lo,b.lo),top=values(k+1,a.hi,b.hi);if(!bottom.length||!top.length)continue;
      let i=0,j=0;
      while(i<bottom.length-1||j<top.length-1){const bi=index(bottom[i],k),tj=index(top[j],k+1);
        const bp=(bottom[i+1]-a.lo)/(b.lo-a.lo||1),tp=(top[j+1]-a.hi)/(b.hi-a.hi||1);
        if(j===top.length-1||i<bottom.length-1&&bp<=tp){triangle(m,bi,index(bottom[i+1],k),tj,!inward);i++;}
        else{triangle(m,bi,index(top[j+1],k+1),tj,!inward);j++;}
      }
    }
  }
  const end=(x:number):Loop=>({points:levels.slice(0,-1).map(phi=>[x,radius*Math.cos(phi),radius*Math.sin(phi)]),params:levels.slice(0,-1).map(phi=>(phi-seam)/TAU)});
  return {holes:enriched,ends:[end(-length/2),end(length/2)]};
}
export function collectorMetal(t:Pick<CollectorTemplate,"main"|"branches">):CollectorMetal{
  const result:CollectorMetal={main:null,branches:{},rings:{},issues:[]};if(!t.main)return result;
  const valid:CollectorBranch[]=[];
  for(const b of t.branches)try{const rings=saddleRings(t.main,b);validateThread(rings,b);result.rings[b.id]=rings;valid.push(b);}catch(e){result.issues.push(`${b.name}: ${e instanceof Error?e.message:String(e)}`);}
  const seam=seamFor(Object.values(result.rings)),boxes=valid.map(b=>{const r=result.rings[b.id].outer,a=r.map(p=>wrap(Math.atan2(p[2],p[1]),seam));return [Math.min(...r.map(p=>p[0])),Math.max(...r.map(p=>p[0])),Math.min(...a),Math.max(...a)];}),invalid=new Set<string>();
  for(let i=0;i<valid.length;i++)for(let j=i+1;j<valid.length;j++)if(boxes[i][0]<boxes[j][1]+EPS&&boxes[j][0]<boxes[i][1]+EPS&&boxes[i][2]<boxes[j][3]+EPS&&boxes[j][2]<boxes[i][3]+EPS){invalid.add(valid[i].id);invalid.add(valid[j].id);result.issues.push(`Пересекаются зоны врезок: ${valid[i].name} / ${valid[j].name}`);}
  const accepted=valid.filter(b=>!invalid.has(b.id)),rings=accepted.map(b=>result.rings[b.id]),m=mesh();
  try{
    const outer=surface(m,t.main.outerMm/2,t.main.lengthMm,rings.map(r=>r.inner),seam,false),inner=surface(m,t.main.innerMm/2,t.main.lengthMm,rings.map(r=>r.bore),seam,true);
    for(let i=0;i<rings.length;i++)zipBand(m,inner.holes[i],outer.holes[i],true);
    zipBand(m,outer.ends[0],inner.ends[0],true);zipBand(m,inner.ends[1],outer.ends[1],true);result.main=m;
    for(const b of accepted)result.branches[b.id]=branchMesh(result.rings[b.id],b);
  }catch(e){result.issues.push(e instanceof Error?e.message:String(e));result.rings={};}
  for(const id of Object.keys(result.rings))if(!result.branches[id])delete result.rings[id];return result;
}
const resolved = new WeakMap<CollectorTemplate,{key:string;metal:CollectorMetal}>();
/** Diagnostics, renderer and snaps share the same validated cut result. No GPU ownership here. */
export function resolvedCollectorMetal(t:CollectorTemplate):CollectorMetal {
  const key=collectorGeometryKey(t),old=resolved.get(t);if(old?.key===key)return old.metal;
  const metal=collectorMetal(t);resolved.set(t,{key,metal});return metal;
}
