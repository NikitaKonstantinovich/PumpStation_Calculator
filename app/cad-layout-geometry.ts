import type { InsertionShape } from "./model-editor/insertion-types";

const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/** Export the dimensioned layout already visible in the editor. These parts
 * remain explicitly simplified, rather than masquerading as supplier CAD. */
export function cadLayoutGeometry(s: InsertionShape) {
  if (!positive(s.lengthMm) || !positive(s.outerMm) || !positive(s.innerMm) || s.innerMm >= s.outerMm) return;
  if (s.kind === "collar" && positive(s.lipThicknessMm) && s.lipThicknessMm < s.lengthMm &&
      positive(s.lipOuterMm) && s.lipOuterMm > s.outerMm)
    return {geometry:{...s},note:"Параметрическая компоновочная модель воротника по размерам расчёта; радиусы переходов упрощены."};
  if (s.kind === "reducer-outline" && positive(s.smallOuterMm) && positive(s.smallInnerMm) &&
      s.smallInnerMm < s.smallOuterMm && s.smallOuterMm < s.outerMm &&
      s.offset?.length === 3 && s.offset.every(Number.isFinite) && s.offset[0] === 0)
    return {geometry:{...s,kind:"reducer"},note:"Параметрическая компоновочная модель перехода по длине, диаметрам, толщине и эксцентриситету расчёта; профиль перехода упрощён."};
}
