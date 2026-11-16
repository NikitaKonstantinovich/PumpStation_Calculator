import type { Step } from "../engineering/engine";
import { withEvaluationProgram } from "../engineering/runtime";
import { coreCalculateCollector, collectorCode, collectorFlow, configurationFingerprint, configurationWarnings, collectorBranchDiameterErrors, currentCollectorLengthRule, matchesCollectorConfiguration, type CollectorCatalog } from "../collector-calculations";
import { coreCollectorRecommendation, coreResolveCollector, createCollectors, normalizeCollectors, syncCollectorSpec, type CollectorCardState, type CollectorsEntity } from "../collector-project";
import { collectorSpacingConfirmed } from "../collector-spacing";
import { baseConfigurationIdentity } from "../base-values";
import { collectorInstrumentPortIdentity } from "../hydraulic-port-ledger";
import { pressureChecksEnabled } from "../pressure-check-policy";
import type { DnEntity, ProjectConfig, SettingsEntity } from "../project-config";
import type { CollectorConfiguration } from "../collector-calculations";
import type { Pump } from "../pump-catalog";
import { canEditAllSettings } from "../user-types";
import type { Diagnostic, ParameterBinding, ToolContext, Values } from "./schema";
import type { CollectorAction, CollectorCalculations, CollectorCommands, CollectorNodeResult, CollectorRecommendations, CollectorViewData } from "./collector-nodes";

