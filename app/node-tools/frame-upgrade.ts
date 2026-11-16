import { makeField } from "../engineering/schema";
import { addProductTool } from "./authoring";
import { boundaryType, syncInstrument } from "./visualization-tools";
import { FRAME_STAGES, frameNodeTypes } from "./frame-nodes";
import { DEFAULT_CHANNEL_RULES } from "../frame-calculation/channel-types";
import { parameterType } from "./compiler";
import type { ToolDocument } from "./schema";

/** Explicit update of the existing hidden tool; saved projects remain pinned until applied. */
export function upgradeChannelFrame(document:ToolDocument,frameId:string):ToolDocument {
 const doc=structuredClone(document),root=doc.diagrams.find(g=>g.id===doc.product?.root),tool=root?.nodes.find(n=>n.id===frameId);
 const graph=doc.diagrams.find(g=>g.id===doc.types.find(t=>t.id===tool?.type)?.instrument);
 if(!tool||!graph)throw Error("Не найден скрытый инструмент рамы");
 tool.tool={...tool.tool,workspaceVisible:false};
 const definitions=frameNodeTypes();
 for(const node of graph.nodes){
  const type=doc.types.find(t=>t.id===node.type),definition=definitions.find(t=>t.operation===type?.operation);
  if(!type||!definition)continue;
  for(const field of definition.fields)if(!type.fields.some(f=>f.key===field.key))type.fields.push(structuredClone(field));
  if(type.operation==="frame.inputs"){
   const initial=type.fields.find(f=>f.key==="rules")?.initial as Record<string,unknown>|undefined;
   const saved=node.values.rules&&typeof node.values.rules==="object"?node.values.rules as Record<string,unknown>:{};
   node.values.rules={...structuredClone(initial??{}),...saved,channel:saved.channel??structuredClone(DEFAULT_CHANNEL_RULES)};
   const boundary=graph.nodes.find(n=>n.id==="source");
   const hasContext=doc.types.find(t=>t.id===boundary?.type)?.fields.some(f=>f.key==="context");
   if(hasContext&&!graph.edges.some(e=>e.to===node.id&&e.input==="channelInputs")){
    const sourceId="channelProject",parameterId="channelInputs",typeId=graph.id+".channelInputs";
    if(graph.nodes.some(n=>[sourceId,parameterId].includes(n.id))||doc.types.some(t=>t.id===typeId))throw Error("Имена параметров швеллерной рамы уже используются");
    const field={...makeField("channelInputs","Монтажные данные швеллерной рамы","object","channelFrameInputs"),initial:structuredClone(node.values.channelInputs??{}),required:false};
    doc.types.push(parameterType(typeId,field.name,field,"all"));
    graph.nodes.push({id:sourceId,type:"data.source",name:"Исходные данные проекта",x:0,y:520,values:{source:"workspace2"}},
     {id:parameterId,type:typeId,name:field.name,x:350,y:520,values:{}});
    graph.edges.push({from:"source",out:"context",to:sourceId,input:"context"},
     {from:sourceId,out:"value",to:parameterId,input:"values"},{from:sourceId,out:"role",to:parameterId,input:"role"},
     {from:parameterId,out:"value",to:node.id,input:"channelInputs"});
   }
  }
 }
 const parameter=graph.nodes.find(n=>doc.types.find(t=>t.id===n.type)?.fields.some(f=>f.key==="value"&&f.meaning==="channelFrameInputs"));
 const specId=root?.edges.find(e=>e.from===frameId&&e.out==="value")?.to;
 const spec=root?.nodes.find(n=>n.id===specId),sg=doc.diagrams.find(g=>g.id===doc.types.find(t=>t.id===spec?.type)?.instrument);
 if(parameter&&sg&&root){
  const output=boundaryType(doc,graph,"result"),input=boundaryType(doc,sg,"source");
  if(!output.fields.some(f=>f.key==="frameBinding"))output.fields.push({...makeField("frameBinding","Настройки размещения шкафа","object","parameterBinding"),direction:"input",required:false});
  if(!input.fields.some(f=>f.key==="frameBinding"))input.fields.push({...makeField("frameBinding","Настройки размещения шкафа","object","parameterBinding"),direction:"output",required:false});
  if(!graph.edges.some(e=>e.to==="result"&&e.input==="frameBinding"))graph.edges.push({from:parameter.id,out:"binding",to:"result",input:"frameBinding"});
  for(const panel of sg.nodes.filter(n=>doc.types.find(t=>t.id===n.type)?.operation==="ui.specification")){
   const type=doc.types.find(t=>t.id===panel.type)!;
   if(!type.fields.some(f=>f.key==="frameBinding"))type.fields.push({...makeField("frameBinding","Настройки размещения шкафа","object","parameterBinding"),required:false});
   if(!sg.edges.some(e=>e.to===panel.id&&e.input==="frameBinding"))sg.edges.push({from:"source",out:"frameBinding",to:panel.id,input:"frameBinding"});
  }
  syncInstrument(doc,graph);syncInstrument(doc,sg);
  if(!root.edges.some(e=>e.to===specId&&e.input==="frameBinding"))root.edges.push({from:frameId,out:"frameBinding",to:specId!,input:"frameBinding"});
 }
 return doc;
}

