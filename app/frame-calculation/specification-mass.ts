import type { StationWork } from "../station-specification";
import type { SpecItem, SettingsEntity, SpecEntity } from "../project-config";
import type { CollectorsEntity } from "../collector-project";
import { coreVisibleSpecificationItems } from "../specification-presentation";
import { componentMass, componentField, numeric } from "./components";
import type { Part } from "./types";
export const frameManagedOptions = new Set(["frame","cabinetStand","mountingKit","vibrationMounts"]);

/** The visible specification is the physical ledger; expand only assemblies it owns. */
export function specificationMassParts(work:StationWork):Part[] {
  const project=work.next,settings=project.entities["station-settings"] as SettingsEntity,spec=project.entities["station-spec"] as SpecEntity;
  const database=work.resources.components?.items??[],collectors=project.entities["station-collectors"] as CollectorsEntity;
  const bom=(rows:Array<{name:string;role:string;componentId:string|null;quantity:number|null;unit:string;kind:string}>,parent:string):Part[]=>rows.filter(r=>!["welding","painting","machining"].includes(r.kind)).map((r,i)=>({id:parent+"/"+i,role:r.role,name:r.name,componentId:r.componentId??undefined,quantity:r.quantity??1,unitMassKg:r.quantity===null?null:componentMass(database.find(c=>c.id===r.componentId),r.unit),unitPriceRub:null,source:"Вложенный состав: "+parent}));
  function part(row:SpecItem,id:string):Part {
    const item=database.find(c=>c.id===row.equipmentId),pump=work.resources.pumps?.find(p=>p.id===row.equipmentId),cabinet=work.resources.cabinets?.find(c=>c.id===row.equipmentId);
    const result:Part={id,role:row.assemblyRole??row.option??"component",name:row.name,quantity:row.quantity,unitMassKg:pump?.weightKg??cabinet?.weightKg??(item?.catalogId==="работы"?0:componentMass(item,row.unit)),unitPriceRub:row.price??null,componentId:row.equipmentId,source:item?"Каталог: "+item.id:pump?"Закреплённое исполнение насоса":undefined};
    if(row.hydraulicAssembly?.accounting==="assembly"){
      result.children=row.hydraulicAssembly.parts.filter(p=>p.assemblyRole!=="collector-interface").map((p,i)=>part(p,id+"/hydraulic/"+i));result.massAccounting="children";
    } else if(row.insertionAssembly){
      result.children=bom(row.insertionAssembly.snapshot.calculation.bom,id);result.massAccounting="children";
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
  return coreVisibleSpecificationItems(spec,settings).filter(r=>!r.assemblyRole?.startsWith("frame/")&&!(frameManagedOptions.has(r.option??"")&&r.generatedBy==="station")&&r.option!=="frame").map((r,i)=>part(r,`station/${i}/${r.equipmentId??r.position}`));
}
