import { baseConfigurationIdentity, spacingForPump } from "./base-values";
import { stationCollectorInstrumentPorts, resolveStationCollectorInstrumentPorts } from "./station-hydraulic-ports";
import { separationEnabled } from "./hydraulic-option-config";
import type { DnEntity, InputEntity, ProjectConfig, SettingsEntity, SpecItem } from "./project-config";
import { normalizeSpecificationItems } from "./specification-items";
import { defaultCollectorMaterial, recommendedDn, resolveDnConnection, suctionHydraulics, dischargeHydraulics } from "./dn-defaults";
import { currentCollectorLengthRule, collectorCode, collectorStorageCode, collectorFlow, collectorPressureChecks, configurationFingerprint, configurationWarnings, collectorBranchDiameterErrors, positive, secondaryAllowed, type CollectorCalculation, type CollectorCatalog, type CollectorConfiguration, type CollectorType } from "./collector-calculations";
import { withInletPressureChecks } from "./suction-pressure";
import { pressureChecksEnabled, withoutPressureChecks } from "./pressure-check-policy";
import { collectorSpacingConfirmed } from "./collector-spacing";

export type CollectorOverrides = Partial<Pick<CollectorConfiguration, "dn" | "pn" | "material" | "connection">> & { primaryDn?: number; secondaryDn?: number; primaryConnection?: "threaded" | "flanged"; secondaryConnection?: "threaded" | "flanged"; secondaryPn?: number };
export type SavedCollector = { id: string; code: string; configuration: CollectorConfiguration; price: number; priceUpdatedAt: string; source: string; calculation: CollectorCalculation };
export type CollectorCardState = { dnSource?: DnEntity; sourceFingerprint?: string; calculationSourceFingerprint?: string; currentCatalogVersion?: string; overrides: CollectorOverrides; spacing1: number; spacing2: number; spacing1Manual?: boolean; spacing2Manual?: boolean; spacing1Confirmation?: string; spacing2Confirmation?: string; eccentric: boolean; recommended: CollectorConfiguration | null; configuration: CollectorConfiguration | null; code: string | null; calculation: CollectorCalculation | null; status: "uncalculated" | "complete" | "incomplete" | "stale"; database: SavedCollector | null; databaseStatus: "unchecked" | "found" | "missing" | "error"; databaseError?: string };
export type CollectorsEntity = { kind: "collectors"; suction: CollectorCardState; discharge: CollectorCardState };
export const emptyCollectorCard = (): CollectorCardState => ({ overrides: {}, spacing1: 500, spacing2: 400, eccentric: false, recommended: null, configuration: null, code: null, calculation: null, status: "uncalculated", database: null, databaseStatus: "unchecked" });
export const createCollectors = (): CollectorsEntity => ({ kind: "collectors", suction: emptyCollectorCard(), discharge: emptyCollectorCard() });
export function normalizeCollectors(raw: unknown): CollectorsEntity {
  const value = raw && typeof raw === "object" ? raw as Partial<CollectorsEntity> : {};
  const card = (raw: Partial<CollectorCardState> | undefined, type: CollectorType): CollectorCardState => {
    const overrides: CollectorOverrides = {};
    for (const key of ["dn", "primaryDn", "secondaryDn"] as const) if (positive(raw?.overrides?.[key])) overrides[key] = raw!.overrides![key];
    for (const key of ["pn", "secondaryPn"] as const) if ([10,16,25].includes(raw?.overrides?.[key] ?? 0)) overrides[key] = raw!.overrides![key];
    for (const key of ["connection", "primaryConnection", "secondaryConnection"] as const) if (["flanged","threaded"].includes(raw?.overrides?.[key] ?? "")) overrides[key] = raw!.overrides![key];
    if (raw?.overrides?.material === "st20" || raw?.overrides?.material === "aisi304") overrides.material = raw.overrides.material;
    const result = { ...emptyCollectorCard(), overrides, spacing1Manual: raw?.spacing1Manual ?? (positive(raw?.spacing1) && raw.spacing1 !== 500), spacing2Manual: raw?.spacing2Manual ?? (positive(raw?.spacing2) && raw.spacing2 !== 400), spacing1: positive(raw?.spacing1) ? raw.spacing1 : 500, spacing2: positive(raw?.spacing2) ? raw.spacing2 : 400, eccentric: type === "suction" && raw?.eccentric === true };
    for (const key of ["spacing1Confirmation", "spacing2Confirmation"] as const) if (typeof raw?.[key] === "string" && raw[key].length < 2000) result[key] = raw[key];
    // Cached results are only accepted with their full structure; database identity is rechecked after loading.
    const calc = raw?.calculation;
    if (calc && typeof calc.fingerprint === "string" && Array.isArray(calc.bom) && Array.isArray(calc.welds) && Array.isArray(calc.warnings) && calc.velocities && Array.isArray(calc.branchLengthsMm) && Number.isFinite(calc.subtotal)) {
      result.calculation = calc; result.status = "stale"; result.calculationSourceFingerprint = raw?.calculationSourceFingerprint;
    }
    return result;
  };
  return { kind: "collectors", suction: card(value.suction, "suction"), discharge: card(value.discharge, "discharge") };
}
export function collectorRecommendation(project: ProjectConfig, type: CollectorType): CollectorConfiguration {
  const dn = project.entities["station-dn"] as DnEntity, settings = project.entities["station-settings"] as SettingsEntity;
  const first = project.entities["system-input"] as InputEntity, second = project.entities["system-input-2"] as InputEntity;
  const circuit = (input: InputEntity, secondary: boolean) => {
    const selectedPumpId = input.selectedPumpId ?? (secondary ? project.station.secondaryPumpId : project.station.selectedPumpId);
    const spacingRule = spacingForPump(settings.baseValues?.values, selectedPumpId, secondary);
    const prefix = secondary ? "secondary" : "", branch = type === "suction" ? (secondary ? "secondarySuctionValveDn" : "suctionValveDn") : (secondary ? "secondaryDischargeValveDn" : "dischargeValveDn");
    const pumpDn = positive(input.flowRate) && positive(input.workingPumpCount) ? recommendedDn(input.flowRate / input.workingPumpCount, settings.baseValues?.values.velocity) : null;
    const suction = (type === "suction" ? suctionHydraulics : dischargeHydraulics)(dn,input,settings,secondary);
    const branchDn = suction && positive(input.flowRate) ? suction.dn : dn[branch] ?? pumpDn;
    const pair = secondary ? [dn.secondarySuctionValveDn, dn.secondaryDischargeValveDn] : [dn.suctionValveDn, dn.dischargeValveDn];
    const connection = suction?.connection ?? resolveDnConnection(settings, Math.max(...pair.map(v => v ?? pumpDn ?? 0)), secondary, secondary ? dn.secondaryConnectionType : dn.connectionType).connection;
    return { flow: input.flowRate, working: input.workingPumpCount, reserve: input.reservePumpCount, pumpId: selectedPumpId, pumpModel: input.selectedPumpModel ?? (input.selectedPumpId && input.selectedPumpId !== (prefix ? project.station.secondaryPumpId : project.station.selectedPumpId) ? undefined : prefix ? project.station.secondaryPumpModel : project.station.selectedPumpModel), dn: branchDn, connection, pn: (secondary ? dn.secondaryPn : dn.pn) ?? 16, spacing: spacingRule.spacing ?? 0, ...(settings.baseValues && !settings.baseValues.values.spacing.legacy ? { spacingBase:spacingRule.spacing, radius:spacingRule.radius, spacingStatus:spacingRule.status, spacingNote:spacingRule.message } : {}) } as CollectorConfiguration["primary"];
  };
  const base = { ...(settings.baseValues ? {baseVersions:settings.baseValues.versions,velocityRules:settings.baseValues.values.velocity} : {}), stationType: settings.stationType, jockey: settings.jockeyPump, simultaneous: settings.combinedCircuitsSimultaneous };
  const firstDn = type === "suction" ? dn.suctionCollectorDn : dn.dischargeCollectorDn;
  const secondDn = type === "suction" ? dn.secondarySuctionCollectorDn : dn.secondaryDischargeCollectorDn;
  const primary = circuit(first, false), secondary = secondaryAllowed(base) ? circuit(second, true) : null;
  const recommended1 = firstDn ?? (positive(first.flowRate) ? recommendedDn(first.flowRate, settings.baseValues?.values.velocity) : null), recommended2 = secondDn ?? (positive(second.flowRate) ? recommendedDn(second.flowRate, settings.baseValues?.values.velocity) : null);
  let networkDn = secondary && recommended1 && recommended2 ? Math.max(recommended1, recommended2) : recommended1;
  const configuration: CollectorConfiguration = { ...base, type, dn: networkDn, pn: Math.max(primary.pn, secondary?.pn ?? 0), material: dn.collectorMaterial ?? defaultCollectorMaterial(settings), connection: "flanged", eccentric: false, primary, secondary };
  if (type === "suction" && secondaryAllowed(base)) {
    // Per-circuit DN values do not size the common suction collector.
    // Its manual size is stored in the collector card's overrides.
    const { flow } = collectorFlow(configuration);
    networkDn = positive(flow) ? recommendedDn(flow, settings.baseValues?.values.velocity) : null;
  }
  configuration.dn=networkDn;
  configuration.instrumentPorts = stationCollectorInstrumentPorts(settings, type, configuration);
  if (separationEnabled(settings)) configuration.sectionBreaks = Math.max(0, [primary, secondary].reduce((sum, circuit) => sum + (circuit?.working ?? 0) + (circuit?.reserve ?? 0), 0) - 1);
  return { ...configuration, dn: networkDn, connection: resolveDnConnection(settings, networkDn, false, dn.connectionType).connection };
}
export function resolveCollector(recommended: CollectorConfiguration, state: CollectorCardState, settings?: SettingsEntity): CollectorConfiguration {
  const o = state.overrides;
  const result: CollectorConfiguration = { ...recommended, dn: o.dn ?? recommended.dn, pn: o.pn ?? recommended.pn, material: o.material ?? recommended.material, connection: o.connection ?? recommended.connection, eccentric: recommended.type === "suction" && state.eccentric,
    primary: { ...recommended.primary, dn: o.primaryDn ?? recommended.primary.dn, pn: o.pn ?? recommended.primary.pn, connection: o.primaryConnection ?? recommended.primary.connection, spacing: state.spacing1Manual ? state.spacing1 : recommended.primary.spacing, ...(state.spacing1Manual ? { spacingManual:true, spacingConfirmation:state.spacing1Confirmation } : {}) },
    secondary: recommended.secondary ? { ...recommended.secondary, dn: o.secondaryDn ?? recommended.secondary.dn, pn: o.secondaryPn ?? o.pn ?? recommended.secondary.pn, connection: o.secondaryConnection ?? recommended.secondary.connection, spacing: state.spacing2Manual ? state.spacing2 : recommended.secondary.spacing, ...(state.spacing2Manual ? { spacingManual:true, spacingConfirmation:state.spacing2Confirmation } : {}) } : null };
  if ((result.dn ?? 0) > 50) result.connection = "flanged";
  for (const circuit of [result.primary, result.secondary]) if (circuit && (circuit.dn ?? 0) > 50) circuit.connection = "flanged";
  if(settings){const resolved=resolveStationCollectorInstrumentPorts(settings,result.type,result);result.instrumentPorts=resolved.ports;if(resolved.error)result.instrumentRuleIssue=resolved.error;else delete result.instrumentRuleIssue;}
  return result;
}
export function syncCollectorSpec(items: SpecItem[], collectors: CollectorsEntity, inletHead?: number | null, catalog?: CollectorCatalog, checkPressure = true): SpecItem[] {
  let result = checkPressure ? [...items] : items.map(withoutPressureChecks);
  for (const type of ["suction", "discharge"] as const) {
    const state = collectors[type], option = type === "suction" ? "suctionCollector" : "dischargeCollector", legacy = type === "suction" ? "Коллектор подводящий" : "Коллектор напорный";
    const isItem = (item: SpecItem) => item.option === option;
    const previous = result.find(isItem), saved = state.databaseStatus === "found" && state.database?.code === state.code && currentCollectorLengthRule(state.database.calculation) ? state.database : null;
    const calculated = state.code && state.status === "complete" && state.calculation?.code === state.code ? state.calculation : null;
    const description = saved ? "Есть в базе · выбрано" : calculated ? "Требует подтверждения — сохраните коллектор в базе" : state.status === "stale" ? "Расчёт устарел — выполните расчёт в конструкторе" : "Коллектор отсутствует в базе — выполните расчёт в конструкторе";
    result = result.filter(item => !isItem(item));
    const row: SpecItem = { ...previous, technicalStatus: saved ? "ready" : state.status === "stale" ? "stale" : "unverified", technicalNotes: [], inletPressureCheck: undefined, dischargePressureCheck: undefined, position: type === "suction" ? "03.01" : "04.02", name: legacy, section: type, option, quantity: 1, unit: "шт.", equipmentId: saved?.id, details: state.code ?? "Не заданы параметры коллектора", price: saved?.price ?? calculated?.price ?? null, description, status: saved ? "selected" : calculated ? "confirmation" : "clarify" };
    result.push(checkPressure && type === "suction" && state.configuration ? withInletPressureChecks(row, collectorPressureChecks(state.configuration, inletHead, catalog)) : row);
  }
  return normalizeSpecificationItems(result);
}
/** Insertion designs size the pump lines, not the collector. Normalize saved
 * fingerprints too so older projects recover without approving other changes. */