/** Explicit, idempotent migration of one specification. Existing project versions stay pinned. */
export function addFrameCalculation(document: ToolDocument, specificationId: string) {
  const input = structuredClone(document);
  const root = input.diagrams.find(g => g.id === input.product?.root);
  const spec = root?.nodes.find(n => n.id === specificationId);
  const graph = input.diagrams.find(g => g.id === input.types.find(t => t.id === spec?.type)?.instrument);
  if (!root || !spec || !graph) throw Error("Не найден инструмент спецификации");
  const existing = root.edges.find(e => e.from === specificationId && e.out === "frameInput");
  if (existing) {
    const target = root.nodes.find(n => n.id === existing.to);
    const inner = input.diagrams.find(g => g.id === input.types.find(t => t.id === target?.type)?.instrument);
    if (inner?.nodes.some(n => input.types.find(t => t.id === n.type)?.operation === "frame.inputs")) return {document: upgradeChannelFrame(input,target!.id), id: target!.id, diagram: inner.id};
    throw Error("Выход расчёта рамы уже используется другим инструментом");
  }
  const finalizers = graph.nodes.filter(n => input.types.find(t => t.id === n.type)?.operation === "spec.finalize");
  if (finalizers.length !== 1) throw Error("Требуется один узел согласования спецификации");
  const incoming = graph.edges.filter(e => e.to === finalizers[0].id && e.input === "work");
  if (incoming.length !== 1) throw Error("Не найден однозначный источник состава спецификации");
  const added = addProductTool(input, "Подбор и расчёт рамы");
  const doc = added.document, nextRoot = doc.diagrams.find(g => g.id === root.id)!;
  const sg = doc.diagrams.find(g => g.id === graph.id)!, fg = doc.diagrams.find(g => g.id === added.diagram)!;
  for (const [side, key, name] of [["source", "frameResult", "Состав с рассчитанной рамой"], ["result", "frameInput", "Состав до расчёта рамы"]] as const) {
    const boundary = boundaryType(doc, sg, side);
    if (boundary.fields.some(f => f.key === key)) throw Error("Порт уже существует: " + name);
    boundary.fields.push({...makeField(key, name, "object", "stationSpecificationWork"), direction: side === "source" ? "output" : "input", required: false});
  }
  sg.edges = sg.edges.filter(e => !(e.to === finalizers[0].id && e.input === "work"));
  sg.edges.push({...incoming[0], to: "result", input: "frameInput"}, {from: "source", out: "frameResult", to: finalizers[0].id, input: "work"});
  syncInstrument(doc, sg);
  const node = nextRoot.nodes.find(n => n.id === added.id)!;
  node.tool = {...node.tool, category: "Обработка и отображение", workspaceVisible: false};
  boundaryType(doc, fg, "source").fields.push({...makeField("work", "Состав до расчёта рамы", "object", "stationSpecificationWork"), direction: "output", required: false});
  const result = boundaryType(doc, fg, "result");
  result.fields = result.fields.map(f => f.key === "value" ? {...f, meaning: "stationSpecificationWork", name: "Состав с рассчитанной рамой"} : f);
  fg.nodes = fg.nodes.filter(n => ["source", "result", "form"].includes(n.id));
  fg.edges = fg.edges.filter(e => e.from === "form" && e.to === "result");
  FRAME_STAGES.forEach(([type, name], i) => {
    const id = "stage" + i;
    fg.nodes.push({id, type, name, x: 350 + i * 360, y: 260, values: {}});
    fg.edges.push({from: i ? "stage" + (i - 1) : "source", out: i ? "value" : "work", to: id, input: "work"});
  });
  fg.edges.push({from: "stage" + (FRAME_STAGES.length - 1), out: "value", to: "result", input: "value"});
  syncInstrument(doc, fg);
  nextRoot.edges.push({from: specificationId, out: "frameInput", to: added.id, input: "work"}, {from: added.id, out: "value", to: specificationId, input: "frameResult"});
  return {document: upgradeChannelFrame(doc,added.id), id: added.id, diagram: fg.id};
}
