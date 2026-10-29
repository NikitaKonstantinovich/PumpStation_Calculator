import { hydraulicAssemblyPrice } from "./hydraulic-option-assembly";
import { instrumentCount, separationEnabled } from "./hydraulic-option-config";
import type { InputEntity, ProjectConfig, SettingsEntity, SpecEntity, SpecItem, SpecOption, SpecTechnicalStatus } from "./project-config";
import { visibleSpecificationItems } from "./specification-presentation";
import { pressureCheckWarning } from "./dn-defaults";
import { secondaryStationEnabled, specificationSourceFingerprint, validStationInput } from "./station-specification";
import { insertionPrice } from "./calculated-insertion";

export type SpecificationFinding = { id: string; category: "composition" | "technical" | "price"; severity: "error" | "warning"; message: string };
export type RequiredSpecificationNode = { id: string; label: string; matches: (item: SpecItem) => boolean; quantity?: number; equipmentId?: string };
// Preserve a manually entered historical price in project data, but never total a stale selection.
export const specificationHasPrice = (item: SpecItem) => item.technicalStatus !== "stale" && typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0 &&
  (!item.insertionAssembly || insertionPrice(item.insertionAssembly.snapshot) === item.price) &&
  (!item.hydraulicAssembly || hydraulicAssemblyPrice(item.hydraulicAssembly) === item.price);
export const specificationLineTotal = (item: SpecItem) => specificationHasPrice(item) && Number.isFinite(item.quantity) && item.quantity > 0 ? item.price! * item.quantity : 0;
type ExistingIssue = { id: string; tool: string; severity: "error" | "warning"; message: string; subject?: string };

export function specificationTechnicalStatus(item: SpecItem): SpecTechnicalStatus {
  const checks = [...(item.inletPressureCheck?.checks ?? []), ...(item.dischargePressureCheck?.checks ?? [])];
  if (checks.some(check => check.status === "exceeded")) return "error";
  if (item.technicalStatus && item.technicalStatus !== "ready") return item.technicalStatus;
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) return "incomplete";
  if (checks.some(pressureCheckWarning) || item.status === "confirmation") return "unverified";
  return item.technicalStatus ?? (item.status === "selected" ? "ready" : "unverified");
}

