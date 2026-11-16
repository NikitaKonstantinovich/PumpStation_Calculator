import { makeField } from "../engineering/schema";
import { addProductTool,prepareDocument } from "./authoring";
import { boundaryType,syncInstrument } from "./visualization-tools";
import type { ToolDocument } from "./schema";

/** Explicit publication update: preserve project inputs and the original spec result. */
export function addComponentMassTool(document:ToolDocument,specificationId:string){
 let doc=prepareDocument(document);
 let root=doc.diagrams.find(g=>g.id===doc.product?.root)!;
 const spec=root.nodes.find(n=>n.id===specificationId),specType=doc.types.find(t=>t.id===spec?.type);
 const sg=doc.diagrams.find(g=>g.id===specType?.instrument);
 const port=specType?.fields.find(f=>f.direction==="output"&&f.meaning==="stationSpecificationResult");
 if(!spec||!sg||!port)throw Error("Не найден результат инструмента спецификации");
 for(const n of sg.nodes){const operation=doc.types.find(t=>t.id===n.type)?.operation;
  if(operation==="spec.readiness"||operation==="spec.notices"){n.type="spec.notices";n.name="Проверка состава и показ предупреждений";n.values={...n.values,tankValveArticle:false,frameAnchorDiameters:false};}
 }
 const existing=root.edges.find(e=>e.from===specificationId&&e.out===port.key&&doc.diagrams.find(g=>g.id===doc.types.find(t=>t.id===root.nodes.find(n=>n.id===e.to)?.type)?.instrument)?.nodes.some(n=>doc.types.find(t=>t.id===n.type)?.operation==="spec.masses"));
 if(existing)return{document:doc,id:existing.to};
 const added=addProductTool(doc,"Массы комплектующих");doc=added.document;root=doc.diagrams.find(g=>g.id===doc.product?.root)!;
 const graph=doc.diagrams.find(g=>g.id===added.diagram)!,tool=root.nodes.find(n=>n.id===added.id)!;
 const order=(spec.tool?.order??0)+1;for(const n of root.nodes)if(n.id!==tool.id&&n.tool&&(n.tool.order??0)>=order)n.tool.order=(n.tool.order??0)+1;
 tool.tool={...tool.tool,category:"Вывод",order,workspaceVisible:true};
 boundaryType(doc,graph,"source").fields.push({...makeField("specification","Результат спецификации","object","stationSpecificationResult"),direction:"output",required:false});
 boundaryType(doc,graph,"result").fields=boundaryType(doc,graph,"result").fields.map(f=>f.key==="value"?{...f,meaning:"stationMassData",name:"Массы комплектующих"}:f);
 graph.nodes=graph.nodes.filter(n=>["source","result","form"].includes(n.id));
 graph.nodes.push({id:"masses",type:"spec.masses",name:"Массы позиций спецификации",x:350,y:250,values:{}},{id:"panel",type:"ui.componentMasses",name:"Таблица масс",x:720,y:250,values:{}});
 graph.edges=[{from:"source",out:"specification",to:"masses",input:"result"},{from:"masses",out:"data",to:"panel",input:"data"},{from:"masses",out:"data",to:"result",input:"value"},{from:"panel",out:"value",to:"form",input:"child0"},{from:"form",out:"value",to:"result",input:"ui"}];
 syncInstrument(doc,graph);root.edges.push({from:specificationId,out:port.key,to:added.id,input:"specification"});
 return{document:doc,id:added.id};
}
