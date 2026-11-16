import evidence from "../../data/cdm-reviewed-cad-ports.json";
import type { PumpProfile } from "./model";

const reviewed = evidence as Readonly<Record<string, {
  source: string;
  bounds: number[];
  points: number[][];
  markerFaces: number[];
}>>;
const same = (a: readonly number[] | undefined, b: readonly number[]) =>
  a?.length === b.length && a.every((value, i) => Math.abs(value - b[i]) < .01);

/** Flow belongs to the measured STEP and its coordinates, independently of
 * whether its motor execution qualifies as an exact catalogue match. */
export function applyCdmCadPorts(profile: PumpProfile): PumpProfile {
  const review = reviewed[profile.sourceHash];
  if (!review || review.source !== profile.source || !same(profile.bounds, review.bounds) ||
      profile.ports.length !== 2) return profile;
  const inlet = profile.ports.find(p => p.id === "port-a");
  const outlet = profile.ports.find(p => p.id === "port-b");
  if (!inlet || !outlet || !same(inlet.point, review.points[0]) || !same(outlet.point, review.points[1]) ||
      !same(inlet.axis, [-1, 0, 0]) || !same(outlet.axis, [1, 0, 0])) return profile;
  const source = "Присоединительные плоскости измерены по STEP. Направление подтверждено стрелками на корпусе CDM.";
  return {
    ...profile,
    ports: [{ ...inlet, id: "inlet", source }, { ...outlet, id: "outlet", source }],
    warnings: profile.warnings.filter(w => w !== "Назначение патрубков для автоматической обвязки требует проверки."),
  };
}
