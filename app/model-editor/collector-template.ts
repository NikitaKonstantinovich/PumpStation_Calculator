import type { CollectorCardState } from "../collector-project";
import { activeCircuits, configurationFingerprint, flangeKinds, pumpCount } from "../collector-calculations";
import type { Component, Vec3, Bounds } from "./model";
import type { LineCatalog, LineGeometry } from "./line-types";
import type { InsertionPiece } from "./insertion-types";
import { collectorGeometryKey, defaultCollectorMount, resolveCollectorMount, type CollectorTemplate, type CollectorBranch } from "./collector-types";
import { saddleRings } from "./collector-intersection";

const positive=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>0;
const add=(a:Vec3,b:Vec3):Vec3=>a.map((v,i)=>v+b[i]) as Vec3;
const mul=(a:Vec3,s:number):Vec3=>a.map(v=>v*s) as Vec3;
const turn=(v:Vec3,angles:Vec3):Vec3=>{
  const [x,y,z]=angles.map(a=>a*Math.PI/180),a=v[0]*Math.cos(z)-v[1]*Math.sin(z),b=v[0]*Math.sin(z)+v[1]*Math.cos(z),c=-a*Math.sin(y)+v[2]*Math.cos(y);
  return [a*Math.cos(y)+v[2]*Math.sin(y),b*Math.cos(x)-c*Math.sin(x),b*Math.sin(x)+c*Math.cos(x)];
};
// Three.js uses XYZ Euler angles (Rx Ry Rz). Align local +X with the
// piece axis, including vertical directions whose X/Y may be signed zero.
// atan2(-0,-0) used as yaw previously flipped upward-facing collars down.
const rotation=(axis:Vec3):Vec3=>[0,
  Math.hypot(axis[0],axis[2])<1e-12?0:Math.atan2(-axis[2],axis[0])*180/Math.PI,
  Math.asin(Math.max(-1,Math.min(1,axis[1])))*180/Math.PI];
const piece=(id:string,componentId:string,name:string,point:Vec3,axis:Vec3,g?:LineGeometry):InsertionPiece=>({id,componentId,name,position:point,rotation:rotation(axis),role:id,auxiliary:false,
  shape:g?.shape??{kind:"marker"},ports:[],source:g?.source??"Размеры не подтверждены",fidelity:g?.shape?g.fidelity:"missing"});

export function finishCollectorTemplate(t:CollectorTemplate):CollectorTemplate {
  const main=t.main, r=main?main.outerMm/2:1, l=main?main.lengthMm/2:1;
  const points:Vec3[]=[[-l,-r,-r],[l,r,r]];
  for(const b of t.branches) if(main)try { const rings=saddleRings(main,b);points.push(...rings.outer,...rings.outerEnd); }catch { points.push(add(b.origin,mul(b.axis,b.endMm))); }
  // Bounds of transformed purchased models; no invented body for markers.
  for(const p of t.pieces) {
    const s=p.shape, bound=s.meshBounds??[0,-(s.lipOuterMm??s.outerMm??0)/2,-(s.lipOuterMm??s.outerMm??0)/2,s.lengthMm??0,(s.lipOuterMm??s.outerMm??0)/2,(s.lipOuterMm??s.outerMm??0)/2];
    if(s.kind!=="marker")for(const x of [bound[0],bound[3]])for(const y of [bound[1],bound[4]])for(const z of [bound[2],bound[5]]){
      const local=s.kind==="mesh"?add(turn([x,y,z],s.modelRotation??[0,0,0]),s.modelPosition??[0,0,0]):[x,y,z] as Vec3;
      points.push(add(p.position,turn(local,p.rotation)));
    }
  }
  t.bounds=[...[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),...[0,1,2].map(i=>Math.max(...points.map(p=>p[i])))] as Bounds;
  t.issues=[...new Set(t.issues)];t.geometryKey=collectorGeometryKey(t);return t;
}

