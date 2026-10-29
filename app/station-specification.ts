import { synchronizeHydraulicOptions } from "./hydraulic-option-assembly";
import type { InputEntity, ProjectConfig, SettingsEntity, SpecEntity, SpecItem, SpecOption } from "./project-config";
import type { ComponentsDatabase } from "./allowed-pump-tools";
import type { SmartCabinet } from "./cabinet-configurator";
import { cataloguePurchasePriceRub, type Pump } from "./pump-catalog";
import { projectControlCabinetItem, type ControlCabinet } from "./control-cabinet-selection";
import { synchronizeCollectors, type CollectorsEntity } from "./collector-project";
import { normalizeSpecificationItems, replaceSpecificationRole } from "./specification-items";
import { automaticFrameItem, frameSpecificationItem, projectFrameSelection, FRAME_RULE_REVISION } from "./frame-selection";

export const secondaryStationEnabled = (settings: SettingsEntity) => settings.stationType === "combined" || settings.stationType === "fire" && settings.jockeyPump;

export function validStationInput(input: InputEntity) {
  return input.calculated && [input.flowRate, input.head, input.staticHead, input.workingPumpCount, input.reservePumpCount].every(value => typeof value === "number" && Number.isFinite(value)) &&
    input.flowRate! > 0 && input.head! > 0 && input.staticHead! >= 0 && input.staticHead! <= input.head! &&
    Number.isInteger(input.workingPumpCount) && input.workingPumpCount! >= 1 && input.workingPumpCount! <= 6 &&
    Number.isInteger(input.reservePumpCount) && input.reservePumpCount! >= 0 && input.reservePumpCount! <= 3;
}

export function specificationSourceFingerprint(project: ProjectConfig) {
  const e = project.entities, settings = e["station-settings"] as SettingsEntity, collectors = e["station-collectors"] as CollectorsEntity;
  return JSON.stringify([FRAME_RULE_REVISION, e["system-input"], secondaryStationEnabled(settings) ? e["system-input-2"] : null, settings, e["station-dn"],
    ...[collectors.suction, collectors.discharge].map(card => [card.overrides, card.spacing1, card.spacing2, card.eccentric])]);
}

export function cabinetSourceFingerprint(project: ProjectConfig) {
  const settings = project.entities["station-settings"] as SettingsEntity;
  const inputs = [project.entities["system-input"] as InputEntity, ...(secondaryStationEnabled(settings) ? [project.entities["system-input-2"] as InputEntity] : [])];
  return JSON.stringify([settings.stationType, settings.jockeyPump, ...inputs.map(input => [input.selectedPumpId, input.workingPumpCount, input.reservePumpCount])]);
}

export type StationSpecificationResources = {
  pumps: Pump[] | null;
  cabinets: ControlCabinet[] | null;
  smartCabinets: SmartCabinet[] | null;
  components?: ComponentsDatabase;
};
type HydraulicRefresh = (project: ProjectConfig, database?: ComponentsDatabase, force?: boolean) => ProjectConfig;
const valveRoles = new Set<SpecOption>(["primarySuctionValve", "primaryDischargeValve", "primaryCheckValve", "secondarySuctionValve", "secondaryDischargeValve", "secondaryCheckValve"]);
const stale = (item: SpecItem, reason: string): SpecItem => ({ ...item, technicalStatus: "stale", technicalNotes: [reason], price: null });

