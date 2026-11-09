import { evaluatePlan, evaluateProduct } from "./runtime";
import { applyParameterWrites } from "./form-actions";
import type { Evaluation, ParameterBinding, ProductControls, ToolContext, ToolProgram, WorkspaceData } from "./schema";
export const controlInfo = {
  geometry: { label: "Расчёт геометрии", hint: "Управляет построением 3D-модели. DN, межосевые расстояния и спецификация рассчитываются независимо." },
  pressure: { label: "Проверки давления", hint: "Проверки допустимости давления насосов, арматуры и коллекторов." }
};
export function validateControls(controls: ProductControls | undefined, program: ToolProgram) {
  if (!controls) return;
  if (typeof controls!=="object" || Array.isArray(controls)) throw Error("Некорректные переключатели продукта");
  for(const [kind, ref] of Object.entries(controls)) {
    const step=program.plans[ref?.toolId]?.steps.find(s=>s.id===ref.node);
    if(!Object.hasOwn(controlInfo,kind) || !step || step.operation!=="parameter" || step.parameter?.field.kind!=="boolean" || !ref.node.startsWith(ref.toolId+"/")) throw Error("Переключатель продукта должен ссылаться на собственный логический параметр инструмента · "+kind);
  }
}
export type WorkspaceControl = {kind:keyof typeof controlInfo;binding:ParameterBinding;bindings:ParameterBinding[];toolId:string};
export function workspaceControls(program:ToolProgram, evaluate:(id:string)=>Evaluation):WorkspaceControl[] {
  return Object.entries(program.product?.controls ?? {}).map(([kind, ref])=>{
    const result=evaluate(ref.toolId), binding=result.bindings.find(b=>b.node===ref.node && b.toolId===ref.toolId);
    if(!binding)throw Error("Не найден источник переключателя · "+kind);
    return {kind:kind as keyof typeof controlInfo,binding,bindings:result.bindings,toolId:ref.toolId};
  });
}
export function writeControl(data:WorkspaceData, control:WorkspaceControl, enabled:boolean):WorkspaceData {
  const values=applyParameterWrites(Object.fromEntries(Object.entries(data.tools).map(([id,t])=>[id,t.values])),control.bindings,[{binding:control.binding,value:enabled}],control.toolId);
  return {...data,tools:Object.fromEntries(Object.entries(data.tools).map(([id,t])=>[id,values[id]===t.values?t:{...t,values:values[id]}]))};
}
/** Menu availability evaluates only guard predicates, never pump tables or geometry. */
export function toolAvailable(program:ToolProgram,id:string,contexts:Record<string,ToolContext>):boolean {
  const plan=program.plans[id];
  if(!plan)return false;
  const guards=plan.steps.filter(s=>s.id.startsWith(id+"/") && s.operation==="circuit.guard");
  for(const guard of guards) {
    const edge=guard.links.find(e=>e.input==="active"), input=guard.fields.find(f=>f.key==="active")!;
    if(!edge) { if((guard.values.active ?? input.initial)!==true)return false; continue; }
    const probe={...plan,steps:[...plan.steps.filter(s=>s.id!=="result"),{id:"result",type:"availability",name:"Доступность",fields:[{...input,key:"value"}],values:{},expressions:{},links:[{...edge,to:"result",input:"value"}]}]};
    if(evaluatePlan(probe,contexts[id],{},contexts).value!==true)return false;
  }
  return true;
}
/** One calculation per instrument for all its open windows, invalidated with contexts. */
export function productEvaluator(program:ToolProgram,contexts:Record<string,ToolContext>) {
  const results=new Map<string,Evaluation>();
  return (id:string)=>{let result=results.get(id);if(!result){result=evaluateProduct(program,id,contexts);results.set(id,result);}return result;};
}
