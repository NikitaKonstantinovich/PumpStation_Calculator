import type { ComponentItem } from "./component-database-types";
import type { ComponentMass } from "./component-mass";
import shapes from "../data/fastener-shapes.json";
import gaskets from "../data/line-gasket-models.json";
import defaults from "../data/mass-calculation-defaults.json";

const field = (item: ComponentItem, ...names: string[]) => item.fields.find(f => names.includes(f.column) || names.includes(f.headerPath.at(-1) ?? ""))?.value;
const num = (item: ComponentItem, ...names: string[]) => {
  const raw = field(item, ...names);
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const ring = (outer: number, inner: number) => Math.PI / 4 * (outer ** 2 - inner ** 2);
const frustum = (a: number, b: number, length: number) => Math.PI * length / 12 * (a * a + a * b + b * b);

/** Nominal material calculation; never treat a purchased mixed-material device as a solid box. */
export function geometricComponentMass(item: ComponentItem, unit = "шт."): ComponentMass | null {
  const name = String(field(item, "Наименование", "Название", "Общее название") ?? item.family);
  const material = String(field(item, "Материал") ?? "") + " " + item.family + " " + name;
  const density = /AISI\s*304|12Х18Н10|нержав/i.test(material) ? 7.9e-6 : /латун/i.test(material) ? 8.5e-6 : /Ст(?:аль|\.)?\s*20|DIN\s*(933|934|125)|RIVKLE/i.test(material) ? 7.85e-6 : null;
  const estimated = (volume: number, source: string, rho = density): ComponentMass | null => rho !== null && Number.isFinite(volume) && volume > 0 ? { kg: volume * rho, estimated: true, source: `Расчёт по номинальной геометрии: ${source}; плотность ${Math.round(rho * 1e9)} кг/м³. Резьба и фаски, если отдельно не заданы, не вычитаются.` } : null;
  const outer = num(item, "Наружный диаметр, мм", "Диаметр, мм"), wall = num(item, "Толщина, мм", "Толщина 1, мм"), length = num(item, "Длина, мм", "Длина перехода, мм");
  if (["трубы", "сгоны-резьба"].includes(item.catalogId) && outer && wall && outer > 2 * wall) {
    const l = ["м", "м."].includes(unit) ? 1000 : length;
    if (l) return estimated(ring(outer, outer - 2 * wall) * l, `труба Ø${outer}×${wall}, L=${l} мм`);
  }
  if (item.catalogId === "фланцы" || item.catalogId === "заглушки") {
    const d = num(item, "Наружный диаметр фланца, мм", "CALC_FLANGE_OD"), bore = num(item, "Посадочный диаметр фланца, мм", "CALC_FLANGE_BORE");
    const b = num(item, "Толщина фланца, мм", "CALC_FLANGE_B"), count = num(item, "Количество отверстий фланца", "CALC_FLANGE_HOLES"), hole = num(item, "Диаметр отверстия фланца, мм", "CALC_FLANGE_HOLE");
    if (d && bore && b && count && hole && d > bore) return estimated((ring(d, bore) - count * ring(hole, 0)) * b, `кольцо Ø${d}/Ø${bore}×${b}, ${count} отверстий Ø${hole}`);
  }
  if (item.catalogId === "переходы" && /[эе]ксцентр|концентр/i.test(name + item.family)) {
    const small = num(item, "Диаметр 2, мм", "Малый диаметр, мм", "Диаметр меньший, мм"), smallWall = num(item, "Толщина 2, мм");
    if (outer && small && wall && smallWall && length && outer > 2 * wall && small > 2 * smallWall) return estimated(frustum(outer, small, length) - frustum(outer - 2 * wall, small - 2 * smallWall, length), `полый усечённый конус Ø${outer}×${wall}/Ø${small}×${smallWall}, L=${length} мм`);
  }
  if (item.catalogId === "прокладки") {
    if (/^user-seals-2026-09-28:flax-/.test(item.id)&&["м","м."].includes(unit))return estimated(defaults.flaxBundleAreaMm2*1000,`лён: условная площадь пряди ${defaults.flaxBundleAreaMm2} мм², L=1000 мм; оценка по принятой объёмной плотности рыхлой пряди, требуется замена при известном расходе`,defaults.flaxBulkDensityKgM3/1e9);
    const row = gaskets.rows.find(r => r.componentId === item.id);
    if (row && num(item, "Толщина, мм") === row.geometry.thickness) return estimated(ring(row.geometry.outer, row.geometry.inner) * row.geometry.thickness, `геометрия ${row.source}; расчётная плотность ПОН 1800 кг/м³`, 1.8e-6);
  }
  if (item.catalogId === "метизы" || item.catalogId === "рама") {
    const rivet=field(item,"FRAME_RIVET") as {threadMm:number;headDiameterMm:number;headThicknessMm:number;holeDiameterMm:number;source:string}|undefined;
    const lengths:Record<string,number>={"23301060055":18.7,"23301060080":21.7,"23301080030":17.8,"23301080055":20.8,"23301080080":23.8,"23301080105":26.8,"23301100035":22.75,"23301100060":25.75,"23301100085":27.75,"23301120040":26.7,"23301120070":29.7,"23301120100":34.8};
    const article=item.id.match(/233\d{8}/)?.[0],blank=article?lengths[article]:null;
    if(rivet&&blank&&rivet.holeDiameterMm>rivet.threadMm)return estimated(ring(rivet.holeDiameterMm,rivet.threadMm)*(blank-rivet.headThicknessMm)+ring(rivet.headDiameterMm,rivet.threadMm)*rivet.headThicknessMm,`гайка-заклёпка ${article}, заготовка L=${blank} мм; упрощённое кольцевое сечение корпуса и буртика; ${rivet.source}`,7.85e-6);
    const d = num(item, "Диаметр резьбы, мм") ?? Number(name.match(/[МM](\d+)/)?.[1]);
    const shape = shapes.rows.find(r => r.d === d);
    const l = num(item, "Длина болта, мм", "Длина шпильки, мм") ?? Number(name.match(/[МM]\d+[хx×](\d+)/)?.[1]);
    if (shape && l && /^Болт /i.test(name) && /DIN\s*933/i.test(name)) return estimated(ring(d, 0) * l + Math.sqrt(3) / 2 * shape.flats ** 2 * shape.head, `DIN933, стержень Ø${d}×${l} и шестигранная головка S=${shape.flats}, k=${shape.head} мм`, 7.85e-6);
    if (d && l && /^Шпилька /i.test(name)) return estimated(ring(d, 0) * l, `стержень Ø${d}×${l} мм`, 7.85e-6);
  }
  return null;
}
