import flangeReference from "../data/flange-dimensions.json";
import bindings from "../data/insertion-model-bindings.json";
import { sha256 } from "./auth-server";
import type { InsertCalculation, InsertCatalog, InsertPart } from "./component-insert-calculations";
import type { InsertSource } from "./component-insert-catalog-server";
import { readFlangeDimensions } from "./flange-dimensions";
import { insertionGeometrySignature, prepareInsertionTemplate, type InsertGeometryContext } from "./model-editor/insertion-template";
import type { Bounds, Vec3 } from "./model-editor/model";
import type { InsertionTemplate } from "./model-editor/insertion-types";

export function insertionGeometryContext(source: InsertSource, catalog: InsertCatalog): InsertGeometryContext {
  const flanges: InsertGeometryContext["flanges"] = {}, models: InsertGeometryContext["models"] = {};
  for (const part of catalog.parts) {
    if (part.kind === "weldFlange" || part.kind === "looseFlange") {
      const item = source.items.find(i => i.id === part.id);
      if (item) flanges[part.id] = readFlangeDimensions(item, part.pn, flangeReference, source.source.sha256).dimensions;
    }
    const candidate = bindings.rows.find(r => r.kind === part.kind && (!r.componentId || r.componentId === part.id) && (!r.sourceSha256 || r.sourceSha256 === source.source.sha256)
      && Object.entries(r.match).every(([key, expected]) => part[key as keyof InsertPart] === expected));
    if (candidate) models[part.id] = { hash: candidate.hash, bounds: candidate.bounds as Bounds, position: candidate.position as Vec3, rotation: candidate.rotation as Vec3, source: candidate.source };
  }
  return { catalog, flanges, models };
}
export async function insertion3d(row: InsertCalculation, source: InsertSource, catalog: InsertCatalog, record: { id: string; revision: number } | null, angle: number): Promise<InsertionTemplate> {
  const template = prepareInsertionTemplate(row, insertionGeometryContext(source, catalog), record, angle);
  return { ...template, geometryKey: await sha256(insertionGeometrySignature(template)) };
}
