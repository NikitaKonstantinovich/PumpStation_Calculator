import type { Vec3 } from "./model";
import type { InsertionShape } from "./insertion-types";
/** Extrusion rotates XY into YZ by +90 about Y: (u,v) -> (v,-u).
 * One definition supplies both the visible holes and the fastener axes. */
export function flangeHoleCenters(s: InsertionShape): Vec3[] {
  if (!s.boltCircleMm || !s.boltHoles || !s.boltHoleMm) return [];
  return Array.from({length:s.boltHoles},(_,i)=>{
    const a=2*Math.PI*(i+.5)/s.boltHoles!;
    return [0,Math.sin(a)*s.boltCircleMm!/2,-Math.cos(a)*s.boltCircleMm!/2] as Vec3;
  });
}
