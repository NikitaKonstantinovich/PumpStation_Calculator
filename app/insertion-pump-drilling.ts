import type { SpecItem } from "./project-config";
import type { AssemblyComponent } from "./suction-catalog";
import { catalogPressures, readFlangeDimensions } from "./flange-dimensions";
import { installedPumpFlange } from "./pump-mating-flange";
import { stampedShape } from "./model-editor/stamped-flanges";
import type { Drilling } from "./pump-vibration-drilling";
import flanges from "../data/flange-dimensions.json";
import stamps from "../data/stamped-loose-flanges.json";

/** Read the installed pump-side flange, including its actual stamped execution.
 * Never infer an eight-hole counterpart solely from its nominal DN. */
export function insertionPumpDrilling(row: SpecItem, database: { items: AssemblyComponent[]; source?: { sha256: string } }): Drilling | undefined {
  const a = row.insertionAssembly;
  if (!a) return;
  const execution = installedPumpFlange(a);
  if (execution) {
    const d = stamps.parts["65"].dimensions;
    return { holes: d.boltHoles, circle: d.boltCircleMm, diameter: d.boltHoleMm, source: execution.source };
  }
  const c = a.snapshot.calculation, side = a.reversed ? "right" : "left";
  const connection = c.configuration[side].connection;
  const kind = connection === "collar" ? "looseFlange" : connection === "flanged" ? "weldFlange" : undefined;
  if (!kind || !c.pn) return;
  const part = c.bom.find(p => p.role === `${side}-${kind === "weldFlange" ? "flanged" : kind}` && p.kind === kind);
  const item = database.items.find(i => i.id === (part?.componentId ?? a.externalFlanges?.from));
  if (!item) return;
  const pn = catalogPressures(database.items).get(item.id);
  if (pn !== c.pn) return;
  const result = readFlangeDimensions(item, pn, flanges, database.source?.sha256), d = result.dimensions;
  if (result.warnings.length) return;
  const shape = stampedShape(item.id, { kind: "flange", lengthMm: d.thicknessMm, innerMm: d.boreDiameterMm,
    outerMm: d.outerDiameterMm, boltCircleMm: d.boltCircleMm, boltHoleMm: d.boltHoleDiameterMm,
    boltHoles: d.holes, faceHeightMm: d.faceHeightMm, faceDiameterMm: d.faceDiameterMm }, kind === "looseFlange");
  if (shape.stampedHash === "missing" || !shape.boltHoles || !shape.boltCircleMm || !shape.boltHoleMm) return;
  return { holes: shape.boltHoles, circle: shape.boltCircleMm, diameter: shape.boltHoleMm, source: result.source };
}
