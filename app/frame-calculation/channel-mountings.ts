import reviewed from "../../data/horizontal-frame-mounts.json";
import type { Pump } from "../pump-catalog";
import { positive, type Mounting } from "./types";
import type { ChannelPumpMount } from "./channel-types";

/** Reuse only an exact reviewed execution already present in the pinned catalogue. */
export function reviewedChannelMount(pump:Pump|undefined,mounting:Mounting|null):ChannelPumpMount|null {
 if(pump?.type==="vertical_multistage")return verticalChannelMount(pump,mounting);
 if(!pump||!mounting?.verified||!mounting.cad||!["end_suction","horizontal_multistage"].includes(pump.type))return null;
 const row=reviewed.rows.find(r=>r.variantId===pump.id&&r.designation===(pump.execution||pump.model)&&r.manufacturer===pump.manufacturer&&r.series===pump.series&&r.article===pump.article&&r.motor.power_kw===pump.power&&r.mounting.cad.sourceHash===mounting.cad!.sourceHash);
 if(!row||row.mounting.holes.length!==mounting.holes.length||row.mounting.holes.some((h,i)=>[h.x-mounting.holes[i].x,h.y-mounting.holes[i].y].some(v=>Math.abs(v)>.001)||h.diameterMm!==mounting.holes[i].diameterMm))return null;
 const cad=mounting.cad,[flow,axis]=cad.anchorMm,b=cad.boundsMm;
 // This audited dataset uses inlet-zero, Z-up CAD; the row datum is the inlet axis.
 return {source:mounting.source,verified:true,target:pump.type==="end_suction"?"factory-base":"feet",mounting:structuredClone(mounting),axisX:-axis,flowOffsetMm:flow,
  bodyBounds:{minX:b[1]-axis,maxX:b[4]-axis,minY:b[0]-flow,maxY:b[3]-flow}};
}

export function verticalChannelMount(pump:Pump,mounting:Mounting|null):ChannelPumpMount|null {
 if(!mounting?.verified||!mounting.source)return null;
 const root=pump.dimensions??{},base=root.baseGeometry;
 const dimensions=positive(root.flange_face_to_face)?root:base&&typeof base==="object"&&!Array.isArray(base)?base:root;
 const rows=Array.isArray(dimensions.sourceValues)?dimensions.sourceValues:[];
 const evidence=rows.find(v=>v&&typeof v==="object"&&!Array.isArray(v)&&v.code==="flange_face_to_face");
 const value=evidence&&typeof evidence==="object"&&!Array.isArray(evidence)?evidence.valueMm??evidence.value:undefined;
 const span=positive(dimensions.flange_face_to_face)?dimensions.flange_face_to_face:positive(value)?value:mounting.flangeFaceToFaceMm;
 const source=span?`${pump.manufacturer} ${pump.model}: flange_face_to_face; ${String(dimensions.dimensionSetId??mounting.source)}`:undefined;
 return {source:mounting.source,verified:true,target:"feet",mounting:structuredClone(mounting),axisX:0,flowOffsetMm:0,bodyBounds:{...mounting.bounds},flangeFaceToFaceMm:span,flangeSource:source};
}
