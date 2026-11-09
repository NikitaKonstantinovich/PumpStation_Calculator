import { engineeringOperation, registerOperation } from "./engineering/runtime";
import { pchipValue, cubicTurningPoints } from "./pchip";
import { curveSegments, type CurveMethod } from "./curve-methods";
import type { PumpFileKind, PumpFileReference } from "./pump-files";

export type PumpType = "vertical_multistage" | "horizontal_multistage" | "end_suction" | "inline" | "submersible" | "unknown";
export type PumpPropertyValue = string | number | boolean | null | PumpPropertyValue[] | { [key: string]: PumpPropertyValue };
export type PumpProperties = Record<string, PumpPropertyValue>;
export type PumpSpatialData = {
  version: 1; units: "mm"; coordinateSystem: "inlet";
  boundsMm: [number | null, number | null, number | null, number | null, number | null, number | null];
  ports: Array<{ id: "inlet" | "outlet"; point: [number, number, number]; axis: [number, number, number]; source: string }>;
  source: string; rule: string; issues: string[];
};
export type Pump = {
  spacingEvidence?: import("./pump-spacing").SpacingEvidence;
  spacingSnapshotId?: string;
  id: string; manufacturer: string; series: string; group: string; model: string; type: PumpType;
  power: number | null; efficiency: number | null; nominalFlow: number | null;
  minFlow: number | null; maxFlow: number | null; minHead: number | null; maxHead: number | null;
  selectionFlowRange?: [number, number];
  price: number | null; priceCurrency: "USD" | "CNY" | "RUB" | null;
  priceKind?: "list" | "net"; discountPercent?: number | null;
  priceSource: string | null; source: string | null; drawing: string | null; drawingSource?: string;
  drawings?: { url: string; name: string; contentType: string; previewUrl?: string; scope: string; note: string; page?: number; source?: string }[];
  curve: Array<[number, number]>; efficiencyCurve?: Array<[number, number]>;
  powerCurve?: Array<[number, number]>; npshCurve?: Array<[number, number]>;
  medium?: "water" | "wastewater"; selectable?: boolean; active?: boolean;
  article?: string; execution?: string; dataWarnings?: string[];
  ratedHead?: number | null; voltage?: string | null; frequencyHz?: number | null;
  speedRpm?: number | null; weightKg?: number | null; inletDn?: number | null; outletDn?: number | null;
  description?: string | null; availability?: string | null; catalogSource?: string;
  electric?: PumpProperties; materials?: PumpProperties; dimensions?: PumpProperties;
  fluid?: PumpProperties; mounting?: PumpProperties;
  inlet?: PumpProperties; outlet?: PumpProperties; connectionSourceValue?: PumpProperties;
  physicalDataSources?: PumpProperties; physicalNote?: string;
  spatialData?: PumpSpatialData;
  assets?: { imagePath?: string; drawingPath?: string; modelPath?: string; files?: Partial<Record<PumpFileKind, PumpFileReference>> };
  manualEntry?: boolean;
};

export function coreUsablePump(pump: Pump, medium: "water" | "wastewater" = "water") {
  return pump.selectable !== false && pump.active !== false && (pump.medium ?? "water") === medium &&
    pump.curve.length >= 2 && pump.curve.every(([q, h], i, points) =>
      Number.isFinite(q) && Number.isFinite(h) && q >= 0 && h >= 0 && (i === 0 || q > points[i - 1][0]));
}

export function coreSelectionHeadAtFlow(pump: Pump, flow: number): number | null {
  const range = pump.selectionFlowRange;
  if (range && (flow < range[0] || flow > range[1])) return null;
  return interpolateCurve(pump.curve, flow);
}

// Selection uses PCHIP by default; chart methods share rendering and intersection math.
// Interpolation is limited to the source range; no synthetic endpoints are added.
export function coreInterpolateCurve(points: Array<[number, number]>, flow: number, method: CurveMethod = "pchip"): number | null {
  if (!Number.isFinite(flow) || points.length < 2 || flow < points[0][0] || flow > points[points.length - 1][0]) return null;
  const segments = curveSegments(points, method);
  if (segments.length && method !== "polynomial") {
    const knot = points.find(([q]) => q === flow);
    if (knot) return knot[1];
  }
  for (const segment of segments) {
    if (flow <= segment.start + segment.width) return pchipValue(segment, (flow - segment.start) / segment.width);
  }
  return null;
}

export function pumpCurvePath(pump: Pump, count: number, maxQ: number, maxH: number, method: CurveMethod = "pchip", minimum: { flow: number; head: number } = { flow: 0, head: 0 }) {
  if (![count, maxQ, maxH].every(value => Number.isFinite(value) && value > 0) || ![minimum.flow,minimum.head].every(Number.isFinite) || maxQ <= minimum.flow || maxH <= minimum.head) return "";
  const segments = curveSegments(pump.curve, method);
  if (!segments.length) return "";
  const xy = (q: number, h: number) => `${45 + (q * count - minimum.flow) / (maxQ - minimum.flow) * 435} ${210 - (h - minimum.head) / (maxH - minimum.head) * 190}`;
  // Exact cubic Bézier representation of each Hermite segment, not sampled lines.
  return `M${xy(segments[0].start, segments[0].d)}` + segments.map(s => {
    const end = s.start + s.width, head = pchipValue(s, 1);
    if (method === "linear") return `L${xy(end, head)}`;
    return `C${xy(s.start + s.width / 3, s.d + s.c / 3)} ${xy(end - s.width / 3, head - (3 * s.a + 2 * s.b + s.c) / 3)} ${xy(end, head)}`;
  }).join("");
}

