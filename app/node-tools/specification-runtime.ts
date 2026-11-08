import type { Step } from "../engineering/engine";
import { withEvaluationProgram } from "../engineering/runtime";
import type { ProjectConfig, SettingsEntity, SpecEntity, SpecItem, SpecSection } from "../project-config";
import { normalizeHydraulicOptions } from "../hydraulic-option-config";
import { corePreparePumpRows, coreStationCabinetRows, coreStationFrameRows, coreStationLines, coreStationOptions, coreFinalizeStation, type StationWork, type StationSpecificationResources } from "../station-specification";
import { coreVisibleSpecificationItems } from "../specification-presentation";
import { coreAssessSpecification } from "../specification-readiness";
import { normalizeSpecificationItems } from "../specification-items";
import type { Pump } from "../pump-catalog";
import type { Diagnostic, ToolContext, Values } from "./schema";
import type { SpecificationData, SpecificationManualRow, SpecificationResult } from "./specification-nodes";

const primitiveProgram = { version: "node-specification-primitives", plans: {}, args: {} };
const pure = <T,>(run: () => T): T => withEvaluationProgram(primitiveProgram, run);
const object = (value: unknown): Values => value && typeof value === "object" && !Array.isArray(value) ? value as Values : {};
const sections = new Set<SpecSection>(["pump", "control", "frame", "suction", "discharge", "electrical"]);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown, max = 1000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const MANUAL_PREFIX = "node-manual:";
type Batch = ReturnType<typeof corePreparePumpRows> & { nodeIssues: Diagnostic[]; manualRows: SpecificationManualRow[] };
type CabinetBatch = ReturnType<typeof coreStationCabinetRows> & { nodeIssues: Diagnostic[]; manualRows: SpecificationManualRow[] };
type Work = StationWork & { nodeIssues: Diagnostic[]; manualRows: SpecificationManualRow[] };
type Result = SpecificationResult & { manualRows: SpecificationManualRow[] };

