import { compileTree, definitionPorts } from "../engineering/hierarchy";
import { validateDocument, executableSlice } from "../engineering/engine";
import { accepts, type Field, type NodeType } from "../engineering/schema";
import { OPERATIONS, evaluatePlan } from "./runtime";
import { safeId, type ToolContext, type ToolDocument, type ToolProgram, type TestResult } from "./schema";
function verifyField(f: Field, depth = 0) {
  if (depth > 5 || !f || !safeId(f.key) || !f.name || !f.meaning || typeof f.unit !== "string") throw Error("Неверное описание атрибута");
  if (f.item) verifyField(f.item, depth + 1);
  f.shape?.forEach(child => verifyField(child, depth + 1));
  if (f.options && (f.options.length > 300 || f.options.some(v => typeof v !== "string"))) throw Error("Неверное перечисление");
  if (f.initial != null && !accepts(f, f.initial)) throw Error(f.name + " · неверное начальное значение");
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
      if (type.fields.find(f => f.key === "value")?.kind !== type.parameter.field.kind) throw Error("Тип порта параметра отличается от его определения");
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
  for (const graph of doc.diagrams) compileTree(doc, graph);
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
    plans[tool.id] = executableSlice(plan, ["value", "ui", "issues"]);
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
    const actual:Record<string,unknown>={};let node="";
    const expectedReport={...test.expected,...(test.errors?.length?{errors:test.errors}:{})};
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
      actual.errors=result.issues.map(i=>i.key);node=result.issues[0]?.node??"result";
      for(const path of Object.keys(test.expected??{}))actual[path]=path.split(".").reduce<unknown>((o,k)=>o&&typeof o==="object"?(o as Record<string,unknown>)[k]:undefined,result);
      for (const [path, expected] of Object.entries(test.expected ?? {})) {
        const value = path.split(".").reduce<unknown>((o, k) => o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined, result);
        if (typeof expected === "number" && typeof value === "number" ? Math.abs(expected - value) > (test.tolerance ?? 1e-9) : JSON.stringify(value) !== JSON.stringify(expected)) throw Error(path + " · ожидалось " + JSON.stringify(expected) + ", получено " + JSON.stringify(value));
      }
      for (const key of test.errors ?? []) if (!result.issues.some(i => i.key === key)) throw Error("Ожидалась ошибка " + key);
      return {
        id: test.id,
        name: test.name,
        passed: true,
        expected:expectedReport,actual,
        message: "Пройден"
      };
    } catch (error) {
      return {
        id: test.id,
        name: test.name,
        passed: false,
        expected:expectedReport,actual,node,
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
