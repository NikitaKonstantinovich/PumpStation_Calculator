import type { ProjectConfig, InputEntity, SettingsEntity, DnEntity, SpecEntity, PanelKind } from "./project-config";
import type { Pump } from "./pump-catalog";
import type { CollectorCatalog } from "./collector-calculations";
import type { CollectorsEntity } from "./collector-project";
import type { SmartCabinet } from "./cabinet-configurator";
import { interpolateCurve, operatingPoint, usablePump } from "./pump-catalog";
import { suctionHydraulics, dischargeHydraulics, recommendedDn, flowVelocity, dnVelocityLimit, pressureCheckWarning } from "./dn-defaults";
import { calculateCollector, configurationFingerprint, configurationWarnings, collectorPressureChecks, collectorVelocityWarning } from "./collector-calculations";
import { pumpSketchFor } from "./pump-sketches";
import { specificationItemPresentation, specificationIssueId, visibleSpecificationItems } from "./specification-presentation";
import { ENTITY_BY_TOOL, PANEL_INFO } from "./tool-registry";

export type IssueSeverity = "error" | "warning";
export type ToolIssue = { id: string; tool: PanelKind; severity: IssueSeverity; message: string; subject?: string };
export type IssueFilters = { errors: boolean; warnings: boolean; tool: PanelKind | "all" };
export const secondaryToolsEnabled = (settings: SettingsEntity) => settings.stationType === "combined" || settings.stationType === "fire" && settings.jockeyPump;
export const issueToolEnabled = (tool: PanelKind, settings: SettingsEntity) => !["input2", "chart2", "sketch2"].includes(tool) || secondaryToolsEnabled(settings);
export function filterIssues(issues: ToolIssue[], filters: IssueFilters) {
  return issues.filter(issue => (issue.severity === "error" ? filters.errors : filters.warnings) && (filters.tool === "all" || filters.tool === issue.tool));
}

export function inputIssues(input: InputEntity, tool: "input" | "input2"): ToolIssue[] {
  const fields = [
    ["flowRate", "Расход станции", (v: number) => v > 0, "должен быть больше нуля"],
    ["head", "Напор", (v: number) => v > 0, "должен быть больше нуля"],
    ["staticHead", "Статический напор", (v: number) => v >= 0 && (input.head === null || v <= input.head), "должен быть от 0 до общего напора"],
    ["workingPumpCount", "Количество рабочих насосов", (v: number) => Number.isInteger(v) && v >= 1 && v <= 6, "должно быть целым числом от 1 до 6"],
    ["reservePumpCount", "Количество резервных насосов", (v: number) => Number.isInteger(v) && v >= 0 && v <= 3, "должно быть целым числом от 0 до 3"],
  ] as const;
  return fields.flatMap<ToolIssue>(([field, label, valid, requirement]) => {
    const value = input[field];
    return value === null ? [{ id: `${tool}/${field}`, tool, severity: "warning" as const, message: `${label}: значение не указано.` }] :
      !Number.isFinite(value) || !valid(value) ? [{ id: `${tool}/${field}`, tool, severity: "error" as const, message: `${label} ${requirement}.` }] : [];
  });
}

export function diagnosticScope(project: ProjectConfig, tool: PanelKind) {
  if (["components", "settings", "spec", "issues"].includes(tool)) return "";
  if (tool === "collectors") return JSON.stringify(project.entities["station-collectors"]);
  const secondary = ["input2", "chart2", "sketch2"].includes(tool);
  return JSON.stringify(project.entities[secondary ? "system-input-2" : "system-input"]);
}

