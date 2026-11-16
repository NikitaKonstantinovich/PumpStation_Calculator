import type { Bounds, Hole, Issue, Mounting, Placement, TankInput, Rules } from "./types";
import type { channelPaintingCost } from "../channel-painting";
import type { FrameHardware } from "../model-editor/frame-hardware";

export const CHANNEL_REVISION = "horizontal-channel-frame-2026-11-15-v7-rivets";
export type ChannelProfile = { code:string; name:string; height:number; width:number; web:number; flange:number; rootRadius:number; toeRadius:number; kgM:number; source:string };
export type ChannelSpacing = { mm:number|null; status:"confirmed"|"conditional"|"missing"|"conflict"|"stale"; source:string; fingerprint?:string };
/** All mounting coordinates refer to the selected aggregate; axisX is in that same datum. */
export type ChannelPumpMount = { source:string; verified:boolean; target:"factory-base"|"feet"; mounting:Mounting; axisX:number; flowOffsetMm:number; bodyBounds:Bounds|null; flangeFaceToFaceMm?:number; flangeSource?:string };
export type ChannelPump = { id:string; name:string; type:string; count:number; circuit:1|2; massKg:number|null; mounting:ChannelPumpMount|null; spacing:ChannelSpacing };
export type ChannelNativePart = { id:string; name:string; role:"stand-left"|"stand-right"|"cabinet"; equipmentId?:string; meshUrl:string; source:string; hash:string; bounds:[number,number,number,number,number,number]; position:[number,number,number]; rotation:[number,number,number] };
/** Cabinet mounting is the combined mounting grid of its selected stands. No inferred cabinet size. */
export type ChannelCabinet = { equipmentId:string; source:string; verified:boolean; widthMm:number; heightMm:number; depthMm:number; mounting:Mounting; bodyBounds:Bounds; uprightBounds?:Bounds; doorDirection?:"rear"|"front"; nativeParts?:ChannelNativePart[]; serviceClearanceMm?:number };
export type ChannelInputs = { pumpMountings?:Record<string,ChannelPumpMount>; spacings?:ChannelSpacing[]; cabinet?:ChannelCabinet|null; cabinetSeparate?:boolean; cabinetEnclosureWidthMm?:600|800; vibrationSupportId?:string; weldLegMm?:number; coatingThicknessMm?:number; coatingDensityKgM3?:number; foundationHoleMm?:number|null; foundationSource?:string; fluidMassKg?:number|null; additionalFrameMassKg?:number|null; tank?:TankInput|null; tankRules?:Pick<Rules,"tankFootGapMm"|"tankBodyGapMm"|"tankStepMm"|"endMarginMm"> };
export type ChannelRules = { version:string; edgeMarginMm:number; pumpWeldOffsetMm:number; cabinetGapMm:number; roundingMm:number; anchorEndMm:number; anchorMaxPitchMm:number };
export const DEFAULT_CHANNEL_RULES:ChannelRules={version:CHANNEL_REVISION,edgeMarginMm:30,pumpWeldOffsetMm:50,cabinetGapMm:300,roundingMm:10,anchorEndMm:50,anchorMaxPitchMm:600};
export type ChannelHole=Hole & {face:"top"|"bottom";memberId?:string;valid:boolean};
/** Axis-aligned member footprint, opening is toward increasing/decreasing cross coordinate. */
export type ChannelMember={id:string;name:string;axis:"x"|"y";start:number;end:number;cross:number;opening:1|-1;profileCode:string};
export type ChannelGeometry={version:1;revision:string;arrangement?:"horizontal"|"vertical";profile:ChannelProfile;lengthMm:number;widthMm:number;heightMm:number;members:ChannelMember[];holes:ChannelHole[];pumps:Placement[];cabinet:{x:number;y:number;data:ChannelCabinet;uprightClearanceMm?:number}|null;cabinetSeparate?:boolean;spacings:ChannelSpacing[];tank?:Placement&{volumeL:number;mounting:Mounting};cabinetAdapter?:{widthMm:number;levelsMm:number[];standColumnsMm:number[];cabinetColumnsMm:number[]};flangeSpanMm?:number};
export type ChannelWelding={joints:Array<{members:[string,string];lengthMm:number}>;perJointMm:number;lengthMm:number;rateRubM:number|null;costRub:number|null;source:string};
export type ChannelHardwareGroup={id:string;name:string;owner:string;position:[number,number,number];rotation:[number,number,number];hardware:FrameHardware;source:string};
export type ChannelResult={geometry:ChannelGeometry|null;profile:ChannelProfile|null;issues:Issue[];geometryStatus:"ready"|"incomplete";dataStatus:"confirmed"|"conditional"|"missing";strengthStatus:"not-checked";fastenersStatus:"incomplete";stockLengthMm:number;stockMassKg:number|null;drilledMassKg:number|null;massNote:string;welding?:ChannelWelding;hardwareGroups?:ChannelHardwareGroup[];hardwareCostRub?:number|null;frameCostRub?:number|null;painting?:ReturnType<typeof channelPaintingCost>;material?:{componentId?:string;rateRubM:number|null;costRub:number|null;source:string}};
