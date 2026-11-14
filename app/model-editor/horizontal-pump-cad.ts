import evidence from "../../data/horizontal-pump-cad-ports.json";
import type { Bounds, PumpProfile, Vec3 } from "./model";

const frames = evidence as unknown as Readonly<Record<string, { boundsMm: Bounds; outletMm: Vec3; evidence: string }>>;
const inletPoint: Vec3 = [0, 0, 0];
const inletAxis: Vec3 = [-1, 0, 0];
const outletAxis: Vec3 = [0, 0, 1];
const matches = (actual: readonly number[] | undefined, expected: readonly number[]) =>
  actual?.length === expected.length && actual.every((coordinate, index) => Math.abs(coordinate - expected[index]) < .01);

export function applyHorizontalPumpCadPorts(profile: PumpProfile): PumpProfile {
  if (!Object.hasOwn(frames, profile.sourceHash)) return profile;
  const frame = frames[profile.sourceHash];
  if (!matches(profile.bounds, frame.boundsMm)) return profile;

  const inlet = profile.ports.find(port => port.id === "port-a");
  const outlet = profile.ports.find(port => port.id === "port-b");
  if (!inlet || !matches(inlet.point, inletPoint) || !matches(inlet.axis, inletAxis)
    || profile.ports.some(port => port !== inlet && port !== outlet)
    || outlet && (!matches(outlet.point, frame.outletMm) || !matches(outlet.axis, outletAxis))) return profile;

  const source = `Патрубки по измерениям нормализованного STEP: ${frame.evidence}`;
  return {
    ...profile,
    ports: [
      { ...inlet, id: "inlet", source, provisional: true },
      { ...outlet, id: "outlet", point: outlet?.point ?? frame.outletMm, axis: outletAxis, source, provisional: true },
    ],
    warnings: profile.warnings.filter(warning => warning !== "Назначение патрубков для автоматической обвязки требует проверки."),
  };
}
