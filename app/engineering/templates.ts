import { requiredInputs } from "./required";
import { operations } from "./contracts";
import { makeField, type DataKind, type Diagram, type Document, type NodeType, type Signature } from "./schema";
import { compileDiagram, executableSlice } from "./engine";
import { type Publication } from "./runtime";
const labels: Record<string, string> = {
  catalog: "Каталог",
  override: "Проектное переопределение",
  catalogue: "Каталог насосов",
  row: "Насос",
  pump: "Насос",
  pumps: "Насосы",
  settings: "Настройки",
  filters: "Фильтры",
  flow: "Подача",
  head: "Напор",
  entity: "Настройки DN",
  input: "Исходные данные",
  secondary: "Второй контур",
  method: "Метод кривой",
  count: "Число насосов",
  items: "Комплектующие",
  project: "Проект",
  material: "Материал",
  pn: "Класс PN",
  dn: "DN",
  pumpDn: "DN со стороны насоса",
  valveDn: "DN со стороны арматуры",
  geometry: "Геометрия",
  grip: "Толщина пакета",
  nut: "Высота гайки",
  washer: "Толщина шайбы",
  ends: "Количество концов",
  massKg: "Масса насоса",
  limit: "Допустимое давление",
  frequencyHz: "Частота",
  nominalHz: "Номинальная частота",
  c: "Конфигурация коллектора",
  value: "Результат"
};
function parseField(text: string, key: string, direction: "input" | "output") {
  const parts = text.split(":");
  const [kind, meaning, unit = ""] = parts.length === 1 ? ["object", parts[0]] : parts;
  return makeField(key, labels[key] ?? key, kind as DataKind, meaning, unit, direction);
}
export const signatures: Signature[] = operations.map(([id, name, screen, file, result, params]) => ({
  id,
  name,
  screen,
  file,
  args: params.split(",").map(p => {
    const [key, ...shape] = p.split(":");
    return {
      ...parseField(shape.join(":"), key, "input"),
      required: requiredInputs[id]?.includes(key) ?? false
    };
  }),
  result: parseField(result, "value", "output")
}));
export const graphNode = (id: string, type: string, name: string, x: number, y: number) => ({
  id,
  type,
  name,
  x,
  y,
  values: {}
});
const edge = (from: string, out: string, to: string, input: string) => ({
  from,
  out,
  to,
  input
});
export function initialDocument(equipment: NodeType[] = []): Document {
  const types: NodeType[] = [...equipment],
    diagrams: Diagram[] = [];
  for (const sig of signatures) {
    const source = "args." + sig.id,
      operation = "tool." + sig.id,
      result = "return." + sig.id;
    types.push({
      id: source,
      name: "Исходные данные",
      category: "Входы",
      description: sig.screen,
      fields: sig.args.map(f => ({
        ...f,
        direction: "output"
      })),
      formulas: {}
    }, {
      id: operation,
      name: sig.name,
      category: "Инструменты",
      description: sig.file + " · " + sig.id,
      fields: [...sig.args, sig.result],
      native: sig.id,
      formulas: {}
    }, {
      id: result,
      name: "Результат для приложения",
      category: "Выходы",
      description: sig.screen,
      fields: [{
        ...sig.result,
        direction: "input"
      }],
      formulas: {}
    });
    const graph: Diagram = {
      id: sig.id,
      name: sig.name,
      groups: {},
      nodes: [graphNode("source", source, "Исходные данные", 30, 64), graphNode("operation", operation, sig.name, 380, 64), graphNode("result", result, sig.screen, 730, 64)],
      edges: [...sig.args.map(f => edge("source", f.key, "operation", f.key)), edge("operation", "value", "result", "value")]
    };
    if (sig.id === "resolvePort") {
      const port = makeField("port", "Патрубок", "object", "port");
      const dn = makeField("dn", "DN патрубка", "number", "dn");
      types.push({
        id: "resolve.port",
        name: "Источник параметров",
        category: "Инструменты",
        description: "Проектное значение выбранного насоса имеет приоритет перед каталогом.",
        fields: [...sig.args, {
          ...port,
          direction: "output"
        }],
        formulas: {
          port: "override ?? catalog"
        }
      }, {
        id: "resolve.dn",
        name: "Характеристики патрубка",
        category: "Инструменты",
        description: "Извлечение DN выбранного патрубка.",
        fields: [{
          ...port,
          direction: "input"
        }, {
          ...dn,
          direction: "output"
        }],
        formulas: {
          dn: 'get(port, "dn")'
        }
      }, {
        id: "resolve.assembly",
        name: "Патрубок для обвязки и 3D",
        category: "Инструменты",
        description: "Возвращает присоединение, давления, источник и принятый DN.",
        fields: [{
          ...port,
          direction: "input"
        }, {
          ...dn,
          direction: "input"
        }, {
          ...sig.result
        }],
        formulas: {
          value: 'set(port, "dn", dn)'
        }
      });
      graph.nodes = [graphNode("source", source, "Насос и параметры проекта", 25, 90), graphNode("select", "resolve.port", "Выбор источника", 330, 90), graphNode("read", "resolve.dn", "DN патрубка", 625, 245), graphNode("assemble", "resolve.assembly", "Параметры патрубка", 920, 90), graphNode("result", result, "Напорная линия / 3D", 1220, 90)];
      graph.edges = [edge("source", "catalog", "select", "catalog"), edge("source", "override", "select", "override"), edge("select", "port", "read", "port"), edge("select", "port", "assemble", "port"), edge("read", "dn", "assemble", "dn"), edge("assemble", "value", "result", "value")];
    }
    if (sig.id === "stationComposition") {
      const stages = ["prepareStation", "stationCollectors", "stationLines", "stationOptions", "finalizeStation"];
      graph.nodes = [graphNode("source", source, "Проект и каталоги", 25, 80), ...stages.map((id, i) => graphNode(id, "tool." + id, signatures.find(s => s.id === id)!.name, 325 + i * 300, 80)), graphNode("result", result, "Готовая спецификация", 1825, 80)];
      graph.edges = [edge("source", "project", stages[0], "project"), edge("source", "resources", stages[0], "resources"), ...stages.slice(1).map((id, i) => edge(stages[i], "value", id, "work")), edge(stages[4], "value", "result", "value")];
    }
    if (sig.id === "jointFastenerLength") {
      types.push({
        id: "rule.fastener",
        name: sig.name,
        category: "Инструменты",
        description: "Толщина пакета и крепёж на каждом конце, включая выступ 5 мм.",
        fields: [...sig.args, sig.result],
        formulas: {
          value: "grip + ends * (nut + washer + 5)"
        }
      });
      graph.nodes[1].type = "rule.fastener";
    }
    diagrams.push(graph);
  }
  const mass = makeField("mass", "Масса одной детали", "number", "mass", "кг"),
    count = makeField("count", "Количество", "number", "count", "шт");
  types.push({
    id: "lab.part",
    name: "Деталь",
    category: "Комплектующие",
    description: "Тестовый экземпляр комплектующего",
    fields: [{
      ...mass,
      initial: 2.5
    }],
    formulas: {}
  }, {
    id: "lab.total",
    name: "Масса партии",
    category: "Инструменты",
    description: "Произведение массы и количества",
    fields: [{
      ...mass,
      direction: "input",
      required: true
    }, {
      ...count,
      direction: "input",
      initial: 4,
      required: true
    }, {
      ...mass,
      key: "value",
      name: "Общая масса",
      direction: "output"
    }],
    formulas: {
      value: "mass * count"
    }
  }, {
    id: "lab.result",
    name: "Результат примера",
    category: "Выходы",
    description: "Проверка созданных типов и связей",
    fields: [{
      ...mass,
      key: "value",
      name: "Общая масса",
      direction: "input"
    }],
    formulas: {}
  });
  diagrams.push({
    id: "lab",
    name: "Песочница · масса партии",
    groups: {},
    nodes: [graphNode("part", "lab.part", "Деталь", 25, 80), graphNode("operation", "lab.total", "Расчёт массы", 360, 80), graphNode("result", "lab.result", "Масса партии", 700, 80)],
    edges: [edge("part", "mass", "operation", "mass"), edge("operation", "value", "result", "value")]
  });
  return {
    schema: 1,
    types,
    diagrams
  };
}
export function compilePublication(doc: Document, version: string): Publication {
  const plans: Publication["plans"] = {},
    args: Publication["args"] = {};
  const baseline = initialDocument();
  for (const sig of signatures) {
    const graph = doc.diagrams.find(g => g.id === sig.id)!;
    const plan = compileDiagram(graph, doc.types);
    const original = compileDiagram(baseline.diagrams.find(g => g.id === sig.id)!, baseline.types);
    const compiled = executableSlice(plan);
    if (JSON.stringify(compiled) !== JSON.stringify(executableSlice(original))) {
      plans[sig.id] = compiled;
      args[sig.id] = sig.args.map(f => f.key);
    }
  }
  return {
    version,
    plans,
    args
  };
}
