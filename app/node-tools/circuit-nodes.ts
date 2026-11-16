import { makeField, type NodeType } from "../engineering/schema";
import type { Step } from "../engineering/engine";
import type { Values, View } from "./schema";

export const CIRCUIT_OPERATIONS = ["circuit.active", "circuit.guard", "ui.readOnly"] as const;
export const secondaryCircuitEnabled = (settings: { stationType?: unknown; jockeyPump?: unknown }) => settings.stationType === "combined" || settings.stationType === "fire" && settings.jockeyPump === true;

// The tool boundary remains a form even when no circuit calculations run.
export const inactiveCircuitView = (node: string): View => ({ kind: "form", node, label: "Второй контур не используется", children: [], enabled: false });

export function circuitNodeTypes(): NodeType[] {
  return [
    { id: "circuit.active", name: "Второй контур используется", category: "Контуры", description: "Совмещённая установка или пожарная установка с жокей-насосом.", operation: "circuit.active", formulas: {}, fields: [
      makeField("settings", "Результат настроек проекта", "object", "record"),
      { ...makeField("active", "Контур используется", "boolean", "flag"), direction: "output" }
    ] },
    { id: "ui.readOnly", name: "Исходные данные — только просмотр", category: "Интерфейс", description: "Показывает подключённые поля с обычной подписью, без возможности ввода.", operation: "ui.readOnly", formulas: {}, fields: [
      makeField("ui", "Исходные данные", "object", "view"),
      { ...makeField("value", "Представление", "object", "view"), direction: "output" }
    ] }
  ];
}

export function executeCircuitOperation(step: Step, v: Values): Values | undefined {
  if (step.operation === "circuit.active") return { active: secondaryCircuitEnabled((v.settings ?? {}) as Values) };
  if (step.operation === "circuit.guard") {
    return Object.fromEntries(step.fields.filter(f => f.direction === "output").map(f => [f.key, v.active === true ? v["in_" + f.key] : f.meaning === "view" ? inactiveCircuitView(step.id) : null]));
  }
  if (step.operation === "ui.readOnly") {
    const readonly = (view: View): View => ({ ...view, enabled: false, collapsible: false, ...(view.children ? { children: view.children.map(readonly) } : {}) });
    return { value: v.ui ? readonly(v.ui as View) : null };
  }
}