function collectorSourceFingerprint(value: string | undefined): string | undefined {
  if (!value) return value;
  try {
    const parts = JSON.parse(value);
    if (!Array.isArray(parts) || parts.length !== 4 || !parts[1] || typeof parts[1] !== "object" || Array.isArray(parts[1])) return value;
    parts[0] = baseConfigurationIdentity(parts[0]);
    parts[1] = Object.fromEntries(Object.entries(parts[1]).filter(([key]) => key !== "insertionDesigns"));
    const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : v;
    return JSON.stringify(canonical(parts));
  } catch { return value; }
}
export function synchronizeCollectors(project: ProjectConfig, catalog?: CollectorCatalog): ProjectConfig {
  const previous = (project.entities["station-collectors"] as CollectorsEntity | undefined) ?? createCollectors();
  const collectors = { ...previous };
  for (const type of ["suction", "discharge"] as const) {
    const state = previous[type], recommended = collectorRecommendation(project, type), configuration = resolveCollector(recommended, state, project.entities["station-settings"] as SettingsEntity), code = collectorCode(configuration);
    const calculation=state.calculation&&state.calculation.code!==code&&state.calculation.code===collectorStorageCode(configuration)&&state.calculation.fingerprint===configurationFingerprint(configuration)?{...state.calculation,code}:state.calculation;
    const sourceFingerprint = collectorSourceFingerprint(JSON.stringify([recommended, project.entities["station-dn"], project.entities["system-input"], configuration.secondary ? project.entities["system-input-2"] : null]));
    const calculationSourceFingerprint = collectorSourceFingerprint(state.calculationSourceFingerprint);
    const sourceChanged = state.sourceFingerprint && collectorSourceFingerprint(state.sourceFingerprint) !== sourceFingerprint;
    const changed = state.configuration && configurationFingerprint(configuration) !== configurationFingerprint(state.configuration);
    const stale = (state.database && !currentCollectorLengthRule(state.database.calculation)) || state.calculation && (!currentCollectorLengthRule(state.calculation) || state.calculation.flow !== collectorFlow(configuration).flow || state.calculation.fingerprint !== configurationFingerprint(configuration) || calculationSourceFingerprint !== sourceFingerprint || (state.currentCatalogVersion && state.calculation.catalogVersion !== state.currentCatalogVersion));
    const configurationErrors = [...configurationWarnings(configuration), ...collectorBranchDiameterErrors(configuration, catalog)];
    collectors[type] = { ...state, calculation, ...(recommended.baseVersions?{spacing1Manual:state.spacing1Manual??false,spacing2Manual:state.spacing2Manual??false}:{}), spacing1Confirmation:collectorSpacingConfirmed(configuration,0)?state.spacing1Confirmation:undefined, spacing2Confirmation:collectorSpacingConfirmed(configuration,1)?state.spacing2Confirmation:undefined, spacing1:configuration.primary.spacing, spacing2:configuration.secondary?.spacing ?? state.spacing2, dnSource: project.entities["station-dn"] as DnEntity, sourceFingerprint, calculationSourceFingerprint, recommended, configuration, code,
      status: configurationErrors.length ? "incomplete" : stale ? "stale" : state.calculation ? state.calculation.complete ? "complete" : "incomplete" : "uncalculated",
      ...(configurationErrors.length || changed || sourceChanged || state.code !== code ? { database: null, databaseStatus: "unchecked" as const, databaseError: undefined } : {}) };
  }
  const spec = project.entities["station-spec"];
  return { ...project, entities: { ...project.entities, "station-collectors": collectors, ...(spec?.kind === "spec" ? { "station-spec": { ...spec, items: syncCollectorSpec(spec.items, collectors, (project.entities["station-settings"] as SettingsEntity).inletHead, catalog, pressureChecksEnabled(project.entities["station-settings"] as SettingsEntity)) } } : {}) } };
}