export function collectProjectIssues(project: ProjectConfig, catalogue: Pump[], catalog: CollectorCatalog | null, cabinets: SmartCabinet[], assetErrors: Record<string, string> = {}): ToolIssue[] {
  const result: ToolIssue[] = [];
  const settings = project.entities["station-settings"] as SettingsEntity;
  const dn = project.entities["station-dn"] as DnEntity;
  const add = (tool: PanelKind, suffix: string, severity: IssueSeverity, message: string, subject?: string) => result.push({ id: `${tool}/${suffix}`, tool, severity, message, subject });
  const primaryInput = project.entities["system-input"] as InputEntity;
  const inputs = [{ input: primaryInput, secondary: false }, ...(secondaryToolsEnabled(settings) ? [{ input: project.entities["system-input-2"] as InputEntity, secondary: true }] : [])];
  for (const { input, secondary } of inputs) {
    const tool = secondary ? "input2" : "input", chart = secondary ? "chart2" : "chart", card = secondary ? "sketch2" : "sketch";
    const validation = inputIssues(input, tool);
    result.push(...validation);
    const selected = catalogue.find(pump => pump.id === input.selectedPumpId);
    const valid = validation.length === 0 && input.calculated;
    if (!input.selectedPumpId) add(tool, "selection/missing", "warning", "Насос не выбран. Выполните подбор оборудования.");
    else if (catalogue.length && !selected) add(tool, "selection/missing", "error", "Выбранный насос отсутствует в подключённом каталоге.");
    if (!valid) add(chart, "empty", "warning", "Для построения кривой задайте корректные параметры и выполните подбор насосов.");
    else if (!selected) add(chart, "empty", "warning", "Для заданной рабочей точки насос не выбран.");
    else if (!usablePump(selected, input.medium)) add(chart, "empty", "error", "Для выбранной модели нет подтверждённой рабочей кривой для этой среды.");
    else {
      const head = interpolateCurve(selected.curve, input.flowRate! / input.workingPumpCount!);
      if (head === null) add(tool, "selection/range", "error", "Запрашиваемый расход находится вне рабочего диапазона выбранного насоса.");
      else {
        const reserve = (head - input.head!) / input.head! * 100;
        if (reserve < 0 || reserve > 5) add(tool, "selection/reserve", reserve < 0 || reserve > 10 ? "error" : "warning", `Запас напора выбранного насоса ${reserve.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%: ${reserve < 0 ? "заданный напор не обеспечен" : "превышает рекомендуемые 5%"}.`);
      }
      if (!operatingPoint(selected, input.workingPumpCount!, { flowRate: input.flowRate!, head: input.head!, staticHead: input.staticHead! })) add(chart, "operating-point", "warning", "Пересечение характеристики насоса и системы не найдено.");
    }
    if (!selected) add(card, "empty", "warning", "Насос ещё не выбран. Карточка появится после выбора модели.");
    else {
      if (!pumpSketchFor(selected)) add(card, "drawing", "warning", "В подключённых каталогах нет подтверждённого габаритного чертежа.", selected.model);
      if (selected.active === false || selected.selectable === false) add(card, "availability", "error", "Модель недоступна для подбора.", selected.model);
      selected.dataWarnings?.forEach((message, index) => { add(card, `data/${index}`, "warning", message, selected.model); add(tool, `selection/data/${index}`, "warning", message, selected.model); });
    }
    if (!valid) { if (!secondary) add("dn", "empty", "warning", "Сначала задайте корректную рабочую точку в инструменте «Подбор насосов»."); continue; }
    const circuit = secondary ? "secondary" : "primary", subject = secondary ? "Контур 2" : "Контур 1";
    const suction = suctionHydraulics(dn, input, settings, secondary), discharge = dischargeHydraulics(dn, input, settings, secondary);
    suction.errors.forEach((message, index) => add("dn", `${circuit}/suction/${index}`, "error", message, subject));
    discharge.errors.forEach((message, index) => add("dn", `${circuit}/discharge/${index}`, "error", message, subject));
    if (pressureCheckWarning(suction.inletPressureCheck)) add("dn", `${circuit}/pressure`, suction.inletPressureCheck.status === "exceeded" ? "error" : "warning", suction.inletPressureCheck.message, subject);
    const flow = input.flowRate!, perPump = flow / input.workingPumpCount!;
    const rows = secondary ? [["secondarySuctionCollectorDn", flow], ["secondaryDischargeCollectorDn", flow], ["secondarySuctionValveDn", perPump], ["secondaryDischargeValveDn", perPump]] as const :
      [["suctionCollectorDn", flow], ["dischargeCollectorDn", flow], ["suctionValveDn", perPump], ["dischargeValveDn", perPump]] as const;
    for (const [field, rowFlow] of rows) {
      const size = field.endsWith("SuctionValveDn") || field === "suctionValveDn" ? suction.dn : field.endsWith("DischargeValveDn") || field === "dischargeValveDn" ? discharge.dn : dn[field] ?? recommendedDn(rowFlow);
      const velocity = flowVelocity(rowFlow, size), limit = dnVelocityLimit(size);
      const rowLabel = field.toLowerCase().includes("suction") ? "Всасывающая линия" : "Напорная линия";
      if (velocity > limit + 1e-9) add("dn", `${circuit}/${field}`, "warning", `DN${size}: скорость ${velocity.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} м/с превышает предел ${limit} м/с. Увеличьте диаметр.`, `${subject} · ${rowLabel}`);
    }
  }
  if (settings.inletHead === null || settings.inletHead === undefined) add("settings", "inlet-head", "warning", "Напор на входе не указан; проверка допустимого давления не выполнена.");
  for (const [key, label] of [["usdRate", "Курс доллара"], ["cnyRate", "Курс юаня"]] as const) if (!Number.isFinite(settings[key]) || settings[key] <= 0) add("settings", `rates/${key}`, "error", `${label} должен быть больше нуля.`);
  for (const [manufacturer, discount] of Object.entries(settings.manufacturerDiscounts)) if (!Number.isFinite(discount) || discount < 0 || discount > 100) add("settings", `discounts/${manufacturer}`, "error", `Скидка ${manufacturer.toUpperCase()} должна быть от 0 до 100%.`);
  for (const item of visibleSpecificationItems(project.entities["station-spec"] as SpecEntity, settings)) {
    const presentation = specificationItemPresentation(item);
    if (presentation.hasWarning) result.push({ id: specificationIssueId(item), tool: "spec", severity: presentation.severity, message: presentation.warningText, subject: `${item.position} · ${item.name}` });
  }
  const collectors = project.entities["station-collectors"] as CollectorsEntity;
  for (const type of ["suction", "discharge"] as const) {
    const state = collectors[type], c = state.configuration, subject = type === "suction" ? "Всасывающий коллектор" : "Напорный коллектор";
    if (!c || !state.recommended) continue;
    const stale = state.status === "stale" || Boolean(state.calculation && catalog && state.calculation.catalogVersion !== catalog.version);
    const calculation = !stale && state.calculation?.fingerprint === configurationFingerprint(c) ? state.calculation : null;
    const preview = catalog ? calculateCollector(c, catalog) : calculation;
    if (state.databaseStatus === "error") add("collectors", `${type}/database`, "error", state.databaseError || "Не удалось проверить базу коллекторов.", subject);
    else if (state.databaseStatus === "missing") add("collectors", `${type}/database`, "warning", "Коллектор отсутствует в базе — выполните расчёт в конструкторе.", subject);
    if (stale) add("collectors", `${type}/stale`, "warning", "Расчёт устарел — выполните повторный расчёт.", subject);
    const velocity = collectorVelocityWarning(c.dn, preview?.velocities.collector);
    if (velocity) add("collectors", `${type}/velocity`, "warning", velocity, subject);
    const invalidConfiguration = new Set(configurationWarnings(c));
    preview?.warnings.forEach((message, index) => add("collectors", `${type}/calculation/${index}`, invalidConfiguration.has(message) ? "error" : "warning", message, subject));
    if (type === "suction") collectorPressureChecks(c, settings.inletHead, catalog).forEach((check, index) => { if (pressureCheckWarning(check)) add("collectors", `${type}/pressure/${index}`, check.status === "exceeded" ? "error" : "warning", check.message, subject); });
  }
  const pump = catalogue.find(p => p.id === primaryInput.selectedPumpId), count = primaryInput.workingPumpCount === null || primaryInput.reservePumpCount === null ? null : primaryInput.workingPumpCount + primaryInput.reservePumpCount;
  if (!pump || count === null || pump.power === null) add("cabinet", "selection", "warning", "Для конфигуратора NS Smart выберите насос и укажите количество и мощность насосов.");
  else if (pump.power > 7.5 + 1e-7) add("cabinet", "selection", "error", "Мощность одного насоса для NS Smart превышает 7,5 кВт. Подберите насос меньшей мощности или измените тип станции.");
  else if (cabinets.length && !cabinets.some(c => c.pumpCount === count && supportsPower(c, pump.power!))) add("cabinet", "selection", "warning", "Готовый шкаф NS Smart для выбранного количества и мощности насосов не найден.");
  for (const [id, message] of Object.entries(assetErrors)) {
    const tool=id.split("/")[0] as PanelKind;
    if (message && issueToolEnabled(tool,settings)) result.push({ id, tool, severity: "error", message });
  }
  return sortIssues(result);
}

