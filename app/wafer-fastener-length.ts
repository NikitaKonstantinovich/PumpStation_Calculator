import models from "../data/line-valve-models.json";
import type { AssemblyComponent } from "./suction-catalog";

/** The catalogue grip is also the existing project allowance at an unmeasured
 * pump. A thinner CAD stamping must not reduce it; a taller one must increase it. */
export const valveFlangeGrip = (catalogue: number | null, stamped: number | null) =>
  catalogue === null || stamped === null ? null : Math.max(catalogue, stamped);

/** Match the same body used by line-geometry-catalog. Explicit dimensions which
 * differ from that catalogue execution must not acquire another model's grip. */
export function waferFastenerLength(item: AssemblyComponent | undefined, dn: number, pn: number, nominal: number | null) {
  const series = /\b017W\b/i.test(item?.family ?? "") ? "017W" : /\b010[СC](?:\.Y)?\b/i.test(item?.family ?? "") ? "010C" : undefined;
  const matches = pn > 0 && pn <= 16 && nominal !== null ? models.rows.filter(m => m.series === series && m.dn === dn && Math.abs(m.catalogLength - nominal) < .01) : [];
  const lengths = [...new Set(matches.map(m => m.length))];
  return lengths.length === 1 ? { thickness: lengths[0], source: `Монтажная длина между плоскостями CAD ${lengths[0]} мм (каталожная ${nominal} мм): ${matches.map(m => m.source).join("; ")}.` }
    : { thickness: nominal, source: "" };
}
