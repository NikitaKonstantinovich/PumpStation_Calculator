import type { InputEntity, ProjectConfig, SettingsEntity, SpecItem } from "./project-config";
import type { Pump } from "./pump-catalog";

/** Owner decision, 29.10.2026: each exact threshold starts the next construction. */
export const FRAME_RULE_REVISION = "frame-pump-mass-2026-10-29-v1";
export type FrameConstruction = {
  code: "bent-4" | "bent-5" | "channel-8p" | "channel-10p" | "channel-12p" | "channel-14p";
  label: string;
  heightMm: 50 | 80 | 100 | 120 | 140;
  sheetThicknessMm?: 4 | 5;
};

export function frameConstructionForPumpMass(massKg: unknown): FrameConstruction | null {
  if (typeof massKg !== "number" || !Number.isFinite(massKg) || massKg <= 0) return null;
  if (massKg < 50) return { code: "bent-4", label: "Рама гнутая, лист 4 мм", sheetThicknessMm: 4, heightMm: 50 };
  if (massKg < 100) return { code: "bent-5", label: "Рама гнутая, лист 5 мм", sheetThicknessMm: 5, heightMm: 50 };
  if (massKg < 300) return { code: "channel-8p", label: "Рама из швеллера 8П", heightMm: 80 };
  if (massKg < 500) return { code: "channel-10p", label: "Рама из швеллера 10П", heightMm: 100 };
  if (massKg < 1000) return { code: "channel-12p", label: "Рама из швеллера 12П", heightMm: 120 };
  return { code: "channel-14p", label: "Рама из швеллера 14П", heightMm: 140 };
}

export function projectFrameSelection(project: ProjectConfig, pumps: Pump[] | null) {
  const settings = project.entities["station-settings"] as SettingsEntity;
  const secondary = settings.stationType === "combined" || settings.stationType === "fire" && settings.jockeyPump;
  const inputs = [project.entities["system-input"] as InputEntity, ...(secondary ? [project.entities["system-input-2"] as InputEntity] : [])];
  const sources = inputs.map((input, index) => {
    const id = input.selectedPumpId ?? (index ? project.station.secondaryPumpId : project.station.selectedPumpId);
    const pump = pumps?.find(p => p.id === id);
    return { id, massKg: pump?.weightKg, count: [input.workingPumpCount, input.reservePumpCount], pump };
  });
  const reasons = sources.flatMap((source, index) => !source.id ? [`Контур ${index + 1}: насос для выбора рамы не выбран.`] :
    !source.pump ? [`Контур ${index + 1}: выбранный насос недоступен в каталоге.`] :
    !frameConstructionForPumpMass(source.massKg) ? [`Контур ${index + 1}: масса одного насоса не указана или некорректна; конструкция рамы не определена.`] : []);
  const massKg = reasons.length ? null : Math.max(...sources.map(source => source.massKg!));
  return {
    construction: frameConstructionForPumpMass(massKg), massKg, reasons,
    sourceFingerprint: JSON.stringify([FRAME_RULE_REVISION, settings.stationType, secondary, sources.map(({ id, massKg, count }) => [id, massKg, count])]),
  };
}

export function frameSpecificationItem(selection: ReturnType<typeof projectFrameSelection>, validConfiguration: boolean): SpecItem {
  const construction = validConfiguration ? selection.construction : null;
  return {
    position: "05.01", option: "frame", section: "frame", generatedBy: "station",
    name: construction?.label ?? "Рама насосной установки", quantity: construction ? 1 : 0, unit: "шт.", price: null,
    details: construction ? `Высота ${construction.heightMm} мм · масса одного насоса ${selection.massKg} кг` : "Конструкция и высота не определены",
    description: "Общая несущая рама; конструкция по массе самого тяжёлого отдельного насоса активных контуров",
    status: "clarify", technicalStatus: "incomplete", sourceFingerprint: selection.sourceFingerprint,
    technicalNotes: construction ? ["Выбраны конструкция и высота. Длина, ширина, монтажные отверстия, состав и стоимость требуют уточнения."] :
      [...selection.reasons, ...(!validConfiguration ? ["Подтвердите насосы и количество активных контуров."] : [])],
  };
}

/** Only an untouched empty legacy placeholder may be replaced like an automatic row. */
export const automaticFrameItem = (item: SpecItem) => item.generatedBy === "station" ||
  item.name === "Рама насосной установки" && item.quantity === 0 && item.price == null && !item.equipmentId && item.technicalStatus === "incomplete";
