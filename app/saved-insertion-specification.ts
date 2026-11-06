import { installedInsertionPrice } from "./calculated-insertion";
import type { DnEntity, ProjectConfig, SpecEntity, SpecItem } from "./project-config";
import { selectStationInsertion } from "./station-insertion-selection";
import type { AssemblyComponent } from "./suction-catalog";

// Earlier releases marked these rows stale solely because the source catalogue or labour rates changed.
const oldPriceWarning = (note: string) => note.startsWith("Расчёт вставки устарел относительно текущего каталога") ||
  note.startsWith("Актуальность расчёта вставки не проверена") || note.includes("Требуется расчёт вставки по выбранным тарифам");

export function refreshSavedSpecificationInsertions(project: ProjectConfig, catalog: AssemblyComponent[]): ProjectConfig {
  const spec = project.entities["station-spec"] as SpecEntity;
  const designs = (project.entities["station-dn"] as DnEntity).insertionDesigns;
  const insertions = catalog.filter(item => item.calculatedInsertion);
  let changed = false;
  const items = spec.items.map((row): SpecItem => {
    const requirement = row.insertionRequirement, assembly = row.insertionAssembly;
    if (!requirement || !assembly || row.technicalStatus === "error") return row;
    if (row.technicalStatus === "stale" && !row.technicalNotes?.some(oldPriceWarning)) return row;
    const design = designs?.[requirement.location] ?? requirement.design;
    const selected = selectStationInsertion(insertions, { ...requirement, design });
    const item = selected.item;
    if (!item?.calculatedInsertion) return row;
    const updatedAssembly = { ...assembly, snapshot: item.calculatedInsertion, reversed: selected.reversed };
    const price = installedInsertionPrice(updatedAssembly);
    const status = selected.technicalStatus === "ready" && price !== null ? "selected" : "clarify";
    const updated: SpecItem = { ...row, name: item.family, equipmentId: item.id, description: selected.explanation,
      insertionAssembly: updatedAssembly, price, technicalStatus: selected.technicalStatus,
      technicalNotes: selected.findings.map(finding => finding.message), status: row.status === "confirmation" ? "confirmation" : status };
    if (row.inletPressureCheck) updated.inletPressureCheck = { ...row.inletPressureCheck, baseStatus: status };
    if (row.dischargePressureCheck) updated.dischargePressureCheck = { ...row.dischargePressureCheck, baseStatus: status };
    if (JSON.stringify(updated) === JSON.stringify(row)) return row;
    changed = true;
    return updated;
  });
  return changed ? { ...project, entities: { ...project.entities, "station-spec": { ...spec, items } } } : project;
}
