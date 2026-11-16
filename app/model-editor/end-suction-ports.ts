import evidence from "../../data/end-suction-ports.json";
import type { Pump, PumpSpatialData } from "../pump-catalog";
import type { Bounds, PumpProfile, Vec3 } from "./model";

type Identity = { manufacturer: string; series: string; model: string; article: string | null; execution: string | null; powerKw: number | null; frequencyHz: number | null };
type PumpIdentity = Pick<Pump, "id" | "type" | "manufacturer" | "series" | "model"> & {
  article?: string | null; execution?: string | null; power?: number | null; frequencyHz?: number | null;
};
type PortEvidence = { identity: Identity; cadHash?: string; dimensionSignature?: string; spatial?: PumpSpatialData };
export const END_SUCTION_PORTS_REVISION = evidence.revision;
const entries = evidence.variants as unknown as Readonly<{ [id: string]: PortEvidence }>;
const frames = evidence.cad as unknown as Readonly<{ [hash: string]: { boundsMm: Bounds; outletMm: Vec3; evidence: string } }>;
const same = (actual: readonly number[] | undefined, expected: readonly number[]) => actual?.length === expected.length && actual.every((n, i) => Math.abs(n - expected[i]) < .01);
const identity = (pump: PumpIdentity): Identity => ({ manufacturer: pump.manufacturer, series: pump.series, model: pump.model, article: pump.article ?? null, execution: pump.execution ?? null, powerKw: pump.power ?? null, frequencyHz: pump.frequencyHz ?? null });
function entry(pump: PumpIdentity) {
  const row = entries[pump.id], actual = identity(pump);
  return pump.type === "end_suction" && row && (Object.keys(actual) as Array<keyof Identity>).every(key => actual[key] === row.identity[key]) ? row : undefined;
}

/** Only source-hash and coordinate-frame matched normalization measurements can
 * name CAD ports. A catalogue drawing is never pasted onto a different mesh. */
export function applyEndSuctionCadPorts(pump: PumpIdentity, profile: PumpProfile): PumpProfile {
  const row = entry(pump), frame = row?.cadHash === profile.sourceHash ? frames[profile.sourceHash] : undefined;
  if (!frame || !same(profile.bounds, frame.boundsMm)) return profile;
  const inlet = profile.ports.find(p => p.id === "inlet" || p.id === "port-a");
  const outlet = profile.ports.find(p => p.id === "outlet" || p.id === "port-b");
  if (inlet?.id === "inlet" && outlet?.id === "outlet") return profile;
  if (!inlet || profile.ports.length !== (outlet ? 2 : 1) || !same(inlet.point, [0, 0, 0]) || !same(inlet.axis, [-1, 0, 0]) ||
    outlet && (!same(outlet.point, frame.outletMm) || !same(outlet.axis, [0, 0, 1]))) return profile;
  const source = `Измерения присоединительных плоскостей нормализованного STEP: ${frame.evidence}`;
  return { ...profile, ports: [
    { ...inlet, id: "inlet", point: [0, 0, 0], axis: [-1, 0, 0], provisional: true, source },
    { ...outlet, id: "outlet", point: [...frame.outletMm], axis: [0, 0, 1], provisional: true, source },
  ], warnings: profile.warnings.filter(w => w !== "Назначение патрубков для автоматической обвязки требует проверки.") };
}

export function endSuctionDrawing(pump: Pump): PumpSpatialData | undefined {
  const row = entry(pump);
  if (!row?.spatial) return;
  const values = pump.dimensions?.sourceValues;
  const signature = JSON.stringify((Array.isArray(values) ? values : []).map(raw => {
    const value = raw as { key: string; valueMm: number }; return [value.key, value.valueMm] as [string, number];
  }).sort((a, b) => a[0].localeCompare(b[0], "en")));
  return signature === row.dimensionSignature ? structuredClone(row.spatial) : undefined;
}
