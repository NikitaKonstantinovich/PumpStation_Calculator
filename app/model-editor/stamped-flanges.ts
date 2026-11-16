import index from "../../data/stamped-loose-flanges.json";
import projectFittings from "../../data/dn65-project-fittings.json";
import type { Assembly, Bounds, Component } from "./model";
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
  const {collar: stockCollar} = projectFittings;
  if(p.componentId===stockCollar.componentId && input.kind==="collar" && p.fidelity==="outline" &&
    Object.entries(stockCollar.dimensions).every(([k,v])=>input[k as keyof InsertionShape]===v)) {
    return {...p,fidelity:"cad" as const,source:stockCollar.basis,
      shape:{kind:"mesh" as const,modelHash:stockCollar.sourceHash,meshUrl:stockCollar.meshUrl,meshBounds:stockCollar.bounds as Bounds}};
  }
  if(input.stampedHash==="missing" && isLoose(p.id)) {
    // A previous "missing" may also mean that the collar would not fit.
    // Recheck its real neck and lip before reviving a formerly unbound size.
    const collarId=p.id.endsWith("-looseFlange") ? p.id.replace(/-looseFlange$/,"-collar") : p.id.replace(/-loose$/,"");
    const collar=pieces.find(other=>other.id===collarId)?.shape;
    const row=catalog[p.componentId],stock=row?.model && parts[row.model];
    const seat=collar?.kind==="collar" ? collar : collar?.modelHash===stockCollar.sourceHash ? stockCollar.dimensions : undefined;
    if(stock && matches(input,row.previous) && seat &&
       (seat.outerMm??Infinity)<=stock.dimensions.innerMm && (seat.lipOuterMm??0)>stock.dimensions.innerMm) {
      input={...input,stampedHash:undefined};
    }
  }
  const shape=stampedShape(p.componentId,input,isLoose(p.id));
  if (shape.stampedHash===projectFittings.flange.sourceHash && p.source!==projectFittings.flange.basis)
    return {...p,shape,source:projectFittings.flange.basis};
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
      const geometryChanged=pieces.some((p,i)=>p!==original[i]);
      const oldSourceNote=c.line && !c.line.manualGeometry && c.insertion?.template.source.recordId &&
        c.sourceNote?.includes(projectFittings.flange.componentId+": "+stampMissing) &&
        pieces.some(p=>p.componentId===projectFittings.flange.componentId) &&
        pieces.every(p=>p.componentId!==projectFittings.flange.componentId || p.shape.stampedHash===projectFittings.flange.sourceHash);
      if(geometryChanged || oldSourceNote){
        if(c.insertion) {
          const t=c.insertion.template, {collar,flange}=projectFittings;
          const collars=pieces.filter(p=>p.componentId===collar.componentId), flanges=pieces.filter(p=>p.componentId===flange.componentId);
          const collarReady=collars.length>0 && collars.every(p=>p.shape.modelHash===collar.sourceHash);
          const flangeReady=flanges.length>0 && flanges.every(p=>p.shape.stampedHash===flange.sourceHash);
          const relevant=(s:string)=>!(collarReady && s.startsWith(collar.componentId+": контур воротника") ||
            flangeReady && s===flange.componentId+": "+stampMissing);
          const issues=t.issues.filter(relevant), warnings=t.warnings.filter(relevant);
          if(flangeReady && !warnings.includes(flange.basis)) warnings.push(flange.basis);
          next={...next,insertion:{...c.insertion,template:{...t,issues,warnings,status:issues.length?t.status:"layout",geometry:{...t.geometry,pieces}}}};
          if(c.line) {
            const lineIssues=c.line.issues.filter(relevant);
            if(flangeReady && !lineIssues.includes(flange.basis)) lineIssues.push(flange.basis);
            next.line={...c.line,issues:lineIssues};
            if(t.source.recordId && !c.line.manualGeometry && (collarReady || flangeReady))
              next.sourceNote=[`Сохранённый расчёт ${t.source.recordId}, ревизия ${t.source.revision}`,...lineIssues].join(". ");
          }
        }
        else {const b=c.collector!;next={...next,collector:{...b,template:{...b.template,pieces}}};}
      }
    }
    changed ||= next!==c;
    return next;
  });
  return changed?{...a,components}:a;
}