/** Expected nodes are derived from the configuration, never from existing rows. */
export function requiredSpecificationNodes(project: ProjectConfig): RequiredSpecificationNode[] {
  const settings = project.entities["station-settings"] as SettingsEntity;
  const nodes: RequiredSpecificationNode[] = [];
  const role = (id: SpecOption, label: string, quantity?: number, equipmentId?: string) => nodes.push({ id, label, quantity, equipmentId, matches: item => item.option === id });
  role("controlCabinet", "Шкаф управления", 1);
  role("suctionCollector", "Всасывающий коллектор", 1);
  role("dischargeCollector", "Напорный коллектор", 1);
  role("frame", "Рама насосной установки");
  role("mountingKit", "Монтажный комплект рамы");
  role("externalElectrical", "Внешняя электрика станции");
  for (const secondary of [false, ...(secondaryStationEnabled(settings) ? [true] : [])]) {
    const input = project.entities[secondary ? "system-input-2" : "system-input"] as InputEntity;
    const prefix = secondary ? "secondary" : "primary", title = `Контур ${secondary ? 2 : 1}`;
    const count = validStationInput(input) ? input.workingPumpCount! + input.reservePumpCount! : undefined;
    role(secondary ? "secondaryPump" : "primaryPump", `${title}: насосы`, count, input.selectedPumpId);
    role(`${prefix}SuctionValve`, `${title}: запорная арматура всаса`, count);
    role(`${prefix}DischargeValve`, `${title}: запорная арматура напора`, count);
    role(`${prefix}CheckValve`, `${title}: обратные клапаны`, count);
    for (const side of ["suction", "discharge"] as const) {
      nodes.push({ id: `${prefix}-${side}-assembly`, label: `${title}: сборочные детали ${side === "suction" ? "всаса" : "напора"}`,
        matches: item => item.generatedBy === `${side}-line` && Boolean(item.assemblyRole?.startsWith(`${prefix}-`)) });
      if (settings.vibrationCompensators) nodes.push({ id: `${prefix}-${side}-vibration`, label: `${title}: виброкомпенсаторы ${side === "suction" ? "всаса" : "напора"}`, quantity: count,
        matches: item => item.generatedBy === `${side}-line` && item.assemblyRole === `${prefix}-vibration-compensator` });
    }
  }
  if (settings.membraneTank) role("membraneTank", "Бак мембранный", 1);
  const pumpTotal = [project.entities["system-input"] as InputEntity, ...(secondaryStationEnabled(settings) ? [project.entities["system-input-2"] as InputEntity] : [])].reduce((sum, input) => sum + (input.workingPumpCount ?? 0) + (input.reservePumpCount ?? 0), 0);
  if (settings.collectorPlugs) role("collectorPlugs", "Заглушки коллекторов", 2);
  if (separationEnabled(settings) && pumpTotal > 1) role("isolatingValves", "Разделительные затворы", 2 * (pumpTotal - 1));
  for (const side of ["suction", "discharge"] as const) {
    const node = (role: string, label: string, quantity: number) => nodes.push({ id: `${side}:${role}`, label, quantity, matches: item => item.assemblyRole === `${side}:${role}` && item.generatedBy === "hydraulic-options" });
      const label = side === "suction" ? "Всас" : "Напор";
      for (const [instrument, name] of [["gauge", "манометр"], ["instrument-valve", "общий кран КИП"], ...(side === "suction" ? [["pressure-switch", "реле давления"], ["резьбовые-фитинги-003-r0235", "переходник бокового подключения КИП"], ["резьбовые-фитинги-002-r0225", "футорка бокового подключения КИП"]] : [])]) nodes.push({ id: `${side}:${instrument}`, label: `${label}: ${name}`, quantity: instrumentCount(settings), matches: item => item.generatedBy === `${side}-line` && item.assemblyRole === instrument });
    if (side === "discharge") node("transducer", "Преобразователи давления: напор", instrumentCount(settings));
    if (settings.collectorPlugs) node("plug", `Заглушка: ${side}`, 1);
    if (separationEnabled(settings) && pumpTotal > 1) node("separator", `Разделительные затворы: ${side}`, pumpTotal - 1);
  }
  return nodes;
}

