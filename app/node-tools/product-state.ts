import { toolAvailable } from "./workspace-controls";
import { algorithmForProject, DEFAULT_ALGORITHM } from "./algorithm-schema";
import { accepts } from "../engineering/schema";
import { evaluateProduct } from "./runtime";
import type { Evaluation, ProductControls, ToolContext, ToolProgram, Values, WorkspaceData } from "./schema";
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
export function migrateProduct(program: ToolProgram, previous: WorkspaceData | undefined, defaults: Values, baseVersions: Record<string, string>, role: UserRole, resources?: ToolContext["resources"], sourceVersions: Record<string, string> = {}, projectControls: Partial<Record<keyof ProductControls, boolean>> = {}) {
  if(previous && algorithmForProject(previous)!==(program.algorithmId??DEFAULT_ALGORITHM))throw Error("Нельзя переносить значения между независимыми продуктами");
  const messages: string[] = [],
    tools = {
      ...previous?.tools
    },
    contexts = productContexts(program, previous, defaults, role, resources);
  // Only an explicit version application imports legacy project flags. A value
  // already stored by the node instrument, including false, always wins.
  for (const [kind, ref] of Object.entries(program.product?.controls ?? {})) {
    const value=projectControls[kind as keyof ProductControls];
    const key=program.plans[ref.toolId]?.steps.find(step=>step.id===ref.node)?.parameter?.key;
    const context=contexts[ref.toolId];
    if(typeof value==="boolean" && key && context && !Object.hasOwn(context.values,key)) {
      contexts[ref.toolId]={...context,values:{...context.values,[key]:value}};
    }
  }
  const oldVersions = new Set(Object.values(previous?.tools ?? {}).map(t => t.version));
  if (oldVersions.size > 1) messages.push("Прежние инструменты использовали разные версии. Явно применяется единая выбранная публикация продукта; предыдущие версии остаются в истории.");
  for (const t of program.tools.filter(t => t.enabled !== false)) {
    const result = evaluateProduct(program, t.id, contexts),
      values: Values = {},
      before = contexts[t.id].values,
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
    data: invalidateInactiveSelections(program, {
      schema: 1 as const,
      algorithmId: program.algorithmId,
      tools,
      product: {
        version: program.version, algorithmId: program.algorithmId,
        baseVersions,
        sourceVersions
      }
    }, defaults, role, resources),
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
    const suspended = plan.steps.some(s => s.id.startsWith(toolId + "/") && s.operation === "circuit.guard" && result.trace[s.id]?.inputs.active === false);
    const revoked = suspended && JSON.stringify(suspendedProof(prior?.[b.key])) === JSON.stringify(values[b.key]);
    if (!valid && !revoked && JSON.stringify(prior?.[b.key]) !== JSON.stringify(values[b.key])) errors.push("Выбранное исполнение не подтверждено текущими условиями и снимком каталога · " + b.field.name);
  }
  return errors;
}

/** Disable invalidates only the proof; filters and all other values remain intact. */
export function suspendedProof(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const proof = value as Values;
  return typeof proof.requestKey === "string" && !proof.requestKey.startsWith("inactive:") ? { ...proof, requestKey: "inactive:" + proof.requestKey } : value;
}
export function invalidateInactiveContexts(program: ToolProgram, contexts: Record<string, ToolContext>): Record<string, ToolContext> {
  let next = contexts;
  for (const tool of program.tools) {
    const plan = program.plans[tool.id];
    if (!plan?.steps.some(s => s.id.startsWith(tool.id + "/") && s.operation === "circuit.guard")) continue;
    let result: Evaluation;
    try { if(toolAvailable(program,tool.id,contexts))continue; result = evaluateProduct(program, tool.id, contexts); } catch { continue; }
    if (!plan.steps.some(s => s.id.startsWith(tool.id + "/") && s.operation === "circuit.guard" && result.trace[s.id]?.inputs.active === false)) continue;
    for (const b of ownBindings(result, tool.id)) {
      if (b.field.meaning !== "pumpSelectionProof") continue;
      const old = next[tool.id]?.values[b.key], value = suspendedProof(old);
      if (value !== old) next = { ...next, [tool.id]: { ...next[tool.id], values: { ...next[tool.id].values, [b.key]: value } } };
    }
  }
  return next;
}
export function invalidateInactiveSelections(program: ToolProgram, data: WorkspaceData, defaults: Values, role: UserRole, resources?: ToolContext["resources"]): WorkspaceData {
  const before = productContexts(program, data, defaults, role, resources), after = invalidateInactiveContexts(program, before);
  if (after === before) return data;
  return { ...data, tools: Object.fromEntries(Object.entries(data.tools).map(([id, saved]) => [id, after[id] && after[id] !== before[id] ? { ...saved, values: after[id].values } : saved])) };
}
