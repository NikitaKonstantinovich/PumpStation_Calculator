import type { StationWork } from "../station-specification";
import type { SpecItem, SettingsEntity, SpecEntity } from "../project-config";
import type { CollectorsEntity } from "../collector-project";
import { coreVisibleSpecificationItems } from "../specification-presentation";
import { componentField, numeric } from "./components";
import type { Part } from "./types";
import { readComponentMass } from "../component-mass";
import { installedInsertionBom } from "../calculated-insertion";
import { manufacturingMass } from "../component-mass-manufacturing";
import { unselectedConnectionMass } from "./specification-mass-estimates";
export const frameManagedOptions = new Set(["frame","cabinetStand","mountingKit","vibrationMounts"]);

/** The visible specification is the physical ledger; expand only assemblies it owns. */
export function specificationMassParts(work:StationWork,options:{includeFrame?:boolean}={}):Part[] {
  const project=work.next,settings=project.entities["station-settings"] as SettingsEntity,spec=project.entities["station-spec"] as SpecEntity;
  const database=work.resources.components?.items??[],collectors=project.entities["station-collectors"] as CollectorsEntity;
  function withMassSources(p:Part):Part {
    const mass=p.componentId?readComponentMass(database.find(c=>c.id===p.componentId),p.unit??"шт.",{description:p.name}):null;
    return {...p,...(!p.massSource&&mass?{massSource:(mass.estimated?"Расчётная масса. ":"")+mass.source}:{}),...(p.children?{children:p.children.map(withMassSources)}:{})};
  }
  const bom=(rows:Array<{name:string;role:string;componentId:string|null;quantity:number|null;unit:string;kind:string}>,parent:string):Part[]=>rows.map((r,i)=>{
    const item=database.find(c=>c.id===r.componentId);
    const mass=["welding","painting","machining"].includes(r.kind)?manufacturingMass(r.kind,r.unit,item):readComponentMass(item,r.unit);
    return {id:parent+"/"+i,role:r.role,name:r.kind==="welding"?"Наплавленный металл сварных швов":r.kind==="painting"?"Сухое покрытие":r.name,componentId:r.componentId??undefined,quantity:r.quantity??1,...(options.includeFrame?{unit:r.unit}:{}),unitMassKg:r.quantity===null?null:mass?.kg??null,unitPriceRub:null,source:mass?`${mass.estimated?"Расчётная масса. ":""}${mass.source}`:"Масса детали вложенного состава не задана"};
  });
  function part(row:SpecItem,id:string):Part {
    const calculated=options.includeFrame&&row.generatedBy==="station"?spec.frameCalculation?.parts.find(p=>p.id===row.assemblyRole):undefined;
    if(calculated)return withMassSources({...structuredClone(calculated),id,quantity:row.quantity,name:row.name,unit:row.unit});
    const item=database.find(c=>c.id===row.equipmentId),pump=work.resources.pumps?.find(p=>p.id===row.equipmentId),cabinet=work.resources.cabinets?.find(c=>c.id===row.equipmentId);
    const selectedMass=readComponentMass(item,row.unit,{description:row.details+" "+row.name})??unselectedConnectionMass(row,spec.items,database);
    const result:Part={id,role:row.assemblyRole??row.option??"component",name:row.name,quantity:row.quantity,...(options.includeFrame?{unit:row.unit}:{}),unitMassKg:pump?.weightKg??cabinet?.weightKg??selectedMass?.kg??null,unitPriceRub:row.price??null,componentId:row.equipmentId,source:selectedMass?(selectedMass.estimated?"Расчётная масса. ":"")+selectedMass.source:pump?(pump.weightEstimated?"Расчётная масса. ":"")+(pump.weightSource??"Закреплённое исполнение насоса"):cabinet?"Каталог готовых шкафов; внутренние комплектующие включены":undefined};
    if(row.hydraulicAssembly?.accounting==="assembly"){
      result.children=row.hydraulicAssembly.parts.filter(p=>p.assemblyRole!=="collector-interface").map((p,i)=>part(p,id+"/hydraulic/"+i));result.massAccounting="children";
    } else if(row.insertionAssembly){
      result.children=bom(installedInsertionBom(row.insertionAssembly),id);result.massAccounting="children";
    } else if(row.option==="suctionCollector"||row.option==="dischargeCollector"){
      const card=collectors[row.option==="suctionCollector"?"suction":"discharge"];
      if(card.calculation&&card.status!=="stale"){result.children=bom(card.calculation.bom,id);result.massAccounting="children";}
    }
    // Hydraulic nodes may explicitly flag a nonphysical accounting interface.
    if(row.assemblyRole?.endsWith("collector-interface"))result.unitMassKg=0;
    const declared=numeric(componentField(item,"Масса сборки, кг"));
    if(declared!==null&&declared>=0){result.unitMassKg=declared;result.massAccounting="self";}
    return result;
  }
  return coreVisibleSpecificationItems(spec,settings).filter(r=>options.includeFrame||!r.assemblyRole?.startsWith("frame/")&&!(frameManagedOptions.has(r.option??"")&&r.generatedBy==="station")&&r.option!=="frame").map((r,i)=>part(r,`station/${i}/${r.equipmentId??r.position}`));
}