/** Generates descriptors only. Prices, weld work and pipe quantities are never changed. */
export function buildCollectorTemplate(card:CollectorCardState, data:LineCatalog, pumps:Array<{id:string;circuit:number;x:number}>, side:"suction"|"discharge", savedMount=defaultCollectorMount(), pumpBranchOrientation:CollectorTemplate["pumpBranchOrientation"]="side"):CollectorTemplate {
  const mount=resolveCollectorMount(savedMount);
  const bottom=side==="discharge"&&pumpBranchOrientation==="bottom";
  const t:CollectorTemplate={version:1,ruleVersion:3,side,pumpBranchOrientation:bottom?"bottom":"side",mount:structuredClone(mount),main:null,branches:[],pieces:[],ports:[],issues:[],assumptions:[
    "Компоновочный шаблон saddle-on-surface v1: патрубок прилегает седлом к наружной поверхности; производственное исполнение врезки не подтверждено.",
    mount.branchLengthReference==="axis-to-pipe-end"?"Расчётная длина патрубка предварительно отложена от оси магистрали до плоского торца трубы.":"Расчётная длина патрубка предварительно отложена от наружной касательной поверхности магистрали до плоского торца трубы.",
    "Координаты насосных врезок согласуются с ветвями сборки; отдельный просмотр использует центры ячеек. Сгоны направлены вверх; их распределение по длине предварительное.",
    "Решение пользователя 31.10.2026: отступ торца трубы от привалочной поверхности приварного фланца по умолчанию 5 мм, на концах магистрали и насосных патрубках. Явная монтажная настройка имеет приоритет; длина трубы и стоимость не меняются.",
  ],geometryKey:"",bounds:[-1,-1,-1,1,1,1]};
  if(bottom)t.assumptions.push("Напорные линии идут вверх от выходов насосов; насосные патрубки коллектора направлены вниз. Сгоны КИП остаются сверху; длины взяты из расчёта и спецификации.");
  const c=card.configuration,calc=card.calculation;
  if(!c||!calc||calc.fingerprint!==configurationFingerprint(c)){t.issues.push("Нет расчёта, соответствующего конфигурации коллектора. Рассчитайте коллектор и обновите состав.");return finishCollectorTemplate(t);}
  if(card.status==="stale"||card.currentCatalogVersion&&card.currentCatalogVersion!==calc.catalogVersion)t.issues.push("Расчёт коллектора устарел. Показана геометрия по сохранённому составу и монтажным длинам; актуальность расчёта и цены требует пересчёта в конструкторе.");
  if(activeCircuits(c).reduce((n,g)=>n+pumpCount(g),0)>90){t.issues.push("Больше 90 насосных патрубков: превышен предел монтажного шаблона. Геометрия не построена.");return finishCollectorTemplate(t);}
  const row=(role:string)=>calc.bom.find(b=>b.role===role), geometry=(role:string)=>{const id=row(role)?.componentId;return id?data.items[id]:undefined;};
  const main=geometry("collector-pipe");
  if(main?.kind==="pipe"&&positive(main.outerDiameter)&&positive(main.wall)&&main.wall*2<main.outerDiameter&&positive(calc.lengthMm))t.main={componentId:main.equipmentId,lengthMm:calc.lengthMm,outerMm:main.outerDiameter,innerMm:main.outerDiameter-2*main.wall,source:main.source};
  else t.issues.push("Не подтверждены OD и стенка выбранной основной трубы коллектора.");
  if(c.eccentric&&mount.eccentricOffsetMm===null)t.assumptions.push("Решение пользователя 30.10.2026: верхние наружные образующие трубы коллектора и каждого насосного патрубка совмещены; смещение по локальной Z = (OD коллектора − OD патрубка) / 2. Индивидуальное DN каждого контура учитывается отдельно.");
  if(c.eccentric&&c.type!=="suction")t.issues.push("Эксцентрическое исполнение напорного коллектора недопустимо.");
  const sign=side==="discharge"?1:-1,axis:Vec3=bottom?[0,0,-1]:[0,sign,0];
  const flange=(root:string,role:string,dn:number,pn:number,pipeOuter:number,tip:Vec3,direction:Vec3,name=root):Vec3=>{
    let face=[...tip] as Vec3;
    for(const kind of flangeKinds(c.material,dn,pn)) {
      const id=row(`${role}-${kind}`)?.componentId??`${role}-${kind}`, g=geometry(`${role}-${kind}`);
      let origin=[...tip] as Vec3,usable=g;
      if(kind==="collar") {
        if(!g?.shape||!positive(g.length)||!positive(g.outerDiameter)||Math.abs(g.outerDiameter-pipeOuter)>1e-4){usable=undefined;t.issues.push(`${root}: нет подтверждённого воротника с торцом под OD ${pipeOuter} мм`);}
        else {face=add(tip,mul(direction,g.length));origin=face;}
      } else if(kind==="looseFlange") {
        const collar=geometry(`${role}-collar`);
        if(!g?.shape||t.pieces.find(p=>p.id===`${root}-collar`)?.fidelity==="missing"||!positive(collar?.lipThickness)||!positive(collar?.length)||!positive(g.shape.innerMm)||g.shape.innerMm<pipeOuter){usable=undefined;t.issues.push(`${root}: не подтверждена посадка свободного фланца за бортом воротника`);}
        else origin=add(face,mul(direction,-collar.lipThickness));
      } else {
        const seat=mount.flangeFaceToPipeEndMm,thickness=g?.length,bore=g?.shape?.innerMm;
        if(seat===null||!g?.shape||!positive(thickness)||seat<0||seat>thickness||!positive(bore)||bore<pipeOuter){usable=undefined;t.issues.push(`${root}: задайте подтверждённое расстояние от привалочной поверхности приварного фланца до торца трубы и проверьте посадочное отверстие`);}
        else {face=add(tip,mul(direction,seat));origin=face;}
      }
      t.pieces.push(piece(`${root}-${kind}`,id,`${kind==="collar"?"Воротник":kind==="looseFlange"?"Свободный фланец":"Приварной фланец"} · ${name}`,origin,mul(direction,-1),usable));
    }return face;
  };
  const addBranch=(b:CollectorBranch,permitted:boolean)=>{
    try{if(!permitted||!t.main)throw new Error("нет подтверждённых монтажных параметров");saddleRings(t.main,b);t.branches.push(b);}
    catch(e){t.issues.push(`${b.name}: ${e instanceof Error?e.message:String(e)}`);t.pieces.push(piece(b.id,b.componentId,b.name,add(b.origin,mul(b.axis,b.endMm)),b.axis));}
  };
  let offset=0;
  activeCircuits(c).forEach((group,index)=>{
    const n=pumpCount(group),g=geometry(`branch${index+1}-pipe`),length=calc.branchLengthsMm[index];
    for(let j=0;j<n&&j<100;j++) {
      const pump=pumps.filter(p=>p.circuit===index+1)[j],portId=pump?.id??`collector-branch-${index+1}-${j}`,id=`branch-${portId}`;
      const x=pump?.x??(-calc.lengthMm/2+offset+(j+.5)*group.spacing),z=c.eccentric?(mount.eccentricOffsetMm??(t.main&&positive(g?.outerDiameter)?(t.main.outerMm-g.outerDiameter)/2:0)):0;
      const origin:Vec3=[x,0,z],end=(positive(length)?length:0)+(mount.branchLengthReference==="surface-to-pipe-end"&&t.main?t.main.outerMm/2:0),tip=add(origin,mul(axis,end));
      const valid=positive(g?.outerDiameter)&&positive(g?.wall)&&g.wall*2<g.outerDiameter&&positive(length);
      if(valid&&t.main&&g.outerDiameter!>t.main.outerMm+1e-6){t.issues.push(`Патрубок ${index+1}.${j+1}: DN${group.dn}, Ø${g.outerDiameter} мм больше коллектора DN${c.dn}, Ø${t.main.outerMm} мм. Седловая врезка невозможна. Исправьте диаметры в конструкторе коллекторов.`);t.pieces.push(piece(id,g.equipmentId,`Патрубок ${index+1}.${j+1}`,tip,axis));}
      else if(valid)addBranch({id,componentId:g.equipmentId,name:`Патрубок ${index+1}.${j+1}`,role:"branch",portId,circuit:index+1,origin,axis,outerMm:g.outerDiameter!,innerMm:g.outerDiameter!-2*g.wall!,endMm:end,calculatedLengthMm:length!,source:g.source,joint:mount.joint},!c.eccentric||c.type==="suction");
      else {t.issues.push(`${id}: нет длины, OD или стенки выбранной трубы патрубка`);t.pieces.push(piece(id,row(`branch${index+1}-pipe`)?.componentId??id,`Патрубок ${index+1}.${j+1}`,tip,axis));}
      const face=group.connection==="flanged"?flange(id,`branch${index+1}`,group.dn??0,group.pn,g?.outerDiameter??0,tip,axis,`Патрубок ${index+1}.${j+1}`):tip;
      if(group.connection==="threaded")t.issues.push(`${id}: плоскость и глубина резьбового подключения не подтверждены`);
      t.ports.push({id:portId,point:face,axis,provisional:true,dn:group.dn??undefined,pn:group.pn,material:c.material,connection:group.connection,plane:group.connection==="threaded"?"thread-reference":"mating-face",source:"Монтажный шаблон коллектора v1; базы предварительные",boreMm:valid?g!.outerDiameter!-2*g!.wall!:undefined});
    }offset+=n*group.spacing;
  });
  if(t.main)for(const [name,s]of [["left",-1],["right",1]] as const){const d:Vec3=[s,0,0],tip:Vec3=[s*t.main.lengthMm/2,0,0],face=c.connection==="flanged"?flange(`end-${name}`,"end",c.dn??0,c.pn,t.main.outerMm,tip,d,s<0?"Левый конец":"Правый конец"):tip;
    t.ports.push({id:`network-${name}`,point:face,axis:d,provisional:true,dn:c.dn??undefined,pn:c.pn,material:c.material,connection:c.connection,plane:c.connection==="threaded"?"thread-reference":"mating-face",source:"Монтажный шаблон коллектора v1"});}
  const instruments=calc.bom.filter(r=>r.kind==="nipple"&&r.role.startsWith("instrument"));
  let instrumentIndex=0;const count=instruments.reduce((sum,r)=>sum+(r.quantity??0),0);
  const slots=[-calc.lengthMm/2,...t.ports.filter(p=>!p.id.startsWith("network-")).map(p=>p.point[0]),calc.lengthMm/2].sort((a,b)=>a-b);
  const gaps=slots.slice(1).map((right,i)=>({width:right-slots[i],x:(right+slots[i])/2})).filter(g=>g.width>0).sort((a,b)=>b.width-a.width||a.x-b.x);
  const instrumentXs=gaps.slice(0,count).map(g=>g.x);
  while(instrumentXs.length<count){const available=[...slots,...instrumentXs].sort((a,b)=>a-b);let gap=0;for(let j=1;j<available.length-1;j++)if(available[j+1]-available[j]>available[gap+1]-available[gap])gap=j;instrumentXs.push((available[gap]+available[gap+1])/2);}
  instrumentXs.sort((a,b)=>a-b);
  for(const r of instruments)for(let j=0;j<(r.quantity??0);j++){
    const instrument=c.instrumentPorts?.find(p=>r.role===`instrument-${p.id}`);
    const id=`${r.role}-${j}`,g=geometry(r.role),override=mount.instrumentLengthsMm[id],length=override??instrument?.lengthMm??mount.instrumentDefaultLengthMm!,reference=override!==undefined?mount.instrumentLengthReference!:"blank-length",x=instrumentXs[instrumentIndex++],origin:Vec3=[x,0,0],a:Vec3=[0,0,1];
    const dn=instrument?.dn??g?.dn??Number(r.role.match(/^instrument(\d+)$/)?.[1]),name=`Сгон DN${dn} · ${j+1}`;
    let end=(t.main?.outerMm??0)/2+length;
    if(positive(length)&&positive(g?.outerDiameter)&&positive(g?.wall)&&g.wall*2<g.outerDiameter){
      const b:CollectorBranch={id,componentId:g.equipmentId,name,role:"instrument",portId:id,circuit:0,origin,axis:a,outerMm:g.outerDiameter,innerMm:g.outerDiameter-2*g.wall,endMm:end,calculatedLengthMm:null,source:`${g.source}; ${override!==undefined?"Размер монтажного шаблона":"Решение пользователя 29.10.2026: длина сгонов"}: ${length} мм, ${reference==="blank-length"?"полная длина заготовки":"выступ от поверхности"}`,joint:mount.joint};
      if(reference==="blank-length"&&t.main)try{const rings=saddleRings(t.main,b);b.endMm=b.endMm-rings.cutLengthMm+length;b.blankLengthMm=length;end=b.endMm;}catch{/* addBranch reports the precise cut failure */}
      if(instrument?.threaded!==false&&[15,20,25,32,40,50].includes(dn)&&t.main)try{
        const rings=saddleRings(t.main,b),free=b.endMm-Math.max(...rings.outer.map(p=>p.reduce((s,v,i)=>s+(v-b.origin[i])*a[i],0)));
        const threadLength=instrument?.threadLengthMm??Math.min(dn===15?18:20,free-1);
        if(threadLength>2)b.thread={designation:({15:'1/2″',20:'3/4″',25:'1″',32:'1¼″',40:'1½″',50:'2″'} as Record<number,string>)[dn],pitchMm:instrument?.threadPitchMm??25.4/(dn<=20?14:11),lengthMm:threadLength,depthMm:Math.min(.9,g.wall*.45),source:"Наружная правая резьба. Условный винтовой профиль по параметрам сгона; глубина до 0,9 мм. Производственный профиль и допуски не подтверждены."};
        if(b.thread)b.source+=`; ${b.thread.designation}; ${b.thread.source}`;
      }catch{/* addBranch reports the precise cut failure */}
      addBranch(b,true);
    }else {t.pieces.push(piece(id,r.componentId??id,name,add(origin,mul(a,end)),a));t.issues.push(`${id}: длина ${length} мм задана; не подтверждены ${positive(g?.outerDiameter)?"толщина стенки":"наружный диаметр и толщина стенки"} выбранного сгона. Показан символ.`);}
    const tip=add(origin,mul(a,end));
    const plug=row(`${r.role}-plug`);if(plug){t.pieces.push(piece(`${id}-plug`,plug.componentId??`${id}-plug`,`Резьбовая заглушка · DN${dn}.${j+1}`,tip,a));
    t.issues.push(`${id}-plug: не подтверждены габариты и глубина навинчивания заглушки; показан символ`);}
  }
  return finishCollectorTemplate(t);
}

