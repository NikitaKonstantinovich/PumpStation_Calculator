import { makeField, type GraphNode, type NodeType } from "../engineering/schema";
import { deriveTools, upgradeDocument } from "./product";
import { pumpNodeTypes } from "./pump-nodes";
import { hydraulicNodeTypes } from "./hydraulic-nodes";
import { detailNodeTypes } from "./pump-detail-data";
import { dnNodeTypes } from "./dn-nodes";
import { stationCatalogNodeTypes } from "./station-catalog";
import { collectorNodeTypes } from "./collector-nodes";
import { specificationNodeTypes } from "./specification-nodes";
import type { ToolDocument } from "./schema";
export function prepareDocument(document: ToolDocument): ToolDocument {
  const doc = upgradeDocument(document);
  const missing = [...pumpNodeTypes(), ...hydraulicNodeTypes(), ...detailNodeTypes(), ...dnNodeTypes(), ...stationCatalogNodeTypes(), ...collectorNodeTypes(), ...specificationNodeTypes()].filter(type => !doc.types.some(t => t.id === type.id));
  return missing.length ? {
    ...doc,
    types: [...doc.types, ...missing]
  } : doc;
}
export function addProductTool(document: ToolDocument, name: string): {
  document: ToolDocument;
  id: string;
  diagram: string;
} {
  const doc = prepareDocument(document),
    root = doc.diagrams.find(g => g.id === doc.product!.root)!;
  const id = "tool_" + crypto.randomUUID().replaceAll("-", "").slice(0, 12),
    diagram = id + ".graph";
  const context = makeField("context", "Контекст инструмента", "object", "toolContext");
  const ui = makeField("ui", "Интерфейс", "object", "view"),
    value = makeField("value", "Результат", "object", "record");
  const inputs = [{
      ...context,
      direction: "input" as const
    }],
    outputs = [ui, value].map(f => ({
      ...f,
      direction: "output" as const,
      required: false
    }));
  const type: NodeType = {
    id: diagram,
    name,
    category: "Инструменты",
    description: name,
    instrument: diagram,
    fields: [...inputs, ...outputs],
    formulas: {}
  };
  const boundaryIn: NodeType = {
    id: diagram + ".in",
    name: "Данные инструмента",
    category: "Границы",
    description: "Собственный доверенный контекст экземпляра",
    fields: inputs.map(f => ({
      ...f,
      direction: "output"
    })),
    formulas: {}
  };
  const boundaryOut: NodeType = {
    id: diagram + ".out",
    name: "Результат инструмента",
    category: "Границы",
    description: "Расчёт и интерфейс",
    fields: outputs.map(f => ({
      ...f,
      direction: "input"
    })),
    formulas: {}
  };
  const empty: NodeType = {
    id: diagram + ".record",
    name: "Результат",
    category: "Данные",
    description: "Добавьте расчётные атрибуты результата",
    operation: "object",
    fields: [{
      ...value,
      direction: "output"
    }],
    formulas: {}
  };
  const order = Math.max(-1, ...deriveTools(doc).map(t => root.nodes.find(n => n.id === t.id)?.tool?.order ?? 0)) + 1;
  const node: GraphNode = {
    id,
    type: diagram,
    name,
    x: Math.max(0, ...root.nodes.map(n => n.x)) + 360,
    y: 180,
    values: {},
    tool: {
      category: "Ввод",
      order,
      enabled: true,
      tests: []
    }
  };
  return {
    id,
    diagram,
    document: {
      ...doc,
      types: [...doc.types, type, boundaryIn, boundaryOut, empty],
      diagrams: [...doc.diagrams.map(g => g.id === root.id ? {
        ...g,
        nodes: [...g.nodes, node]
      } : g), {
        id: diagram,
        name,
        groups: {
          data: "Данные",
          ui: "Интерфейс"
        },
        nodes: [{
          id: "source",
          type: boundaryIn.id,
          name: "Данные инструмента",
          x: 0,
          y: 0,
          values: {}
        }, {
          id: "project",
          type: "data.source",
          name: "Собственные значения инструмента",
          x: 330,
          y: 0,
          values: {
            source: "workspace2"
          }
        }, {
          id: "form",
          type: "ui.form",
          name: "Форма инструмента",
          x: 1000,
          y: 0,
          values: {
            title: name
          }
        }, {
          id: "save",
          type: "command.save",
          name: "Сохранить значения",
          x: 650,
          y: 250,
          values: {}
        }, {
          id: "record",
          type: empty.id,
          name: "Расчётный результат",
          x: 1000,
          y: 300,
          values: {}
        }, {
          id: "result",
          type: boundaryOut.id,
          name: "Результат инструмента",
          x: 1400,
          y: 0,
          values: {}
        }],
        edges: [{
          from: "source",
          out: "context",
          to: "project",
          input: "context"
        }, {
          from: "save",
          out: "value",
          to: "form",
          input: "command",
          kind: "command"
        }, {
          from: "form",
          out: "value",
          to: "result",
          input: "ui"
        }, {
          from: "record",
          out: "value",
          to: "result",
          input: "value"
        }]
      }]
    }
  };
}
export function updateToolMetadata(doc: ToolDocument, id: string, patch: {
  name?: string;
  category?: string;
  order?: number;
  enabled?: boolean;
  tests?: import("./schema").ToolTest[];
}): ToolDocument {
  return {
    ...doc,
    diagrams: doc.diagrams.map(g => g.id === doc.product?.root ? {
      ...g,
      nodes: g.nodes.map(n => n.id === id ? {
        ...n,
        ...(patch.name != null ? {
          name: patch.name
        } : {}),
        tool: {
          ...n.tool,
          ...Object.fromEntries(Object.entries(patch).filter(([k]) => k !== "name"))
        }
      } : n)
    } : g)
  };
}