/** Manual rows deliberately cannot set an automatic role, equipment identity or technical status. */
export function normalizeSpecificationManualRows(value: unknown): SpecificationManualRow[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 500) throw Error("Ручные позиции должны быть списком не более 500 строк");
  const seen = new Set<string>();
  return value.map((raw, index) => {
    const row = object(raw), id = text(row.id, 96);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || seen.has(id)) throw Error(`Ручная позиция ${index + 1}: отсутствует или повторяется идентификатор`);
    seen.add(id);
    const quantity = row.quantity, price = row.price;
    if (!finite(quantity) || quantity < 0 || quantity > 1e9) throw Error(`Ручная позиция ${index + 1}: количество должно быть от 0 до 1 000 000 000`);
    if (price != null && (!finite(price) || price < 0 || price > 1e12)) throw Error(`Ручная позиция ${index + 1}: цена должна быть неотрицательным конечным числом`);
    if (!sections.has(row.section as SpecSection)) throw Error(`Ручная позиция ${index + 1}: неизвестный раздел`);
    return { id, name: text(row.name, 500), details: text(row.details), quantity, unit: text(row.unit, 30) || "шт.", price: price == null ? null : price as number, section: row.section as SpecSection, description: text(row.description), confirmed: row.confirmed === true };
  });
}
export function manualSpecificationItems(rows: SpecificationManualRow[]): SpecItem[] {
  return rows.map((row, index) => ({ position: `90.${String(index + 1).padStart(3, "0")}`, assemblyRole: MANUAL_PREFIX + row.id, name: row.name || "Ручная позиция без названия", details: row.details, quantity: row.quantity, unit: row.unit, price: row.price, section: row.section, description: row.description || "Ручная позиция", status: row.confirmed && row.name && row.quantity > 0 ? "selected" : "confirmation", technicalStatus: row.confirmed && row.name && row.quantity > 0 ? "ready" : "unverified", technicalNotes: row.confirmed && row.name && row.quantity > 0 ? [] : ["Проверьте название, количество и применимость ручной позиции."] }));
}
function projectValue(value: unknown): ProjectConfig | null {
  const p = value as ProjectConfig | null;
  return p?.schemaVersion === 1 && p.entities?.["station-settings"]?.kind === "settings" && p.entities?.["station-dn"]?.kind === "dn" && p.entities?.["system-input"]?.kind === "input" && p.entities?.["system-input-2"]?.kind === "input" && p.entities?.["station-collectors"]?.kind === "collectors" && p.entities?.["station-spec"]?.kind === "spec" ? p : null;
}
function prepare(step: Step, values: Values): Batch | null {
  const upstream = object(values.collectors), source = projectValue(upstream.project);
  if (!source) return null;
  const rows = normalizeSpecificationManualRows(values.manualRows);
  const settings = source.entities["station-settings"] as SettingsEntity;
  const spec = source.entities["station-spec"] as SpecEntity;
  const hydraulicOptions = values.hydraulicOptions == null ? settings.hydraulicOptions : normalizeHydraulicOptions(values.hydraulicOptions);
  const project: ProjectConfig = { ...source, entities: { ...source.entities, "station-settings": { ...settings, ...(hydraulicOptions ? { hydraulicOptions } : {}) }, "station-spec": { ...spec, items: normalizeSpecificationItems([...spec.items.filter(item => !item.assemblyRole?.startsWith(MANUAL_PREFIX)), ...manualSpecificationItems(rows)]) } } };
  const supplied = object(values.resources);
  const resources: StationSpecificationResources = { pumps: Array.isArray(upstream.pumps) ? upstream.pumps as Pump[] : [], cabinets: Array.isArray(supplied.cabinets) ? supplied.cabinets as NonNullable<StationSpecificationResources["cabinets"]> : null, smartCabinets: Array.isArray(supplied.smartCabinets) ? supplied.smartCabinets as NonNullable<StationSpecificationResources["smartCabinets"]> : null, ...(supplied.components && Array.isArray(object(supplied.components).items) ? { components: supplied.components as StationSpecificationResources["components"] } : {}) };
  const nodeIssues = Array.isArray(upstream.issues) ? [...upstream.issues] as Diagnostic[] : [];
  if (!resources.components) nodeIssues.push({ node: step.id, key: "resources", severity: "warning", message: "Каталог комплектующих не подключён. Полнота состава и цены гидравлики не подтверждены." });
  const batch = corePreparePumpRows(project, resources);
  const items = batch.items.map(item => {
    if (item.option !== "primaryPump" && item.option !== "secondaryPump") return item;
    const pump = resources.pumps?.find(pump => pump.id === item.equipmentId);
    if (!pump) return item;
    const rate = pump.priceCurrency === "USD" ? settings.usdRate : pump.priceCurrency === "CNY" ? settings.cnyRate : 1;
    const discount = pump.priceKind === "net" ? 0 : settings.manufacturerDiscounts[pump.manufacturer.toLowerCase()] ?? pump.discountPercent ?? 0;
    if (finite(rate) && rate > 0 && finite(discount) && discount >= 0 && discount <= 100) return item;
    nodeIssues.push({ node: step.id, key: item.option + "/price", severity: "warning", message: `${item.name}: курс валюты или скидка не заданы корректно; закупочная цена не определена.` });
    return { ...item, price: null };
  });
  return { ...batch, items, nodeIssues, manualRows: rows };
}
function data(value: unknown): SpecificationData {
  const result = value as Result | null, project = projectValue(result?.project);
  if (!project || !result) return { status: "empty", message: "Подключите результаты расчёта DN и конструктора коллекторов.", items: [], manualRows: [] };
  const settings = project.entities["station-settings"] as SettingsEntity, spec = project.entities["station-spec"] as SpecEntity;
  const items = coreVisibleSpecificationItems(spec, settings);
  const existing = result.issues.map((issue, index) => ({ id: `node/${issue.node}/${issue.key}/${index}`, tool: "components", severity: issue.severity, message: issue.message }));
  return { status: "ready", message: "", project, items, readiness: coreAssessSpecification(project, items, existing), database: result.resources.components, manualRows: result.manualRows ?? [] };
}
export function executeSpecificationOperation(step: Step, values: Values, _context: ToolContext): Values | undefined {
  void _context;
  return pure(() => {
    switch (step.operation) {
      case "spec.pumps": return { batch: prepare(step, values) };
      case "spec.cabinet": { const b = values.batch as Batch | null; return { value: b ? { ...coreStationCabinetRows(b), nodeIssues: b.nodeIssues, manualRows: b.manualRows } : null }; }
      case "spec.frame": { const b = values.batch as CabinetBatch | null; return { work: b ? { ...coreStationFrameRows(b), nodeIssues: b.nodeIssues, manualRows: b.manualRows } : null }; }
      case "spec.lines": { const work = values.work as Work | null; return { value: work ? coreStationLines(work) : null }; }
      case "spec.options": { const work = values.work as Work | null; return { value: work ? coreStationOptions(work) : null }; }
      case "spec.finalize": { const work = values.work as Work | null; return { result: work ? { project: coreFinalizeStation(work), pumps: work.resources.pumps ?? [], resources: work.resources, issues: work.nodeIssues, manualRows: work.manualRows } satisfies Result : null }; }
      case "spec.readiness": {
        const specification = data(values.result);
        // Readiness describes the deliverable, not whether draft parameters may
        // be saved. Keep original severities in the table/export; graph warnings
        // let an unfinished station survive saving and reopening, as in Workspace 1.
        return { data: specification, issues: (specification.readiness?.findings ?? []).map(finding => ({ node: step.id, key: finding.id, severity: "warning", message: finding.message })) };
      }
      case "ui.specification": return { value: { kind: "specification", node: step.id, label: "Спецификация", specification: values.data ?? { status: "empty", message: "Подключите проверку состава и стоимости.", items: [], manualRows: [] }, specificationBindings: { ...(values.manualBinding ? { manual: values.manualBinding } : {}), ...(values.hydraulicBinding ? { hydraulic: values.hydraulicBinding } : {}), ...(values.dnBinding ? { dn: values.dnBinding } : {}) } } };
      default: return undefined;
    }
  });
}