/** One transaction for a confirmed selection, resource refresh, import or undo. No I/O. */
export function synchronizeStationSpecification(project: ProjectConfig, resources: StationSpecificationResources, refreshHydraulics: HydraulicRefresh): ProjectConfig {
  const settings = project.entities["station-settings"] as SettingsEntity;
  const spec = project.entities["station-spec"] as SpecEntity;
  const secondary = secondaryStationEnabled(settings);
  const primary = project.entities["system-input"] as InputEntity, second = project.entities["system-input-2"] as InputEntity;
  const reasons: string[] = [];
  let items = secondary ? spec.items : spec.items.filter(item => !item.assemblyRole?.startsWith("secondary-") &&
    !["secondaryPump", "secondarySuctionValve", "secondaryDischargeValve", "secondaryCheckValve"].includes(item.option ?? ""));
  const station = { ...project.station };
  const entities = { ...project.entities };
  for (const [input, isSecond] of [[primary, false], [second, true]] as const) {
    const active = !isSecond || secondary, valid = active && validStationInput(input);
    const option = isSecond ? "secondaryPump" : "primaryPump";
    const pump = resources.pumps?.find(pump => pump.id === input.selectedPumpId);
    const total = valid ? input.workingPumpCount! + input.reservePumpCount! : undefined;
    const model = pump ? `${pump.manufacturer} ${pump.model}` : input.selectedPumpModel;
    Object.assign(station, isSecond ? {
      secondaryPumpId: active ? input.selectedPumpId : undefined, secondaryPumpModel: active ? model : undefined,
      secondaryWorkingPumpCount: valid ? input.workingPumpCount : undefined, secondaryReservePumpCount: valid ? input.reservePumpCount : undefined, secondaryTotalPumpCount: total,
    } : {
      selectedPumpId: input.selectedPumpId, selectedPumpModel: model, workingPumpCount: valid ? input.workingPumpCount : undefined,
      reservePumpCount: valid ? input.reservePumpCount : undefined, totalPumpCount: total,
    });
    if (!active) { items = replaceSpecificationRole(items, option); continue; }
    const issue = !valid ? `Контур ${isSecond ? 2 : 1}: задайте корректную рабочую точку и количество насосов.` : !input.selectedPumpId ? `Контур ${isSecond ? 2 : 1}: насос не выбран.` :
      !resources.pumps ? "Каталог насосов недоступен; выбранное оборудование не проверено." : !pump ? `Контур ${isSecond ? 2 : 1}: выбранный насос отсутствует в каталоге.` : null;
    if (issue) reasons.push(issue);
    if (!input.selectedPumpId) { items = replaceSpecificationRole(items, option); continue; }
    const row: SpecItem = { position: isSecond ? "02" : "01", option, section: "pump", generatedBy: "station", equipmentId: input.selectedPumpId,
      name: pump ? `Насос ${model}` : `Насос контура ${isSecond ? 2 : 1}`, quantity: total ?? 0, unit: "шт.",
      details: pump ? `${pump.power ?? "Мощность не указана"} кВт · ${pump.series} · ${input.workingPumpCount ?? "?"} раб. + ${input.reservePumpCount ?? "?"} рез.` : "Исполнение не проверено",
      price: !issue && pump ? cataloguePurchasePriceRub(pump, settings) : null,
      listPrice: pump?.price, priceCurrency: pump?.priceCurrency, manufacturer: pump?.manufacturer,
      description: isSecond ? "Насос второго контура" : "Рабочие и резервные насосы", status: issue ? "clarify" : "selected",
      technicalStatus: issue ? "stale" : "ready", technicalNotes: issue ? [issue] : [] };
    items = replaceSpecificationRole(items, option, row);
  }

  const pump = resources.pumps?.find(pump => pump.id === primary.selectedPumpId);
  const previousCabinet = items.find(item => item.option === "controlCabinet");
  const cabinetFingerprint = cabinetSourceFingerprint(project);
  const cabinetReady = validStationInput(primary) && pump && (!secondary || validStationInput(second) && resources.pumps?.some(item => item.id === second.selectedPumpId));
  const catalogAvailable = settings.stationType === "smart" ? resources.smartCabinets !== null : resources.cabinets !== null;
  // Explicit manual selections survive. Their applicability must be rechecked after a motor/type change.
  if (previousCabinet && previousCabinet.generatedBy !== "station") {
    if (!cabinetReady || previousCabinet.sourceFingerprint !== cabinetFingerprint) {
      items = replaceSpecificationRole(items, "controlCabinet", { ...stale(previousCabinet, "Ручной шкаф: конфигурация насосов изменилась или не проверена. Требуется повторное подтверждение применимости."), price: previousCabinet.price });
    }
  } else if (cabinetReady && catalogAvailable) {
    const row = projectControlCabinetItem(resources.cabinets ?? [], resources.smartCabinets ?? [], settings, pump, primary.workingPumpCount! + primary.reservePumpCount!);
    const jockeyUnchecked = settings.stationType === "fire" && settings.jockeyPump;
    items = replaceSpecificationRole(items, "controlCabinet", { ...row, option: "controlCabinet", generatedBy: "station", sourceFingerprint: cabinetFingerprint,
      technicalStatus: row.status === "selected" && !jockeyUnchecked ? "ready" : "unverified",
      technicalNotes: jockeyUnchecked ? ["Шкаф FPJ: применимость к мощности и количеству жокей-насосов требует проверки; автоматический подбор учитывает только основные насосы."] : [] });
  } else {
    const reason = !cabinetReady ? "Шкаф требует пересчёта: не подтверждены насосы и количество активных контуров." : "Каталог шкафов недоступен; подбор требует пересчёта.";
    reasons.push(reason);
    items = replaceSpecificationRole(items, "controlCabinet", { position: "03", option: "controlCabinet", generatedBy: "station", section: "control", name: "Шкаф управления",
      details: "Не подобран", quantity: 0, unit: "шт.", price: null, status: "clarify", technicalStatus: "stale", technicalNotes: [reason] });
  }

  const frameSelection = projectFrameSelection(project, resources.pumps);
  const frameRows = items.filter(item => item.option === "frame");
  if (frameRows.every(automaticFrameItem)) {
    items = replaceSpecificationRole(items, "frame", frameSpecificationItem(frameSelection, Boolean(cabinetReady)));
  } else {
    // Keep explicit manual frames and prices; changed pumps require an applicability review.
    items = items.map(item => item.option === "frame" && (!cabinetReady || item.sourceFingerprint !== frameSelection.sourceFingerprint)
      ? { ...item, technicalStatus: "stale", technicalNotes: ["Ручная рама: проверьте соответствие текущим насосам, массе и монтажным размерам."] } : item);
  }

  // Invalid inputs must not reach the assembly generators as a calculated circuit.
  for (const [key, input] of [["system-input", primary], ["system-input-2", second]] as const) {
    if (!validStationInput(input)) entities[key] = { ...input, calculated: false };
  }
  let next = synchronizeCollectors({ ...project, station, entities: { ...entities, "station-spec": { ...spec, items } } }, resources.components?.collectorCatalog);
  if (resources.components) {
    next = refreshHydraulics(next, resources.components, true);
    next = synchronizeHydraulicOptions(next, resources.components);
  }
  else reasons.push("Каталог комплектующих недоступен; гидравлические узлы требуют пересчёта.");
  const nextSpec = next.entities["station-spec"] as SpecEntity;
  items = nextSpec.items.map(item => {
    const hydraulic = item.generatedBy === "hydraulic-options" || ["membraneTank", "pressureTransducer", "collectorPlugs", "isolatingValves"].includes(item.option ?? "") || item.generatedBy === "suction-line" || item.generatedBy === "discharge-line" || valveRoles.has(item.option as SpecOption);
    const dependent = hydraulic || item.option === "suctionCollector" || item.option === "dischargeCollector";
    if (dependent && !resources.components) return stale(item, "Каталог комплектующих недоступен; состав и цены не проверены.");
    if (dependent && !cabinetReady) return stale(item, "Исходные данные или насосы активных контуров не подтверждены; узел требует пересчёта.");
    return item;
  });
  next = { ...next, entities: { ...next.entities, "system-input": primary, "system-input-2": second,
    "station-spec": { ...nextSpec, identityVersion: 1, items: normalizeSpecificationItems(items), synchronization: { fingerprint: specificationSourceFingerprint(project), reasons: [...new Set(reasons)] } } } };
  return JSON.stringify(next) === JSON.stringify(project) ? project : next;
}
