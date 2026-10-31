import type { Vec3 } from "./model";

/** Local +Z is up: at 0 degrees the upper outer generator is level. */
export function eccentricOffset(largeOuterMm: number, smallOuterMm: number, angleDeg = 0): Vec3 {
  const e = (largeOuterMm - smallOuterMm) / 2, theta = angleDeg * Math.PI / 180;
  return [0, -e * Math.sin(theta) || 0, e * Math.cos(theta) || 0];
}
