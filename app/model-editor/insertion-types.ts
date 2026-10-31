import type { Bounds, Vec3 } from "./model";

export type ConnectionPoint = {
  id: string; point: Vec3; axis: Vec3; up: Vec3; provisional: boolean;
  purpose: "connection" | "weld" | "sensor" | "support";
  connection: "flanged" | "collar" | "threaded" | "weld";
  dn: number; pn: number; material: string; source: string;
  plane: "mating-face" | "weld-end" | "thread-reference";
  thread?: string; gender?: "male" | "female"; occupiedBy?: string;
  boreMm?: number; boltCircleMm?: number; boltHoles?: number; boltHoleMm?: number;
};
export type InsertionShape = {
  kind: "tube" | "reducer-outline" | "flange" | "collar" | "marker" | "mesh";
  lengthMm?: number; outerMm?: number; innerMm?: number; smallOuterMm?: number; smallInnerMm?: number;
  offset?: Vec3; lipOuterMm?: number; lipThicknessMm?: number;
  boltCircleMm?: number; boltHoles?: number; boltHoleMm?: number;
  faceHeightMm?: number; faceDiameterMm?: number;
  thread?: { pitchMm: number; lengthMm: number; depthMm: number };
  meshUrl?: string; modelHash?: string; meshBounds?: Bounds; modelRotation?: Vec3; modelPosition?: Vec3;
};
export type InsertionPiece = {
  id: string; componentId: string; name: string; role: string; auxiliary: boolean;
  position: Vec3; rotation: Vec3; shape: InsertionShape; ports: ConnectionPoint[];
  source: string; fidelity: "cad" | "parametric" | "outline" | "missing";
};
export type InsertionGeometry = {
  version: 1; ruleVersion: number; kind: "straight" | "concentric" | "eccentric";
  baseLengthMm: number; totalLengthMm: number; eccentricAngleDeg: number;
  pieces: InsertionPiece[]; ports: ConnectionPoint[]; bounds: Bounds;
  joints: Array<{ a: { piece: string; port: string }; b: { piece: string; port: string }; kind: "seat" | "butt" | "thread"; confirmed: boolean }>;
};
export type InsertionTemplate = {
  version: 1; geometryKey: string; geometry: InsertionGeometry;
  source: { recordId: string | null; identityKey: string; revision: number; name: string; pn: number; material: string; price: number | null };
  status: "layout" | "incomplete"; issues: string[]; warnings: string[];
};
const obj = (x: unknown): Record<string, unknown> => x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {};
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 1e7;
const vec = (x: unknown): x is Vec3 => Array.isArray(x) && x.length === 3 && x.every(finite);
const text = (x: unknown, max = 2000): x is string => typeof x === "string" && x.length <= max;
const id = (x: unknown): x is string => text(x, 240) && x.length > 0;
const unit = (x: unknown): x is Vec3 => vec(x) && Math.abs(Math.hypot(...x) - 1) < 1e-5;
/** Bound tessellation and prevent a decorative thread from cutting through the wall. */
export function validShapeThread(shape: Record<string, unknown>): boolean {
  if (shape.thread === undefined) return true;
  const t = obj(shape.thread);
  return shape.kind === "tube" && [t.pitchMm, t.lengthMm, t.depthMm, shape.lengthMm, shape.outerMm, shape.innerMm].every(finite)
    && Number(t.pitchMm) > 0 && Number(t.lengthMm) > 0 && Number(t.lengthMm) < Number(shape.lengthMm)
    && Number(t.lengthMm) / Number(t.pitchMm) <= 100 && Number(t.depthMm) > 0 && Number(shape.innerMm) > 0
    && Number(t.depthMm) < (Number(shape.outerMm) - Number(shape.innerMm)) / 2;
}
export function parseConnectionPoint(raw: unknown): ConnectionPoint | null {
  const p = obj(raw);
  if (typeof p.provisional !== "boolean" || !id(p.id) || !vec(p.point) || !unit(p.axis) || !unit(p.up) || Math.abs(p.axis.reduce((s, n, i) => s + n * (p.up as Vec3)[i], 0)) > 1e-5
    || !["connection", "weld", "sensor", "support"].includes(String(p.purpose)) || !["flanged", "collar", "threaded", "weld"].includes(String(p.connection))
    || !["mating-face", "weld-end", "thread-reference"].includes(String(p.plane)) || !finite(p.dn) || p.dn <= 0 || !finite(p.pn) || p.pn <= 0 || !text(p.material) || !text(p.source, 12000)) return null;
  if (p.thread !== undefined && !text(p.thread, 24) || p.gender !== undefined && !["male", "female"].includes(String(p.gender)) || p.occupiedBy !== undefined && !id(p.occupiedBy)) return null;
  for (const k of ["boreMm", "boltCircleMm", "boltHoles", "boltHoleMm"]) if (p[k] !== undefined && (!finite(p[k]) || (p[k] as number) <= 0)) return null;
  return structuredClone(p) as ConnectionPoint;
}

