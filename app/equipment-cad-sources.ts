import valves from "../data/line-valve-registry.json";
import insertions from "../data/insertion-model-bindings.json";
import dimensions from "../data/component-cad-dimensions.json";
import gaskets from "../data/line-gasket-models.json";
import vibrations from "../data/vibration-dimensions.json";
import instruments from "../data/instrument-mounts.json";
import controls from "../data/valve-control-mounts.json";
import tanks from "../data/tank-models.json";
import nativeParts from "../data/solidworks-parts.json";
import nativeGaskets from "../data/solidworks-gaskets.json";
import stamped from "../data/stamped-loose-flanges.json";
import projectFittings from "../data/dn65-project-fittings.json";
import collars from "../data/collar-dimensions.json";
import reducers from "../data/st20-concentric-reducers.json";
import audited from "../data/equipment-cad-bindings.json";
import {INSTRUMENT_SIDE_FITTINGS} from "./instrument-connection";
import {TANK_VALVE_20_ID} from "./tank-connection";
import {cadSource,type EquipmentCadModel,type EquipmentRow} from "./equipment-admin";

// Reuse the exact catalogue identities used by the 3D assemblies. A similarly
// named file in the unbound CAD library is not proof that it belongs to a row.
const models=new Map<string,EquipmentCadModel[]>();
const auditedModels=new Map(audited.bindings.map(binding=>[binding.key,binding]));
function add(key:string,path:string,hash?:string,note?:string) {
  if(!cadSource(path))return;
  const list=models.get(key)??[];
  if(!list.some(model=>model.path===path))list.push({path,hash,note});
  models.set(key,list);
}
for(const part of Object.values(projectFittings))add(`equipment:${part.componentId}`,part.source,part.sourceHash,part.basis);
for(const model of valves.models)add(model.key,model.source,model.sourceHash,model.warnings.join(" "));
for(const model of insertions.rows)if("componentId" in model && model.componentId)add(`equipment:${model.componentId}`,model.source,model.hash);
for(const model of dimensions.rows)add(`equipment:${model.componentId}`,model.modelPath,model.modelSha256,model.method);
for(const model of gaskets.rows)add(`equipment:${model.componentId}`,model.source,model.sourceHash,`Исполнение ${model.execution}, DN${model.dn}, PN${model.modelPn}.`);
for(const row of vibrations.rows)for(const execution of row.executions){
  if("cad" in execution && execution.cad)add(`equipment:${row.componentId}`,execution.cad.source,execution.cad.sourceHash,`DN${row.dn}, PN${execution.pn}. ${execution.reason}`);
}
const asset=(id:string,model:{source:string;sourceHash:string},note?:string)=>add(`equipment:${id}`,model.source,model.sourceHash,note);
for(const [id,binding] of Object.entries(stamped.catalog)){
  const part=binding.model?(stamped.parts as Record<string,{source:string;sourceHash:string;name:string}>)[binding.model]:undefined;
  if(part)asset(id,part,part.name);
}
for(const part of nativeParts)if("equipmentId" in part&&part.equipmentId && !(part.equipmentId in stamped.catalog))asset(part.equipmentId,part,"Проверенный исходник из реестра экспорта SolidWorks.");
for(const part of nativeGaskets)asset(part.equipmentId,part,`Исполнение А, DN${part.dn}, PN${part.modelPn}.`);
for(const part of collars.cadRows){
  add(`equipment:${part.componentId}`,part.nativePath,part.nativeSha256,`Исходная модель воротника; толщина борта в CAD ${part.a} мм. Принятые расчётные размеры приведены в характеристиках позиции.`);
  add(`equipment:${part.componentId}`,part.modelPath,part.modelSha256,"STEP-копия исходной модели воротника.");
}
for(const part of reducers.rows)if(part.geometryDonorId){
  for(const source of models.get(`equipment:${part.geometryDonorId}`)??[])add(`equipment:${part.id}`,source.path,source.hash,"Геометрический аналог AISI304, принятый для концентрического перехода Ст20; материал позиции сохранён в каталоге.");
}
asset("шаровые-краны-002-r0203",instruments.assets.valve);
asset(INSTRUMENT_SIDE_FITTINGS.adapter,instruments.assets.adapter);
asset(INSTRUMENT_SIDE_FITTINGS.bush,instruments.assets.bush);
for(const id of ["кипиа-001-r0005","кипиа-001-r0006","кипиа-001-r0007","кипиа-001-r0008"])asset(id,instruments.assets.gauge,"Компоновочная модель ТМ-510Р; диапазон измерения определяется записью каталога.");
for(const id of ["кипиа-002-r0013","кипиа-002-r0014","кипиа-002-r0015","кипиа-002-r0016"])asset(id,instruments.assets.relay);
for(const id of ["station-v11-oni-ppt10-16","station-v11-oni-ppt10-25"])asset(id,instruments.assets.transducer,"Геометрия корпуса преобразователя; диапазон давления определяется записью каталога.");
asset("кипиа-004-r0028",controls.switch);
for(const mount of controls.rows)asset(mount.dn<=80?"кронштейны-001-r0005":"кронштейны-001-r0006",mount.bracket);
asset(TANK_VALVE_20_ID,tanks.assets.valve20);
asset("мембранный-бак-001-r0005",tanks.assets.tank50);
asset("мембранный-бак-001-r0006",tanks.assets.tank80);
asset("мембранный-бак-001-r0007",tanks.assets.tank100);

