import type { DnEntity, InputEntity, ProjectConfig, SettingsEntity, SpecItem } from "./project-config";
import { defaultCollectorMaterial, recommendedDn } from "./dn-defaults";
import { collectorCode, configurationFingerprint, positive, secondaryAllowed, type CollectorCalculation, type CollectorConfiguration, type CollectorType } from "./collector-calculations";

export type CollectorOverrides = Partial<Pick<CollectorConfiguration, "dn" | "pn" | "material" | "connection">> & { primaryDn?: number; secondaryDn?: number; primaryConnection?: "threaded" | "flanged"; secondaryConnection?: "threaded" | "flanged"; secondaryPn?: number };
export type SavedCollector = { id: string; code: string; configuration: CollectorConfiguration; price: number; priceUpdatedAt: string; source: string; calculation: CollectorCalculation };
export type CollectorCardState = { dnSource?: DnEntity; sourceFingerprint?: string; calculationSourceFingerprint?: string; currentCatalogVersion?: string; overrides: CollectorOverrides; spacing1: number; spacing2: number; eccentric: boolean; recommended: CollectorConfiguration | null; configuration: CollectorConfiguration | null; code: string | null; calculation: CollectorCalculation | null; status: "uncalculated" | "complete" | "incomplete" | "stale"; database: SavedCollector | null; databaseStatus: "unchecked" | "found" | "missing" | "error"; databaseError?: string };
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
    const result = { ...emptyCollectorCard(), overrides, spacing1: positive(raw?.spacing1) ? raw.spacing1 : 500, spacing2: positive(raw?.spacing2) ? raw.spacing2 : 400, eccentric: type === "suction" && raw?.eccentric === true };
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
    const prefix = secondary ? "secondary" : "", branch = type === "suction" ? (secondary ? "secondarySuctionValveDn" : "suctionValveDn") : (secondary ? "secondaryDischargeValveDn" : "dischargeValveDn");
    const branchDn = dn[branch] ?? (positive(input.flowRate) && positive(input.workingPumpCount) ? recommendedDn(input.flowRate / input.workingPumpCount) : null);
    const pair = secondary ? [dn.secondarySuctionValveDn, dn.secondaryDischargeValveDn] : [dn.suctionValveDn, dn.dischargeValveDn];
    const forced = settings.stationType === "combined" || (settings.stationType === "fire" && !secondary);
    const connection = forced || Math.max(branchDn ?? 0, ...pair.map(v => v ?? branchDn ?? 0)) > 50 || (settings.stationType !== "utility" && !(secondary && settings.stationType === "fire")) ? "flanged" : (secondary ? dn.secondaryConnectionType : dn.connectionType) ?? "threaded";
    return { flow: input.flowRate, working: input.workingPumpCount, reserve: input.reservePumpCount, pumpId: input.selectedPumpId ?? (prefix ? project.station.secondaryPumpId : project.station.selectedPumpId), pumpModel: input.selectedPumpModel ?? (input.selectedPumpId && input.selectedPumpId !== (prefix ? project.station.secondaryPumpId : project.station.selectedPumpId) ? undefined : prefix ? project.station.secondaryPumpModel : project.station.selectedPumpModel), dn: branchDn, connection, pn: (secondary ? dn.secondaryPn : dn.pn) ?? 16, spacing: secondary ? 400 : 500 } as CollectorConfiguration["primary"];
  };
  const base = { stationType: settings.stationType, jockey: settings.jockeyPump, simultaneous: settings.combinedCircuitsSimultaneous };
  const firstDn = type === "suction" ? dn.suctionCollectorDn : dn.dischargeCollectorDn;
  const secondDn = type === "suction" ? dn.secondarySuctionCollectorDn : dn.secondaryDischargeCollectorDn;
  const primary = circuit(first, false), secondary = secondaryAllowed(base) ? circuit(second, true) : null;
  const recommended1 = firstDn ?? (positive(first.flowRate) ? recommendedDn(first.flowRate) : null), recommended2 = secondDn ?? (positive(second.flowRate) ? recommendedDn(second.flowRate) : null);
  const networkDn = secondary && recommended1 && recommended2 ? Math.max(recommended1, recommended2) : recommended1;
  return { ...base, type, dn: networkDn, pn: Math.max(primary.pn, secondary?.pn ?? 0), material: dn.collectorMaterial ?? defaultCollectorMaterial(settings), connection: networkDn && networkDn <= 50 ? primary.connection : "flanged", eccentric: false, primary, secondary };
}
export function resolveCollector(recommended: CollectorConfiguration, state: CollectorCardState): CollectorConfiguration {
  const o = state.overrides;
  const result: CollectorConfiguration = { ...recommended, dn: o.dn ?? recommended.dn, pn: o.pn ?? recommended.pn, material: o.material ?? recommended.material, connection: o.connection ?? recommended.connection, eccentric: recommended.type === "suction" && state.eccentric,
    primary: { ...recommended.primary, dn: o.primaryDn ?? recommended.primary.dn, pn: o.pn ?? recommended.primary.pn, connection: o.primaryConnection ?? recommended.primary.connection, spacing: state.spacing1 },
    secondary: recommended.secondary ? { ...recommended.secondary, dn: o.secondaryDn ?? recommended.secondary.dn, pn: o.secondaryPn ?? o.pn ?? recommended.secondary.pn, connection: o.secondaryConnection ?? recommended.secondary.connection, spacing: state.spacing2 } : null };
  if ((result.dn ?? 0) > 50) result.connection = "flanged";
  for (const circuit of [result.primary, result.secondary]) if (circuit && (circuit.dn ?? 0) > 50) circuit.connection = "flanged";
  return result;
}
export function syncCollectorSpec(items: SpecItem[], collectors: CollectorsEntity): SpecItem[] {
  let result = [...items];
  for (const type of ["suction", "discharge"] as const) {
    const state = collectors[type], option = type === "suction" ? "suctionCollector" : "dischargeCollector", legacy = type === "suction" ? "Коллектор подводящий" : "Коллектор напорный";
    const isItem = (item: SpecItem) => item.option === option || (!item.option && item.name === legacy);
    const previous = result.find(isItem), saved = state.databaseStatus === "found" && state.database?.code === state.code ? state.database : null;
    const calculated = state.status === "complete" && state.calculation?.code === state.code ? state.calculation : null;
    const description = saved ? "Есть в базе · выбрано" : calculated ? "Требует подтверждения — сохраните коллектор в базе" : state.status === "stale" ? "Расчёт устарел — выполните расчёт в конструкторе" : "Коллектор отсутствует в базе — выполните расчёт в конструкторе";
    result = result.filter(item => !isItem(item));
    result.push({ ...previous, position: type === "suction" ? "03.01" : "04.02", name: legacy, section: type, option, quantity: 1, unit: "шт.", equipmentId: saved?.id, details: state.code ?? "Не заданы параметры коллектора", price: saved?.price ?? calculated?.price ?? null, description, status: saved ? "selected" : calculated ? "confirmation" : "clarify" });
  }
  return result.sort((a, b) => a.position.localeCompare(b.position, "ru", { numeric: true }));
}
export function synchronizeCollectors(project: ProjectConfig): ProjectConfig {
  const previous = (project.entities["station-collectors"] as CollectorsEntity | undefined) ?? createCollectors();
  const collectors = { ...previous };
  for (const type of ["suction", "discharge"] as const) {
    const state = previous[type], recommended = collectorRecommendation(project, type), configuration = resolveCollector(recommended, state), code = collectorCode(configuration);
    const sourceFingerprint = JSON.stringify([recommended, project.entities["station-dn"], project.entities["system-input"], configuration.secondary ? project.entities["system-input-2"] : null]);
    const sourceChanged = state.sourceFingerprint && state.sourceFingerprint !== sourceFingerprint;
    const changed = state.configuration && configurationFingerprint(configuration) !== configurationFingerprint(state.configuration);
    const stale = state.calculation && (state.calculation.fingerprint !== configurationFingerprint(configuration) || state.calculationSourceFingerprint !== sourceFingerprint || (state.currentCatalogVersion && state.calculation.catalogVersion !== state.currentCatalogVersion));
    collectors[type] = { ...state, dnSource: project.entities["station-dn"] as DnEntity, sourceFingerprint, recommended, configuration, code,
      status: stale ? "stale" : state.calculation ? state.calculation.complete ? "complete" : "incomplete" : "uncalculated",
      ...(changed || sourceChanged || state.code !== code ? { database: null, databaseStatus: "unchecked" as const, databaseError: undefined } : {}) };
  }
  const spec = project.entities["station-spec"];
  return { ...project, entities: { ...project.entities, "station-collectors": collectors, ...(spec?.kind === "spec" ? { "station-spec": { ...spec, items: syncCollectorSpec(spec.items, collectors) } } : {}) } };
}
