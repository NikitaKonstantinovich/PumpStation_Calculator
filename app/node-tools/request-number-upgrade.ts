import { makeField } from "../engineering/schema";
import { parameterType } from "./compiler";
import { deriveTools } from "./product";
import type { ToolDocument } from "./schema";

/** Explicit publication edit: historical project snapshots are never changed on read. */
export function addRequestNumberSetting(document: ToolDocument, settingsId: string): ToolDocument {
  const doc = structuredClone(document), tool = deriveTools(doc).find(t => t.id === settingsId);
  const graph = doc.diagrams.find(g => g.id === tool?.diagram);
  if (!graph) throw Error("Не найден инструмент настроек проекта");
  if (graph.nodes.some(n => doc.types.find(t => t.id === n.type)?.parameter?.key === "requestNumber")) return doc;
  const station = graph.nodes.find(n => doc.types.find(t => t.id === n.type)?.parameter?.key === "stationType");
  const ui = graph.nodes.find(n => n.id === graph.edges.find(e => e.from === station?.id && e.out === "binding")?.to);
  const parent = graph.edges.find(e => e.from === ui?.id && /^child\d+$/.test(e.input));
  const result = graph.edges.find(e => e.to === "result" && e.input === "value");
  const record = graph.nodes.find(n => n.id === result?.from), recordType = doc.types.find(t => t.id === record?.type);
  if (!station || !ui || !parent || !record || recordType?.operation !== "object" || !result) throw Error("Не найдены поля и выход настроек проекта");
  const key = "requestNumber", name = "Номер запроса", typeId = graph.id + ".param." + key, uiId = "field_" + key;
  if (doc.types.some(t => t.id === typeId) || graph.nodes.some(n => n.id === key || n.id === uiId)) throw Error("ID номера запроса уже используется");
  const field = {...makeField(key, name, "string", key), initial:""};
  doc.types.push(parameterType(typeId, name, field, "input"));
  graph.nodes.push({id:key, type:typeId, name, x:station.x, y:station.y-200, values:{}},
    {id:uiId, type:ui.type, name, x:ui.x, y:ui.y-200, values:{widget:"auto",showOrigin:false,hint:"Цифры и тире, например 123-1234-1"}});
  graph.edges.push(...graph.edges.filter(e => e.to === station.id && ["values","defaults","role"].includes(e.input)).map(e => ({...e,to:key})),
    {from:key,out:"binding",to:uiId,input:"binding"});
  const index = Number(parent.input.slice(5));
  for (const edge of graph.edges) if (edge.to === parent.to && /^child\d+$/.test(edge.input) && Number(edge.input.slice(5)) >= index) edge.input = "child" + (Number(edge.input.slice(5)) + 1);
  graph.edges.push({from:uiId,out:"value",to:parent.to,input:"child"+index},{from:key,out:"value",to:record.id,input:key});
  recordType.fields.push({...field,direction:"input"});
  recordType.fields.find(f => f.key === result.out)?.shape?.push(field);
  return doc;
}
