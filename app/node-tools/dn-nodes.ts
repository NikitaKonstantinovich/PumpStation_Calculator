import { makeField, type Field, type NodeType } from "../engineering/schema";
import type { DnEntity, InputEntity, ProjectConfig, SettingsEntity } from "../project-config";
import type { Pump } from "../pump-catalog";
import type { PumpPortData } from "../pump-ports";
import type { coreGetCircuitDnConfig } from "../station-hydraulic-calculation";
import type { Diagnostic } from "./schema";

export type DnCircuit = NonNullable<ReturnType<typeof coreGetCircuitDnConfig>> & {
  speeds: Record<string, { velocity: number; limit: number; valid: boolean }>;
};
export type DnContext = {
  status: "ready" | "empty";
  message: string;
  settings: SettingsEntity;
  input: InputEntity;
  secondaryInput: InputEntity;
  entity: DnEntity;
  effectiveEntity: DnEntity;
  pumps: Pump[];
  ports: { primary: { inlet: PumpPortData | null; outlet: PumpPortData | null }; secondary: { inlet: PumpPortData | null; outlet: PumpPortData | null } };
  warnings: string[];
};
export type DnResult = {
  spacing?: Partial<Record<"primary" | "secondary", import("../pump-spacing").SpacingResult>>;
  context: DnContext;
  primary: DnCircuit | null;
  secondary: DnCircuit | null;
  project: ProjectConfig;
  pumps: Pump[];
  resetOverrides: DnEntity;
  issues: Diagnostic[];
};

export const DN_OPERATIONS = ["station.dnContext", "station.dnCircuit", "station.dnResult", "ui.dnCalculator"] as const;
const field = (key: string, name: string, meaning: string, kind: Field["kind"] = "object", initial?: unknown): Field => ({ ...makeField(key, name, kind, meaning, "", "input"), ...(initial === undefined ? {} : { initial }) });
const out = (f: Field): Field => ({ ...f, direction: "output" });
export function dnNodeTypes(): NodeType[] {
  const types: NodeType[] = [];
  const add = (id: string, name: string, description: string, fields: Field[]) => types.push({ id, name, description, category: "Расчёт DN", operation: id, fields, formulas: {} });
  add("station.dnContext", "Исходные данные расчёта DN", "Собирает только подключённые настройки и подтверждённые исполнения. Ручные патрубки привязаны к выбранному насосу; старый каталог не используется.", [field("settings", "Настройки проекта", "record"), field("item", "Выбранный насос", "pumpCatalogItem"), field("selection", "Подтверждение насоса", "pumpSelectionState"), field("request", "Условия подбора", "pumpRequest"), field("secondaryItem", "Насос второго контура", "pumpCatalogItem"), field("secondarySelection", "Подтверждение второго насоса", "pumpSelectionState"), field("secondaryRequest", "Условия второго контура", "pumpRequest"), field("overrides", "Ручные настройки DN", "dnOverrides"), field("hydraulicOptions", "Комплектация и приборы", "hydraulicOptions"), field("baseSettings", "Закреплённые базовые значения", "baseSettings"), out(field("context", "Данные установки для DN", "dnContext")), out(field("issues", "Проверки", "diagnostics", "array"))]);
  add("station.dnCircuit", "Диаметры и арматура контура", "Рассчитывает четыре DN, скорости, соединения, PN, приводы и проверки патрубков по правилам первого рабочего пространства.", [field("context", "Данные установки для DN", "dnContext"), field("secondary", "Второй контур", "flag", "boolean", false), out(field("circuit", "Результат контура", "dnCircuit"))]);
  add("station.dnResult", "Результат расчёта DN", "Объединяет результаты обоих контуров для конструктора коллекторов и спецификации. Проект сформирован только подключённым графом.", [field("context", "Данные установки для DN", "dnContext"), field("primary", "Основной контур", "dnCircuit"), field("secondary", "Второй контур", "dnCircuit"), field("primarySpacing", "Межосевое — основной контур", "pumpSpacingResult"), field("secondarySpacing", "Межосевое — второй контур", "pumpSpacingResult"), out(field("value", "Расчёт DN", "stationDnResult")), out(field("issues", "Проверки", "diagnostics", "array"))]);
  add("ui.dnCalculator", "Панель расчёта DN", "Сохраняет привычный интерфейс DN, PN, материалов, соединений и патрубков. Изменения записываются в подключённый параметр графа.", [field("data", "Расчёт DN", "stationDnResult"), field("binding", "Параметр ручных настроек", "parameterBinding"), out(field("value", "Интерфейс", "view"))]);
  return types;
}
