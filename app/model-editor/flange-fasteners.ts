import type { Assembly, Component, Port, PortRef, Vec3 } from "./model";
import type { InsertionPiece, InsertionShape } from "./insertion-types";
import type { FastenerBinding, FlangeMount, HardwareItem } from "./fastener-types";
import { composeValvePose } from "./valve-controls";
import { mountingRotation } from "./line-assembly";
import { jointFastenerLength } from "../joint-fastener-length";
import reference from "../suction-fasteners.json";
import shapes from "../../data/fastener-shapes.json";
import cad from "../../data/flange-cad-mounts.json";
import { flangeHoleCenters } from "./flange-hole-pattern";

const add = (a: Vec3, b: Vec3): Vec3 => a.map((v,i)=>v+b[i]) as Vec3;
const sub = (a: Vec3, b: Vec3): Vec3 => a.map((v,i)=>v-b[i]) as Vec3;
const mul = (a: Vec3, n: number): Vec3 => a.map(v=>v*n) as Vec3;
const dot = (a: Vec3, b: Vec3) => a.reduce((s,v,i)=>s+v*b[i],0);
const dist = (a: Vec3, b: Vec3) => Math.hypot(...sub(a,b));
const zero: Vec3 = [0,0,0];
const rotate = (p: Vec3, r: Vec3) => composeValvePose({position:zero,rotation:r},{position:p,rotation:zero}).position;
const world = (c: {position:Vec3;rotation:Vec3}, p: Vec3) => add(c.position,rotate(p,c.rotation));
const key = (p: PortRef) => JSON.stringify([p.componentId,p.portId]);
const positive = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v>0;

export const isHardwareRow = (c:Component) => /fasteners-(bolts|studs|nuts|washers)$/.test(c.line?.role??"");
const isVibration = (c:Component) => /-vibration-compensator$/.test(c.line?.role??"");
type Support = { node:string; owner:Component; port:Port; mount?:FlangeMount; pieceId?:string };
function procedural(s: InsertionShape, source:string): FlangeMount | undefined {
  const holes=flangeHoleCenters(s);
  return s.kind==="flange" && holes.length && positive(s.lengthMm) ? {source,holes,holeDiameter:s.boltHoleMm!,thickness:s.lengthMm,face:zero,axis:[-1,0,0],holeKind:"through",bearingInner:s.innerMm,bearingOuter:s.outerMm} : undefined;
}
function transformed(m:FlangeMount, pose:{position:Vec3;rotation:Vec3}):FlangeMount {
  return {...m,face:world(pose,m.face),axis:rotate(m.axis,pose.rotation),holes:m.holes.map(p=>world(pose,p))};
}
function supports(c:Component):Support[] {
  if (c.fastener || c.valveControl || c.orphaned) return [];
  const result:Support[]=[];
  const append=(p:Port,m?:FlangeMount,piece?:InsertionPiece)=>result.push({node:key({componentId:c.id,portId:p.id}),owner:c,port:p,
    mount:m?transformed(piece?transformed(m,piece):m,c):undefined,pieceId:piece?.id});
  if (c.shape?.kind==="flange") {
    const p=c.ports.find(p=>p.id==="left"); if(p)append(p,procedural(c.shape,c.sourceNote));
  } else if (c.insertion || c.collector) {
    const pieces=c.insertion?.template.geometry.pieces??c.collector!.template.pieces;
    for(const p of c.ports.filter(p=>p.purpose!=="sensor" && ["flanged","collar"].includes(p.connection??""))) {
      const root=c.insertion ? p.id : p.id.startsWith("network-") ? `end-${p.id.slice(8)}` : `branch-${p.id}`;
      const piece=pieces.find(s=>(c.insertion ? s.id===`${root}-loose` || s.id===root : s.id===`${root}-looseFlange` || s.id===`${root}-weldFlange`) && s.shape.kind==="flange");
      append(p,piece?procedural(piece.shape,piece.source):undefined,piece);
    }
  } else if (c.kind==="pump" || c.cadSource && !c.line || isVibration(c)) {
    const mesh=c.shape?.kind==="mesh"?c.shape:undefined;
    const mounts=(cad.models as unknown as Record<string,Record<string,FlangeMount>>)[mesh?.modelHash??c.cadSource?.hash??""];
    for(const p of c.ports.filter(p=>p.connection==="flanged")) {
      const mount=mounts?.[p.id];
      append(p,mount&&mesh?transformed(mount,{position:mesh.modelPosition??zero,rotation:mesh.modelRotation??zero}):mount);
    }
  }
  return result;
}
const hash = (s:string) => { let a=2166136261,b=5381; for(let i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b,33)^s.charCodeAt(i);}return `${(a>>>0).toString(16)}${(b>>>0).toString(16)}`; };

