import { definitionPorts } from "../engineering/hierarchy";
import { makeField, type Diagram, type GraphNode } from "../engineering/schema";
import type { ToolDocument } from "./schema";
import { spacingNodeTypes } from "./spacing-nodes";

/** Explicit product edit, never applied automatically when an older publication is opened. */
export function useStandardPumpSpacing(doc: ToolDocument): number {
  const standard = spacingNodeTypes().find(t => t.operation === "spacing.standardWidth")!;
  const existing = doc.types.find(t => t.id === standard.id);
  if (existing && existing.operation !== standard.operation) throw Error("Идентификатор стандартного межосевого уже занят другим определением");
  if (!existing) doc.types.push(standard);
  let changed = 0;
  for (const graph of doc.diagrams) {
    const type = (id: string) => doc.types.find(t => t.id === graph.nodes.find(n => n.id === id)?.type);
    // Only spacing chains actually feeding the DN result; unrelated custom graphs stay intact.
    for (const edge of graph.edges.filter(e => ["primarySpacing", "secondarySpacing"].includes(e.input) && type(e.to)?.operation === "station.dnResult")) {
      let id = edge.from;
      const seen = new Set<string>();
      while (!seen.has(id)) {
        seen.add(id);
        const node = graph.nodes.find(n => n.id === id), operation = type(id)?.operation;
        if (!node || !operation?.startsWith("spacing.")) break;
        if (operation === "spacing.standardWidth") break;
        if (operation === "spacing.geometry") {
          node.type = standard.id;
          node.name = standard.name + (edge.input === "secondarySpacing" ? " — второй контур" : " — основной контур");
          changed++; break;
        }
        const incoming = graph.edges.find(e => e.to === id && e.input === "work");
        if (!incoming) break;
        id = incoming.from;
      }
    }
  }
  return changed;
}

/** Add only missing stages/ports. Existing nodes, links, parameters and manual choices survive. */
export function connectPumpSpacing(doc: ToolDocument) {
  const root = doc.diagrams.find(g => g.id === doc.product?.root); if (!root) return;
  const type = (n: GraphNode) => doc.types.find(t => t.id === n.type)!;
  const graph = (n: GraphNode) => doc.diagrams.find(g => g.id === type(n)?.instrument);
  const ops = (g: Diagram, op: string) => g.nodes.filter(n => type(n)?.operation === op);
  const sync = (g: Diagram) => { const fields = definitionPorts(g, doc.types); doc.types.filter(t => t.instrument === g.id).forEach(t => {t.fields = fields;}); };
  const port = (g: Diagram, id: "source" | "result", key: string, name: string, meaning: string) => {
    const n = g.nodes.find(n => n.id === id); if (!n) return false;
    const t = type(n); if (doc.diagrams.some(other => other.id !== g.id && other.nodes.some(n => n.type === t.id))) return false;
    if (t.fields.some(f => f.key === key && f.meaning !== meaning)) return false;
    if (!t.fields.some(f => f.key === key)) t.fields.push({...makeField(key, name, "object", meaning), direction: id === "source" ? "output" : "input", required:false});
    return true;
  };
  for (const node of root.nodes) {
    const g = graph(node); if (!g) continue;
    const results = ops(g, "station.dnResult"); if (results.length !== 1) continue;
    const result = results[0], context = g.edges.find(e => e.to === result.id && e.input === "context"); if (!context) continue;
    for (const secondary of [false, true]) {
      const input = secondary ? "secondarySpacing" : "primarySpacing", prefix = "spacing_" + (secondary ? "secondary" : "primary");
      if (g.edges.some(e => e.to === result.id && e.input === input) || Object.hasOwn(result.values, input) || g.nodes.some(n => n.id.startsWith(prefix))) continue;
      const stages = [["layout","Данные компоновки насосов"],["rule","Поиск правила межосевого расстояния"],["geometry","Расчёт межосевого по габаритам"],["clearance","Проверка зазора"],["result","Результат межосевого расстояния"]];
      stages.forEach(([operation, name], index) => {
        const id = prefix + "_" + operation;
        g.nodes.push({id,type:"spacing."+operation,name:name+(secondary?" — второй контур":" — основной контур"),x:700+index*350,y:secondary?-1050:-650,values:operation==="layout"?{secondary,orientation:"transverse_to_flow"}:{}});
        if (index) g.edges.push({from:prefix+"_"+stages[index-1][0],out:"value",to:id,input:"work"});
      });
      g.edges.push({from:context.from,out:context.out,to:prefix+"_layout",input:"context"},{from:prefix+"_result",out:"value",to:result.id,input});
      if (port(g,"result",input,secondary?"Межосевое — второй контур":"Межосевое — основной контур","pumpSpacingResult")) g.edges.push({from:prefix+"_result",out:"value",to:"result",input});
    }
    sync(g);
  }
  // The card consumes the collector's actual layout, including manual decisions.
  // Match through the DN input's selection source, never by instrument name.
  const selectionOrigins = (n: GraphNode) => root.edges.filter(e => e.to === n.id && type(n).fields.some(f=>f.key===e.input&&f.meaning==="pumpCatalogItem")).map(e=>e.from+"/"+e.out);
  for (const card of root.nodes) {
    const cg=graph(card); if (!cg) continue;
    const details=ops(cg,"pump.detailData"); if(details.length!==1)continue;
    if(cg.edges.some(e=>e.to===details[0].id&&e.input==="collectors")||Object.hasOwn(details[0].values,"collectors"))continue;
    const origins=selectionOrigins(card); if(origins.length!==1)continue;
    const candidates=root.nodes.filter(n=>{
      if(!graph(n)||ops(graph(n)!,"collector.recommend").length!==1)return false;
      return root.edges.some(e=>e.to===n.id&&type(n).fields.some(f=>f.key===e.input&&f.meaning==="stationDnResult")&&root.nodes.some(dn=>dn.id===e.from&&selectionOrigins(dn).includes(origins[0])));
    });
    if(candidates.length!==1)continue;
    const source=candidates[0], outputs=type(source).fields.filter(f=>f.direction==="output"&&f.meaning==="stationCollectorResult");
    if(outputs.length!==1||!port(cg,"source","collectors","Текущая компоновка коллекторов","stationCollectorResult")||root.edges.some(e=>e.to===card.id&&e.input==="collectors"))continue;
    cg.edges.push({from:"source",out:"collectors",to:details[0].id,input:"collectors"});sync(cg);
    root.edges.push({from:source.id,out:outputs[0].key,to:card.id,input:"collectors"});
  }
}
