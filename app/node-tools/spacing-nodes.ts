import { makeField, type Field, type NodeType } from "../engineering/schema";
import type { Step } from "../engineering/engine";
import type { AppliedBaseValues } from "../base-values";
import type { Pump } from "../pump-catalog";
import { findSpacingRule, calculateSpacingFallback, checkSpacingClearance, standardPumpSpacing, type PumpLayout, type SpacingResult } from "../pump-spacing";
import type { DnContext } from "./dn-nodes";
import type { Values } from "./schema";

export const SPACING_OPERATIONS = ["spacing.layout", "spacing.rule", "spacing.geometry", "spacing.standardWidth", "spacing.clearance", "spacing.result"] as const;
export const SPACING_ORIENTATIONS = ["unspecified", "transverse_to_flow", "along_flow"];
export function pumpLayout(pump: Pump | undefined, contour: PumpLayout["contour"], installed: number, orientation = "transverse_to_flow"): PumpLayout {
  const evidence = pump?.spacingEvidence;
  const mm = pump?.dimensions?.overall_width;
  const width = typeof mm === "number" && Number.isFinite(mm) && mm > 0 ? { mm, source: pump?.drawingSource || pump?.source || "Габаритная ширина в закреплённом каталоге" } : undefined;
  return { pumpId: pump?.id ?? "", modelId: evidence?.modelId ?? "", snapshotId: pump?.spacingSnapshotId ?? "", powerKw: pump?.power ?? null, motorKey: evidence?.motorKey ?? "", contour, installed, orientation: SPACING_ORIENTATIONS.includes(orientation) ? orientation : "unspecified", links: evidence?.links ?? [], ...(width ? { width } : {}), ...(evidence?.geometry ? { geometry: evidence.geometry } : {}), ...(evidence?.reference ? { reference: evidence.reference } : {}), issues: evidence?.issues ?? ["Снимок каталога не содержит связей межосевых расстояний; обновление источника выполняется явно"] };
}
type Work = { layout: PumpLayout; applied?: AppliedBaseValues; result?: SpacingResult };
const f = (key: string, name: string, meaning: string, direction: Field["direction"] = "input", kind: Field["kind"] = "object", initial?: unknown): Field => ({ ...makeField(key, name, kind, meaning, "", direction), ...(initial === undefined ? {} : {initial}) });
export function spacingNodeTypes(): NodeType[] {
  const work = () => f("work", "Данные межосевого расстояния", "pumpSpacingWork");
  const result = () => f("value", "Результат стадии", "pumpSpacingWork", "output");
  return [
    { id: "spacing.layout", name: "Данные компоновки насосов", fields: [f("context", "Данные установки для DN", "dnContext"), f("secondary", "Второй контур", "flag", "input", "boolean", false), {...f("orientation", "Направление размещения соседних насосов", "text", "input", "enum", "transverse_to_flow"), options: SPACING_ORIENTATIONS, optionNames: {unspecified:"Не задано",transverse_to_flow:"Поперёк потока через насос",along_flow:"Вдоль потока через насос"}}, result()] },
    { id: "spacing.rule", name: "Поиск правила межосевого расстояния", fields: [work(), result()] },
    { id: "spacing.geometry", name: "Расчёт межосевого по габаритам", fields: [work(), result()] },
    { id: "spacing.standardWidth", name: "Стандартное межосевое по ширине насоса", fields: [work(), result()] },
    { id: "spacing.clearance", name: "Проверка зазора", fields: [work(), result()] },
    { id: "spacing.result", name: "Результат межосевого расстояния", fields: [work(), f("value", "Межосевое расстояние", "pumpSpacingResult", "output")] },
  ].map(t => ({ ...t, category: "Компоновка насосов", description: t.id === "spacing.standardWidth" ? "ceil((ширина насоса + 150 мм) / 50 мм) × 50 мм. Ширина из закреплённого каталога или связанного габаритного источника. Не зависит от прежних табличных правил и их минимального расстояния." : t.id === "spacing.geometry" ? "Выполняется только без применимого готового правила. Нужны полные подтверждённые вылеты в заданной ориентации и закреплённая политика." : "Использует подтверждённое исполнение и закреплённую версию правил; состояния и исходные данные доступны в инспекторе.", operation: t.id, formulas: {} }));
}
export function executeSpacingOperation(step: Step, values: Values): Values | undefined {
  if (step.operation === "spacing.layout") {
    const context = values.context as DnContext | undefined, secondary = values.secondary === true;
    if (!context || secondary && context.settings.stationType !== "combined" && !(context.settings.stationType === "fire" && context.settings.jockeyPump)) return { value: null };
    const input = secondary ? context.secondaryInput : context.input;
    return { value: { layout: pumpLayout(context.pumps.find(p => p.id === input.selectedPumpId), secondary ? "secondary" : "primary", (input.workingPumpCount ?? 0) + (input.reservePumpCount ?? 0), String(values.orientation ?? "transverse_to_flow")), applied: context.settings.baseValues } satisfies Work };
  }
  if (!(SPACING_OPERATIONS as readonly string[]).includes(step.operation ?? "")) return undefined;
  const w = values.work as Work | null;
  if (!w?.layout) return { value: null };
  if (step.operation === "spacing.rule") return { value: {...w, result: findSpacingRule(w.layout, w.applied)} };
  if (step.operation === "spacing.standardWidth") return { value: {...w, result: standardPumpSpacing(w.layout)} };
  if (!w.result) return { value: null };
  if (step.operation === "spacing.geometry") return { value: {...w, result: calculateSpacingFallback(w.result, w.applied)} };
  if (step.operation === "spacing.clearance") return { value: {...w, result: checkSpacingClearance(w.result)} };
  return { value: w.result };
}
