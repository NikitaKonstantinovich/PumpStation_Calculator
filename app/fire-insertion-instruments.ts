import type { AssemblyComponent } from "./suction-catalog";
import type { SpecItem } from "./project-config";
import type { lineSpecParts } from "./line-spec-parts";
import { field, itemDn, number } from "./line-spec-parts";
import { selectDischargeInstruments } from "./suction-instruments";
import { INSTRUMENT_SIDE_FITTINGS } from "./instrument-connection";
import type { InstrumentPressure } from "./instrument-pressure";

export const FIRE_INSERTION_INSTRUMENTS_REVISION = "fire-insertion-relay-mode-pressure-v2";
/** One set per main fire-pump branch, including reserve branches once the
 * working-pump threshold has enabled the insertion's DN15 sensor port. */
export function addFireInsertionInstruments(parts: ReturnType<typeof lineSpecParts>, items: AssemblyComponent[], insertion: SpecItem, pn: number, head: number | null, rating?:InstrumentPressure) {
  const prefix = insertion.assemblyRole?.split("-")[0] ?? "primary", count = insertion.quantity;
  const valve = items.find(item => item.catalogId === "шаровые-краны" && field(item, /^Артикул$/i) === "44.15.В-В.С.Б" && itemDn(item) === 15 && (number(field(item, /^PN$/i)) ?? 0) >= pn);
  const bush = items.find(item => item.id === INSTRUMENT_SIDE_FITTINGS.bush);
  const relay = selectDischargeInstruments(items, head, rating).find(item => item.role === "pressure-switch")!;
  parts.add(`${prefix}-sensor-valve`, "Кран LD Pride 44.15.В-В.С.Б DN15 PN40 · сгон вставки", count, "Сгон DN15 → кран; боковые сервисные порты остаются частью крана", valve);
  const fitting = parts.add(`${prefix}-sensor-bush`, "Футорка 1/2 НР–1/4 ВР · над краном вставки", count, "Верхний порт крана G1/2 ВР → футорка → реле G1/4 НР", bush);
  fitting.description = "Подключение принято по изображениям пользователя: сгон → кран → футорка → реле сверху.";
  parts.add(`${prefix}-sensor-relay`, "Реле давления РД-2Р · напорная вставка", count, relay.details, relay.item, "шт.", undefined, relay.description, relay.warning ? "confirmation" : relay.item ? undefined : "clarify");
  parts.flax(`${prefix}-sensor-seals`, count * .3, "Сгон → кран → футорка → реле: 3 резьбовых стыка × 0,1 м на насосную ветвь; заглушка занятого сгона исключена из установленной вставки");
}
