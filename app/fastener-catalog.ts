import type { AssemblyComponent } from "./suction-catalog";
import { field, number, itemName } from "./line-spec-parts";
import type { FastenerCatalog, HardwareItem } from "./model-editor/fastener-types";

/** Uses the current server catalogue, including its dimension corrections. */
export function fastenerCatalog(items: AssemblyComponent[]): FastenerCatalog {
  return { version: 1, items: items.flatMap(item => {
    if (item.catalogId !== "метизы") return [];
    const name = itemName(item), diameter = number(field(item, /^Диаметр резьбы, мм$/i));
    const kind = /^Болт /.test(name) ? "bolt" : /^Шпилька /.test(name) ? "stud" : /^Гайка /.test(name) ? "nut" : /^Шайба /.test(name) ? "washer" : null;
    const length = number(field(item, /^(Длина болта, мм|Длина шпильки, мм|Ширина, мм)$/i));
    if (!kind || !diameter || !length) return [];
    return [{ id: item.id, name, kind, diameter, length, source: `Каталог ${item.id}; ${item.sourceSheet}, строка ${item.sourceRow}` } as HardwareItem];
  }) };
}
