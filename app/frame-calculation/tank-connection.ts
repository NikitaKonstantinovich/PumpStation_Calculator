import type {StationWork} from "../station-specification";
import type {SettingsEntity, SpecEntity, SpecItem} from "../project-config";
import {componentField,componentPrice} from "./components";
import {tankValve20,TANK_VALVE_20_ID} from "../tank-connection";

/** Applied only by the new frame graph. Historical algorithms retain their own hookup. */
export function frameTankConnection(work:StationWork):StationWork {
  const settings=work.next.entities["station-settings"] as SettingsEntity;
  if(!settings.membraneTank||![50,80,100].includes(settings.membraneTankVolume??0))return work;
  const spec=work.next.entities["station-spec"] as SpecEntity,items=work.resources.components?.items??[];
  const definitions=[
    {role:"tank-diameter-transition",key:"adapter-25f-20m",name:"Переход у бака DN25 ВР → DN20 НР",description:"Бак G1 НР → переход G1 ВР / G3/4 НР → подводка DN20"},
    {role:"tank-hose",key:"hose-20mf",name:"Гибкая подводка DN20 НР–ВР",description:"Переход у бака → накидная гайка G3/4 ВР → подводка DN20 → G3/4 НР → кран DN20"},
    {role:"tank-valve",key:"valve-20ff",name:"Отсечной кран DN20 ВР–ВР",description:"Подводка DN20 → кран DN20 → сгон коллектора DN20"}
  ];
  const replace=(row:SpecItem):SpecItem=>{
    const definition=definitions.find(d=>row.assemblyRole?.endsWith(d.role)||row.hydraulicPart?.role===d.role);
    if(!definition)return row;
    // Geometry/name similarity is insufficient to authorize a PN or thread match.
    const found=items.filter(item=>{
      const v=componentField(item,"FRAME_TANK_CONNECTION") as {key?:string;verified?:boolean;source?:string}|undefined;
      return v?.key===definition.key&&v.verified===true&&!!v.source;
    });
    const item=found.length===1?found[0]:definition.key==="hose-20mf"?items.find(i=>i.id==="мембранный-бак-002-r0011"):definition.key==="valve-20ff"?items.find(i=>i.id===TANK_VALVE_20_ID)??tankValve20:undefined;
    const priceSource=componentField(item,"PRICE_SOURCE");
    return {...row,name:definition.name,details:definition.description,description:[definition.description,priceSource].filter(Boolean).join(". "),equipmentId:item?.id,price:componentPrice(item),status:"clarify",technicalStatus:"unverified",technicalNotes:[item?"Проверьте PN, выбранную длину подводки и трассу по текущей компоновке":"Нужен точный артикул с подтверждёнными резьбами, PN и длиной; цена прежнего DN25 не применяется"],sourceFingerprint:"frame-tank-connection-dn20-v1"};
  };
  return {...work,next:{...work.next,entities:{...work.next.entities,"station-spec":{...spec,items:spec.items.map(row=>{
    if(row.option!=="membraneTank"||!row.hydraulicAssembly)return replace(row);
    const parts=row.hydraulicAssembly.parts.map(replace),assembly={...row.hydraulicAssembly,parts,findings:[...row.hydraulicAssembly.findings,"Схема DN20: переход установлен непосредственно у бака; уточните артикулы и длину подводки"]};
    return {...row,hydraulicAssembly:assembly,price:assembly.accounting==="assembly"?null:row.price,technicalStatus:"incomplete" as const,technicalNotes:assembly.findings};
  })}}}};
}
