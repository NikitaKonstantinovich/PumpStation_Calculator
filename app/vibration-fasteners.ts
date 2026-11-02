import mounts from "../data/flange-cad-mounts.json";
import reference from "./suction-fasteners.json";
import type { AssemblyComponent } from "./suction-catalog";
import type { VibrationExecution } from "./vibration-dimensions";
import { equipmentFlangeThickness } from "./line-joint-stack";

type Mount = { face: number[]; axis: number[]; thickness: number; holeKind: string };
const models: Record<string, Partial<Record<"inlet" | "outlet" | "left" | "right", Mount>>> = mounts.models;

/** One end only: sealing plane to the back of the ring, never the body length. */
export function vibrationBoltSeat(item: AssemblyComponent | undefined, execution: VibrationExecution | undefined, dn: number, pn: number, side: "left" | "right"): { grip: number | null; source: string; allowance?: string } {
  if (!item) return { grip: null, source: "Фланцевый виброкомпенсатор не выбран." };
  const cad = execution?.pn === pn && execution.status === "confirmed" ? execution.cad : undefined;
  const m = cad && models[cad.sourceHash]?.[side], sign = side === "left" ? -1 : 1;
  const setback = m && cad && sign * (cad.planesMm[side === "left" ? 0 : 1] - m.face[0]);
  const valid = m?.holeKind === "through" && m.axis[0] === sign && m.thickness > 0 && setback !== undefined && setback >= -.001;
  const actual = equipmentFlangeThickness(item);
  if (valid || actual !== null) {
    const ring = actual ?? m!.thickness, offset = valid ? Math.max(0, setback) : 0;
    const mm = (n: number) => Math.round(n * 1000) / 1000;
    return { grip: mm(ring + offset), source: `Толщина фланца виброкомпенсатора ${mm(ring)} мм (${actual !== null ? "карточка изделия" : "STEP"}).${valid ? ` Отступ от уплотнительной плоскости ${mm(offset)} мм по STEP ${cad!.sourceHash}; сторона ${side === "left" ? "насоса" : "вставки"}.` : ""}` };
  }
  const row = reference.find(r => r.dn === dn && r.pn === pn && r.steelFlangeThickness > 0);
  return row ? { grip: row.steelFlangeThickness, allowance: `расчёт по стандартному фланцу ${row.steelFlangeThickness} мм`, source: `Для подбора болта принята толщина стандартного фланца DN${dn} PN${pn}: ${row.steelFlangeThickness} мм. Источник: ${row.source}. Это расчётное допущение, а не размер модели KMS.` }
    : { grip: null, source: `Нет толщины фланца виброкомпенсатора и табличного значения DN${dn} PN${pn}.` };
}
