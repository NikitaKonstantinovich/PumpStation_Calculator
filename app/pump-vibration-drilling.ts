import pumps from "../data/prepared-pump-cad-models.json";
import horizontal from "../data/horizontal-frame-mounts.json";
import pumpMounts from "../data/end-suction-flange-mounts.json";
import mounts from "../data/flange-cad-mounts.json";
import type { AssemblyComponent } from "./suction-catalog";
import { vibrationExecution } from "./vibration-dimensions";

type Mount = { holes: number[][]; face: number[]; holeDiameter: number; holeKind: string; source: string };
export type Drilling = { holes: number; circle: number; diameter: number; source: string };
const models = { ...pumps.models, ...horizontal.models } as Record<string, {profile:{sourceHash:string}}>;
function drilling(m?: Mount): Drilling | undefined {
  if (!m || m.holeKind !== "through" || !m.holes.length) return;
  const radii = m.holes.map(p => Math.hypot(...p.map((v,i) => v-m.face[i])));
  if (radii.some(r => Math.abs(r-radii[0]) > .1)) return;
  return {holes:m.holes.length,circle:2*radii[0],diameter:m.holeDiameter,source:m.source};
}
export function pumpVibrationDrilling(id: string | undefined, side: "inlet" | "outlet") {
  const hash = models[id ?? ""]?.profile.sourceHash;
  return drilling((pumpMounts as Record<string,Record<string,Mount>>)[hash]?.[side]);
}
export function vibrationDrilling(item: AssemblyComponent, pn: number) {
  const execution = vibrationExecution(item,pn);
  const hash = execution?.status === "confirmed" ? execution.cad?.sourceHash : undefined;
  return hash ? drilling((mounts.models as Record<string,Record<string,Mount>>)[hash]?.left) : undefined;
}
export const sameDrillingCircle = (a:Drilling,b:Drilling) => Math.abs(a.circle-b.circle)<.2 && Math.abs(a.diameter-b.diameter)<.2;
export const fourOfEightVibrationNote = "Стык насос — вибровставка: у насоса 4 отверстия, у вибровставки 8. Установить 4 болтовых соединения через одно отверстие, совместив сверловку. В спецификации и стоимости учтён крепёж на 8 отверстий; 4 комплекта остаются в запасе.";
export const fourOfEightInsertionNote = "Стык насос — вставка: у насоса 4 отверстия, у фланца вставки 8. Установить 4 болтовых соединения через одно отверстие, совместив сверловку. В спецификации и стоимости учтён крепёж на 8 отверстий; 4 комплекта остаются в запасе.";