/** Connectivity, not spatial proximity, determines one clamped package. A wafer
 * and its gaskets connect two bearing flanges and receive ONE hardware set. */
export function rebuildFasteners(assembly:Assembly):Assembly {
  if (!assembly.fastenerCatalog) return assembly;
  const parts=assembly.components.filter(c=>!c.fastener).map(c=>isHardwareRow(c)?{...c,hidden:true}:c), byId=new Map(parts.map(c=>[c.id,c]));
  const parent=new Map<string,string>();
  const find=(k:string):string=>{const p=parent.get(k);if(!p){parent.set(k,k);return k;}if(p===k)return k;const root=find(p);parent.set(k,root);return root;};
  const union=(a:string,b:string)=>parent.set(find(a),find(b));
  const joints=assembly.lineJoints??[];
  const port=(p:PortRef)=>byId.get(p.componentId)?.ports.find(x=>x.id===p.portId);
  for(const j of joints) {
    if(j.kind==="thread" || !port(j.a) || !port(j.b))continue;
    union(key(j.a),key(j.b));
  }
  for(const c of parts) {
    // The collar lip and its seated loose flange belong to the same clamp.
    if(c.shape?.kind==="collar" && c.ports.some(p=>p.id==="flange-seat"))union(key({componentId:c.id,portId:"left"}),key({componentId:c.id,portId:"flange-seat"}));
    const wafer=/^(primary|secondary)(SuctionValve|DischargeValve|CheckValve)$/.test(c.line?.role??"") && /017W|010[СC]/i.test(c.name+" "+c.sourceNote);
    const gasket=/gasket/.test(c.line?.role??"");
    if((wafer||gasket) && c.ports.length>=2 && c.ports.every(p=>p.connection!=="threaded"))union(key({componentId:c.id,portId:c.ports[0].id}),key({componentId:c.id,portId:c.ports[1].id}));
  }
  const groups=new Map<string,Support[]>();
  for(const c of parts)for(const s of supports(c)){const root=find(s.node);groups.set(root,[...(groups.get(root)??[]),s]);}
  const generated:Component[]=[];
  for(const [root,ends] of groups){
    // A KMS has two independent steel rings. Never union its ports into a
    // through-bolt package. Put the bolt head on its ring, away from thread ends.
    ends.sort((a,b)=>Number(isVibration(b.owner))-Number(isVibration(a.owner)));
    const links=joints.filter(j=>find(key(j.a))===root && find(key(j.b))===root);
    if(!links.length)continue; // An unconnected flange is not a bolted joint.
    // Ignore welded backs; only mating surfaces or explicit collar seats count.
    const members=[...new Set(links.flatMap(j=>[j.a.componentId,j.b.componentId]))];
    const objects=members.map(id=>byId.get(id)!).filter(Boolean);
    const id=`fastener-${hash(ends.map(s=>s.node).sort().join("|"))}`;
    const issues:string[]=[],warnings:string[]=[];
    const binding:FastenerBinding={version:1,members,jointIds:links.map(j=>j.id),status:"blocked",issues,sources:[],grip:0,minimumLength:0,count:0,centers:[]};
    let position:Vec3=ends[0].mount?.face??world(ends[0].owner,ends[0].port.point),rotation:Vec3=zero;
    if(ends.length!==2)issues.push(`Нужны две подтверждённые опорные поверхности, найдено: ${ends.length}. Проверьте ответный фланец и состав пакета.`);
    const [a,b]=ends;
    for(const e of ends)if(!e.mount)issues.push(`${e.owner.name}: нет подтверждённых отверстий, углового положения или толщины фланца.`);
    for(const j of links){
      const pa=port(j.a)!,pb=port(j.b)!,ca=byId.get(j.a.componentId)!,cb=byId.get(j.b.componentId)!;
      if(dist(world(ca,pa.point),world(cb,pb.point))>.2)issues.push(`Соединение разорвано: ${ca.name} / ${cb.name}. Крепёж не показан.`);
      if(pa.axis&&pb.axis&&dot(rotate(pa.axis,ca.rotation),rotate(pb.axis,cb.rotation))>-.999)issues.push(`Оси стыка ${j.id} не согласованы.`);
    }
    if(a?.mount && b?.mount && ends.length===2){
      const am=a.mount,bm=b.mount,axis=am.axis;
      binding.sources=[am.source,bm.source,...shapes.sources];
      if(am.holeKind!=="through"||bm.holeKind!=="through")issues.push("Резьбовые или неподтверждённые отверстия: длина зацепления и исполнение винта не заданы.");
      if(dot(axis,bm.axis)>-.999)issues.push("Фланцы не обращены друг к другу или их оси не параллельны.");
      const span=dot(sub(bm.face,am.face),axis);
      if(span<-.01||Math.hypot(...sub(sub(bm.face,am.face),mul(axis,span)))>.2)issues.push("Фланцы несоосны либо пакет имеет отрицательную длину.");
      const dn=a.port.dn??b.port.dn,pn=a.port.pn??b.port.pn;
      if(!dn||!pn||a.port.dn&&b.port.dn&&a.port.dn!==b.port.dn||a.port.pn&&b.port.pn&&a.port.pn!==b.port.pn)issues.push("DN/PN сопрягаемых исполнений не подтверждены или различаются.");
      const ref=reference.find(r=>r.dn===dn&&r.pn===pn);
      if(!ref)issues.push(`Нет принятого правила крепежа DN${dn??"?"} PN${pn??"?"}.`);
      if(am.holes.length!==bm.holes.length || am.holes.some(h=>!bm.holes.some(k=>Math.hypot(...sub(sub(k,h),mul(axis,dot(sub(k,h),axis))))<.2)))issues.push("Сверловка или угловое положение отверстий не совпадают. Фланцы автоматически не поворачиваются.");
      if(ref && (am.holes.length!==ref.holes || bm.holes.length!==ref.holes || am.holeDiameter<=ref.boltDiameter || bm.holeDiameter<=ref.boltDiameter))issues.push("Фактическая сверловка не согласуется с принятой таблицей DN/PN и диаметром крепежа.");
      const wafer=objects.find(c=>/CheckValve|SuctionValve|DischargeValve/.test(c.line?.role??""));
      const vibration=objects.find(isVibration);
      const check=/CheckValve/.test(wafer?.line?.role??"");
      const endsCount=check?2:1;
      const kind=check?"stud":"bolt";
      const branch=objects.find(c=>c.line)?.line;
      const prefix=branch?.circuit===2?"secondary":"primary";
      const role=vibration?(objects.some(c=>c.kind==="pump")?"vibration-pump-fasteners":"vibration-insertion-fasteners"):check?"check-fasteners":wafer?"valve-fasteners":"pump-fasteners";
      const specParts=parts.filter(c=>c.line?.pumpId===branch?.pumpId&&c.line?.side===branch?.side&&c.line?.role.startsWith(`${prefix}-${role}-`));
      const hardware=assembly.fastenerCatalog.items;
      const choose=(k:HardwareItem["kind"])=>hardware.find(h=>h.kind===k && h.diameter===ref?.boltDiameter && specParts.some(c=>c.equipmentId===h.id));
      const nut=choose("nut")??hardware.find(h=>h.kind==="nut"&&h.diameter===ref?.boltDiameter),washer=choose("washer")??hardware.find(h=>h.kind==="washer"&&h.diameter===ref?.boltDiameter);
      const shape=shapes.rows.find(s=>s.d===ref?.boltDiameter);
      binding.grip=Math.max(0,span+am.thickness+bm.thickness);
      binding.count=am.holes.length;
      if(!nut||!washer||!shape)issues.push("Нет полных каталоговых размеров гайки/шайбы/головки для этого диаметра.");
      if(nut&&washer&&shape&&ref){
        const bearingRadius=Math.max(shape.washerOuter/2,shape.flats/Math.sqrt(3));
        for(const m of [am,bm])if(m.holes.some(h=>{
          const radius=dist(h,m.face);
          return positive(m.bearingInner)&&radius-bearingRadius<m.bearingInner/2-.01 || positive(m.bearingOuter)&&radius+bearingRadius>m.bearingOuter/2+.01;
        }))issues.push("Головка, гайка или шайба не помещается на опорном кольце фланца; проверьте исполнение и посадочный диаметр.");
        binding.minimumLength=jointFastenerLength(binding.grip,nut.length,washer.length,endsCount);
        const selected=choose(kind);
        const rod=selected??hardware.filter(h=>h.kind===kind&&h.diameter===ref.boltDiameter&&h.length+.01>=binding.minimumLength).sort((x,y)=>x.length-y.length)[0];
        if(!rod)issues.push(`В каталоге нет ${kind==="stud"?"шпильки":"болта"} М${ref.boltDiameter} длиной не менее ${binding.minimumLength.toFixed(1)} мм.`);
        else if(rod.length+.01<binding.minimumLength)issues.push(`Крепёж спецификации ${rod.name} короче фактического пакета: нужно ≥${binding.minimumLength.toFixed(1)} мм. Исправьте подбор.`);
        else if(!/DIN\s*934/.test(nut.name)||!/DIN\s*125/.test(washer.name)||kind==="bolt"&&!/DIN\s*933/.test(rod.name))issues.push("Нет подтверждённого профиля выбранного стандарта крепежа.");
        else {
          binding.hardware={rod,nut,washer};
          binding.sources.push(rod.source,nut.source,washer.source);
          binding.dimensions={diameter:ref.boltDiameter,length:rod.length,flats:shape.flats,head:shape.head,nut:nut.length,washer:washer.length,washerInner:shape.washerInner,washerOuter:shape.washerOuter,ends:endsCount};
          if(!selected)warnings.push("Стандартная длина подобрана для фактического 3D-пакета; отдельный соответствующий комплект в спецификации не найден. Стоимость и состав спецификации не изменены.");
          if(specParts.some(c=>c.line?.quantity!==am.holes.length*(["nut","washer"].includes(hardware.find(h=>h.id===c.equipmentId)?.kind??"")?endsCount:1)))warnings.push("Количество крепежа в спецификации отличается от фактической сверловки; требуется сверка.");
          position=sub(am.face,mul(axis,am.thickness));rotation=mountingRotation([1,0,0],axis);
          const basis=([ [1,0,0],[0,1,0],[0,0,1] ] as Vec3[]).map(v=>rotate(v,rotation));
          binding.centers=am.holes.map(h=>{const d=sub(h,am.face);return [0,dot(d,basis[1]),dot(d,basis[2])] as Vec3;});
        }
      }
      if(objects.some(c=>c.ports.some(p=>p.provisional)))warnings.push("В пакете есть предварительные монтажные базы; посадку необходимо подтвердить перед изготовлением.");
    }
    binding.status=issues.length?"blocked":"ready";
    binding.issues=[...new Set([...issues,...warnings])];
    const prior=assembly.components.find(c=>c.id===id&&c.fastener), d=binding.dimensions;
    const radius=Math.max(8,...binding.centers.map(p=>Math.hypot(p[1],p[2])+(d?.washerOuter??16)/2));
    const line=objects.find(c=>c.line)?.line, pump=line?byId.get(line.pumpId):undefined;
    const vibration=objects.find(isVibration);
    const label=vibration?`${vibration.name} · ${objects.some(c=>c.kind==="pump")?"к насосу":"к вставке"}`:objects.find(c=>/CheckValve|SuctionValve|DischargeValve/.test(c.line?.role??""))?.name??a.owner.name;
    const studStart=d?.ends===2?-(d.length-binding.grip)/2:0;
    generated.push({id,name:`Крепёж · ${pump?.name??a.owner.name}${line?.side==="suction"?" · всасывание":line?.side==="discharge"?" · напор":""} · ${label}`,
      kind:"equipment",sourceKey:"automatic-fastener",sourceNote:`${binding.status==="ready"?"Параметрический крепёж; резьба и фаски упрощены.":"Крепёж не построен."} ${binding.issues.join(" ")}`,
      position,rotation,hidden:prior?.hidden??false,opacity:prior?.opacity??1,locked:true,ports:[],fastener:binding,
      parameters:{length:d?.length??1,width:radius*2,height:radius*2,diameter:d?.diameter??1,routeOffset:0},
      bounds:binding.status==="ready"?[d!.ends===2?studStart:-d!.head,-radius,-radius,studStart+d!.length,radius,radius]:[-8,-8,-8,8,8,8]});
  }
  return {...assembly,components:[...parts,...generated]};
}
