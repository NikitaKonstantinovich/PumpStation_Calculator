import type { SpecItem } from "./project-config";
import type { InstalledInsertion } from "./calculated-insertion";
import type { InsertionTemplate } from "./model-editor/insertion-types";
import stamps from "../data/stamped-loose-flanges.json";

export const PUMP_FLANGE_EXECUTION = "dn65-pn16-four-hole";
const stockId = "фланцы-006-r0116";
export const pumpFlangeExecutionId = `${stockId}:4-hole`;
export const pumpFlangeExecutionSource = "Сверловка 4 отверстия подтверждена пользователем по STEP NIS80-65-160/5.5. Геометрия ответного свободного фланца: HECO LF-076-GPR, DN65 PN10/16, PCD145, 4×Ø17,5; https://www.heco.de/webservice/downloads/product-sheet/118/de/heco-Produktblatt-118-Edelstahl-Lose-Flansche-aus-Blech-gepresst-PN-10-16.pdf";
const priceNote = "Цена предварительная, по базовой позиции DN65 из каталога; отдельная цена четырёхотверстного исполнения не задана.";

/** An installed execution is separate from the immutable published insertion. */
export function installedPumpFlange(a: InstalledInsertion) {
  if (a.pumpFlangeExecution !== PUMP_FLANGE_EXECUTION) return null;
  const c = a.snapshot.calculation, side = a.reversed ? "right" : "left";
  if (c.material !== "aisi304" || c.pn !== 16 || (side === "left" ? c.dnLarge : c.dnSmall ?? c.dnLarge) !== 65 || c.configuration[side].connection !== "collar") return null;
  const flange = c.bom.find(p => p.role === `${side}-looseFlange` && p.kind === "looseFlange" && p.componentId === stockId);
  const collar = c.bom.find(p => p.role === `${side}-collar` && p.componentId === "воротники-002-r0035");
  return flange && collar ? {side, flange, thickness: 24, holes: 4, source: pumpFlangeExecutionSource} : null;
}

export function adoptPumpMatingFlange(row: SpecItem, pumpId?: string) {
  if (row.insertionAssembly?.pumpFlangeExecution) {
    row.insertionAssembly = {...row.insertionAssembly}; delete row.insertionAssembly.pumpFlangeExecution;
  }
  if (pumpId !== "ES:variant:c4c73a42735354919429ee87" || row.section !== "discharge" || row.insertionRequirement?.purpose !== "pump-transition" || !row.insertionAssembly) return;
  const candidate = {...row.insertionAssembly, pumpFlangeExecution: PUMP_FLANGE_EXECUTION as typeof PUMP_FLANGE_EXECUTION};
  if (!installedPumpFlange(candidate)) return;
  row.insertionAssembly = candidate;
  row.status = "confirmation";
  row.technicalNotes = [...(row.technicalNotes ?? []), pumpFlangeExecutionSource, priceNote];
  row.description = [row.description, pumpFlangeExecutionSource, priceNote].filter(Boolean).join(" ");
}

export function pumpMatingFlangeBom(a: InstalledInsertion, parts: InstalledInsertion["snapshot"]["calculation"]["bom"]) {
  const execution = installedPumpFlange(a);
  return execution ? parts.map(p => p.role === execution.flange.role ? {...p, componentId: pumpFlangeExecutionId,
    name: "Фланец свободный DN65 PN16 · 4 отверстия, PCD145", source: `${pumpFlangeExecutionSource}; ${priceNote} ${p.source ?? ""}`} : p) : parts;
}

export function pumpMatingFlangeTemplate(template: InsertionTemplate, a: InstalledInsertion): InsertionTemplate {
  const execution = installedPumpFlange(a);
  if (!execution) return template;
  const original = template.geometry.pieces.find(p => p.id === `${execution.side}-loose`);
  if (!original || ![stockId,pumpFlangeExecutionId].includes(original.componentId) || original.shape.kind !== "flange") return template;
  if (original.shape.innerMm !== 81 || original.shape.outerMm !== 185 || original.shape.boltCircleMm !== 145) return template;
  const part = stamps.parts["65"], copy = structuredClone(template);
  const piece = copy.geometry.pieces.find(p => p.id === original.id)!;
  piece.componentId = pumpFlangeExecutionId; piece.name = "Свободный фланец DN65 PN16 · 4 отверстия";
  piece.source = pumpFlangeExecutionSource;
  piece.shape = {kind:"flange", ...part.dimensions, stampedHash:part.sourceHash};
  // Ports describe the same sealing plane; changing a loose ring never moves the pipework.
  for (const port of [...piece.ports, ...copy.geometry.ports.filter(p => p.id === execution.side)]) {
    port.boltHoles = 4; port.boltCircleMm = 145; port.boltHoleMm = 17.5;
  }
  copy.warnings = [...new Set([...copy.warnings.filter(s => !s.includes("Italvalvole 14474")),pumpFlangeExecutionSource])];
  return copy;
}
