/** Existing station rule: one nut/washer/protrusion for a bolt, two for a stud.
 * grip is the entire physical stack including actual gaskets and collar lips. */
export function jointFastenerLength(grip: number, nut: number, washer: number, ends: 1 | 2): number {
  return grip + ends * (nut + washer + 5);
}
