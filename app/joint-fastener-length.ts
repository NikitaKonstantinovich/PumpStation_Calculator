import { engineeringOperation, registerOperation } from "./engineering/runtime";
/** Existing station rule: one nut/washer/protrusion for a bolt, two for a stud.
 * grip is the entire physical stack including actual gaskets and collar lips. */
export function coreJointFastenerLength(grip: number, nut: number, washer: number, ends: 1 | 2): number {
  return grip + ends * (nut + washer + 5);
}

export function jointFastenerLength(...args: Parameters<typeof coreJointFastenerLength>): ReturnType<typeof coreJointFastenerLength> {
  return engineeringOperation("jointFastenerLength", coreJointFastenerLength, args);
}

registerOperation("jointFastenerLength", ["grip","nut","washer","ends"], coreJointFastenerLength);
