import type { Bounds, Port, Vec3 } from "./model";
import type { InsertionPiece } from "./insertion-types";
import { parseLineShape } from "./line-types";

/** Explicit layout conventions, deliberately separate from the costing calculation. */
export type CollectorMount = {
  version: 1; joint: "saddle-on-surface";
  branchLengthReference: "axis-to-pipe-end" | "surface-to-pipe-end";
  confirmed: false; eccentricOffsetMm: number | null;
  flangeFaceToPipeEndMm: number | null;
  instrumentLengthsMm: Record<string, number>;
  instrumentDefaultLengthMm?: number;
  instrumentLengthReference?: "blank-length" | "surface-to-pipe-end";
  instrumentRulesRevision?: 2;
};
export type CollectorBranch = {
  id: string; componentId: string; name: string; role: "branch" | "instrument";
  portId: string; circuit: number; origin: Vec3; axis: Vec3;
  outerMm: number; innerMm: number; endMm: number; calculatedLengthMm: number | null;
  blankLengthMm?: number;
  thread?: { designation: string; pitchMm: number; lengthMm: number; depthMm: number; source: string };
  source: string; joint: "saddle-on-surface";
};
export type CollectorTemplate = {
  version: 1; ruleVersion: 1; side: "suction" | "discharge";
  mount: CollectorMount; main: { componentId: string; lengthMm: number; outerMm: number; innerMm: number; source: string } | null;
  branches: CollectorBranch[]; pieces: InsertionPiece[]; ports: Port[];
  issues: string[]; assumptions: string[]; geometryKey: string; bounds: Bounds;
};
export type CollectorBinding = {
  template: CollectorTemplate; hiddenPieceIds: string[]; selectedPieceId?: string; manualGeometry?: boolean; pieceOpacities?: Record<string,number>;
};
export const COLLECTOR_INSTRUMENT_RULES_REVISION = "collector-sgons-60-thread-v2";
export const DEFAULT_INSTRUMENT_LENGTH_MM = 60;
export const defaultCollectorMount = (): CollectorMount => ({ version: 1, joint: "saddle-on-surface", branchLengthReference: "axis-to-pipe-end", confirmed: false, eccentricOffsetMm: null, flangeFaceToPipeEndMm: null, instrumentLengthsMm: {}, instrumentDefaultLengthMm: DEFAULT_INSTRUMENT_LENGTH_MM, instrumentLengthReference: "blank-length", instrumentRulesRevision: 2 });
export function resolveCollectorMount(mount: CollectorMount): CollectorMount {
  const legacyDefault = mount.instrumentRulesRevision === undefined && mount.instrumentDefaultLengthMm === 115;
  return { ...defaultCollectorMount(), ...mount, instrumentRulesRevision: 2, instrumentDefaultLengthMm: legacyDefault ? DEFAULT_INSTRUMENT_LENGTH_MM : mount.instrumentDefaultLengthMm ?? DEFAULT_INSTRUMENT_LENGTH_MM,
    instrumentLengthReference: mount.instrumentLengthReference ?? (Object.keys(mount.instrumentLengthsMm).length ? "surface-to-pipe-end" : "blank-length") };
}
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e6;
const vec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(finite);
const text = (v: unknown): v is string => typeof v === "string" && v.length < 20000;
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function parseCollectorBinding(raw: unknown): CollectorBinding | undefined {
  const b = obj(raw), t = obj(b.template), m = obj(t.mount), main = obj(t.main);
  if (t.version !== 1 || t.ruleVersion !== 1 || !["suction", "discharge"].includes(String(t.side)) || m.version !== 1 || m.joint !== "saddle-on-surface" || m.confirmed !== false
    || m.instrumentRulesRevision !== undefined && m.instrumentRulesRevision !== 2
    || m.instrumentDefaultLengthMm !== undefined && (!finite(m.instrumentDefaultLengthMm) || m.instrumentDefaultLengthMm <= 0)
    || m.instrumentLengthReference !== undefined && !["blank-length", "surface-to-pipe-end"].includes(String(m.instrumentLengthReference))
    || !["axis-to-pipe-end", "surface-to-pipe-end"].includes(String(m.branchLengthReference)) || ![m.eccentricOffsetMm, m.flangeFaceToPipeEndMm].every(v => v === null || finite(v))
    || !m.instrumentLengthsMm || typeof m.instrumentLengthsMm !== "object" || Array.isArray(m.instrumentLengthsMm) || Object.keys(m.instrumentLengthsMm).length > 100 || !Object.values(obj(m.instrumentLengthsMm)).every(v => finite(v) && v > 0)
    || ![t.issues, t.assumptions].every(v => Array.isArray(v) && v.length <= 500 && v.every(text)) || typeof t.geometryKey !== "string" || t.geometryKey.length > 150000
    || !Array.isArray(t.bounds) || t.bounds.length !== 6 || !t.bounds.every(finite) || ![0, 1, 2].every(i => (t.bounds as number[])[i + 3] > (t.bounds as number[])[i])
    || !Array.isArray(t.branches) || t.branches.length > 100 || !Array.isArray(t.pieces) || t.pieces.length > 300 || !Array.isArray(t.ports) || t.ports.length > 100) return;
  if (t.main !== null && (!text(main.componentId) || !text(main.source) || ![main.outerMm, main.innerMm, main.lengthMm].every(v => finite(v) && v > 0) || Number(main.innerMm) >= Number(main.outerMm))) return;
  const ids = new Set<string>();
  for (const rawBranch of t.branches) {
    const a = obj(rawBranch);
    if (![a.id, a.componentId, a.name, a.portId, a.source].every(text) || !a.id || ids.has(String(a.id)) || !["branch", "instrument"].includes(String(a.role)) || a.joint !== "saddle-on-surface"
      || !vec(a.origin) || !vec(a.axis) || Math.abs(Math.hypot(...a.axis) - 1) > 1e-6 || ![a.outerMm, a.innerMm, a.endMm].every(v => finite(v) && v > 0)
      || Number(a.innerMm) >= Number(a.outerMm) || !(a.calculatedLengthMm === null || finite(a.calculatedLengthMm) && a.calculatedLengthMm > 0) || a.blankLengthMm !== undefined && (!finite(a.blankLengthMm) || a.blankLengthMm <= 0) || ![0, 1, 2].includes(Number(a.circuit))) return;
    ids.add(String(a.id));
    if (a.thread !== undefined) {
      const thread = obj(a.thread);
      if (a.role !== "instrument" || !text(thread.designation) || !text(thread.source)
        || ![thread.pitchMm, thread.lengthMm, thread.depthMm].every(v => finite(v) && v > 0)
        || Number(thread.lengthMm) / Number(thread.pitchMm) > 100 || Number(thread.depthMm) >= (Number(a.outerMm) - Number(a.innerMm)) / 2) return;
    }
  }
  for (const rawPiece of t.pieces) {
    const p = obj(rawPiece);
    if (![p.id, p.componentId, p.name, p.role, p.source].every(text) || !p.id || ids.has(String(p.id)) || !vec(p.position) || !vec(p.rotation) || !parseLineShape(p.shape)
      || !["cad", "parametric", "outline", "missing"].includes(String(p.fidelity)) || typeof p.auxiliary !== "boolean" || !Array.isArray(p.ports) || p.ports.length) return;
    ids.add(String(p.id));
  }
  const portIds = new Set<string>();
  for (const rawPort of t.ports) {
    const p = obj(rawPort);
    if (!text(p.id) || !p.id || p.id.length > 240 || portIds.has(p.id) || !vec(p.point) || !vec(p.axis) || Math.abs(Math.hypot(...p.axis) - 1) > 1e-6 || p.provisional !== true) return;
    portIds.add(p.id);
  }
  const copy = structuredClone(t) as CollectorTemplate;
  copy.mount = resolveCollectorMount(copy.mount);
  // Keys are derived from validated geometry; saved user text cannot alias the cache.
  copy.geometryKey = collectorGeometryKey(copy);
  return { template: copy, hiddenPieceIds: Array.isArray(b.hiddenPieceIds) ? b.hiddenPieceIds.filter((v): v is string => typeof v === "string" && (v === "main" || ids.has(v))) : [],
    ...(typeof b.selectedPieceId === "string" && (b.selectedPieceId === "main" || ids.has(b.selectedPieceId)) ? { selectedPieceId: b.selectedPieceId } : {}), manualGeometry: b.manualGeometry === true,
    pieceOpacities:Object.fromEntries(Object.entries(obj(b.pieceOpacities)).filter(([id,v])=>(id==="main"||ids.has(id))&&finite(v)&&v>=.1&&v<=1)) as Record<string,number> };
}
export function collectorGeometryKey(t: Pick<CollectorTemplate, "main" | "branches" | "pieces" | "mount" | "ruleVersion">): string {
  return JSON.stringify([t.ruleVersion, t.mount, t.main && [t.main.componentId, t.main.lengthMm, t.main.outerMm, t.main.innerMm],
    t.branches.map(b => [b.id, b.componentId, b.origin, b.axis, b.outerMm, b.innerMm, b.endMm, b.joint, b.thread]),
    t.pieces.map(p => [p.id, p.componentId, p.position, p.rotation, p.shape, p.fidelity])]);
}
