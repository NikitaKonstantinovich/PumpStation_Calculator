import type { Vec3 } from "./model";
import type { CollectorBranch, CollectorTemplate } from "./collector-types";

export type SaddleRings = { outer: Vec3[]; inner: Vec3[]; bore: Vec3[]; outerEnd: Vec3[]; innerEnd: Vec3[]; cutLengthMm: number };
export const SADDLE_SEGMENTS = 96;
const TAU = 2 * Math.PI, EPS = 1e-7;
const add = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v + b[i]) as Vec3;
const mul = (v: Vec3, s: number): Vec3 => v.map(x => x * s) as Vec3;
const dot = (a: Vec3, b: Vec3) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const sub = (a: Vec3, b: Vec3): Vec3 => add(a, mul(b, -1));
export function branchFrame(axis: Vec3): [Vec3, Vec3] {
  const hint: Vec3 = Math.abs(axis[0]) < .9 ? [1, 0, 0] : [0, 0, 1];
  const u = sub(hint, mul(axis, dot(hint, axis))), length = Math.hypot(...u);
  const unit = mul(u, 1 / length); return [unit, cross(axis, unit)];
}
/** Near-side root along the outward branch axis. A hollow-wall subtraction would leave an internal stub. */
function cylinderHit(origin: Vec3, axis: Vec3, radius: number): { point: Vec3; t: number } {
  const a = axis[1]**2 + axis[2]**2, b = 2*(origin[1]*axis[1]+origin[2]*axis[2]), c = origin[1]**2+origin[2]**2-radius**2;
  const d = b*b-4*a*c;
  if (a < 1e-8 || d < -EPS) throw new Error("ось или контур врезки не пересекает ближнюю стенку цилиндра");
  const t = (-b+Math.sqrt(Math.max(0,d)))/(2*a); return { point: add(origin, mul(axis,t)), t };
}
export function saddleRings(main: NonNullable<CollectorTemplate["main"]>, branch: CollectorBranch): SaddleRings {
  if (branch.joint !== "saddle-on-surface") throw new Error("неподдерживаемый тип врезки");
  if (!(main.innerMm > 0 && main.outerMm > main.innerMm && branch.innerMm > 0 && branch.outerMm > branch.innerMm && branch.endMm > 0)
    || Math.abs(Math.hypot(...branch.axis)-1) > 1e-6) throw new Error("некорректные размеры или ось врезки");
  const [u,v] = branchFrame(branch.axis), outer: Vec3[] = [], inner: Vec3[] = [], bore: Vec3[] = [], outerEnd: Vec3[] = [], innerEnd: Vec3[] = [];
  let minT = Infinity;
  for (let i=0; i<SADDLE_SEGMENTS; i++) {
    const a=TAU*i/SADDLE_SEGMENTS, radial=add(mul(u,Math.cos(a)),mul(v,Math.sin(a)));
    const op=add(branch.origin,mul(radial,branch.outerMm/2)), ip=add(branch.origin,mul(radial,branch.innerMm/2));
    const o=cylinderHit(op,branch.axis,main.outerMm/2), n=cylinderHit(ip,branch.axis,main.outerMm/2), inside=cylinderHit(ip,branch.axis,main.innerMm/2);
    if (Math.max(o.t,n.t) >= branch.endMm-EPS) throw new Error("торец патрубка находится внутри седла: недостаточная длина");
    if ([o.point,n.point,inside.point].some(p=>Math.abs(p[0]) >= main.lengthMm/2-EPS)) throw new Error("врезка выходит за торец магистрали");
    if (inside.t >= n.t-EPS) throw new Error("не определена ближняя стенка врезки");
    outer.push(o.point); inner.push(n.point); bore.push(inside.point);
    outerEnd.push(add(op,mul(branch.axis,branch.endMm))); innerEnd.push(add(ip,mul(branch.axis,branch.endMm))); minT=Math.min(minT,o.t);
  }
  return {outer,inner,bore,outerEnd,innerEnd,cutLengthMm:branch.endMm-minT};
}
