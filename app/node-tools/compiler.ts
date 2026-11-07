import { compileTree, definitionPorts } from "../engineering/hierarchy";
import { validateDocument, executableSlice, DiagramError } from "../engineering/engine";
import { accepts, compatible, type Field, type NodeType } from "../engineering/schema";
import { OPERATIONS, evaluatePlan, parameterExecutionPlan } from "./runtime";
import { safeId, type ToolContext, type ToolDocument, type ToolProgram, type TestResult } from "./schema";
function verifyField(f: Field, depth = 0) {
  if (depth > 5 || !f || !safeId(f.key) || !f.name || !f.meaning || typeof f.unit !== "string") throw Error("Неверное описание атрибута");
  if (f.item) verifyField(f.item, depth + 1);
  f.shape?.forEach(child => verifyField(child, depth + 1));
  if (f.options && (f.options.length > 300 || f.options.some(v => typeof v !== "string"))) throw Error("Неверное перечисление");
  if (f.initial != null && !accepts(f, f.initial)) throw Error(f.name + " · неверное начальное значение");
  if (f.min != null && !Number.isFinite(f.min) || f.max != null && !Number.isFinite(f.max) || f.min != null && f.max != null && f.min > f.max) throw Error(f.name + " · неверные границы диапазона");
}
export function compileTools(doc: ToolDocument, version: string, strict = true): ToolProgram {
  if (!Array.isArray(doc?.tools) || doc.tools.length > 30) throw Error("Некорректный список инструментов");
  validateDocument(doc, [], [], strict);
  const definitions = new Set<string>();
  for (const type of doc.types) {
    if (type.native) throw Error("Инструменты используют собственный набор операций");
    if (type.operation && !OPERATIONS.includes(type.operation as typeof OPERATIONS[number])) throw Error("Неизвестная операция " + type.operation);
    type.fields.forEach(f => verifyField(f));
    if (type.operation === "parameter") {
      if (!type.parameter || !safeId(type.parameter.key) || !["input", "all", "options"].includes(type.parameter.permission)) throw Error("Некорректный параметр");
      verifyField(type.parameter.field);
      const valuePort = type.fields.find(f => f.key === "value");
      if (!valuePort || !compatible(valuePort, {
        ...type.parameter.field,
        direction: "input"
      })) throw Error("Тип, смысл или единица порта параметра отличаются от его определения");
      const source = type.parameter.source;
      if (source) {
        if (Object.keys(type.formulas).length) throw Error(type.name + " · формулы параметра вынесите в отдельную расчётную ноду");
        if (!["user", "fixed", "computed", "source"].includes(source.mode)) throw Error(type.name + " · неизвестный источник значения");
        if (source.mode === "fixed" && !accepts(type.parameter.field, source.value)) throw Error(type.name + " · неверное постоянное значение");
        if (source.mode === "computed") {
          const input = type.fields.find(f => f.key === "computed");
          if (!input || !compatible({
            ...type.parameter.field,
            direction: "output"
          }, input)) throw Error(type.name + " · вычисляемому параметру нужен совместимый вход computed");
        }
        if (source.mode === "source" && (!["workspace2", "base-values"].includes(source.registry ?? "") || typeof source.attribute !== "string" || !source.attribute.replace(/^\$\./, "").split(".").every(safeId))) throw Error(type.name + " · выберите зарегистрированный источник и атрибут");
        if (source.mode === "source") {
          const attribute = source.attribute!.replace(/^\$\./, "");
          const contracts = doc.types.flatMap(t => t.parameter && (attribute === (t.parameter.defaultKey ?? t.parameter.key) || attribute.endsWith("." + (t.parameter.defaultKey ?? t.parameter.key))) ? [t.parameter.field] : []);
          if (!contracts.length) throw Error(type.name + " · у атрибута источника нет зарегистрированного контракта параметра");
          if (!contracts.some(f => compatible({
            ...f,
            direction: "output"
          }, {
            ...type.parameter!.field,
            direction: "input"
          }))) throw Error(type.name + " · тип, смысл или единица атрибута источника несовместимы с параметром");
        }
      }
    }
  }
  if (!strict) return {
    version,
    tools: doc.tools.map(({
      tests: _tests,
      ...tool
    }) => {
      void _tests;
      return tool;
    }),
    plans: {}
  };
  // Validate interfaces even for definitions currently absent from the selected output.
  for (const graph of doc.diagrams) {
    for (const node of graph.nodes) {
      const type = doc.types.find(t => t.id === node.type)!;
      if (type.parameter?.source?.mode === "computed" && !graph.edges.some(e => e.to === node.id && e.input === "computed")) throw new DiagramError(type.name + " · подключите расчётный выход к входу вычисления", graph.id, node.id);
    }
    compileTree(doc, graph);
  }
  const plans: ToolProgram["plans"] = {};
  for (const tool of doc.tools) {
    if (!safeId(tool.id) || definitions.has(tool.id) || !tool.name.trim() || !Array.isArray(tool.tests) || tool.tests.length > 100) throw Error("Неверное определение инструмента");
    definitions.add(tool.id);
    const graph = doc.diagrams.find(g => g.id === tool.diagram);
    if (!graph) throw Error("Отсутствует граф инструмента");
    const ports = definitionPorts(graph, doc.types);
    if (!ports.some(f => f.key === "context" && f.direction === "input") || !ports.some(f => f.key === "ui" && f.direction === "output")) throw Error("Инструменту нужны вход context и выход ui");
    const plan = compileTree(doc, graph);
    if (!plan.steps.find(s => s.id === "result")?.links.some(e => e.input === "ui")) throw Error("Подключите интерфейс инструмента");
    plans[tool.id] = executableSlice(parameterExecutionPlan(plan), ["value", "ui", "issues"]);
  }
  return {
    version,
    tools: doc.tools.map(({
      tests: _tests,
      ...tool
    }) => {
      void _tests;
      return tool;
    }),
    plans
  };
}
export function runTests(doc: ToolDocument, context: ToolContext): TestResult[] {
  const publication = compileTools(doc, "trial");
  return doc.tools.flatMap(tool => tool.tests.map(test => {
    const actual: Record<string, unknown> = {};
    let node = "";
    const expectedReport = {
      ...test.expected,
      ...(test.errors?.length ? {
        errors: test.errors
      } : {})
    };
    try {
      const graph = test.diagram ? doc.diagrams.find(g => g.id === test.diagram) : null;
      const plan = graph ? compileTree(doc, graph) : publication.plans[tool.id];
      const result = evaluatePlan(plan, {
        ...context,
        values: test.values,
        role: test.role ?? "pro"
      }, test.diagram ? {
        values: test.values,
        defaults: context.defaults,
        role: test.role ?? "pro",
        scope: "main",
        active: true,
        ...test.inputs
      } : {});
      actual.errors = result.issues.map(i => i.key);
      node = result.issues[0]?.node ?? "result";
      for (const path of Object.keys(test.expected ?? {})) actual[path] = path.split(".").reduce<unknown>((o, k) => o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined, result);
      for (const [path, expected] of Object.entries(test.expected ?? {})) {
        const value = path.split(".").reduce<unknown>((o, k) => o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined, result);
        if (typeof expected === "number" && typeof value === "number" ? Math.abs(expected - value) > (test.tolerance ?? 1e-9) : JSON.stringify(value) !== JSON.stringify(expected)) {
          node = result.bindings.find(b => b.key === path.replace(/^value\./, ""))?.node ?? node;
          throw Error(path + " · ожидалось " + JSON.stringify(expected) + ", получено " + JSON.stringify(value));
        }
      }
      for (const key of test.errors ?? []) if (!result.issues.some(i => i.key === key)) throw Error("Ожидалась ошибка " + key);
      return {
        id: test.id,
        name: test.name,
        passed: true,
        inputs: {
          values: test.values,
          inputs: test.inputs ?? {},
          role: test.role ?? "pro"
        },
        expected: expectedReport,
        actual,
        message: "Пройден"
      };
    } catch (error) {
      return {
        id: test.id,
        name: test.name,
        passed: false,
        inputs: {values:test.values,inputs:test.inputs??{},role:test.role??"pro"},
        expected: expectedReport,
        actual,
        node,
        message: (error as Error).message
      };
    }
  }));
}
export function parameterType(id: string, name: string, field: Field, permission: "input" | "options" | "all" = "input"): NodeType {
  const port = (key: string, kind: Field["kind"], meaning: string, direction: Field["direction"]): Field => ({
    key,
    name: key,
    kind,
    meaning,
    unit: "",
    direction
  });
  return {
    id,
    name,
    description: name,
    category: "Параметры",
    operation: "parameter",
    parameter: {
      key: field.key,
      field,
      permission
    },
    formulas: {},
    fields: [port("values", "object", "toolValues", "input"), port("defaults", "object", "toolValues", "input"), port("scope", "string", "scope", "input"), port("role", "string", "role", "input"), {
      ...field,
      key: "computed",
      name: "Вычисленное значение",
      direction: "input",
      required: false,
      initial: undefined
    }, {
      ...port("active", "boolean", "flag", "input"),
      initial: true
    }, {
      ...field,
      key: "value",
      direction: "output",
      required: false,
      initial: undefined
    }, port("binding", "object", "parameterBinding", "output"), port("issues", "array", "diagnostics", "output"), port("valid", "boolean", "flag", "output"), port("origin", "string", "origin", "output")]
  };
}
