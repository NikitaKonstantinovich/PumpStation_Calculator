import type { SpecItem } from "../project-config";
import { specificationItemPresentation } from "../specification-presentation";
import type { SpecificationData } from "./specification-nodes";

export type SpecificationNoticePolicy={tankValveArticle:boolean;frameAnchorDiameters:boolean};
const anchorNote=(text:string)=>/^(?:Тип и диаметр крепления к основанию не подтверждены; показаны предварительные оси|anchor-[\w-]+: диаметр отверстия не определён)$/.test(text);
/** Only presentation is filtered. Technical evidence and unknown dimensions stay intact. */
export function nodeSpecificationPresentation(item:SpecItem,policy?:SpecificationNoticePolicy){
 if(!policy)return specificationItemPresentation(item);
 const tank=!policy.tankValveArticle&&item.equipmentId==="tank-ld-pride-dn20-drain"&&item.assemblyRole?.endsWith("/tank-valve");
 const frame=!policy.frameAnchorDiameters&&item.option==="frame";
 const notes=item.technicalNotes??[],remaining=notes.filter(n=>!(tank&&n==="Точный артикул LD Pride DN20 требует подтверждения; стоимость принята ориентировочно по аналогу."||frame&&anchorNote(n)));
 if(remaining.length===notes.length)return specificationItemPresentation(item);
 const display={...item,technicalNotes:remaining,...(tank?{description:""}:{}),
  ...(!remaining.length&&item.technicalStatus!=="error"?{technicalStatus:"ready" as const}:{})};
 return specificationItemPresentation(display);
}
export function applySpecificationNotices(data:SpecificationData,policy:SpecificationNoticePolicy):SpecificationData{
 return {...data,noticePolicy:policy,readiness:data.readiness?{...data.readiness,findings:data.readiness.findings.flatMap(f=>{
  const match=/^spec\/readiness\/item\/(\d+)$/.exec(f.id),row=match?data.items[Number(match[1])]:undefined;
  if(!row)return [f];const presentation=nodeSpecificationPresentation(row,policy),original=specificationItemPresentation(row);
  if(presentation.hasWarning===original.hasWarning&&presentation.warningText===original.warningText)return [f];
  return presentation.hasWarning?[{...f,message:row.name+": "+presentation.warningText}]:[];
 })}:undefined};
}