const primitiveProgram = { version: "node-collector-primitives", plans: {}, args: {} };
const pure = <T,>(run: () => T): T => withEvaluationProgram(primitiveProgram, run);
const types = ["suction", "discharge"] as const;
const object = (value: unknown): Values => value && typeof value === "object" && !Array.isArray(value) ? value as Values : {};
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const issue = (step: Step, message: string, key = ""): Diagnostic => ({ key, node: step.id, message, severity: "warning" });
const empty = (issues: Diagnostic[] = []): CollectorNodeResult => ({ project: null, pumps: [], entity: createCollectors(), catalog: null, issues });
const canonical = (value: unknown): string => JSON.stringify(value, (_key, child) => child && typeof child === "object" && !Array.isArray(child) ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b))) : child);
const physicalIdentity = (c: CollectorConfiguration): string => canonical({ type: c.type, sectionBreaks: c.sectionBreaks ?? 0, dn: c.dn, pn: c.pn, material: c.material, connection: c.connection, eccentric: c.eccentric, circuits: [c.primary, c.secondary].filter(Boolean).map(v => ({ dn: v!.dn, pn: v!.pn, connection: v!.connection, spacing: v!.spacing, count: (v!.working ?? 0) + (v!.reserve ?? 0) })), ports: c.instrumentPorts === undefined ? "legacy" : collectorInstrumentPortIdentity(c.instrumentPorts) });
function source(value: unknown): { project: ProjectConfig; pumps: Pump[]; issues: Diagnostic[]; spacing?: import("./dn-nodes").DnResult["spacing"] } | null {
  const v = object(value), project = v.project as ProjectConfig | undefined;
  if (v.context && object(v.context).status !== "ready") return null;
  if (!project?.entities || !project.station || !project.entities["station-settings"] || !project.entities["station-dn"] || !project.entities["system-input"] || !project.entities["system-input-2"]) return null;
  return { project, pumps: Array.isArray(v.pumps) ? v.pumps as Pump[] : [], issues: Array.isArray(v.issues) ? v.issues as Diagnostic[] : [], spacing: v.spacing as import("./dn-nodes").DnResult["spacing"] };
}
function catalog(value: unknown): CollectorCatalog | null {
  const c = value as CollectorCatalog | null;
  return typeof c?.version === "string" && Array.isArray(c.components) && Array.isArray(c.bolts) ? c : null;
}
/** Only the state of this graph parameter is accepted. No Workspace 1 entity is read. */
function state(value: unknown): CollectorsEntity {
  const raw = object(value), normalized = normalizeCollectors(raw);
  for (const type of types) {
    const card = object(raw[type]) as Partial<CollectorCardState>, next = normalized[type];
    const overrides = object(card.overrides);
    for (const key of ["dn", "primaryDn", "secondaryDn"] as const) if (finite(overrides[key])) next.overrides[key] = overrides[key];
    for (const key of ["spacing1", "spacing2"] as const) if (finite(card[key])) next[key] = card[key];
    if (typeof card.sourceFingerprint === "string") next.sourceFingerprint = card.sourceFingerprint;
    if (card.configuration && typeof card.configuration === "object") next.configuration = card.configuration;
    if (typeof card.code === "string") next.code = card.code;
    if (typeof card.currentCatalogVersion === "string") next.currentCatalogVersion = card.currentCatalogVersion;
    if (card.databaseStatus === "missing" || card.databaseStatus === "error") next.databaseStatus = card.databaseStatus;
    if (typeof card.databaseError === "string") next.databaseError = card.databaseError;
    const saved = card.database;
    if (card.databaseStatus === "found" && saved && typeof saved.id === "string" && typeof saved.code === "string" && finite(saved.price) && saved.price > 0 && saved.configuration && saved.calculation && Array.isArray(saved.calculation.bom) && Array.isArray(saved.calculation.warnings)) {
      next.database = saved; next.databaseStatus = "found";
    }
  }
  return normalized;
}
function recommendations(step: Step, value: unknown): CollectorRecommendations {
  const dn = source(value);
  if (!dn) return { project: null, pumps: [], recommendations: null, issues: [issue(step, "Подключите результат инструмента «Расчёт DN»")] };
  return { ...dn, recommendations: { suction: coreCollectorRecommendation(dn.project, "suction", dn.pumps, dn.spacing), discharge: coreCollectorRecommendation(dn.project, "discharge", dn.pumps, dn.spacing) } };
}
function resolve(step: Step, values: Values): CollectorNodeResult {
  const r = values.recommendations as CollectorRecommendations | null;
  if (!r?.project || !r.recommendations) return empty(r?.issues ?? [issue(step, "Подключите рекомендации коллекторов")]);
  const currentCatalog = catalog(values.catalog), entity = state(values.state), settings = r.project.entities["station-settings"] as SettingsEntity;
  const issues = [...r.issues];
  if (!currentCatalog) issues.push(issue(step, "Подключите каталог комплектующих коллекторов"));
  for (const type of types) {
    const previous = entity[type], recommended = r.recommendations[type], configuration = coreResolveCollector(recommended, previous, settings), code = collectorCode(configuration);
    const sourceDn = Object.fromEntries(Object.entries(r.project.entities["station-dn"]).filter(([key]) => key !== "insertionDesigns"));
    const sourceFingerprint = canonical([baseConfigurationIdentity(recommended), sourceDn, r.project.entities["system-input"], configuration.secondary ? r.project.entities["system-input-2"] : null]);
    const changed = previous.configuration && configurationFingerprint(previous.configuration) !== configurationFingerprint(configuration);
    const sourceChanged = previous.sourceFingerprint && previous.sourceFingerprint !== sourceFingerprint;
    const calculation = previous.calculation;
    const errors = [...new Set([...configurationWarnings(configuration), ...collectorBranchDiameterErrors(configuration, currentCatalog)])];
    const saved = previous.database;
    const databaseValid = saved && saved.code === code && physicalIdentity(saved.configuration) === physicalIdentity(configuration) && currentCollectorLengthRule(saved.calculation) && saved.calculation.complete;
    const databaseCurrent = databaseValid && matchesCollectorConfiguration(configurationFingerprint(saved.configuration), configuration) && matchesCollectorConfiguration(saved.calculation.fingerprint, configuration) && currentCatalog && saved.calculation.catalogVersion === currentCatalog.version;
    const stale = Boolean(calculation && (!currentCollectorLengthRule(calculation) || calculation.flow !== collectorFlow(configuration).flow || !matchesCollectorConfiguration(calculation.fingerprint, configuration) || previous.calculationSourceFingerprint !== sourceFingerprint || currentCatalog && calculation.catalogVersion !== currentCatalog.version) || databaseValid && !databaseCurrent);
    entity[type] = { ...previous, recommended, configuration, code, sourceFingerprint, dnSource: r.project.entities["station-dn"] as DnEntity,
      currentCatalogVersion: currentCatalog?.version,
      spacing1: configuration.primary.spacing, spacing2: configuration.secondary?.spacing ?? previous.spacing2,
      spacing1Confirmation: collectorSpacingConfirmed(configuration, 0) ? previous.spacing1Confirmation : undefined,
      spacing2Confirmation: collectorSpacingConfirmed(configuration, 1) ? previous.spacing2Confirmation : undefined,
      status: errors.length ? "incomplete" : stale ? "stale" : calculation ? calculation.complete ? "complete" : "incomplete" : "uncalculated",
      ...((errors.length || changed || sourceChanged || previous.code !== code || saved && !databaseValid) ? { database: null, databaseStatus: "unchecked" as const, databaseError: undefined } : {}),
    };
    issues.push(...errors.map(message => issue(step, `${type === "suction" ? "Всасывающий" : "Напорный"} коллектор · ${message}`, type)));
    if (stale) issues.push(issue(step, `${type === "suction" ? "Всасывающий" : "Напорный"} коллектор · расчёт устарел`, type));
  }
  return { project: { ...r.project, entities: { ...r.project.entities, "station-collectors": entity } }, pumps: r.pumps, entity, catalog: currentCatalog, issues };
}
function calculations(value: unknown): CollectorCalculations {
  const r = value as CollectorNodeResult | null;
  return Object.fromEntries(types.map(type => [type, r?.catalog && r.entity[type].configuration ? coreCalculateCollector(r.entity[type].configuration, r.catalog) : null])) as CollectorCalculations;
}
export function executeCollectorOperation(step: Step, v: Values, context: ToolContext): Values | undefined {
  return pure(() => {
    switch (step.operation) {
      case "collector.recommend": { const result = recommendations(step, v.dn); return { recommendations: result, issues: result.issues }; }
      case "collector.resolve": { const resolved = resolve(step, v); return { resolved, issues: resolved.issues }; }
      case "collector.calculate": {
        const result = calculations(v.resolved);
        return { calculations: result, issues: types.flatMap(type => result[type]?.warnings.map(message => issue(step, `${type === "suction" ? "Всасывающий" : "Напорный"} коллектор · ${message}`, type)) ?? []) };
      }
      case "collector.result": {
        const resolved = v.resolved as CollectorNodeResult | null;
        if (!resolved?.project) { const result = resolved ?? empty([issue(step, "Подключите настроенные коллекторы")]); return { result, issues: result.issues }; }
        const preview = v.calculations as CollectorCalculations | undefined;
        const issues = [...resolved.issues];
        const entity = { ...resolved.entity };
        for (const type of types) {
          const c = entity[type], p = preview?.[type];
          if (!p || !c.configuration || !matchesCollectorConfiguration(p.fingerprint, c.configuration) || p.catalogVersion !== resolved.catalog?.version || c.status === "stale") {
            entity[type] = { ...c, status: c.calculation ? "stale" : "incomplete", database: null, databaseStatus: "unchecked" };
            issues.push(issue(step, "Подключите актуальный расчёт состава и стоимости коллекторов", type));
          } else if (c.calculation) {
            // Cached arithmetic is not authoritative: only this node's current calculation is exported.
            entity[type] = { ...c, calculation: p, status: p.complete ? "complete" : "incomplete" };
          }
        }
        const settings = resolved.project.entities["station-settings"] as SettingsEntity, spec = resolved.project.entities["station-spec"];
        const project = { ...resolved.project, entities: { ...resolved.project.entities, "station-collectors": entity, ...(spec?.kind === "spec" ? { "station-spec": { ...spec, items: syncCollectorSpec(spec.items, entity, settings.inletHead, resolved.catalog ?? undefined, pressureChecksEnabled(settings)) } } : {}) } };
        const result: CollectorNodeResult = { ...resolved, project, entity, issues };
        return { result, issues };
      }
      case "collector.databaseActions": return { commands: { kind: "collector-database", actions: (["calculate", "lookup", "create", "refresh"] as CollectorAction[]).filter(action => v[action] === true) } satisfies CollectorCommands };
      case "ui.collectorConstructor": {
        const result = v.resolved as CollectorNodeResult | undefined ?? empty([issue(step, "Подключите настроенные коллекторы")]);
        const declared = v.commands as CollectorCommands | undefined;
        const data: CollectorViewData = { result, calculations: v.calculations as CollectorCalculations | undefined ?? { suction: null, discharge: null }, commands: declared?.kind === "collector-database" ? declared : { kind: "collector-database", actions: [] }, stateBinding: v.stateBinding as ParameterBinding | undefined, canCustomize: canEditAllSettings(context.role) };
        return { value: { kind: "collector-constructor", node: step.id, label: "Конструктор коллекторов", collector: data } };
      }
      default: return undefined;
    }
  });
}
