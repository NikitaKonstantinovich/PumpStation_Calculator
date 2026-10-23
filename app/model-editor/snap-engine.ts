import { add, subtract, distance, editComponent, type Assembly, type Vec3 } from "./model";
import { cross, dot, scale, unit, midpoint, onFace, projectPlane, type SnapGeometry, type SnapLine, type SnapPoint } from "./snap-geometry";
import { snapDefinitions, supportedSnap, type SnapKind, type SnapSettings, type SnapPlane } from "./snap-settings";

export type SnapPick = { point: Vec3; label: string; approximate: boolean; projected: boolean; componentId?: string; kinds: SnapKind[]; axis?: Vec3; note?: string };
export type Candidate = SnapPick & { id: string; symbol: string; guide?: [Vec3, Vec3]; componentIds: string[] };
export type Ray = { origin: Vec3; direction: Vec3 };
export type ScreenPoint = { x: number; y: number; visible: boolean };
export type SnapQuery = {
  geometry: SnapGeometry; settings: SnapSettings; ray: Ray; plane: SnapPlane | null;
  project: (point: Vec3) => ScreenPoint; pointer: { x: number; y: number };
  exclude?: Set<string>; onlyComponent?: string;
  reference?: Vec3; secondReference?: Vec3; parallelLine?: SnapLine;
  referenceApproximate?: boolean; secondReferenceApproximate?: boolean;
  surface?: { point: Vec3; componentId: string; vertices?: Vec3[] };
};
const epsilon = 1e-5;
const definitions = new Map(snapDefinitions.map(d => [d.id, d]));
export function rayPlane(ray: Ray, plane: SnapPlane): Vec3 | null {
  const n = cross(plane.u, plane.v), divisor = dot(ray.direction, n);
  if (Math.abs(divisor) < 1e-9) return null;
  const t = dot(subtract(plane.origin, ray.origin), n) / divisor;
  return t >= 0 ? add(ray.origin, scale(ray.direction, t)) : null;
}
export function footOnLine(point: Vec3, a: Vec3, b: Vec3, clamp = true): Vec3 {
  const d = subtract(b, a), t = dot(subtract(point, a), d) / (dot(d, d) || 1);
  return add(a, scale(d, clamp ? Math.max(0, Math.min(1, t)) : t));
}
/** Closest point on the feature to the view ray, never a screen-depth guess. */
export function closestToRay(ray: Ray, a: Vec3, b: Vec3, clamp = true): Vec3 {
  const v = subtract(b, a), w = subtract(a, ray.origin), dv = dot(ray.direction, v);
  const den = dot(v, v) - dv * dv;
  const t = Math.abs(den) < 1e-9 ? (clamp ? .5 : 0) : (dv * dot(ray.direction, w) - dot(v, w)) / den;
  return add(a, scale(v, clamp ? Math.max(0, Math.min(1, t)) : t));
}
/** Rejects skew and collinear segments; overlap has no unique intersection point. */
export function segmentIntersection(a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3 | null {
  const u = subtract(b, a), v = subtract(d, c), n = cross(u, v), nn = dot(n, n);
  if (nn < epsilon * epsilon) return null;
  const w = subtract(c, a), t = dot(cross(w, v), n) / nn, s = dot(cross(w, u), n) / nn;
  if (t < -1e-8 || t > 1 + 1e-8 || s < -1e-8 || s > 1 + 1e-8) return null;
  const p = add(a, scale(u, t)), q = add(c, scale(v, s));
  return distance(p, q) < epsilon ? midpoint(p, q) : null;
}
export function tangentPoints(reference: Vec3, circle: SnapGeometry["circles"][number]): Vec3[] {
  const d = subtract(reference, circle.origin), n = cross(circle.u, circle.v), length = Math.hypot(...d), r = circle.radius;
  if (Math.abs(dot(d, n)) > epsilon || length < r - epsilon) return [];
  if (Math.abs(length - r) < epsilon) return [reference];
  const base = add(circle.origin, scale(d, r * r / (length * length))), offset = scale(unit(cross(n, d)), r * Math.sqrt(1 - r * r / (length * length)));
  return [add(base, offset), subtract(base, offset)];
}
/** Numerical search on the analytic circle also works when its plane is edge-on to the camera. */
export function nearestCircleToRay(ray: Ray, circle: SnapGeometry["circles"][number]): Vec3 {
  const at = (angle: number) => add(circle.origin, add(scale(circle.u, circle.radius * Math.cos(angle)), scale(circle.v, circle.radius * Math.sin(angle))));
  const score = (angle: number) => { const delta = subtract(at(angle), ray.origin); return dot(delta, delta) - Math.max(0, dot(delta, ray.direction)) ** 2; };
  const step = Math.PI / 32;
  let best = 0, value = Infinity;
  for (let i = 0; i < 64; i++) { const v = score(i * step); if (v < value) { value = v; best = i * step; } }
  let lo = best - step, hi = best + step;
  for (let i = 0; i < 40; i++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3; if (score(a) < score(b)) hi = b; else lo = a; }
  return at((lo + hi) / 2);
}
export function candidates(q: SnapQuery): Candidate[] {
  if (!q.settings.enabled || q.settings.types.project && !q.plane) return [];
  const result: Candidate[] = [], types = q.settings.types;
  const allowed = (id: string) => !q.exclude?.has(id) && (!q.onlyComponent || q.onlyComponent === id);
  const emit = (p: SnapPoint, guide?: [Vec3, Vec3], componentIds = [p.componentId], forceProjection = false) => {
    const kinds = p.kinds.filter(k => types[k] && supportedSnap(k));
    if (!kinds.length || componentIds.some(id => id && !allowed(id))) return;
    const projected = forceProjection || types.project && Boolean(q.plane);
    const point = projected && q.plane ? projectPlane(p.point, q.plane) : p.point;
    const derivedApproximate = q.referenceApproximate && kinds.some(k => ["perpendicular", "planeFoot", "tangent", "parallel", "between", "trackX", "trackY", "trackZ", "ortho", "polar"].includes(k)) || q.secondReferenceApproximate && kinds.includes("between");
    result.push({ id: p.id, point, kinds, componentId: p.componentId || undefined, componentIds: componentIds.filter(Boolean), approximate: !!p.approximate || !!derivedApproximate, projected,
      symbol: definitions.get(kinds[0])!.symbol, label: kinds.map(k => definitions.get(k)!.label).join(" / "), note: p.note, axis: p.axis, guide });
  };
  for (const p of q.geometry.points) if (allowed(p.componentId)) emit(p);
  const lines = q.geometry.lines.filter(l => allowed(l.componentId));
  for (const l of lines) {
    const base = { id: l.id, componentId: l.componentId };
    if (types.nearEdge || types.axis && l.axis) emit({ ...base, id: l.id + "/near", point: closestToRay(q.ray, l.a, l.b), kinds: ["nearEdge", ...(l.axis ? ["axis" as const] : [])] });
    if (types.extension) {
      const point = closestToRay(q.ray, l.a, l.b, false);
      if (distance(point, footOnLine(point, l.a, l.b)) > epsilon) emit({ ...base, id: l.id + "/extension", point, kinds: ["extension"] }, [l.a, point]);
    }
    if (q.reference && types.perpendicular) {
      const point = footOnLine(q.reference, l.a, l.b, false);
      if (distance(point, footOnLine(point, l.a, l.b)) < epsilon) emit({ ...base, id: l.id + "/foot", point, kinds: ["perpendicular"] }, [q.reference, point]);
    }
  }
  for (const c of q.geometry.circles.filter(c => allowed(c.componentId))) {
    if (types.nearEdge) {
      emit({ id: c.id + "/near", componentId: c.componentId, point: nearestCircleToRay(q.ray, c), kinds: ["nearEdge"] });
    }
    if (q.reference && types.tangent) tangentPoints(q.reference, c).forEach((point, i) => emit({ id: c.id + `/tangent${i}`, componentId: c.componentId, point, kinds: ["tangent"] }, [q.reference!, point]));
  }
  if (q.reference && types.planeFoot) for (const f of q.geometry.faces.filter(f => allowed(f.componentId))) {
    const point = projectPlane(q.reference, f);
    if (onFace(point, f)) emit({ id: f.id + "/foot", componentId: f.componentId, point, kinds: ["planeFoot"] }, [q.reference, point]);
  }
  // Screen-space broad phase avoids all-pairs work on the complete assembly.
  if (types.intersection || types.apparent && types.project && q.plane) {
    for (const projected of [false, true]) {
      if (projected ? !(types.apparent && types.project && q.plane) : !types.intersection) continue;
      const nearby = lines.map(l => ({ ...l, a: projected ? projectPlane(l.a, q.plane!) : l.a, b: projected ? projectPlane(l.b, q.plane!) : l.b })).filter(l => {
        const a = q.project(l.a), b = q.project(l.b), r = q.settings.radius * 1.5;
        return (a.visible || b.visible) && q.pointer.x >= Math.min(a.x, b.x) - r && q.pointer.x <= Math.max(a.x, b.x) + r && q.pointer.y >= Math.min(a.y, b.y) - r && q.pointer.y <= Math.max(a.y, b.y) + r;
      });
      for (let i = 0; i < nearby.length; i++) for (let j = i + 1; j < nearby.length; j++) {
        const a = nearby[i], b = nearby[j], point = segmentIntersection(a.a, a.b, b.a, b.b);
        if (point) emit({ id: `${projected ? "projection" : "int"}/${a.id}/${b.id}`, componentId: a.componentId, point, kinds: [projected ? "apparent" : "intersection"] }, undefined, [a.componentId, b.componentId], projected);
      }
    }
  }
  if (q.surface && allowed(q.surface.componentId)) {
    emit({ id: q.surface.componentId + "/surface", componentId: q.surface.componentId, point: q.surface.point, kinds: ["nearFace"], approximate: true, note: "по полигональной сетке" });
    for (const [i, point] of (q.surface.vertices ?? []).entries()) emit({ id: q.surface.componentId + `/mesh${i}/${point.join(",")}`, componentId: q.surface.componentId, point, kinds: ["meshVertex"], approximate: true, note: "по сетке: треугольник под курсором" });
  }
  if (q.reference && !q.onlyComponent) {
    const ref = q.reference;
    const guide = (kind: SnapKind, direction: Vec3, origin = ref) => {
      const point = closestToRay(q.ray, origin, add(origin, direction), false);
      emit({ id: `guide/${kind}/${direction.join(",")}`, componentId: "", point, kinds: [kind] }, [origin, point]);
    };
    if (q.secondReference) emit({ id: "between", componentId: "", point: midpoint(ref, q.secondReference), kinds: ["between"] }, [ref, q.secondReference]);
    for (const [i, kind] of (["trackX", "trackY", "trackZ"] as const).entries()) if (types[kind]) guide(kind, [0, 0, 0].map((_, j) => i === j ? 1 : 0) as Vec3);
    if (types.parallel && q.parallelLine && allowed(q.parallelLine.componentId)) guide("parallel", unit(subtract(q.parallelLine.b, q.parallelLine.a)));
    if (q.plane) {
      const origin = projectPlane(ref, q.plane);
      if (types.ortho) { guide("ortho", q.plane.u, origin); guide("ortho", q.plane.v, origin); }
      if (types.polar) {
        const p = rayPlane(q.ray, q.plane);
        if (p) {
          const d = subtract(p, origin), step = q.settings.polarStep * Math.PI / 180;
          const angle = Math.round(Math.atan2(dot(d, q.plane.v), dot(d, q.plane.u)) / step) * step;
          guide("polar", add(scale(q.plane.u, Math.cos(angle)), scale(q.plane.v, Math.sin(angle))), origin);
        }
      }
    }
  }
  return result;
}

/** Filter first, then merge coincident candidates without losing enabled type labels or provenance. */
export function rankedCandidates(all: Candidate[], project: SnapQuery["project"], pointer: SnapQuery["pointer"], radius: number, previous?: string): Candidate[] {
  const unique = new Map<string, Candidate & { screenDistance: number }>();
  for (const c of all) {
    const screen = project(c.point), d = Math.hypot(screen.x - pointer.x, screen.y - pointer.y);
    if (!screen.visible || d > radius * (c.id === previous ? 1.4 : 1)) continue;
    const key = c.point.map(v => Math.round(v / epsilon)).join(",") + "/" + c.projected;
    const existing = unique.get(key);
    if (existing) {
      existing.kinds = [...new Set([...existing.kinds, ...c.kinds])];
      existing.label = existing.kinds.map(k => definitions.get(k)!.label).join(" / ");
      existing.componentIds = [...new Set([...existing.componentIds, ...c.componentIds])];
      existing.approximate = existing.approximate && c.approximate;
      existing.axis ??= c.axis;
      existing.note = [existing.note, c.note].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join("; ");
    } else unique.set(key, { ...c, screenDistance: d });
  }
  const isNear = (c: Candidate) => c.kinds.every(k => ["nearEdge", "nearFace", "axis", "extension", "trackX", "trackY", "trackZ", "ortho", "polar", "parallel"].includes(k));
  return [...unique.values()].sort((a, b) => Number(isNear(a)) - Number(isNear(b)) || (a.screenDistance - (a.id === previous ? radius * .35 : 0)) - (b.screenDistance - (b.id === previous ? radius * .35 : 0)) || a.id.localeCompare(b.id));
}
export function moveByPoints(assembly: Assembly, componentId: string, source: Vec3, target: Vec3): Assembly {
  const c = assembly.components.find(c => c.id === componentId);
  if (!c || c.locked || c.hidden || c.routing?.automatic) return assembly;
  // Deliberately no grid rounding: the selected source must coincide with the target.
  return editComponent(assembly, { id: componentId, patch: { position: add(c.position, subtract(target, source)) } });
}
