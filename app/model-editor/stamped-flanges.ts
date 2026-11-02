import index from "../../data/stamped-loose-flanges.json";
import type { Assembly, Component } from "./model";
import type { InsertionPiece, InsertionShape } from "./insertion-types";

type Dims = Partial<Pick<InsertionShape,"lengthMm"|"outerMm"|"innerMm"|"boltCircleMm"|"boltHoles"|"boltHoleMm">>;
const catalog: Record<string,{previous:Dims;model:string|null}> = index.catalog;
const parts: Record<string,typeof index.parts["100"]> = index.parts;
const matches = (a:InsertionShape,b:Dims) => !a.faceDiameterMm && !a.faceHeightMm &&
  Object.entries(b).length===6 && Object.entries(b).every(([k,v])=>Math.abs((a[k as keyof Dims]??NaN)-v)<.005);
export const stampMissing = "Нет проверенного штампованного свободного фланца для выбранной посадки и сверловки. Привяжите модель нужного DN, PN и материала.";
export function stampedShape(id:string|undefined,s:InsertionShape,loose=false):InsertionShape {
  if (s.kind!=="flange") return s;
  if(s.stampedHash==="missing") return s;
  const row=catalog[id??""];
  if (!row && !loose && !s.stampedHash) return s;
  const part=row?.model ? parts[row.model] : undefined;
  if (!part || !(matches(s,part.dimensions) || matches(s,row.previous))) {
    return s.stampedHash==="missing" ? s : {...s,stampedHash:"missing"};
  }
  return s.stampedHash===part.sourceHash && matches(s,part.dimensions) ? s : {...s,...part.dimensions,stampedHash:part.sourceHash};
}
export const stampedPart = (s:InsertionShape) => s.stampedHash ? Object.values(parts).find(r=>r.sourceHash===s.stampedHash) : undefined;
export const previousStampGrip = (id:string|undefined,s:InsertionShape) => stampedPart(s) ? catalog[id??""]?.previous.lengthMm : undefined;
const isLoose=(role?:string)=>!!role && /(?:^|-)(loose|looseFlange)$/.test(role);
function adaptPiece(p:InsertionPiece, pieces:InsertionPiece[]) {
  let input=p.shape;
  if(input.stampedHash==="missing" && isLoose(p.id)) {
    // A previous "missing" may also mean that the collar would not fit.
    // Recheck its real neck and lip before reviving a formerly unbound size.
    const collarId=p.id.endsWith("-looseFlange") ? p.id.replace(/-looseFlange$/,"-collar") : p.id.replace(/-loose$/,"");
    const collar=pieces.find(other=>other.id===collarId)?.shape;
    const row=catalog[p.componentId],stock=row?.model && parts[row.model];
    if(stock && matches(input,row.previous) && collar?.kind==="collar" &&
       (collar.outerMm??Infinity)<=stock.dimensions.innerMm && (collar.lipOuterMm??0)>stock.dimensions.innerMm) {
      input={...input,stampedHash:undefined};
    }
  }
  const shape=stampedShape(p.componentId,input,isLoose(p.id));
  return shape===p.shape?p:{...p,shape};
}
/** Upgrade stock shapes without moving the assembly; callers refresh dependent fasteners. */
export function upgradeStampedFlanges(a:Assembly):Assembly {
  let changed=false;
  const components=a.components.map(c=>{
    let next:Component=c;
    if(c.shape) {
      const shape=stampedShape(c.equipmentId,c.shape,isLoose(c.line?.role));
      if(shape!==c.shape) next={...c,shape};
    }
    if(c.insertion || c.collector) {
      const original=c.insertion?.template.geometry.pieces??c.collector!.template.pieces;
      const pieces=original.map(p=>adaptPiece(p,original));
      if(pieces.some((p,i)=>p!==original[i])){
        if(c.insertion) {const t=c.insertion.template;next={...next,insertion:{...c.insertion,template:{...t,geometry:{...t.geometry,pieces}}}};}
        else {const b=c.collector!;next={...next,collector:{...b,template:{...b.template,pieces}}};}
      }
    }
    changed ||= next!==c;
    return next;
  });
  return changed?{...a,components}:a;
}
