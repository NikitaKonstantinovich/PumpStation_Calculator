import { assistantProjectSnapshot } from "../assistant-project";
import { specificationTechnicalStatus } from "../specification-readiness";
import type { CatalogItem } from "./catalog-schema";
import type { Evaluation, ToolProgram, Values, View, WorkspaceData } from "./schema";
import type { CatalogSource } from "./workspace-sources";
import { toolSourceDependencies } from "./workspace-sources";

export type NodeAssistantReader = (signal: AbortSignal) => Promise<ReturnType<typeof assistantProjectSnapshot> | undefined>;
const record = (raw: unknown): Values => raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Values : {};

function* visibleViews(view: View): Generator<View> {
  if (view.visible === false) return;
  yield view;
  for (const child of view.children ?? []) yield* visibleViews(child);
}

export function directProductInputs(program: ToolProgram, id: string) {
  const steps = program.plans[id]?.steps ?? [];
  const owners = new Set(steps.filter(step => step.id.startsWith(id + "/")).flatMap(step => step.links ?? [])
    .map(link => link.from.split("/")[0]));
  return program.tools.filter(tool => tool.id !== id && owners.has(tool.id)).map(({ id, name }) => ({ id, name }));
}

export function nodeAssistantProject({ program, name, data, evaluate, available, pendingInput, isAvailable }: {
  program: ToolProgram;
  name: string;
  data: WorkspaceData;
  evaluate: (id: string) => Evaluation;
  available: ReadonlySet<CatalogSource>;
  pendingInput: boolean;
  isAvailable: (id: string) => boolean;
}) {
  const tools = [], fields = [], issues = [];
  let dn: View["dn"], collector: View["collector"], spec: View["specification"];
  let settings: Values = {};
  const inputs: Record<"main" | "secondary", Values | null> = { main: null, secondary: null };
  for (const tool of program.tools.filter(tool => tool.enabled !== false && tool.workspaceVisible !== false)) {
    const id = tool.id;
    const sources = directProductInputs(program, id).map(source => source.name).join(" · ");
    if (toolSourceDependencies(program, id).some(source => !available.has(source))) {
      tools.push({ id, name: tool.name, status: "Источники не загружены", sources });
      continue;
    }
    try {
      if (!isAvailable(id)) {
        tools.push({ id, name: tool.name, status: "Не используется", sources });
        continue;
      }
      const result = evaluate(id);
      tools.push({ id, name: tool.name, status: result.issues.length ? "Есть замечания" : "Доступен", sources });
      for (const issue of result.issues) issues.push({ tool: id, subject: tool.name, severity: issue.severity, message: issue.message });
      for (const binding of result.bindings) {
        if ((binding.toolId && binding.toolId !== id) || !binding.active) continue;
        const { value } = binding;
        if (value == null || typeof value === "number" || typeof value === "boolean" || binding.field.kind === "enum") fields.push({ tool: id, key: binding.key, name: binding.field.name, unit: binding.field.unit, value, origin: binding.origin });
      }
      for (const view of visibleViews(result.view)) {
        dn ??= view.dn;
        collector ??= view.collector;
        spec ??= view.specification;
      }
      const steps = program.plans[id]?.steps.filter(step => step.id.startsWith(id + "/")) ?? [];
      const request = steps.find(step => step.operation === "pump.request");
      if (!request) continue;
      const trace = result.trace[request.id];
      const contour = trace?.inputs.contour === "secondary" ? "secondary" : "main";
      const selection = steps.find(step => step.operation === "pump.select");
      const selected = selection && result.trace[selection.id]?.outputs;
      const item = selected?.valid === true ? selected.value as CatalogItem | null : null;
      settings = record(trace?.inputs.settings);
      inputs[contour] = { ...record(settings[contour]), ...record(trace?.outputs.value),
        selectedPumpId: item?.variantId, selectedPumpModel: item?.pump.model, calculated: trace?.outputs.valid === true };
    } catch {
      tools.push({ id, name: tool.name, status: "Результат недоступен", sources });
    }
  }
  const currentSettings = dn?.context.settings;
  return assistantProjectSnapshot({
    product: { algorithmId: program.algorithmId, version: program.version, name, sourceVersions: data.product?.sourceVersions, tools, fields, pendingInput },
    versions: data.product?.baseVersions,
    primaryInput: dn?.context.input ?? inputs.main,
    secondaryInput: dn?.secondary ? dn.context.secondaryInput : inputs.secondary,
    settings: currentSettings ?? settings,
    dn: { ...dn?.context.effectiveEntity, ...dn?.primary?.values, ...dn?.secondary?.values },
    hydraulics: { primarySuction: dn?.primary?.suction, primaryDischarge: dn?.primary?.discharge,
      secondarySuction: dn?.secondary?.suction, secondaryDischarge: dn?.secondary?.discharge },
    spacing: dn?.spacing,
    collectors: collector?.result.entity,
    specification: spec ? { ...spec.readiness, status: spec.status, message: spec.message,
      items: spec.items.map(item => ({ ...item, technicalStatus: specificationTechnicalStatus(item) })) } : undefined,
    issues: [...new Map(issues.map(issue => [issue.message, issue])).values()].sort((a, b) => Number(b.severity === "error") - Number(a.severity === "error")),
  });
}
