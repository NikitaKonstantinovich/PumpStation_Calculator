import type { ToolProgram } from "./schema";

export const NODE_RUNTIME_HEADER = "x-node-runtime-operations";
export const NODE_RUNTIME_UPDATE_MESSAGE = "Открыта устаревшая версия приложения. Обновите страницу (Ctrl+F5), чтобы продолжить расчёт.";

export function parseRuntimeOperations(header: string | null): string[] | undefined {
  if (header === null) return undefined;
  const operations = header.split(",").filter(Boolean);
  if (header.length > 16000 || operations.length > 256 || operations.some(op => !/^[a-zA-Z][\w.]*$/.test(op))) throw Error("Некорректное описание возможностей нодового редактора");
  return operations;
}

export function missingRuntimeOperations(program: ToolProgram, supported?: readonly string[]): string[] {
  const required = [...new Set(Object.values(program.plans).flatMap(plan => plan.steps.flatMap(step => step.operation ? [step.operation] : [])))];
  // Tabs opened before capability negotiation cannot execute the newly added width node.
  if (!supported) return required.filter(operation => ["spacing.standardWidth","ui.stationGeometry"].includes(operation));
  const available = new Set(supported);
  return required.filter(operation => !available.has(operation));
}