function hardwareModels(row:EquipmentRow):EquipmentCadModel[] {
  if(row.values.catalogId!=="метизы" || /нерж|aisi|[аa][24]/i.test(row.name) || !/\sЦ\s/.test(row.name))return [];
  const kinds={"Болт":"bolt","Шпилька":"stud","Гайка":"nut","Шайба":"washer"} as const;
  const kind=kinds[row.name.split(" ")[0] as keyof typeof kinds];
  if(!kind || kind==="bolt"&&!/DIN\s*933\b/i.test(row.name) || kind==="nut"&&!/DIN\s*934\b/i.test(row.name) || kind==="washer"&&!/DIN\s*125\b/i.test(row.name))return [];
  const fields=Array.isArray(row.values.fields)?row.values.fields as Array<{headerPath?:string[];value?:unknown}>:[];
  const field=(label:string)=>fields.find(f=>f.headerPath?.at(-1)===label)?.value;
  const diameter=field("Диаметр резьбы, мм"),length=field("Длина шпильки, мм")??field("Длина болта, мм");
  if(typeof diameter!=="number" || (kind==="bolt"||kind==="stud")&&typeof length!=="number")return [];
  const named=(kind==="bolt"||kind==="stud")?row.name.match(/^(?:Болт|Шпилька)\s+[МM]?(\d+)\s*[xх×]\s*(\d+)\b/i):row.name.match(/^(?:Гайка\s+[МM]|Шайба плоская\s+)(\d+)\b/i);
  if(!named||Number(named[1])!==diameter||named[2]&&Number(named[2])!==length)return [];
  return nativeParts.flatMap(part=>{
    if(!("hardware" in part)||part.hardware!==kind||part.nominalMm!==diameter)return [];
    if((kind==="bolt"||kind==="stud")&&part.dimensions?.lengthMm!==length)return [];
    const width=field("Ширина, мм");
    const difference=(kind==="nut"||kind==="washer")&&typeof width==="number"&&Math.abs(width-part.dimensions.lengthMm)>.035?` Толщина в исходном CAD ${part.dimensions.lengthMm} мм, в каталоге ${width} мм; размеры требуют проверки.`:"";
    return [{path:part.source,hash:part.sourceHash,configuration:part.configuration,note:`В SolidWorks выберите конфигурацию «${part.configuration}». Размеры: M${diameter}${kind==="bolt"||kind==="stud"?` × ${length} мм`:""}; материал и класс прочности — по каталогу.${difference}`}];
  });
}

export function withEquipmentCadSources(row:EquipmentRow):EquipmentRow {
  const binding=auditedModels.get(row.key);
  const verified=binding&&binding.name===row.name&&(binding.manufacturer??null)===(row.values.manufacturer??null)?binding.models:[];
  const cadModels:EquipmentCadModel[]=[...(models.get(row.key)??[]),...hardwareModels(row),...verified];
  if(!cadModels?.length)return row;
  return {...row,cadModels,values:{...row.values,"Исходные CAD-модели":cadModels.map(model=>({"Файл":model.path,"SHA-256":model.hash,"Конфигурация SolidWorks":model.configuration??null,"Примечание":model.note??null}))}};
}
