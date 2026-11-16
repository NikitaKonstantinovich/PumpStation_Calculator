import { makeField, type Field, type NodeType } from "../engineering/schema";
import type { ProjectConfig } from "../project-config";
import type { Pump } from "../pump-catalog";
import type { CollectorCalculation, CollectorCatalog, CollectorConfiguration, CollectorType } from "../collector-calculations";
import type { CollectorsEntity } from "../collector-project";
import type { Diagnostic, ParameterBinding } from "./schema";

export type CollectorRecommendations = {
  project: ProjectConfig | null;
  pumps: Pump[];
  recommendations: Record<CollectorType, CollectorConfiguration> | null;
  issues: Diagnostic[];
};
export type CollectorNodeResult = {
  project: ProjectConfig | null;
  pumps: Pump[];
  entity: CollectorsEntity;
  catalog: CollectorCatalog | null;
  issues: Diagnostic[];
};
export type CollectorCalculations = Record<CollectorType, CollectorCalculation | null>;
export type CollectorAction = "calculate" | "lookup" | "create" | "refresh";
export type CollectorCommands = { kind: "collector-database"; actions: CollectorAction[] };
export type CollectorViewData = {
  result: CollectorNodeResult;
  calculations: CollectorCalculations;
  commands: CollectorCommands;
  stateBinding?: ParameterBinding;
  canCustomize: boolean;
};
export const COLLECTOR_OPERATIONS = ["collector.recommend", "collector.resolve", "collector.calculate", "collector.result", "collector.databaseActions", "ui.collectorConstructor"] as const;
const input = (key: string, name: string, meaning: string, kind: Field["kind"] = "object", initial?: unknown): Field => ({ ...makeField(key, name, kind, meaning, "", "input"), ...(initial === undefined ? {} : { initial }) });
const output = (key: string, name: string, meaning: string, kind: Field["kind"] = "object"): Field => ({ ...input(key, name, meaning, kind), direction: "output" });
const resolved = () => input("resolved", "Настроенные коллекторы", "stationCollectorResult");
const catalog = () => input("catalog", "Каталог комплектующих коллекторов", "collectorCatalog");
const calculations = () => input("calculations", "Расчёт состава и стоимости", "collectorCalculations");
const commands = () => input("commands", "Действия с базой коллекторов", "collectorCommands");
export function collectorNodeTypes(): NodeType[] {
  return [
    { id: "collector.recommend", name: "Рекомендации коллекторов", description: "Получает параметры контуров, выбранные насосы и диаметры из расчёта DN. Вычисляет рекомендацию для всасывающего и напорного коллекторов.", fields: [input("dn", "Результат расчёта DN", "stationDnResult"), output("recommendations", "Рекомендации", "collectorRecommendations"), output("issues", "Проверки", "diagnostics", "array")] },
    { id: "collector.resolve", name: "Настройка исполнения коллекторов", description: "Применяет ручные DN, PN, материал, соединения и межосевые расстояния. Проверяет подтверждение расстояний и актуальность сохранённых расчётов.", fields: [input("recommendations", "Рекомендации", "collectorRecommendations"), input("state", "Сохранённые настройки и расчёты", "collectorState"), catalog(), output("resolved", "Настроенные коллекторы", "stationCollectorResult"), output("issues", "Проверки", "diagnostics", "array")] },
    { id: "collector.calculate", name: "Состав и стоимость коллекторов", description: "Рассчитывает длины, скорости, трубы, фланцы, сгоны, заглушки, сварные швы и окраску по подключённому каталогу. Неполные исходные данные не заменяются нулевой ценой.", fields: [resolved(), output("calculations", "Расчёт состава и стоимости", "collectorCalculations"), output("issues", "Проверки", "diagnostics", "array")] },
    { id: "collector.result", name: "Результат конструктора коллекторов", description: "Передаёт коллекторы и подтверждённый состав в спецификацию. Изменение параметров или версии каталога делает сохранённый расчёт устаревшим.", fields: [resolved(), calculations(), output("result", "Коллекторы для спецификации", "stationCollectorResult"), output("issues", "Проверки", "diagnostics", "array")] },
    { id: "collector.databaseActions", name: "Действия с базой коллекторов", description: "Явно разрешает кнопки расчёта, проверки базы, создания и обновления позиции. Запись выполняется только по нажатию кнопки через проверяемый серверный обработчик.", fields: [input("calculate", "Расчёт", "boolean", "boolean", true), input("lookup", "Проверка базы", "boolean", "boolean", true), input("create", "Создание позиции", "boolean", "boolean", true), input("refresh", "Обновление цены", "boolean", "boolean", true), output("commands", "Разрешённые действия", "collectorCommands")] },
    { id: "ui.collectorConstructor", name: "Интерфейс конструктора коллекторов", description: "Две привычные карточки с настройками, составом, сварными швами, скоростями и ценами. Ручные значения и результаты действий сохраняются в подключённом параметре графа.", fields: [resolved(), calculations(), commands(), input("stateBinding", "Параметр состояния коллекторов", "parameterBinding"), output("value", "Интерфейс", "view")] },
  ].map(type => ({ ...type, category: type.id.startsWith("ui.") ? "Интерфейс коллекторов" : "Конструктор коллекторов", operation: type.id, formulas: {} }));
}
