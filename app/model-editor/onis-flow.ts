import records from "../../data/onis-flow-reviews.json";
import type { Bounds, Port, PumpProfile, Vec3 } from "./model";
import type { FlangeMount } from "./fastener-types";

type MeasuredPort = { point: number[]; axis: number[] };
type FlowReview = {
  pumpId: string|null; source: string; inlet: string; bounds: Bounds; method: string;
  originalPorts: Record<string, MeasuredPort>; mounts: Record<string, FlangeMount>;
};
const reviewed = records as unknown as Record<string, FlowReview>;
export function reviewedMvMounts(hash: string) { return reviewed[hash]?.mounts; }

export function reviewedOnisLibraryPorts(hash:string, source:string, bounds:Bounds):Port[] {
  const row=reviewed[hash];
  if(!row || row.source!==source || !bounds.every((v,i)=>Math.abs(v-row.bounds[i])<.01)) return [];
  return Object.entries(row.originalPorts).map(([id,p])=>({
    id:id===row.inlet ? "inlet":"outlet", point:[...p.point] as Vec3, axis:[...p.axis] as Vec3,
    provisional:true, source:row.source
  }));
}

/** A project can pin a manifest which predates the flow review. Apply it only
 * to the exact measured solid and frame, retaining the original CAD pose. */
export function applyMvFlowReview(pumpId: string, profile?: PumpProfile): PumpProfile | undefined {
  if (!profile) return profile;
  const row = reviewed[profile.sourceHash];
  if (!row || row.method !== "casing_arrows" || row.pumpId !== pumpId || row.source !== profile.source || profile.ports.length !== 2) return profile;
  if (!["port-a","port-b"].every(id => {
    const port = profile.ports.find(p => p.id === id), original = row.originalPorts[id];
    return port && original && port.axis && port.point.every((v,i) => v === original.point[i])
      && port.axis.every((v,i) => v === original.axis[i]);
  })) return profile;
  const evidence = "Направление потока подтверждено двумя стрелками на основании исходной STEP-модели ONIS.";
  const ports = profile.ports.map(p => ({...p, id:p.id === row.inlet ? "inlet" : "outlet",source:evidence}));
  return {...profile, ports, warnings:[...profile.warnings.filter(w => !w.startsWith("Направление потока MV не подтверждено")),evidence]};
}
