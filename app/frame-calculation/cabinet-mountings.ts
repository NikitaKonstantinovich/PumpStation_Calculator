import type { StationWork } from "../station-specification";
import type { SpecEntity } from "../project-config";
import { componentField, numeric } from "./components";

/** Use the selected cabinet's width. The owner approved 600 mm for missing or
 * unsupported sizes (including 400 mm Smart cabinets) on 2026-11-11. */
export function cabinetFrameWidth(work:StationWork, explicit?:unknown):600|800 {
  const row=(work.next.entities["station-spec"] as SpecEntity).items.find(r=>r.option==="controlCabinet"&&r.quantity>0);
  const item=work.resources.components?.items.find(c=>c.id===row?.equipmentId);
  const cabinet=work.resources.cabinets?.find(c=>c.id===row?.equipmentId) as {widthMm?:number}|undefined;
  const smart=work.resources.smartCabinets?.find(c=>c.id===row?.equipmentId);
  const width=numeric(componentField(item,"widthMm")??componentField(item,"Ширина, мм")??cabinet?.widthMm
    ??smart?.enclosureDimensions?.match(/^\s*(\d+)\s*[xх×]/i)?.[1]);
  if(width===600||width===800)return width;
  // Explicit node input fills missing source data; it cannot contradict a
  // supported width already present in the pinned cabinet catalogue.
  return width===null&&(explicit===600||explicit===800)?explicit:600;
}
