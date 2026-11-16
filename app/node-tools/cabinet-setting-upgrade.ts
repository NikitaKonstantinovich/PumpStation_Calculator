import { makeField } from "../engineering/schema";
import { parameterType } from "./compiler";
import { deriveTools } from "./product";
import type { ToolDocument, ToolProgram, ToolContext } from "./schema";

/** Explicit edit for an existing published product; immutable snapshots stay intact. */
export function addCabinetProjectSetting(document:ToolDocument,settingsId:string):ToolDocument {
 const doc=structuredClone(document),tool=deriveTools(doc).find(t=>t.id===settingsId);
 const graph=doc.diagrams.find(g=>g.id===tool?.diagram);
 if(!graph)throw Error("Не найден инструмент настроек проекта");
 if(graph.nodes.some(n=>doc.types.find(t=>t.id===n.type)?.parameter?.key==="cabinetSeparate"))return doc;
 const tank=graph.nodes.find(n=>doc.types.find(t=>t.id===n.type)?.parameter?.key==="membraneTank");
 const tankUiEdge=graph.edges.find(e=>e.from===tank?.id&&e.out==="binding");
 const tankUi=graph.nodes.find(n=>n.id===tankUiEdge?.to);
 const sectionEdge=graph.edges.find(e=>e.from===tankUi?.id&&/^child\d+$/.test(e.input));
 const resultEdge=graph.edges.find(e=>e.to==="result"&&e.input==="value");
 const record=graph.nodes.find(n=>n.id===resultEdge?.from),recordType=doc.types.find(t=>t.id===record?.type);
 if(!tank||!tankUi||!sectionEdge||!record||recordType?.operation!=="object"||!resultEdge)throw Error("Не найдены комплектация и выход настроек");
 const key="cabinetSeparate",name="Отдельно стоящий шкаф",typeId=graph.id+".param."+key,uiId="field_"+key;
 if(doc.types.some(t=>t.id===typeId)||graph.nodes.some(n=>n.id===key||n.id===uiId))throw Error("ID опции шкафа уже используется");
 const field={...makeField(key,name,"boolean","flag"),initial:false};
 doc.types.push(parameterType(typeId,name,field,"options"));
 graph.nodes.push({id:key,type:typeId,name,x:tank.x,y:tank.y+440,values:{}},{id:uiId,type:tankUi.type,name,x:tankUi.x,y:tankUi.y+440,values:{widget:"auto"}});
 graph.edges.push(...graph.edges.filter(e=>e.to===tank.id&&["values","defaults","role"].includes(e.input)).map(e=>({...e,to:key})),{from:key,out:"binding",to:uiId,input:"binding"});
 // Keep the tank and its conditional volume together in the equipment list.
 const volume=graph.nodes.find(n=>doc.types.find(t=>t.id===n.type)?.parameter?.key==="membraneTankVolume");
 const volumeUi=graph.edges.find(e=>e.from===volume?.id&&e.out==="binding")?.to;
 const volumeParent=graph.edges.find(e=>e.from===volumeUi&&e.input==="child")?.to??volumeUi;
 const volumeEdge=graph.edges.find(e=>e.from===volumeParent&&e.to===sectionEdge.to&&/^child\d+$/.test(e.input));
 const index=Math.max(Number(sectionEdge.input.slice(5)),volumeEdge?Number(volumeEdge.input.slice(5)):0)+1;
 for(const edge of graph.edges)if(edge.to===sectionEdge.to&&/^child\d+$/.test(edge.input)&&Number(edge.input.slice(5))>=index)edge.input="child"+(Number(edge.input.slice(5))+1);
 graph.edges.push({from:uiId,out:"value",to:sectionEdge.to,input:"child"+index},{from:key,out:"value",to:record.id,input:key});
 recordType.fields.push({...field,direction:"input"});
 const output=recordType.fields.find(f=>f.key===resultEdge.out);
 if(output?.shape)output.shape.push(field);
 return doc;
}

/** Only migrate when applying a version that exposes the new settings binding. */
export function migrateCabinetProjectSetting(program:ToolProgram,contexts:Record<string,ToolContext>):void {
 const settings=program.tools.find(t=>program.plans[t.id]?.steps.some(s=>s.id.startsWith(t.id+"/")&&s.parameter?.key==="cabinetSeparate")&&program.plans[t.id]?.steps.some(s=>s.parameter?.key==="membraneTank"));
 if(!settings)return;
 const frame=program.tools.find(t=>program.plans[t.id]?.steps.some(s=>s.id.startsWith(t.id+"/")&&s.operation==="frame.inputs"));
 const legacy=frame&&contexts[frame.id]?.values.channelInputs;
 if(!legacy||typeof legacy!=="object"||Array.isArray(legacy))return;
 const old=legacy as Record<string,unknown>;
 if(typeof old.cabinetSeparate!=="boolean")return;
 const context=contexts[settings.id];
 if(!Object.hasOwn(context.values,"cabinetSeparate"))contexts[settings.id]={...context,values:{...context.values,cabinetSeparate:old.cabinetSeparate}};
 const rest={...old};delete rest.cabinetSeparate;
 contexts[frame!.id]={...contexts[frame!.id],values:{...contexts[frame!.id].values,channelInputs:rest}};
}