/** Validate project snapshots before any saved geometry can reach Three.js or an asset URL. */
export function parseInsertionTemplate(raw: unknown): InsertionTemplate | null {
  const t = obj(raw), g = obj(t.geometry), s = obj(t.source);
  if (t.version !== 1 || !text(t.geometryKey, 80) || !/^[a-f0-9]{64}$/.test(t.geometryKey) || g.version !== 1 || !finite(g.ruleVersion)
    || !["straight", "concentric", "eccentric"].includes(String(g.kind)) || !finite(g.baseLengthMm) || g.baseLengthMm <= 0 || !finite(g.totalLengthMm) || g.totalLengthMm <= 0
    || !finite(g.eccentricAngleDeg) || !Array.isArray(g.bounds) || g.bounds.length !== 6 || !g.bounds.every(finite) || ![0, 1, 2].every(i => (g.bounds as number[])[i + 3] > (g.bounds as number[])[i])
    || !Array.isArray(g.pieces) || !g.pieces.length || g.pieces.length > 16 || !Array.isArray(g.ports) || g.ports.length > 8 || !Array.isArray(g.joints) || g.joints.length > 16
    || !["layout", "incomplete"].includes(String(t.status)) || ![t.issues, t.warnings].every(v => Array.isArray(v) && v.length <= 150 && v.every(x => text(x, 20000)))
    || !(s.recordId === null || id(s.recordId)) || !text(s.identityKey, 30000) || !text(s.name, 500) || !finite(s.revision) || !finite(s.pn) || !text(s.material) || !(s.price === null || finite(s.price))) return null;
  const ids = new Set<string>();
  for (const rawPiece of g.pieces) {
    const p = obj(rawPiece), shape = obj(p.shape);
    if (typeof p.auxiliary !== "boolean" || !id(p.id) || ids.has(p.id) || !id(p.componentId) || !text(p.name, 1000) || !id(p.role) || !vec(p.position) || !vec(p.rotation) || !text(p.source, 20000)
      || !["cad", "parametric", "outline", "missing"].includes(String(p.fidelity)) || !["tube", "reducer-outline", "flange", "collar", "marker", "mesh"].includes(String(shape.kind))
      || !Array.isArray(p.ports) || p.ports.length > 8 || p.ports.some(v => !parseConnectionPoint(v))) return null;
    ids.add(p.id);
    if (!validShapeThread(shape)) return null;
    for (const k of ["lengthMm", "outerMm", "innerMm", "smallOuterMm", "smallInnerMm", "lipOuterMm", "lipThicknessMm", "boltCircleMm", "boltHoles", "boltHoleMm", "faceHeightMm", "faceDiameterMm"]) if (shape[k] !== undefined && (!finite(shape[k]) || (shape[k] as number) < 0)) return null;
    if (shape.faceHeightMm !== undefined || shape.faceDiameterMm !== undefined) {
      if (shape.kind !== "flange" || !(Number(shape.faceHeightMm) > 0 && Number(shape.faceHeightMm) < Number(shape.lengthMm))
        || !(Number(shape.faceDiameterMm) > Number(shape.innerMm) && Number(shape.faceDiameterMm) <= Number(shape.outerMm))) return null;
    }
    if (shape.innerMm !== undefined && Number(shape.innerMm) >= Number(shape.outerMm)) return null;
    if (shape.lipThicknessMm !== undefined && Number(shape.lipThicknessMm) >= Number(shape.lengthMm)) return null;
    if (shape.boltHoles !== undefined && (!Number.isInteger(shape.boltHoles) || (shape.boltHoles as number) > 128)) return null;
    for (const k of ["offset", "modelRotation", "modelPosition"]) if (shape[k] !== undefined && !vec(shape[k])) return null;
    if (shape.kind === "mesh" && (!text(shape.modelHash, 64) || !/^[a-f0-9]{64}$/.test(shape.modelHash) || shape.meshUrl !== `/model-assets/model-${shape.modelHash}-v1.stl` || !Array.isArray(shape.meshBounds) || shape.meshBounds.length !== 6 || !shape.meshBounds.every(finite))) return null;
    if (["tube", "flange", "collar", "reducer-outline"].includes(String(shape.kind)) && (!(Number(shape.lengthMm) > 0) || !(Number(shape.outerMm) > 0))) return null;
  }
  if (g.ports.some(v => !parseConnectionPoint(v))) return null;
  for (const rawJoint of g.joints) {
    const j = obj(rawJoint);
    if (!["seat", "butt", "thread"].includes(String(j.kind))) return null;
    for (const end of [j.a, j.b]) {
      const e = obj(end), piece = g.pieces.find(p => obj(p).id === e.piece);
      if (!ids.has(String(e.piece)) || !(obj(piece).ports as ConnectionPoint[]).some(p => p.id === e.port)) return null;
    }
  }
  return structuredClone(t) as InsertionTemplate;
}
