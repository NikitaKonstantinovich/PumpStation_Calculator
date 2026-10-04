import type { SpecEntity, SpecItem, SpecSection, SettingsEntity } from "./project-config";
import { normalizeSpecificationItems } from "./specification-items";
import { pressureCheckWarning } from "./dn-defaults";

const clarificationText = /предупреждени[ея]:|требу(?:ет|ют|ется)|уточн(?:ить|яется)|не\s+(?:задан[аыо]?|указан[аыо]?|найден[аыо]?|подобран[аыо]?)|(?:отсутству(?:ет|ют)|нет)\s+(?:в\s+базе|таблицы|данных)|(?:в\s+базе|таблице)\s+нет/i;

export function specificationItemPresentation(item: SpecItem) {
  // Legacy/generated rows can include a warning after the technical details.
  // Keep the saved row intact; separate its text only when displaying it.
  const [details, ...embeddedWarnings] = item.details.split(/\s*(?:·\s*)?⚠\s*/);
  const technicalDetails: string[] = [];
  const notes: string[] = embeddedWarnings;
  for (const part of details.split(/\s*·\s*/)) {
    const text = part.trim();
    if (!text) continue;
    (clarificationText.test(text) ? notes : technicalDetails).push(text);
  }
  const checks = [...(item.inletPressureCheck?.checks ?? []), ...(item.dischargePressureCheck?.checks ?? [])];
  const explicitWarning = notes.length > 0 || clarificationText.test(item.description ?? "") || checks.some(pressureCheckWarning);
  const hasWarning = item.status !== "selected" || explicitWarning;
  const fallback = "Требуется уточнение характеристик или проверка применимости комплектующего.";
  const messages = [...new Set([item.description, ...notes, ...checks.map(check => check.message)]
    .map(message => message?.trim()).filter((message): message is string => Boolean(message)))];
  if (hasWarning && !explicitWarning) messages.push(typeof item.price !== "number" ? "Цена не указана; исполнение и стоимость требуют уточнения." : fallback);
  const severity = checks.some(check => check.status === "exceeded") ||
    /Шкаф управления не найден|не может превышать|PN[^.]*ниже требуемого/i.test(messages.join(" ")) ? "error" as const : "warning" as const;

  return {
    details: technicalDetails.join(" · "),
    description: technicalDetails.join(" · "),
    hasWarning,
    severity,
    warningText: messages.join(" ") || fallback,
  };
}

export const specificationIssueId = (item: SpecItem) => `spec/${item.position}/${item.name}`;
export const specificationSection = (item: SpecItem): SpecSection => item.section ??
  (item.position === "01" || /^Насос(?:\s|$)/i.test(item.name) ? "pump" : item.position === "02" || /шкаф/i.test(item.name) ? "control" : /кабел|электр|клем|наконечн|провод|гофр|лоток/i.test(item.name) ? "electrical" : /рам|стойк|крепеж|вибро/i.test(item.name) ? "frame" : /подвод|манометр|реле|затвор/i.test(item.name) ? "suction" : "discharge");

export function visibleSpecificationItems(entity: SpecEntity, settings: SettingsEntity) {
  const items = normalizeSpecificationItems(entity.items);
  const secondary = settings.stationType === "combined" || settings.stationType === "fire" && settings.jockeyPump;
  const pumps = new Set(items.filter(item => specificationSection(item) === "pump")
    .sort((a, b) => a.position.localeCompare(b.position, "ru", { numeric: true })).slice(0, secondary ? 2 : 1));
  return items.filter(item => {
    if (specificationSection(item) === "pump") return pumps.has(item);
    switch (item.option) {
      case "membraneTank": return settings.membraneTank;
      case "vibrationCompensators": return settings.vibrationCompensators;
      case "collectorPlugs": return settings.collectorPlugs;
      case "isolatingValves": return settings.isolatingValves;
      case "secondarySuctionValve": case "secondaryDischargeValve": case "secondaryCheckValve": return secondary;
      default: return true;
    }
  });
}
