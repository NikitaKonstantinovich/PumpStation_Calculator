import { add, subtract, distance, rotate, worldPoint, pipePoints, type Vec3, type Assembly, type Component, type EditorState } from "./model";
import type { SnapKind, SnapPlane, SnapSettings } from "./snap-settings";
import { branchFrame, saddleRings } from "./collector-intersection";
import { resolvedCollectorMetal } from "./collector-mesh";

export const scale = (a: Vec3, n: number): Vec3 => a.map(v => v * n) as Vec3;
export const dot = (a: Vec3, b: Vec3) => a.reduce((s, v, i) => s + v * b[i], 0);
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(...a) || 1));
export const midpoint = (a: Vec3, b: Vec3) => scale(add(a, b), .5);
export function localPoint(c: Component, p: Vec3): Vec3 {
  const d = subtract(p, c.position);
  return [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(a => dot(d, rotate(a as Vec3, c.rotation))) as Vec3;
}
type Feature = { id: string; componentId: string };
export type SnapPoint = Feature & { point: Vec3; kinds: SnapKind[]; approximate?: boolean; note?: string; axis?: Vec3 };
export type SnapLine = Feature & { a: Vec3; b: Vec3; axis?: boolean };
export type SnapCircle = Feature & SnapPlane & { radius: number };
export type SnapFace = Feature & SnapPlane & { halfU: number; halfV: number; radius?: number };
export type SnapGeometry = { points: SnapPoint[]; lines: SnapLine[]; circles: SnapCircle[]; faces: SnapFace[] };

/** Shared with the renderer: exact beam solids, not the bounding box around the hollow frame. */
export function frameBoxes(p: Component["parameters"]): Array<{ center: Vec3; size: Vec3 }> {
  const rail = Math.min(60, p.width / 3, p.length / 3);
  return [
    ...[-1, 1].map(y => ({ center: [0, y * (p.width - rail) / 2, 0] as Vec3, size: [p.length, rail, p.height] as Vec3 })),
    ...[-1, 1].map(x => ({ center: [x * (p.length - rail) / 2, 0, 0] as Vec3, size: [rail, Math.max(1, p.width - 2 * rail), p.height] as Vec3 })),
  ];
}
export function snapGeometry(assembly: Assembly, references: EditorState["referencePoints"] = []): SnapGeometry {
  const g: SnapGeometry = { points: [], lines: [], circles: [], faces: [] };
  for (const c of assembly.components.filter(c => !c.hidden)) {
    const feature = (id: string) => ({ id: `${c.id}/${id}`, componentId: c.id });
    const point = (id: string, p: Vec3, kinds: SnapKind[]) => g.points.push({ ...feature(id), point: p, kinds });
    point("base", c.position, ["base"]);
    for (const p of c.ports.filter(p => !c.collector?.hiddenPieceIds.includes(`branch-${p.id}`))) g.points.push({ ...feature(`port/${p.id}`), point: worldPoint(c, p.point), kinds: ["port"], axis: p.axis && rotate(p.axis, c.rotation), approximate: p.provisional,
      note: p.provisional ? "предварительные данные патрубка" : "метаданные патрубка; монтажная пригодность требует проверки" });
    for (const p of references.filter(p => p.componentId === c.id)) g.points.push({ ...feature(`reference/${p.id}`), point: worldPoint(c, p.point), kinds: ["reference"], approximate: p.approximate, note: p.approximate ? "опора сохранена по полигональной сетке" : undefined });
    if (c.kind === "frame") frameBoxes(c.parameters).forEach((box, bi) => {
      const vertices: Vec3[] = [];
      for (let bits = 0; bits < 8; bits++) vertices.push(worldPoint(c, add(box.center, box.size.map((s, a) => (bits & (1 << a) ? 1 : -1) * s / 2) as Vec3)));
      vertices.forEach((p, vi) => point(`beam${bi}/vertex${vi}`, p, ["vertex", "end"]));
      for (let vi = 0; vi < 8; vi++) for (let axis = 0; axis < 3; axis++) if (!(vi & (1 << axis))) g.lines.push({ ...feature(`beam${bi}/edge${vi}-${axis}`), a: vertices[vi], b: vertices[vi | (1 << axis)] });
      for (let normal = 0; normal < 3; normal++) for (const sign of [-1, 1]) {
        const u = (normal + 1) % 3, v = (normal + 2) % 3;
        const center = [...box.center] as Vec3; center[normal] += sign * box.size[normal] / 2;
        const face: SnapFace = { ...feature(`beam${bi}/face${normal}-${sign}`), origin: worldPoint(c, center), u: rotate([0, 0, 0].map((_, i) => i === u ? 1 : 0) as Vec3, c.rotation), v: rotate([0, 0, 0].map((_, i) => i === v ? 1 : 0) as Vec3, c.rotation), halfU: box.size[u] / 2, halfV: box.size[v] / 2 };
        g.faces.push(face); point(face.id + "/center", face.origin, ["faceCenter", "centroid"]);
      }
    });
    if (c.collector) {
      const t = c.collector.template, hidden = c.collector.hiddenPieceIds, metal = resolvedCollectorMetal(t);
      const end = (id: string, origin: Vec3, axis: Vec3, radius: number) => {
        const [u,v] = branchFrame(axis), circle: SnapCircle = { ...feature(id), origin: worldPoint(c,origin), u: rotate(u,c.rotation), v: rotate(v,c.rotation), radius };
        g.circles.push(circle); point(id+"/center",circle.origin,["center","faceCenter","centroid"]);
        for(let i=0;i<4;i++) point(id+`/q${i}`,add(circle.origin,scale([circle.u,circle.v,scale(circle.u,-1),scale(circle.v,-1)][i],radius)),["quadrant"]);
      };
      if(t.main&&!hidden.includes("main"))for(const s of [-1,1])end(`main-end-${s}`,[s*t.main.lengthMm/2,0,0],[s,0,0],t.main.outerMm/2);
      for(const b of t.branches.filter(b=>!hidden.includes(b.id) && metal.branches[b.id])) {
        const tip=add(b.origin,scale(b.axis,b.endMm));end(`${b.id}/end`,tip,b.axis,b.outerMm/2);end(`${b.id}/bore`,tip,b.axis,b.innerMm/2);
        if(t.main)try { const rings=saddleRings(t.main,b),base=scale(rings.outer.reduce((sum,p)=>add(sum,p),[0,0,0] as Vec3),1/rings.outer.length);
          g.lines.push({...feature(`${b.id}/axis`),a:worldPoint(c,base),b:worldPoint(c,tip),axis:true});
          rings.outer.forEach((p,i)=>g.points.push({...feature(`${b.id}/saddle-${i}`),point:worldPoint(c,p),kinds:["vertex"],approximate:true,note:"Дискретизированный аналитический контур седла"}));
        }catch { /* Invalid cuts have diagnostic symbols, never fictitious flat saddle faces. */ }
      }
    }
    if (c.kind === "pipe" || c.kind === "collector" && !c.collector) {
      const points = c.kind === "pipe" ? pipePoints(assembly, c) : [-1, 1].map(s => worldPoint(c, [s * c.parameters.length / 2, 0, 0]));
      for (let i = 1; i < points.length; i++) if (distance(points[i - 1], points[i]) > 1e-6) g.lines.push({ ...feature(`axis${i}`), a: points[i - 1], b: points[i], axis: true });
      // Only exposed end circles. Spherical bend proxies are not analytic pipe arcs.
      for (const index of [0, points.length - 1]) {
        const axis = unit(subtract(points[index === 0 ? 1 : index], points[index === 0 ? 0 : index - 1]));
        // Basis follows component rotation, so quadrants rotate with the part.
        let seed = rotate([0, 1, 0], c.rotation);
        if (Math.abs(dot(seed, axis)) > .95) seed = rotate([0, 0, 1], c.rotation);
        const u = unit(subtract(seed, scale(axis, dot(seed, axis)))), v = unit(cross(axis, u));
        const circle: SnapCircle = { ...feature(`circle${index}`), origin: points[index], u, v, radius: c.parameters.diameter / 2 };
        g.circles.push(circle); g.faces.push({ ...circle, halfU: circle.radius, halfV: circle.radius });
        point(`circle${index}/center`, circle.origin, ["center", "faceCenter", "centroid"]);
        for (let q = 0; q < 4; q++) point(`circle${index}/q${q}`, add(circle.origin, scale([u, v, scale(u, -1), scale(v, -1)][q], circle.radius)), ["quadrant"]);
      }
    }
  }
  for (const l of g.lines) {
    g.points.push({ id: l.id + "/a", componentId: l.componentId, point: l.a, kinds: ["end"] }, { id: l.id + "/b", componentId: l.componentId, point: l.b, kinds: ["end"] }, { id: l.id + "/mid", componentId: l.componentId, point: midpoint(l.a, l.b), kinds: ["mid"] });
  }
  return g;
}
export function workingPlane(settings: SnapSettings, g: SnapGeometry): SnapPlane | null {
  if (settings.plane === "face") return g.faces.find(f => f.componentId === settings.face?.componentId && f.id === settings.face.featureId) ?? null;
  return { origin: [0, 0, 0], u: settings.plane === "YZ" ? [0, 1, 0] : [1, 0, 0], v: settings.plane === "XY" ? [0, 1, 0] : [0, 0, 1] };
}
export function projectPlane(p: Vec3, plane: SnapPlane): Vec3 {
  const d = subtract(p, plane.origin);
  return add(plane.origin, add(scale(plane.u, dot(d, plane.u)), scale(plane.v, dot(d, plane.v))));
}
export function onFace(p: Vec3, face: SnapFace): boolean {
  const d = subtract(p, face.origin), x = dot(d, face.u), y = dot(d, face.v);
  return Math.abs(dot(d, cross(face.u, face.v))) < 1e-4 && (face.radius ? Math.hypot(x, y) <= face.radius + 1e-6 : Math.abs(x) <= face.halfU + 1e-6 && Math.abs(y) <= face.halfV + 1e-6);
}
export function excludedTargets(assembly: Assembly, movingId?: string): Set<string> {
  return new Set(assembly.components.filter(c => c.id === movingId || c.routing?.automatic && !c.locked && (c.routing.from.componentId === movingId || c.routing.to.componentId === movingId)).map(c => c.id));
}
