import { parameterType } from "./compiler";
import { deriveTools } from "./product";
import { makeField } from "../engineering/schema";
import type { ToolDocument } from "./schema";
import { addProductTool } from "./authoring";
import { boundaryType, syncInstrument } from "./visualization-tools";
import { GEOMETRY_OPERATION } from "./geometry-nodes";

/** Explicit, idempotent edit of the selected product; never invoked on load. */
export function connectWorkspaceControls(doc: ToolDocument, settingsId: string) {
  if (!doc.product) throw Error("Нужен корневой граф продукта");
  const tool=deriveTools(doc).find(t=>t.id===settingsId), graph=doc.diagrams.find(g=>g.id===tool?.diagram);
  if(!graph)throw Error("Не найден инструмент исходных данных");
  const outputEdge=graph.edges.find(e=>e.to==="result"&&e.input==="value"), outputNode=graph.nodes.find(n=>n.id===outputEdge?.from);
  const record=doc.types.find(t=>t.id===outputNode?.type);
  if(record?.operation!=="object" || !outputEdge)throw Error("Выход настроек должен быть явно собранной записью");
  const example=graph.nodes.find(n=>doc.types.find(t=>t.id===n.type)?.parameter?.key==="stationType");
  if(!example)throw Error("Не найден источник параметров настроек");
  let changed=0;
  for(const [kind,key,name,initial] of [["geometry","geometryEnabled","Расчёт геометрии",false],["pressure","pressureChecksEnabled","Проверки давления",true]] as const) {
    let node=graph.nodes.find(n=>doc.types.find(t=>t.id===n.type)?.parameter?.key===key);
    if(!node) {
      if(graph.nodes.some(n=>n.id===key))throw Error("Занят ID переключателя · "+key);
      const id=graph.id+".control."+key;
      if(doc.types.some(t=>t.id===id))throw Error("Занят ID определения переключателя");
      const field={...makeField(key,name,"boolean","flag"),initial};
      const type=parameterType(id,name,field,"all");type.parameter!.source={mode:"user"};doc.types.push(type);
      node={id:key,type:id,name,x:350,y:4900+changed*220,values:{}};graph.nodes.push(node);
      graph.edges.push(...graph.edges.filter(e=>e.to===example.id&&["values","defaults","role"].includes(e.input)).map(e=>({...e,to:key})));
      changed++;
    }
    if(!record.fields.some(f=>f.key===key))record.fields.push(makeField(key,name,"boolean","flag","","input"));
    const out=record.fields.find(f=>f.key===outputEdge.out);
    if(out?.shape&&!out.shape.some(f=>f.key===key))out.shape.push(makeField(key,name,"boolean","flag"));
    if(!graph.edges.some(e=>e.to===outputNode!.id&&e.input===key))graph.edges.push({from:node.id,out:"value",to:outputNode!.id,input:key});
    doc.product.controls={...doc.product.controls,[kind]:{toolId:settingsId,node:settingsId+"/"+node.id}};
  }
  return changed;
}

/** Reuse the original 3D tool with inputs supplied by the product graph. */
export function addProductGeometry(document:ToolDocument,settingsId:string,specificationId:string):ToolDocument {
  const root=document.diagrams.find(g=>g.id===document.product?.root)!;
  if(deriveTools(document).some(t=>document.diagrams.find(g=>g.id===t.diagram)?.nodes.some(n=>document.types.find(type=>type.id===n.type)?.operation===GEOMETRY_OPERATION)))return document;
  const port=(id:string,meaning:string)=>{
    const node=root.nodes.find(n=>n.id===id),type=document.types.find(t=>t.id===node?.type);
    const output=type?.fields.find(f=>f.direction==="output"&&f.meaning===meaning);
    if(!output)throw Error("Не найден выход для геометрии · "+meaning);
    return output.key;
  };
  const settingsPort=port(settingsId,"record"),specPort=port(specificationId,"stationSpecificationResult");
  const added=addProductTool(document,"3D-модель установки"),doc=added.document,graph=doc.diagrams.find(g=>g.id===added.diagram)!,product=doc.diagrams.find(g=>g.id===doc.product!.root)!;
  const settingsField=makeField("settings","Настройки проекта","object","record"),dataField=makeField("data","Состав установки","object","stationSpecificationResult");
  boundaryType(doc,graph,"source").fields.push({...settingsField,direction:"output"},{...dataField,direction:"output"});
  const model=parameterType(graph.id+".model","Настройки 3D-модели",{...makeField("modelState","Настройки 3D-модели","object","modelState"),initial:null},"all");model.parameter!.source={mode:"user"};
  const flag={id:graph.id+".enabled",name:"Геометрия включена",category:"Геометрия",description:"Переключатель настроек проекта",fields:[settingsField,{...makeField("value","Включена","boolean","flag"),direction:"output" as const}],formulas:{value:'get(settings,"geometryEnabled") == true'}};
  doc.types.push(model,flag);
  graph.nodes.push({id:"modelState",type:model.id,name:model.name,x:350,y:300,values:{}},{id:"geometryEnabled",type:flag.id,name:flag.name,x:350,y:0,values:{}},{id:"geometry",type:GEOMETRY_OPERATION,name:"3D-модель установки",x:700,y:0,values:{}});
  graph.edges.push({from:"project",out:"value",to:"modelState",input:"values"},{from:"project",out:"role",to:"modelState",input:"role"},{from:"source",out:"settings",to:"geometryEnabled",input:"settings"},{from:"geometryEnabled",out:"value",to:"geometry",input:"enabled"},{from:"source",out:"data",to:"geometry",input:"data"},{from:"modelState",out:"binding",to:"geometry",input:"binding",kind:"binding"},{from:"geometry",out:"value",to:"form",input:"child0"});
  syncInstrument(doc,graph);
  product.edges.push({from:settingsId,out:settingsPort,to:added.id,input:"settings"},{from:specificationId,out:specPort,to:added.id,input:"data"});
  product.nodes.find(n=>n.id===added.id)!.tool!.category="Обработка и отображение";
  return doc;
}