export function coreOperatingPoint(pump: Pump, count: number, input: {flowRate: number; head: number; staticHead: number}, method: CurveMethod = "pchip") {
  if (![count, input.flowRate, input.head, input.staticHead].every(Number.isFinite) ||
    !(count > 0 && input.flowRate > 0 && input.head >= input.staticHead && input.staticHead >= 0)) return null;
  const k = (input.head - input.staticHead) / input.flowRate ** 2;
  return intersectPumpCurve(pump,count,input.staticHead,k,method);
}
export function coreIntersectPumpCurve(pump:Pump,count:number,staticHead:number,k:number|null,method:CurveMethod="pchip") {
  if(k==null)return null;
  const system = (q: number) => staticHead + k * q ** 2;
  for (const segment of curveSegments(pump.curve, method)) {
    const start = segment.start * count, width = segment.width * count;
    const a = segment.a, b = segment.b - k * width ** 2;
    const c = segment.c - 2 * k * start * width, d = segment.d - system(start);
    const difference = (t: number) => ((a * t + b) * t + c) * t + d;
    const point = (t: number) => { const flow = start + width * t; return {flow, head: system(flow)}; };
    const bounds = [0, ...cubicTurningPoints(a, b, c), 1];
    for (let interval = 1; interval < bounds.length; interval++) {
      let low = bounds[interval - 1], high = bounds[interval], left = difference(low);
      if (Math.abs(left) < 1e-9) return point(low);
      const right = difference(high);
      if (Math.abs(right) < 1e-9) return point(high);
      if (left * right > 0) continue;
      for (let iteration = 0; iteration < 50; iteration++) {
        const middle = (low + high) / 2, value = difference(middle);
        if (left * value <= 0) high = middle;
        else { low = middle; left = value; }
      }
      return point((low + high) / 2);
    }
  }
  return null;
}

type PriceSettings = {usdRate: number; cnyRate: number; manufacturerDiscounts: {cnp: number; aquastrong: number; onis?: number; vandjord?: number; wellmix?: number}};
export function coreCataloguePriceRub(pump: Pump, settings: PriceSettings) {
  if (pump.price === null || !Number.isFinite(pump.price) || pump.priceCurrency === null) return null;
  const rate = pump.priceCurrency === "USD" ? settings.usdRate : pump.priceCurrency === "CNY" ? settings.cnyRate : 1;
  return Math.round(pump.price * rate * 100) / 100;
}
export function coreCatalogueDiscount(pump: Pump, settings: PriceSettings) {
  // A net snapshot must never be discounted a second time.
  if (pump.priceKind === "net") return 0;
  const key = pump.manufacturer.toLowerCase() as keyof PriceSettings["manufacturerDiscounts"];
  return settings.manufacturerDiscounts[key] ?? pump.discountPercent ?? 0;
}
export function coreCataloguePurchasePriceRub(pump: Pump, settings: PriceSettings) {
  const price = cataloguePriceRub(pump, settings);
  return price === null ? null : Math.round(price * (1 - catalogueDiscount(pump, settings) / 100) * 100) / 100;
}

export function selectionHeadAtFlow(...args: Parameters<typeof coreSelectionHeadAtFlow>): ReturnType<typeof coreSelectionHeadAtFlow> {
  return engineeringOperation("selectionHeadAtFlow", coreSelectionHeadAtFlow, args);
}

export function operatingPoint(...args: Parameters<typeof coreOperatingPoint>): ReturnType<typeof coreOperatingPoint> {
  return engineeringOperation("operatingPoint", coreOperatingPoint, args);
}

export function cataloguePurchasePriceRub(...args: Parameters<typeof coreCataloguePurchasePriceRub>): ReturnType<typeof coreCataloguePurchasePriceRub> {
  return engineeringOperation("cataloguePurchasePriceRub", coreCataloguePurchasePriceRub, args);
}

registerOperation("selectionHeadAtFlow", ["pump","flow"], coreSelectionHeadAtFlow);

registerOperation("operatingPoint", ["pump","count","input","method"], coreOperatingPoint);

registerOperation("cataloguePurchasePriceRub", ["pump","settings"], coreCataloguePurchasePriceRub);

export function interpolateCurve(...args: Parameters<typeof coreInterpolateCurve>): ReturnType<typeof coreInterpolateCurve> {
  return engineeringOperation("interpolateCurve", coreInterpolateCurve, args);
}

registerOperation("interpolateCurve", ["points","flow","method"], coreInterpolateCurve);

export function usablePump(...args: Parameters<typeof coreUsablePump>): ReturnType<typeof coreUsablePump> {
  return engineeringOperation("usablePump", coreUsablePump, args);
}

registerOperation("usablePump", ["pump","medium"], coreUsablePump);

export function cataloguePriceRub(...args: Parameters<typeof coreCataloguePriceRub>): ReturnType<typeof coreCataloguePriceRub> {
  return engineeringOperation("cataloguePriceRub", coreCataloguePriceRub, args);
}

registerOperation("cataloguePriceRub", ["pump","settings"], coreCataloguePriceRub);

export function catalogueDiscount(...args: Parameters<typeof coreCatalogueDiscount>): ReturnType<typeof coreCatalogueDiscount> {
  return engineeringOperation("catalogueDiscount", coreCatalogueDiscount, args);
}

registerOperation("catalogueDiscount", ["pump","settings"], coreCatalogueDiscount);

export function intersectPumpCurve(...args:Parameters<typeof coreIntersectPumpCurve>):ReturnType<typeof coreIntersectPumpCurve>{return engineeringOperation("intersectPumpCurve",coreIntersectPumpCurve,args);}
registerOperation("intersectPumpCurve",["pump","count","staticHead","coefficient","method"],coreIntersectPumpCurve);
