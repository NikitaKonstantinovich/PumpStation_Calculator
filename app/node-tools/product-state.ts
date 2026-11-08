import { accepts } from "../engineering/schema";
import { evaluateProduct } from "./runtime";
import type { Evaluation, ToolContext, ToolProgram, Values, WorkspaceData } from "./schema";
import type { UserRole } from "../user-types";
export const usesCatalog = (program: ToolProgram) => Object.values(program.plans).some(plan => plan.steps.some(step => step.operation === "pump.catalog"));
export const ownBindings = (result: Evaluation, id: string) => result.bindings.filter(b => !b.toolId || b.toolId === id);
export function productContexts(program: ToolProgram, data: WorkspaceData | undefined, defaults: Values, role: UserRole, resources?: ToolContext["resources"]): Record<string, ToolContext> {
  return Object.fromEntries(program.tools.map(t => [t.id, {
    values: data?.tools[t.id]?.values ?? {},
    stored: data?.tools[t.id]?.values,
    defaults,
    role,
    resources,
    algorithmVersion: program.version
  }]));
}
export function migrateProduct(program: ToolProgram, previous: WorkspaceData | undefined, defaults: Values, baseVersions: Record<string, string>, role: UserRole, resources?: ToolContext["resources"], sourceVersions: Record<string, string> = {}) {
  const messages: string[] = [],
    tools = {
      ...previous?.tools
    },
    contexts = productContexts(program, previous, defaults, role, resources);
  const oldVersions = new Set(Object.values(previous?.tools ?? {}).map(t => t.version));
  if (oldVersions.size > 1) messages.push("Прежние инструменты использовали разные версии. Явно применяется единая выбранная публикация продукта; предыдущие версии остаются в истории.");
  for (const t of program.tools.filter(t => t.enabled !== false)) {
    const result = evaluateProduct(program, t.id, contexts),
      values: Values = {},
      before = previous?.tools[t.id]?.values ?? {},
      bindings = ownBindings(result, t.id);
    for (const b of bindings) {
      if (!Object.hasOwn(before, b.key)) continue;
      if ((b.mode ?? "user") !== "user") {
        messages.push(t.name + " · " + b.field.name + " · прежнее введённое значение сохранено в истории; действует " + b.origin);
        continue;
      }
      if (accepts({
        ...b.field,
        required: false
      }, before[b.key])) values[b.key] = before[b.key];else messages.push(t.name + " · " + b.field.name + " · требуется совместимое значение");
    }
    for (const key of Object.keys(before)) if (!bindings.some(b => b.key === key)) messages.push(t.name + " · удалённый параметр " + key + " доступен в истории");
    for (const b of bindings) if (b.field.meaning === "pumpSelectionProof" && values[b.key]) messages.push(t.name + " · выбранный насос проверяется повторно по новой версии алгоритма и каталога");
    tools[t.id] = {
      version: program.version,
      values,
      baseVersions,
      sourceVersions
    };
  }
  const inactive = Object.keys(previous?.tools ?? {}).filter(id => !program.tools.some(t => t.id === id && t.enabled !== false));
  if (inactive.length) messages.push("Состояние отключённых или удалённых инструментов сохранено в архиве проекта · " + inactive.join(", "));
  return {
    data: {
      schema: 1 as const,
      tools,
      product: {
        version: program.version,
        baseVersions,
        sourceVersions
      }
    },
    messages
  };
}

/** A retained old proof may remain visible as stale; a newly forged choice cannot be saved. */
export function invalidSelections(result: Evaluation, toolId: string, values: Values, prior: Values | undefined, plan: ToolProgram["plans"][string]): string[] {
  const errors: string[] = [];
  for (const b of ownBindings(result, toolId)) {
    if (b.field.meaning !== "pumpSelectionProof" || values[b.key] == null) continue;
    const proof = values[b.key] as Values;
    const proofKeys = Object.keys(proof).sort().join(",");
    if (proofKeys !== "requestKey,snapshotId,variantId") {
      errors.push("Некорректный контракт подтверждения выбора · " + b.field.name);
      continue;
    }
    const valid = plan.steps.filter(step => step.operation === "pump.select").some(step => {
      const trace = result.trace[step.id],
        bound = trace?.inputs.binding as import("./schema").ParameterBinding | undefined,
        s = trace?.outputs.selection as Values | undefined;
      return bound?.node === b.node && bound.key === b.key && s?.valid === true && s.bindingKey === b.key && s.variantId === proof.variantId && s.snapshotId === proof.snapshotId && s.requestKey === proof.requestKey;
    });
    if (!valid && JSON.stringify(prior?.[b.key]) !== JSON.stringify(values[b.key])) errors.push("Выбранное исполнение не подтверждено текущими условиями и снимком каталога · " + b.field.name);
  }
  return errors;
}
