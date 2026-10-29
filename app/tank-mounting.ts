import type { AssemblyComponent } from "./suction-catalog";
import { field, itemName, number } from "./line-spec-parts";

/** Source audit: local WAV-100 analytic CAD has three Ø12 holes and 3 mm feet.
 * WAV-50 cached CAD has three Ø12 holes and ~1.5 mm feet (use 2 mm allowance).
 * The local WAV-50 frame drawing specifies 5 mm sheet and three Ø13 holes.
 * Placement/load validation of the final frame belongs to the frame stage. */
export function tankMounting(items: AssemblyComponent[], volume: 50 | 100) {
  const diameter = 10, points = 3, frameThickness = 5, footThickness = volume === 50 ? 2 : 3;
  const hardware = items.filter(item => item.catalogId === "метизы" && number(field(item, /^Диаметр резьбы, мм$/i)) === diameter);
  const nut = hardware.find(item => /^Гайка /i.test(itemName(item))), washer = hardware.find(item => /^Шайба /i.test(itemName(item)));
  const nutHeight = nut ? (number(field(nut, /^Ширина, мм$/i)) ?? (/М10\s+DIN934/i.test(itemName(nut)) ? 8 : null)) : null, washerHeight = washer ? number(field(washer, /^Ширина, мм$/i)) : null;
  const minimum = nutHeight && washerHeight ? frameThickness + footThickness + nutHeight + 2 * washerHeight + 5 : null;
  const bolt = minimum ? hardware.filter(item => /^Болт /i.test(itemName(item)) && (number(field(item, /^Длина болта, мм$/i)) ?? 0) >= minimum).sort((a, b) => number(field(a, /^Длина болта, мм$/i))! - number(field(b, /^Длина болта, мм$/i))!)[0] : undefined;
  return { diameter, points, minimum, bolt, nut, washer,
    source: `WAV-${volume}: 3 отверстия Ø12; М10. Рама 5 мм + лапа ${footThickness} мм + гайка ${nutHeight ?? "?"} мм + 2 шайбы по ${washerHeight ?? "?"} мм + выход резьбы 5 мм = ${minimum ?? "?"} мм. Длина — ближайшая достаточная из каталога. Локальные CAD/чертёж, проверка 29.10.2026; высота DIN934 M10 8 мм: Bossard BN117, https://composant.artech-ge.ch/upload/datasheet/1423.pdf.`,
    limitation: "Крепёж рассчитан для листа рамы 5 мм; расположение отверстий и несущую способность итоговой рамы проверить на этапе рамы." };
}
