import { buildHydraulicOptions } from "./hydraulic-option-assembly";
import { acceptInstrumentFitting } from "./instrument-connection";
import { dischargeInstrumentPressure } from "./instrument-pressure";
import { selectDischargeInstruments } from "./suction-instruments";
import { price } from "./line-spec-parts";
import { normalizeSpecificationItems } from "./specification-items";
import { withoutPressureChecks } from "./pressure-check-policy";
import type { ProjectConfig, SpecEntity, SpecItem } from "./project-config";

const transducerRow=(row:SpecItem)=>row.generatedBy==="hydraulic-options"&&
  (row.assemblyRole==="discharge:transducer"||row.hydraulicPart?.location==="discharge:transducer");
const partRole=(row:SpecItem)=>row.hydraulicPart?.role??(row.assemblyRole==="discharge:transducer"?"product":row.assemblyRole);

/** Repair only the already-generated KIP in an opened station snapshot. Keep
 * collector/insertion calculations, other purchased prices and manual rows.
 * Historical revisions remain immutable in storage. */
export function repairSavedInstrumentSpecification(project:ProjectConfig,resources:Parameters<typeof buildHydraulicOptions>[1]):ProjectConfig {
  const spec=project.entities["station-spec"] as SpecEntity;
  if(!resources.pumps?.length)return project;
  const old=spec.items.filter(transducerRow),main=old.find(row=>row.assemblyRole==="discharge:transducer");
  let replacement:SpecItem[]=[];
  if(main){
    replacement=buildHydraulicOptions(project,resources).filter(transducerRow).map((fresh,index)=>{
      const role=partRole(fresh),previous=old.find(row=>partRole(row)===role);
      const recipe=main.hydraulicAssembly?.parts.find(row=>row.assemblyRole===role);
      const knownPrice=previous?.price??recipe?.price;
      return {...fresh,position:previous?.position??`${main.position}.${String(index).padStart(2,"0")}`,
        ...(role!=="product"&&typeof knownPrice==="number"?{price:knownPrice}:{})};
    });
    const nextMain=replacement.find(row=>row.assemblyRole==="discharge:transducer");
    if(nextMain?.hydraulicAssembly){
      const assembly=nextMain.hydraulicAssembly;
      nextMain.hydraulicAssembly={...assembly,parts:assembly.parts.map(part=>{
        const row=replacement.find(row=>partRole(row)===part.assemblyRole);
        return row?{...part,price:row.price}:part;
      })};
    }
  }
  let inserted=false;
  const items=spec.items.flatMap(row=>{
    if(replacement.length&&transducerRow(row)){
      if(inserted)return [];
      inserted=true;return replacement;
    }
    const relay=row.generatedBy==="discharge-line"&&row.assemblyRole?.match(/^(primary|secondary)-sensor-relay$/);
    if(relay){
      const rating=dischargeInstrumentPressure(project,resources.pumps,relay[1] as "primary"|"secondary");
      const selected=selectDischargeInstruments(resources.items,rating.headM,rating).find(part=>part.role==="pressure-switch");
      if(selected?.item)return [{...withoutPressureChecks(row),equipmentId:selected.item.id,price:price(selected.item),details:selected.details,
        description:selected.description,status:"selected" as const,technicalStatus:"ready" as const,technicalNotes:[]}];
    }
    return [acceptInstrumentFitting(row)];
  });
  const normalized=replacement.length===old.length?items:normalizeSpecificationItems(items);
  return JSON.stringify(normalized)===JSON.stringify(spec.items)?project:
    {...project,entities:{...project.entities,"station-spec":{...spec,items:normalized}}};
}
