import type { Vec3 } from "./model";

export const FASTENER_REVISION = "flange-fasteners-v2-kms";
export type HardwareItem = { id: string; name: string; kind: "bolt" | "stud" | "nut" | "washer"; diameter: number; length: number; source: string };
export type FastenerCatalog = { version: 1; items: HardwareItem[] };
/** CAD mounting metadata is keyed by source hash. Points are in native model mm. */
export type FlangeMount = {
  source: string; holes: Vec3[]; holeDiameter: number; thickness: number;
  axis: Vec3; face: Vec3; holeKind: "through" | "threaded" | "unknown";
  bearingInner?: number; bearingOuter?: number;
};
export type FastenerBinding = {
  version: 1; members: string[]; jointIds: string[];
  status: "ready" | "blocked"; issues: string[]; sources: string[];
  grip: number; minimumLength: number; count: number;
  hardware?: { rod: HardwareItem; nut: HardwareItem; washer: HardwareItem };
  dimensions?: { diameter: number; length: number; flats: number; head: number; nut: number; washer: number; washerInner: number; washerOuter: number; ends: 1 | 2 };
  /** Hole axes in group-local coordinates: X runs from head to nut. */
  centers: Vec3[];
};
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 10000;
const text = (v: unknown): v is string => typeof v === "string" && v.length <= 20000;
const id = (v: unknown): v is string => text(v) && v.length > 0 && v.length <= 240;
const list = (v: unknown, max: number, validate: (x: unknown) => boolean) => Array.isArray(v) && v.length <= max && v.every(validate);
export function parseHardware(v: unknown): HardwareItem | undefined {
  if (!v || typeof v !== "object") return;
  const h = v as HardwareItem;
  if (id(h.id) && text(h.name) && text(h.source) && ["bolt", "stud", "nut", "washer"].includes(h.kind) && positive(h.diameter) && positive(h.length)) return structuredClone(h);
}
export function parseFastenerCatalog(v: unknown): FastenerCatalog | undefined {
  if (!v || typeof v !== "object") return;
  const c = v as FastenerCatalog;
  if (c.version !== 1 || !list(c.items, 2000, x => !!parseHardware(x))) return;
  return structuredClone(c);
}
export function parseFastenerBinding(v: unknown): FastenerBinding | undefined {
  if (!v || typeof v !== "object") return;
  const b = v as FastenerBinding;
  if (b.version !== 1 || !["ready", "blocked"].includes(b.status) || !list(b.members, 100, id) || !list(b.jointIds, 100, id)
    || !list(b.issues, 100, text) || !list(b.sources, 100, text) || ![b.grip, b.minimumLength, b.count].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 10000)
    || !list(b.centers, 128, v => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e6))) return;
  if (!Number.isInteger(b.count) || b.count > 128) return;
  const d = b.dimensions;
  if (d && (![d.diameter, d.length, d.flats, d.head, d.nut, d.washer, d.washerInner, d.washerOuter].every(positive)
    || ![1, 2].includes(d.ends) || d.washerInner <= d.diameter || d.washerOuter <= d.washerInner || d.flats <= d.diameter)) return;
  if (b.status === "ready" && (!d || !b.hardware || ![b.hardware.rod, b.hardware.nut, b.hardware.washer].every(h => parseHardware(h))
    || b.count === 0 || b.count !== b.centers.length || d.length < b.minimumLength - .01)) return;
  return structuredClone(b);
}
