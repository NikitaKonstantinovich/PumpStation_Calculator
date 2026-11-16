import type { SpecificationResult } from "./specification-nodes";
import type { SpecEntity,SettingsEntity,SpecSection } from "../project-config";
import { coreVisibleSpecificationItems,specificationSection } from "../specification-presentation";
import { specificationMassParts } from "../frame-calculation/specification-mass";
import { nonnegative,type Part } from "../frame-calculation/types";
import { SPECIFICATION_GROUPS } from "./specification-nodes";
import type { SpecificationExportRow } from "../specification-export";

export type ComponentMassRow={id:string;position:string;name:string;section:SpecSection;details:string;quantity:number;unit:string;unitMassKg:number|null;totalMassKg:number|null;knownMassKg:number;source:string;children:ComponentMassRow[]};
export type ComponentMassData={status:"ready"|"empty";message:string;rows:ComponentMassRow[];totalMassKg:number|null;knownMassKg:number;missingCount:number};
export function componentMassData(result:SpecificationResult|null|undefined):ComponentMassData{
 if(!result?.project)return{status:"empty",message:"Подключите результат спецификации.",rows:[],totalMassKg:null,knownMassKg:0,missingCount:0};
 const project=result.project,spec=project.entities["station-spec"] as SpecEntity;
 const items=coreVisibleSpecificationItems(spec,project.entities["station-settings"] as SettingsEntity);
 const parts=specificationMassParts({original:project,next:project,resources:result.resources,cabinetReady:true,reasons:[]},{includeFrame:true});
 function row(p:Part,position:string,section:SpecSection,details=""):ComponentMassRow{
  const children=(p.children??[]).map((c,i)=>row(c,position+"."+(i+1),section));
  const own=nonnegative(p.unitMassKg)?p.unitMassKg:null;
  const fromChildren=p.massAccounting==="children"&&children.length>0;
  const unitMassKg=fromChildren?(children.every(c=>c.totalMassKg!==null)?children.reduce((n,c)=>n+c.totalMassKg!,0):null):own;
  const totalMassKg=p.quantity===0?0:unitMassKg===null?null:unitMassKg*p.quantity;
  // For an incomplete frame show its documented stock/parts subtotal without
  // declaring it the finished frame mass or counting parent and children twice.
  const knownMassKg=totalMassKg??children.reduce((n,c)=>n+c.knownMassKg,0)*p.quantity;
  const provenance=p.massSource??p.source;
  const source=children.length?"Расчёт по составу; вложенные детали учтены один раз"+(provenance?". "+provenance:""):provenance??(p.id.startsWith("frame/")||p.role==="frame-member"?"Расчёт рамы":p.componentId?"Каталог оборудования и комплектующих":"Масса не задана");
  return{id:p.id,position,name:p.name,section,details,quantity:p.quantity,unit:p.unit??"шт.",unitMassKg,totalMassKg,knownMassKg,source,children};
 }
 const rows=parts.map((p,i)=>row(p,items[i].position,specificationSection(items[i]),items[i].details));
 const knownMassKg=rows.reduce((n,r)=>n+r.knownMassKg,0),missingCount=rows.filter(r=>r.totalMassKg===null).length;
 return{status:"ready",message:"Сухая масса состава спецификации, без рабочей жидкости. Расчётные значения и допущения указаны в источниках массы. Прочерк означает отсутствие данных; известная часть не считается полной массой.",rows,totalMassKg:missingCount?null:knownMassKg,knownMassKg,missingCount};
}
export function componentMassExportRows(data:ComponentMassData):SpecificationExportRow[]{
 const rows:SpecificationExportRow[]=[{kind:"header",cells:["№","Наименование","Кол-во","Ед.","Масса ед., кг","Масса всего, кг","Характеристики","Источник массы"]}];
 const append=(r:ComponentMassRow)=>{rows.push({kind:"item",cells:[r.position,r.name,r.quantity,r.unit,r.unitMassKg,r.totalMassKg,r.details,r.source+(r.totalMassKg===null?`; масса неполная, учтено ${r.knownMassKg.toFixed(3)} кг`:"")]});for(const c of r.children)append({...c,source:"В составе родительской позиции, повторно не суммируется. "+c.source});};
 for(const group of SPECIFICATION_GROUPS){
  rows.push({kind:"group",cells:[null,group.title,null,null,null,null,null,null]});
  for(const section of group.sections){if(section.title)rows.push({kind:"subgroup",cells:[null,section.title,null,null,null,null,null,null]});data.rows.filter(r=>r.section===section.id).forEach(append);}
 }
 rows.push({kind:"total",cells:[null,data.totalMassKg===null?"Известная часть массы":"Итоговая масса",null,null,null,data.knownMassKg,null,data.totalMassKg===null?`Позиций с неполной массой: ${data.missingCount}`:"Без рабочей жидкости"]});
 return rows;
}
