import type { Bounds, Port, Vec3 } from "./model";
import type { InsertionShape, InsertionTemplate } from "./insertion-types";

/** Geometry evidence is separate from catalogue selection and from a component's pose. */
export type LineGeometry = {
  equipmentId: string; source: string; revision: string;
  length: number | null; shape?: InsertionShape; bounds?: Bounds;
  ports: Port[]; template?: InsertionTemplate;
  fidelity: "parametric" | "cad" | "outline" | "missing";
  issues: string[]; wall?: number; dn?: number; pn?: number;
  kind?: string; mountingDepth?: number;
  outerDiameter?: number;
  lipThickness?: number;
  insertionBodies?: Array<{
    leftPartId: string; rightPartId: string; pipeId: string; pn: number;
    material: string; length: number; outer: number; wall: number;
    leftAxial: number; rightAxial: number; source: string; issues: string[];
  }>;
  gasketModels?: Array<{ pn: number; shape: InsertionShape; source: string; length: number }>;
  valveModels?: Array<{ drive: string; shape: InsertionShape; source: string; length: number; catalogLength: number; series: string; flowDirection?: "left-to-right" }>;
  vibrationModels?: Array<{ pn: number; length: number | null; shape?: InsertionShape; bounds?: Bounds; fidelity: LineGeometry["fidelity"]; source: string; issues: string[] }>;
};
export type LineCatalog = { version: 1; revision: string; items: Record<string, LineGeometry>; issues: string[] };
export type LineBinding = {
  version: 1; circuit: number; pumpId: string; side: "suction" | "discharge";
  role: string; specPosition: string; equipmentId?: string; instance: number;
  quantity: number; sequence: number; fidelity: LineGeometry["fidelity"];
  length: number | null; issues: string[]; ports: [string, string] | null;
  baseline: { position: Vec3; rotation: Vec3 };
  geometryRevision: string; auxiliary?: boolean; manualGeometry?: boolean;
};
export type LineJoint = {
  id: string; a: { componentId: string; portId: string }; b: { componentId: string; portId: string };
  provisional: boolean; kind: "face" | "thread" | "seat"; overlap: number;
};

const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown, n = 1000): v is string => typeof v === "string" && v.length <= n;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e7;
const vec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(finite);
export function parseLineBinding(value: unknown): LineBinding | undefined {
  const v = obj(value), base = obj(v.baseline);
  if (v.version !== 1 || ![1, 2].includes(Number(v.circuit)) || !["suction", "discharge"].includes(String(v.side)) || !["cad", "parametric", "outline", "missing"].includes(String(v.fidelity))
    || ![v.pumpId, v.role, v.specPosition, v.geometryRevision].every(x => text(x)) || ![v.instance, v.sequence, v.quantity].every(finite) || !(v.length === null || finite(v.length) && v.length > 0)
    || !vec(base.position) || !vec(base.rotation) || !Array.isArray(v.issues) || v.issues.length > 200 || !v.issues.every(x => text(x, 20000))
    || !(v.ports === null || Array.isArray(v.ports) && v.ports.length === 2 && v.ports.every(p => text(p, 240)))) return;
  return structuredClone(v) as LineBinding;
}
export function parseLineShape(value: unknown): InsertionShape | undefined {
  const s = obj(value);
  if (!["tube", "flange", "collar", "reducer-outline", "marker", "mesh"].includes(String(s.kind))) return;
  for (const k of ["lengthMm", "outerMm", "innerMm", "smallOuterMm", "smallInnerMm", "lipOuterMm", "lipThicknessMm", "boltCircleMm", "boltHoles", "boltHoleMm"]) if (s[k] !== undefined && (!finite(s[k]) || Number(s[k]) < 0)) return;
  if (s.kind !== "marker" && s.kind !== "mesh" && !(Number(s.lengthMm) > 0 && Number(s.outerMm) > 0)) return;
  if (s.innerMm !== undefined && Number(s.innerMm) >= Number(s.outerMm)) return;
  if (s.smallInnerMm !== undefined && Number(s.smallInnerMm) >= Number(s.smallOuterMm)) return;
  if (s.boltHoles !== undefined && (!Number.isInteger(s.boltHoles) || Number(s.boltHoles) > 128)) return;
  for (const key of ["offset", "modelPosition", "modelRotation"]) if (s[key] !== undefined && !vec(s[key])) return;
  if (s.kind === "mesh" && (!text(s.modelHash, 64) || !/^[a-f0-9]{64}$/.test(s.modelHash) || ![`/model-assets/model-${s.modelHash}-v1.stl`, `/api/model-preparation/assets/model-${s.modelHash}-v1.stl`].includes(String(s.meshUrl)) || !Array.isArray(s.meshBounds) || s.meshBounds.length !== 6 || !s.meshBounds.every(finite))) return;
  return structuredClone(s) as InsertionShape;
}
export function parseLineJoints(value: unknown): LineJoint[] | undefined {
  if (!Array.isArray(value) || value.length > 3000) return;
  return value.flatMap(raw => {
    const j = obj(raw), a = obj(j.a), b = obj(j.b);
    if (![j.id, a.componentId, a.portId, b.componentId, b.portId].every(v => text(v, 240)) || !["face", "thread", "seat"].includes(String(j.kind)) || !finite(j.overlap) || j.overlap < 0) return [];
    return [{ id: j.id, a, b, provisional: j.provisional !== false, kind: j.kind, overlap: j.overlap } as LineJoint];
  });
}