export function assessSpecification(project: ProjectConfig, displayedItems?: SpecItem[], existingIssues: ExistingIssue[] = []) {
  const spec = project.entities["station-spec"] as SpecEntity, settings = project.entities["station-settings"] as SettingsEntity;
  const items = displayedItems ?? visibleSpecificationItems(spec, settings);
  const findings: SpecificationFinding[] = [];
  const add = (category: SpecificationFinding["category"], id: string, message: string, severity: SpecificationFinding["severity"] = "warning") => findings.push({ category, id: `spec/readiness/${id}`, message, severity });
  // Reuse established engineering diagnostics; drawings/3D are outside specification readiness.
  for (const issue of existingIssues) {
    if (["input", "input2", "chart", "chart2", "dn", "collectors", "components", "cabinet"].includes(issue.tool) || /^(?:sketch|sketch2)\/availability$/.test(issue.id)) {
      add("technical", `condition/${issue.id}`, `${issue.subject ? `${issue.subject}: ` : ""}${issue.message}`, issue.severity);
    } else if (issue.id.startsWith("settings/rates/") || issue.id.startsWith("settings/discounts/")) add("price", `condition/${issue.id}`, issue.message, issue.severity);
  }
  for (const [index, message] of (spec.hydraulicPorts?.findings ?? []).entries()) add("composition", `ports/${index}`, message, "error");
  for (const node of requiredSpecificationNodes(project)) {
    const rows = items.filter(node.matches);
    if (!rows.length) add("composition", node.id, `${node.label}: обязательный узел отсутствует в спецификации.`);
    else {
      if (rows.some(row => !Number.isFinite(row.quantity) || row.quantity <= 0)) add("composition", `${node.id}/quantity`, `${node.label}: количество не определено.`);
      if (node.quantity !== undefined && rows.reduce((sum, row) => sum + row.quantity, 0) !== node.quantity) add("composition", `${node.id}/count`, `${node.label}: количество не соответствует конфигурации (${node.quantity}).`, "error");
      if (node.equipmentId && rows.some(row => row.equipmentId !== node.equipmentId)) add("composition", `${node.id}/selection`, `${node.label}: изделие не соответствует выбранной модели. Требуется пересчёт.`, "error");
      if (node.id in { primaryPump: 1, secondaryPump: 1, controlCabinet: 1, suctionCollector: 1, dischargeCollector: 1 } && rows.length > 1) add("composition", `${node.id}/duplicate`, `${node.label}: обнаружены дубли обязательной роли.`, "error");
    }
  }
  if (!spec.synchronization || spec.synchronization.fingerprint !== specificationSourceFingerprint(project)) add("composition", "synchronization", "Состав требует синхронизации с текущими исходными данными.");
  for (const [index, reason] of (spec.synchronization?.reasons ?? []).entries()) add("composition", `source/${index}`, reason);
  for (const secondary of [false, ...(secondaryStationEnabled(settings) ? [true] : [])]) {
    const input = project.entities[secondary ? "system-input-2" : "system-input"] as InputEntity;
    if (!validStationInput(input) || !input.selectedPumpId) add("technical", `input/${secondary ? 2 : 1}`, `Контур ${secondary ? 2 : 1}: исходные данные или выбор насоса не подтверждены.`);
  }
  if (settings.isolatingValves && !separationEnabled(settings)) add("technical", "separation-station-type", "Разделительные затворы доступны только пожарным и совмещённым станциям.", "error");
  if (settings.pressureChecksEnabled === false) add("technical", "pressure-disabled", "Проверки давления отключены; пригодность по давлению не подтверждена.");
  else if (settings.inletHead == null) add("technical", "pressure-input", "Напор на входе не указан; проверка давления не завершена.");
  for (const [index, item] of items.entries()) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) add("composition", `item/${index}/quantity`, `${item.name}: количество не определено; стоимость позиции не рассчитана.`);
    const status = specificationTechnicalStatus(item);
    if (status === "stale") add("composition", `item/${index}/stale`, `${item.name}: соответствие текущей конфигурации не подтверждено.`);
    if (status !== "ready") add("technical", `item/${index}`, `${item.name}: ${item.technicalNotes?.join(" ") || ({ incomplete: "узел не рассчитан полностью", unverified: "требуется проверка исполнения", stale: "результат требует пересчёта", error: "техническая ошибка" } as const)[status]}.`, status === "error" ? "error" : "warning");
    if (!specificationHasPrice(item)) add("price", `price/${index}`, `${item.name}: цена не указана или некорректна; в стоимость не включена.`);
  }
  const compositionComplete = !findings.some(finding => finding.category === "composition");
  const technicalReady = compositionComplete && !findings.some(finding => finding.category === "technical");
  const pricesComplete = items.length > 0 && items.every(specificationHasPrice) && !findings.some(finding => finding.category === "price");
  const costComplete = compositionComplete && pricesComplete && !items.some(item => specificationTechnicalStatus(item) === "stale");
  return { compositionComplete, technicalReady, pricesComplete, costComplete, ready: technicalReady && costComplete,
    knownTotal: items.reduce((sum, item) => sum + specificationLineTotal(item), 0),
    pricedRows: items.filter(specificationHasPrice).length, totalRows: items.length, findings };
}
export type SpecificationReadiness = ReturnType<typeof assessSpecification>;