function supportsPower(cabinet: SmartCabinet, power: number) {
  const match = cabinet.name.match(/\((\d+(?:,\d+)?)-(\d+(?:,\d+)?)\)/);
  const min = cabinet.powerMinKw ?? (match ? Number(match[1].replace(",", ".")) : cabinet.pumpPowerKw);
  const max = cabinet.powerMaxKw ?? (match ? Number(match[2].replace(",", ".")) : cabinet.pumpPowerKw);
  return power + 1e-7 >= min && power <= max + 1e-7;
}

export function sortIssues(issues: ToolIssue[]) {
  return [...new Map(issues.map(issue => [issue.id, issue])).values()].sort((a, b) =>
    (a.severity === "error" ? 0 : 1) - (b.severity === "error" ? 0 : 1) || PANEL_INFO[a.tool].title.localeCompare(PANEL_INFO[b.tool].title, "ru") || a.id.localeCompare(b.id, "ru", { numeric: true }));
}

export function openIssueInFirstPanel(project: ProjectConfig, issue: ToolIssue, newId: string) {
  const workspace = project.workspace;
  const windows = workspace.windows.map(panel => ({ ...panel }));
  let grid = { ...workspace.grid, cells: [...workspace.grid.cells], rowSizes: [...workspace.grid.rowSizes] };
  let first = workspace.mode === "grid" ? windows.find(panel => panel.id === grid.cells[0]) : windows[0];
  const maxZ = Math.max(0, ...windows.map(panel => panel.z));
  if (!first) {
    first = { id: newId, entityId: ENTITY_BY_TOOL[issue.tool], x: 16, y: 16, w: 520, h: 460, z: maxZ + 1 };
    windows.unshift(first);
    if (workspace.mode === "grid") grid.cells[0] = first.id;
  }
  // Preserve the diagnostics list if it occupies the first window.
  if (first.activeTool === "issues" && !windows.some(panel => panel !== first && panel.activeTool === "issues")) {
    let destination = windows.find(panel => panel !== first && panel.activeTool === issue.tool);
    if (!destination) {
      destination = { ...first, id: `${newId}-list`, x: first.x + 36, y: first.y + 36, z: maxZ + 2 };
      windows.push(destination);
      if (workspace.mode === "grid") {
        let cell = grid.cells.findIndex(id => !id);
        if (cell < 0 && grid.rows < 6) { cell = grid.cells.length; grid = { ...grid, rows: grid.rows + 1, rowSizes: [...grid.rowSizes, 1], cells: [...grid.cells, ...Array.from({ length: grid.columns }, () => null)] }; }
        if (cell >= 0) grid.cells[cell] = destination.id;
        else destination.minimized = true;
      }
    }
    destination.activeTool = "issues";
    destination.entityId = ENTITY_BY_TOOL.issues;
  }
  Object.assign(first, { activeTool: issue.tool, entityId: ENTITY_BY_TOOL[issue.tool], minimized: false, z: maxZ + 3 });
  return { project: { ...project, workspace: { ...workspace, windows, grid } }, panelId: first.id };
}
