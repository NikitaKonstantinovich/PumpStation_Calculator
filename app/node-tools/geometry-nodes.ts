import { makeField, type NodeType } from "../engineering/schema";
import type { Step } from "../engineering/engine";
import type { ModelEntity, ProjectConfig } from "../project-config";
import type { Pump } from "../pump-catalog";
import { canUseGeometry } from "../user-types";
import type { ParameterBinding, ToolContext, Values, View } from "./schema";
export type GeometryViewData = {project:ProjectConfig;pumps:Pump[];model:ModelEntity};
export const GEOMETRY_OPERATION="ui.stationGeometry";
export function geometryNodeTypes():NodeType[] {
  return [{id:GEOMETRY_OPERATION,name:"3D-геометрия установки",description:"Строит модель только при включённой геометрии. Получает состав установки по графу, сохраняет ручную компоновку в параметр.",category:"Геометрия",operation:GEOMETRY_OPERATION,formulas:{},fields:[
    {...makeField("enabled","Расчёт геометрии","boolean","flag"),initial:false},makeField("data","Состав установки","object","stationSpecificationResult"),makeField("binding","Настройки модели","object","parameterBinding"),{...makeField("value","Интерфейс","object","view"),direction:"output"}
  ]}];
}
export function executeGeometry(step:Step,v:Values,context:ToolContext):Values|undefined {
  if(step.operation!==GEOMETRY_OPERATION)return;
  const binding=v.binding as ParameterBinding|undefined;
  const enabled=v.enabled===true && canUseGeometry(context.role);
  const data=v.data as {project?:ProjectConfig;pumps?:Pump[]}|undefined;
  const view:View={kind:"station-geometry",node:step.id,label:"3D-модель установки",enabled,binding};
  if(enabled && data?.project && Array.isArray(data.pumps))view.geometry={project:data.project,pumps:data.pumps,model:binding?.value&&typeof binding.value==="object"?binding.value as ModelEntity:{kind:"model",view:{rotation:0,zoom:1}}};
  return {value:view};
}
