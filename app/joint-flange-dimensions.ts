import type { BindingCatalog } from "./collector-catalog";
import type { AssemblyComponent } from "./suction-catalog";
import { flangeKinds } from "./collector-calculations";
import { catalogPressures, readFlangeDimensions, acceptedFlangeMaterials } from "./flange-dimensions";
import { collarLipThickness } from "./component-collar-dimensions";
import flanges from "../data/flange-dimensions.json";
import collars from "../data/collar-dimensions.json";
import { supplierFlangeFor } from "./component-supplier-flanges";

type Database = { items: AssemblyComponent[]; source?: BindingCatalog["source"] };
const field = (item: Database["items"][number], label: string) => item.fields.find(value => value.headerPath.at(-1) === label)?.value;
const dn = (item: Database["items"][number]) => Number(String(field(item, "DN") ?? "").replace(/^DN\s*/i, ""));
/** The physical bolt grip contains each backing flange AND each collar lip.
 * Excluding loose flanges from the insert BOM does not remove them from the joint. */
export function jointFlangeThickness(database: Database, material: "st20" | "aisi304", size: number, pn: number, collarComponentId?: string, weldFlangeComponentId?: string, looseFlangeComponentId?: string) {
  const pressures = catalogPressures(database.items), kinds = weldFlangeComponentId ? ["weldFlange" as const] : flangeKinds(material, size, pn);
  const sources: string[] = [], warnings: string[] = [], dimensions: Array<{ name: string; value: number; unit: "мм"; source: string }> = [];
  const adoptedHoleCounts: number[] = [];
  let oneSide = 0, found = false;
  for (const kind of kinds) {
    const items = database.items.filter(item => dn(item) === size && (kind === "collar" && collarComponentId
      ? item.id === collarComponentId && (pressures.get(item.id) ?? 0) >= pn : weldFlangeComponentId
        ? item.id === weldFlangeComponentId && (pressures.get(item.id) === pn || supplierFlangeFor(item, database.source?.sha256)?.compatiblePns.includes(pn))
        : pressures.get(item.id) === pn && (kind !== "looseFlange" || !looseFlangeComponentId || item.id === looseFlangeComponentId))
      && (material === "aisi304" ? /AISI\s*304/i : /(?:сталь|ст[.\s]*)\s*20/i).test(item.family)
      && (kind === "collar" ? item.catalogId === "воротники" : item.catalogId === "фланцы" && (kind === "looseFlange" ? /свободн/i : /плоск/i).test(item.family)));
    found ||= items.length > 0;
    const values: number[] = [];
    if (!items.length) warnings.push(`Нет ${kind === "collar" ? "воротника" : "фланца"} ${material} DN${size} PN${pn} для крепёжного пакета`);
    for (const item of items) {
      if (kind === "collar") {
        const policy = collarLipThickness(item, database.source?.sha256 ?? collars.sourceSha256, collars);
        const lip = Number(field(item, "Толщина борта, мм"));
        if (!policy || lip !== policy.valueMm) warnings.push(`Не подтверждена толщина борта воротника ${item.id} в крепёжном пакете`);
        else { values.push(lip); sources.push(`${item.id}: ${policy.source}`); dimensions.push({ name: `Борт воротника ${item.id} (одна сторона)`, value: lip, unit: "мм", source: policy.source }); }
      } else {
        const result = readFlangeDimensions(item, pressures.get(item.id) ?? pn, flanges, database.source?.sha256);
        warnings.push(...result.warnings);
        if (result.standard && result.dimensions.holes) adoptedHoleCounts.push(result.dimensions.holes);
        if (result.dimensions.thicknessMm) { values.push(result.dimensions.thicknessMm); sources.push(`${item.id}: ${result.source}`); dimensions.push({ name: `Толщина фланца ${item.id} (одна сторона)`, value: result.dimensions.thicknessMm, unit: "мм", source: result.source }); }
        if (/AISI\s*304/i.test(item.family) && /12Х18Н10Т/i.test(String(field(item, "Наименование")))) {
          const accepted = acceptedFlangeMaterials(item, pn, flanges, database.source?.sha256);
          if (accepted) sources.push(`${item.id}: ${accepted.materials}; ${accepted.source}`);
          else warnings.push(`Материал фланца ${item.id}: семейство AISI304 противоречит 12Х18Н10Т в наименовании; геометрия определена, материал требует уточнения`);
        }
      }
    }
    if (new Set(values).size > 1) warnings.push(`Несколько толщин ${kind} DN${size} PN${pn}; требуется определённое исполнение`);
    if (!values.length || values.length !== items.length || new Set(values).size > 1) oneSide = NaN;
    else oneSide += values[0];
  }
  const holeCounts = new Set(adoptedHoleCounts);
  if (holeCounts.size > 1) warnings.push(`Несколько вариантов сверловки фланцев DN${size} PN${pn}; требуется определённое исполнение`);
  return { found, thicknessMm: Number.isFinite(oneSide) && oneSide > 0 ? 2 * oneSide : null, holes: holeCounts.size === 1 ? adoptedHoleCounts[0] : null, source: [...sources, `Проверка таблицы фланцев: ${flanges.verifiedAt}; исходные данные воротников: ${collars.providedAt}`].join("; "), warnings: [...new Set(warnings)], dimensions };
}
