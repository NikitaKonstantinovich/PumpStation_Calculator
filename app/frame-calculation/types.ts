export type Point = { x: number; y: number };
export type Hole = Point & { id: string; owner: string; diameterMm: number | null; clearanceMm?: number };
export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
export type Issue = { code: string; message: string; blocking: boolean };
type Point3 = [number, number, number];
/** Native Z-up STEP. The anchor projects to (row, flow) = (0, 0) in the frame calculation. */
export type PumpMountingCad = {
 sourceHash:string; anchorMm:Point3; boundsMm:[number,number,number,number,number,number]; pointsMm:Point3[];
};
const point3 = (value:unknown):value is Point3 => Array.isArray(value)&&value.length===3&&value.every(n=>typeof n==="number"&&Number.isFinite(n)&&Math.abs(n)<1e6);
export function readPumpMountingCad(value:unknown):PumpMountingCad|undefined {
 if (!value || typeof value!=="object") return;
 const cad=value as PumpMountingCad;
 if(typeof cad.sourceHash!=="string"||!/^[a-f0-9]{64}$/.test(cad.sourceHash)||!point3(cad.anchorMm)||
    !Array.isArray(cad.boundsMm)||cad.boundsMm.length!==6||!point3(cad.boundsMm.slice(0,3))||
    !point3(cad.boundsMm.slice(3))||[0,1,2].some(i=>cad.boundsMm[i]>=cad.boundsMm[i+3])||
    !Array.isArray(cad.pointsMm)||cad.pointsMm.length<2||cad.pointsMm.length>32||!cad.pointsMm.every(point3))return;
 return structuredClone(cad);
}
export type Mounting = { source: string; verified: boolean; holes: Hole[]; bounds: Bounds; footThicknessMm: number | null; clampHeightMm?: number | null; boltDiameterMm: number | null; fastenerSource?: string; rivetHeadPocket?: {diameterMm:number;depthMm:number}; cad?:PumpMountingCad };
export type PumpInput = { id: string; name: string; count: number; massKg: number | null; spacingMm: number | null; mounting: Mounting | null; circuit: 1 | 2 };
export type TankInput = { id: string; volumeL: number; dryMassKg: number | null; mounting: Mounting | null };
export type Rules = {
 version: string; widthMm: number; firstStandX: number; firstPumpGap: number; minStandGap: number;
 standPitchMm: number; endMarginMm: number; tankFootGapMm: number; tankBodyGapMm: number; tankStepMm: number;
 eyeletMarginMm: number; waterDensityKgL: number; priceWidthTransferApproved: boolean;
 liftingEffectiveLegs: number | null; liftingAttachmentVerified: boolean;
};
export type PriceAnchor = { id: string; lengthMm: number; thicknessMm: number; priceRub: number };
export type PriceResult = { value: number | null; method: string; anchors: PriceAnchor[]; sourceWidthMm: number; targetWidthMm: number; transferApproved: boolean; rule: string };
export type FrameVariant = { id: string; lengthMm: number; thicknessMm: 3 | 4 | 5; widthMm: number; color: "blue" | "red"; price: PriceResult; massKg: number | null; cad?: string; stl?: string; hash?: string; boundsMm?: number[] };
export type FrameFastening = {diameter:number;length:number;clamp:number;hole:number;head:number;headDiameter:number;tail:number;supportLift?:number};
export type Part = { id: string; role: string; name: string; quantity: number; unitMassKg: number | null; unitPriceRub: number | null; componentId?: string; source?: string; specified?: boolean; children?: Part[]; massAccounting?: "self" | "children"; placement?: {x:number;y:number;z:number}; fastening?:FrameFastening; };
export type MassResult = { dryKg: number | null; operatingKg: number | null; liftingKg: number | null; knownDryKg: number; knownOperatingKg: number; waterKg: number; missing: string[]; rows: {id:string;name:string;quantity:number;massKg:number|null;source?:string}[] };
export type Support = { id:string; name:string; threadMm:number; capacityKg:number|null; massKg:number|null; priceRub:number|null; mounting:"two-studs"|"other"; verified:boolean; source:string; model?:string };
export type Eyelet = { id:string; name:string; threadMm:number; capacity45Kg:number; massKg:number|null; priceRub:number|null; verified:boolean; source:string; baseDiameterMm:number|null };
export type Placement = { id:string; kind:"pump"|"tank"|"stand"|"support"|"eyelet"; x:number; y:number; bounds?:Bounds; equipmentId?:string; cad?:PumpMountingCad };
export type Layout = { lengthMm:number|null; pumps:Placement[]; tank?:Placement; stands:Placement[]; supports?:Placement[]; eyelets?:Placement[]; standDistanceMm:number|null; profiles:boolean; holes:Hole[]; issues:Issue[]; stationOffsetMm?:number; stationAlignment?:"cabinet"|"centered" };
// Measured base footprint of the selected 1500 mm left/right STEP stands.
export const STAND_HALF_LENGTH_MM = 20;
export const DEFAULT_FRAME_RULES: Rules = {
 version:"bent-frame-2026-11-11-v4",widthMm:410,firstStandX:20,firstPumpGap:55,minStandGap:20,standPitchMm:350,
 endMarginMm:30,tankFootGapMm:110,tankBodyGapMm:40,tankStepMm:10,eyeletMarginMm:30,waterDensityKgL:1,
 priceWidthTransferApproved:true,liftingEffectiveLegs:null,liftingAttachmentVerified:false
};
/** Apply the revised default to the original rules embedded in saved frame nodes.
 * Other user-authored clearances and unrelated rules retain their values. */
export function resolveFrameRules(saved:Partial<Rules>={}):Rules {
 const rules={...DEFAULT_FRAME_RULES,...saved};
 if(rules.version==="bent-frame-2026-11-10-v1"&&rules.minStandGap===50){
  rules.version=DEFAULT_FRAME_RULES.version;
  rules.minStandGap=DEFAULT_FRAME_RULES.minStandGap;
 }
 if(["bent-frame-2026-11-10-v1","bent-frame-2026-11-10-v2","bent-frame-2026-11-11-v3"].includes(rules.version))rules.version=DEFAULT_FRAME_RULES.version;
 return rules;
}
export const positive = (v:unknown):v is number => typeof v==="number" && Number.isFinite(v) && v>0;
export const nonnegative = (v:unknown):v is number => typeof v==="number" && Number.isFinite(v) && v>=0;
