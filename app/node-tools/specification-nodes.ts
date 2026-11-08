import { makeField, type Field, type NodeType } from "../engineering/schema";
import type { ComponentsDatabase } from "../component-database-types";
import type { ProjectConfig, SpecItem, SpecSection } from "../project-config";
import type { Pump } from "../pump-catalog";
import type { StationSpecificationResources } from "../station-specification";
import type { SpecificationReadiness } from "../specification-readiness";
import type { Diagnostic, ParameterBinding } from "./schema";

export type SpecificationManualRow = {
  id: string; name: string; details: string; quantity: number; unit: string;
  price: number | null; section: SpecSection; description: string; confirmed: boolean;
};
export type SpecificationResult = { project: ProjectConfig; pumps: Pump[]; resources: StationSpecificationResources; issues: Diagnostic[] };
export type SpecificationData = {
  status: "ready" | "empty"; message: string; project?: ProjectConfig; items: SpecItem[];
  readiness?: SpecificationReadiness; database?: ComponentsDatabase; manualRows: SpecificationManualRow[];
};
export type SpecificationBindings = { manual?: ParameterBinding; hydraulic?: ParameterBinding; dn?: ParameterBinding };
export const SPECIFICATION_GROUPS: Array<{ title: string; sections: Array<{ id: SpecSection; title?: string }> }> = [
  { title: "Насосы", sections: [{ id: "pump" }] }, { title: "Шкаф управления", sections: [{ id: "control" }] },
  { title: "Рама", sections: [{ id: "frame" }] },
  { title: "Сборочный комплект гидравлики", sections: [{ id: "suction", title: "Всасывающая линия" }, { id: "discharge", title: "Напорная линия" }] },
  { title: "Сборочный комплект электрики", sections: [{ id: "electrical" }] },
];
export const SPECIFICATION_OPERATIONS = ["spec.pumps", "spec.cabinet", "spec.frame", "spec.lines", "spec.options", "spec.finalize", "spec.readiness", "ui.specification"] as const;
const field = (key: string, name: string, meaning: string, kind: Field["kind"] = "object", direction: Field["direction"] = "input"): Field => makeField(key, name, kind, meaning, "", direction);
const output = (key: string, name: string, meaning: string) => field(key, name, meaning, "object", "output");
export function specificationNodeTypes(): NodeType[] {
  const types: NodeType[] = [];
  const add = (id: string, name: string, description: string, fields: Field[]) => types.push({ id, name, description, category: id.startsWith("ui.") ? "Интерфейс спецификации" : "Спецификация", operation: id, formulas: {}, fields });
  add("spec.pumps", "Насосы и ручные позиции спецификации", "Принимает результат конструктора, подтверждённые насосы и закреплённый каталог комплектующих. Рассчитывает закупочные цены и количества рабочих и резервных насосов. Ручные позиции не подменяют автоматически рассчитанные узлы.", [field("collectors", "Результат конструктора коллекторов", "stationCollectorResult"), field("resources", "Каталог комплектующих и шкафов", "stationCatalogResources"), field("manualRows", "Ручные позиции", "specManualRows", "array"), field("hydraulicOptions", "Настройки изделий гидравлики", "hydraulicOptions"), output("batch", "Насосы и состав", "stationPumpRows")]);
  add("spec.cabinet", "Подбор шкафа управления", "Подбирает шкаф по подтверждённым насосам, количеству и типу станции. Неизвестные цены и отсутствие исполнения остаются явными замечаниями.", [field("batch", "Насосы и состав", "stationPumpRows"), output("value", "Состав со шкафом", "stationCabinetRows")]);
  add("spec.frame", "Подбор рамы станции", "Применяет правила подбора рамы по выбранным насосам, массе и монтажным данным. Неполные сведения не заменяются предположениями.", [field("batch", "Состав со шкафом", "stationCabinetRows"), output("work", "Подготовленный состав станции", "stationSpecificationWork")]);
  add("spec.lines", "Арматура и сборочные линии", "Повторяет расчёт всасывающих и напорных линий первого рабочего пространства: DN, PN, соединения, вставки, КИП и проверка давления.", [field("work", "Состав станции", "stationSpecificationWork"), output("value", "Состав с гидравлическими линиями", "stationSpecificationWork")]);
  add("spec.options", "Комплектация гидравлических узлов", "Собирает бак, преобразователи, заглушки и разделительные затворы с комплектами подключения и ценами. Сохраняет отдельный и комплектный учёт деталей.", [field("work", "Состав с гидравлическими линиями", "stationSpecificationWork"), output("value", "Состав с опциями", "stationSpecificationWork")]);
  add("spec.finalize", "Согласованная спецификация", "Нормализует позиции и проверяет соответствие состава текущим входам. Устаревшие узлы не получают подтверждённую цену.", [field("work", "Полный состав", "stationSpecificationWork"), output("result", "Результат спецификации", "stationSpecificationResult")]);
  add("spec.readiness", "Проверка состава и стоимости", "Раздельно проверяет комплектность, техническую готовность и полноту цен. Вычисляет стоимость только достоверных позиций.", [field("result", "Результат спецификации", "stationSpecificationResult"), output("data", "Таблица и готовность", "stationSpecificationData"), field("issues", "Проверки", "diagnostics", "array", "output")]);
  add("ui.specification", "Таблица спецификации", "Привычная таблица по разделам, суммы, сообщения, выбор вставок и исполнений гидравлики, ручные позиции и выгрузка CSV/XLSX. Изменения выполняются только через подключённые параметры.", [field("data", "Таблица и готовность", "stationSpecificationData"), field("manualBinding", "Параметр ручных позиций", "parameterBinding"), field("hydraulicBinding", "Параметр гидравлических опций", "parameterBinding"), field("dnBinding", "Параметр настроек DN", "parameterBinding"), output("value", "Интерфейс", "view")]);
  return types;
}
