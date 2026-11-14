import { FRAME_LENGTHS } from "./catalog";
import { positive, STAND_HALF_LENGTH_MM, type Bounds, type Hole, type Layout, type PumpInput, type Rules, type TankInput, type Placement } from "./types";
const moveBounds=(b:Bounds,x:number,y=0):Bounds=>({minX:b.minX+x,maxX:b.maxX+x,minY:b.minY+y,maxY:b.maxY+y});
const translated=(holes:Hole[],id:string,x:number):Hole[]=>holes.map((h,i)=>({...h,id:`${id}/hole-${i}`,owner:id,x:h.x+x}));
const distance=(a:Hole,b:Hole)=>Math.hypot(a.x-b.x,a.y-b.y);
export function holesOverlap(a:Hole,b:Hole,webMm=3){return distance(a,b)<(a.clearanceMm??a.diameterMm??0)/2+(b.clearanceMm??b.diameterMm??0)/2+webMm;}
function standFits(x:number,l:Layout,r:Rules,offset=0,second=true):boolean {
 const holes=l.holes.filter(h=>h.owner.startsWith("pump-"));
 const after=l.pumps.filter(p=>x>Math.max(...holes.filter(h=>h.owner===p.id).map(h=>h.x+offset))).length;
 return (!second||after>=1&&after<=2)&&holes.every(h=>Math.abs(x-h.x-offset)+1e-6>=r.minStandGap)
  &&[...l.pumps,...(l.tank?[l.tank]:[])].every(p=>!p.bounds||x+STAND_HALF_LENGTH_MM<=p.bounds.minX+offset+1e-6||x-STAND_HALF_LENGTH_MM>=p.bounds.maxX+offset-1e-6);
}
function secondStand(l:Layout,r:Rules,target:number):number|undefined {
 const holes=l.holes.filter(h=>h.owner.startsWith("pump-")),bodies=[...l.pumps,...(l.tank?[l.tank]:[])].flatMap(p=>p.bounds?[p.bounds]:[]);
 const candidates=[target,...holes.flatMap(h=>[h.x-r.minStandGap,h.x+r.minStandGap]),...bodies.flatMap(b=>[b.minX-STAND_HALF_LENGTH_MM,b.maxX+STAND_HALF_LENGTH_MM])]
  .filter(x=>x>r.firstStandX+2*STAND_HALF_LENGTH_MM&&x<=target).sort((a,b)=>b-a);
 return candidates.find(x=>standFits(x,l,r));
}
function shiftStation(l:Layout,offset:number){
 for(const p of [...l.pumps,...(l.tank?[l.tank]:[])]){p.x+=offset;if(p.bounds)p.bounds=moveBounds(p.bounds,offset);}
 l.holes=l.holes.map(h=>({...h,x:h.x+offset}));l.stationOffsetMm=offset;
}
export function layoutFrame(pumps:PumpInput[],cabinetWidth:number|null,tank:TankInput|null,r:Rules):Layout {
 const result:Layout={lengthMm:null,pumps:[],stands:[],standDistanceMm:null,profiles:false,holes:[],issues:[]};
 const fail=(code:string,message:string)=>result.issues.push({code,message,blocking:true});
 if(!pumps.length){fail("pumps","Не выбраны насосы для рамы");return result;}
 for(const p of pumps){
  if(!Number.isInteger(p.count)||p.count<1||p.count>20)fail("pump-count",`${p.name}: некорректное количество`);
  if(!p.mounting||!p.mounting.holes.length||!p.mounting.source)fail("mounting",`${p.name}: нужны подтверждённые монтажные отверстия и габариты`);
  if(p.count>1&&!positive(p.spacingMm))fail("spacing",`${p.name}: отсутствует межосевое расстояние`);
 }
 if(result.issues.length)return result;
 for(const p of pumps)if(!p.mounting!.verified)fail("mounting-unverified",`${p.name}: компоновка предварительная — привязка монтажной сетки и корпуса не подтверждена`);
 let previous:Placement|undefined,previousStep=0;
 for(const p of pumps)for(let i=0;i<p.count;i++){
  const m=p.mounting!,id=`pump-${p.circuit}-${i}`;
  const x=previous?previous.x+Math.max(previousStep,p.spacingMm??0):r.firstStandX+r.firstPumpGap-Math.min(...m.holes.map(h=>h.x));
  const placed:Placement={id,kind:"pump",x,y:0,bounds:moveBounds(m.bounds,x),...(m.cad?{cad:m.cad,equipmentId:p.id}:{})};
  if(previous?.bounds&&placed.bounds!.minX<previous.bounds.maxX)fail("pump-collision",`Пересечение насосов ${previous.id} и ${id}; проверьте межосевой шаг`);
  const holes=translated(m.holes,id,x);
  if(holes.some(h=>Math.abs(h.y)+(h.diameterMm??0)/2>=r.widthMm/2))fail("pump-width",`${p.name}: крепёж выходит за основание 410 мм`);
  result.pumps.push(placed);result.holes.push(...holes);previous=placed;previousStep=p.spacingMm??0;
 }
 let needed=Math.max(...result.pumps.map(p=>p.bounds!.maxX))+r.endMarginMm;
 if(tank&&[50,80,100].includes(tank.volumeL)){
  const m=tank.mounting;
  if(!m?.verified||m.holes.length!==3){fail("tank-mounting","Нужны три подтверждённых отверстия и габариты бака");return result;}
  if(m.holes.some(h=>Math.abs(h.y)+(h.diameterMm??0)/2>=r.widthMm/2)){
   fail("tank-width","Крепёж бака выходит за основание 410 мм; нужна отдельная площадка или другая рама");return result;
  }
  const min=Math.min(...m.holes.map(h=>h.x)),max=Math.max(...m.holes.map(h=>h.x));
  if(m.holes.filter(h=>Math.abs(h.x-max)<0.1).length!==2){fail("tank-orientation","Две ножки бака должны быть обращены к концу рамы");return result;}
  const pumpEnd=Math.max(...result.holes.map(h=>h.x));
  let x=pumpEnd+r.tankFootGapMm-min;
  const lastBody=Math.max(...result.pumps.map(p=>p.bounds!.maxX));
  x+=Math.max(0,Math.ceil((lastBody+r.tankBodyGapMm-(x+m.bounds.minX))/r.tankStepMm))*r.tankStepMm;
  result.tank={id:"tank",kind:"tank",x,y:0,bounds:moveBounds(m.bounds,x)};
  result.holes.push(...translated(m.holes,"tank",x));
  needed=Math.max(needed,x+max+50,x+m.bounds.maxX+r.endMarginMm);
 }
 if(cabinetWidth!==600&&cabinetWidth!==800){fail("cabinet-width","Подтвердите ширину шкафа: поддерживаются 600 и 800 мм");return result;}
 // Native 1800 mm stands offset each cabinet hole by 4 mm from its base row.
 // A 758 mm cabinet pitch therefore requires 766 mm between the base rows.
 const optimal=cabinetWidth===800?766:560,target=r.firstStandX+optimal;
 // Choose the blank for the station first. Cabinet mounting then uses its
 // spare length; it must not silently select a larger frame to fit the cabinet.
 const bodies=[...result.pumps.map(p=>p.bounds!),...(result.tank?.bounds?[result.tank.bounds]:[])];
 const min=Math.min(...bodies.map(b=>b.minX)),max=Math.max(...bodies.map(b=>b.maxX));
 const stationNeeded=needed;
 needed=Math.max(needed,max-min+2*r.endMarginMm);
 result.lengthMm=FRAME_LENGTHS.find(length=>length>=needed)??null;
 if(!result.lengthMm){fail("frame-length","Требуется другой тип рамы: компоновка длиннее 2000 мм");return result;}
 const available=result.lengthMm-stationNeeded;
 const mountRows=result.holes.filter(h=>h.owner.startsWith("pump-"));
 // Feasibility changes only at body edges or mounting clearances. Evaluate
 // those exact boundaries rather than scanning mm by mm on each graph update.
 const offsets=[0,available,...[r.firstStandX,target].flatMap(x=>[
  ...bodies.flatMap(b=>[x+STAND_HALF_LENGTH_MM-b.minX,x-STAND_HALF_LENGTH_MM-b.maxX]),
  ...mountRows.flatMap(h=>[x-h.x-r.minStandGap,x-h.x+r.minStandGap])])]
  .filter(d=>d>=Math.max(0,-min)&&d<=available+1e-6).sort((a,b)=>a-b);
 const offset=target+STAND_HALF_LENGTH_MM<=result.lengthMm
  ?offsets.find(d=>standFits(r.firstStandX,result,r,d,false)&&standFits(target,result,r,d)):undefined;
 let stand2:number|undefined;
 if(offset!==undefined){shiftStation(result,offset);stand2=target;result.stationAlignment="cabinet";}
 else {
  // Center the complete pump/tank envelope, keeping every inter-part distance.
  shiftStation(result,(result.lengthMm-min-max)/2);result.stationAlignment="centered";
  stand2=secondStand(result,r,Math.min(target,result.lengthMm-STAND_HALF_LENGTH_MM));
 }
 if(r.firstStandX<STAND_HALF_LENGTH_MM||!standFits(r.firstStandX,result,r,0,false)||stand2===undefined){fail("stand-placement",`На выбранной раме нет места для стоек с опорной лапой ${STAND_HALF_LENGTH_MM*2} мм и зазором между осями креплений ≥${r.minStandGap} мм. Насосная установка центрирована; требуется согласовать размещение шкафа.`);return result;}
 if(Math.abs(r.standPitchMm-350)>.001){fail("stand-pitch","Поперечный шаг выбранных стоек 1500 мм составляет 350 мм; монтажные отверстия рамы не совпадают с CAD стоек.");return result;}
 result.standDistanceMm=stand2-r.firstStandX;result.profiles=Math.abs(result.standDistanceMm-optimal)>0.1;
 result.stands=[r.firstStandX,stand2].map((x,i)=>({id:`stand-${i+1}`,kind:"stand",x,y:0}));
 for(const s of result.stands)for(const y of [-r.standPitchMm/2,r.standPitchMm/2])result.holes.push({id:`${s.id}/${y}`,owner:s.id,x:s.x,y,diameterMm:9});
 return result;
}
/** Four corner regions, moved inwards only; no hard-coded overlap with the first stand. */
export function eyeletHoles(layout:Layout,r:Rules,diameterMm:number,baseDiameterMm:number):Hole[]|null {
 if(!layout.lengthMm||!positive(diameterMm)||!positive(baseDiameterMm))return null;
 const found:Hole[]=[];
 for(const end of [0,1])for(const side of [-1,1]){
  let selected:Hole|undefined;
  for(let offset=r.eyeletMarginMm;offset<layout.lengthMm/2;offset+=10){
   const h:Hole={id:`eyelet-${end}-${side}`,owner:"eyelets",x:end?layout.lengthMm-offset:offset,y:side*(r.widthMm/2-r.eyeletMarginMm),diameterMm,clearanceMm:baseDiameterMm};
   if(Math.abs(h.y)+baseDiameterMm/2>r.widthMm/2||h.x<baseDiameterMm/2||layout.lengthMm-h.x<baseDiameterMm/2)continue;
   if([...layout.holes,...found].every(other=>!holesOverlap(h,other))&&!layout.pumps.some(p=>p.bounds&&h.x+baseDiameterMm/2>p.bounds.minX&&h.x-baseDiameterMm/2<p.bounds.maxX&&h.y+baseDiameterMm/2>p.bounds.minY&&h.y-baseDiameterMm/2<p.bounds.maxY)){selected=h;break;}
  }
  if(!selected)return null;found.push(selected);
 }
 return found;
}
export function supportHoles(layout:Layout,r:Rules,count:number,diameterMm:number):Hole[]|null {
 if(!layout.lengthMm||![4,6,8].includes(count)||!positive(diameterMm))return null;
 const found:Hole[]=[],rows=count/2;
 for(let i=0;i<rows;i++)for(const side of [-1,1]){
  const target=30+i*(layout.lengthMm-60)/(rows-1);
  let selected:Hole|undefined;
  for(const delta of [0,10,-10,20,-20,30,-30,40,-40,50,-50]){
   const h:Hole={id:`support-${i}-${side}`,owner:"supports",x:target+delta,y:side*(r.widthMm/2-30),diameterMm,clearanceMm:diameterMm*2.5};
   if(h.x<30||h.x>layout.lengthMm-30)continue;
   if([...layout.holes,...found].every(other=>!holesOverlap(h,other))){selected=h;break;}
  }
  if(!selected)return null;found.push(selected);
 }
 return found;
}