export function moveCollectorBranchX(t:CollectorTemplate,portId:string,x:number):CollectorTemplate {
  const copy=structuredClone(t),port=copy.ports.find(p=>p.id===portId);if(!port)return t;
  const dx=x-port.point[0],root=`branch-${portId}`;port.point[0]=x;
  for(const b of copy.branches)if(b.id===root)b.origin[0]+=dx;
  for(const p of copy.pieces)if(p.id===root||p.id.startsWith(root+"-"))p.position[0]+=dx;
  return finishCollectorTemplate(copy);
}
export function applyCollectorTemplate(c:Component,t:CollectorTemplate):Component {
  return {...c,collector:{template:t,hiddenPieceIds:c.collector?.hiddenPieceIds.filter(id=>id==="main"||t.branches.some(b=>b.id===id)||t.pieces.some(p=>p.id===id))??[],selectedPieceId:c.collector?.selectedPieceId,manualGeometry:c.collector?.manualGeometry,pieceOpacities:c.collector?.pieceOpacities},
    ports:t.ports,bounds:t.bounds,sourceNote:[...t.assumptions,...t.issues].join("\n"),parameters:{...c.parameters,...(t.main?{length:t.main.lengthMm,diameter:t.main.outerMm,wallThickness:(t.main.outerMm-t.main.innerMm)/2}:{})}};
}
