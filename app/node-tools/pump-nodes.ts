import { makeField, type Field, type NodeType } from "../engineering/schema";
import type { PumpSelectionInput, PumpSelectionCandidate } from "../pump-selection";
import type { CatalogItem } from "./catalog-schema";
export type SelectionProof = {
  variantId: string;
  snapshotId: string;
  requestKey: string;
};
export type SelectionState = {
  bindingKey: string;
  node: string;
  variantId: string | null;
  snapshotId: string;
  requestKey: string;
  valid: boolean;
  stale: boolean;
  message: string;
  request?: PumpSelectionInput | null;
  purchasePriceRub?: number | null;
  modelId?: string;
  curveSetId?: string | null;
};
export type PumpRow = Record<string, unknown> & {
  id: string;
  variantId: string;
  modelId: string;
  curveSetId: string | null;
  item: CatalogItem;
  measured: boolean;
  selectable: boolean;
  candidate?: PumpSelectionCandidate;
};
export type PumpDataset = {
  snapshotId: string;
  requestKey: string;
  stage: "catalog" | "filtered" | "reserved" | "measured" | "ranked";
  request: PumpSelectionInput | null;
  filters: Record<string, string>;
  criteria: Record<string, unknown>;
  rows: PumpRow[];
  total: number;
  issues: string[];
};
export const PUMP_OPERATIONS = ["pump.catalog", "pump.request", "pump.filter", "pump.reserve", "pump.measure", "pump.rank", "pump.options", "pump.table", "pump.select", "pump.card", "ui.select", "collection.filter", "collection.sort", "collection.limit", "collection.lookup", "collection.options", "collection.number", "collection.string", "collection.boolean"] as const;
export const TABLE_COLUMNS: Record<string, {
  label: string;
  unit?: string;
}> = {
  manufacturer: {
    label: "Производитель"
  },
  series: {
    label: "Серия"
  },
  model: {
    label: "Модель"
  },
  execution: {
    label: "Исполнение"
  },
  article: {
    label: "Артикул"
  },
  power: {
    label: "Мощность",
    unit: "кВт"
  },
  frequencyHz: {
    label: "Частота",
    unit: "Гц"
  },
  headAtRequestedFlow: {
    label: "Напор при заданном расходе",
    unit: "м"
  },
  headReservePercent: {
    label: "Запас напора",
    unit: "%"
  },
  flow: {
    label: "Рабочий расход",
    unit: "м³/ч"
  },
  head: {
    label: "Рабочий напор",
    unit: "м"
  },
  deltaQPercent: {
    label: "Отклонение расхода",
    unit: "%"
  },
  deltaHPercent: {
    label: "Отклонение напора",
    unit: "%"
  },
  purchasePriceRub: {
    label: "Закупочная цена",
    unit: "₽"
  },
  inletDn: {
    label: "DN входа"
  },
  outletDn: {
    label: "DN выхода"
  },
  pointIssue: {
    label: "Диагностика"
  },
  variantId: {
    label: "ID исполнения"
  }
};
const input = (key: string, name: string, kind: Field["kind"], meaning: string, unit = "", initial?: unknown): Field => ({
  ...makeField(key, name, kind, meaning, unit, "input"),
  ...(initial === undefined ? {} : {
    initial
  })
});
const output = (field: Field): Field => ({
  ...field,
  direction: "output",
  initial: undefined
});
const record = (key: string, name: string, meaning = "record") => input(key, name, "object", meaning);
const text = (key: string, name: string, initial = "") => input(key, name, "string", "text", "", initial);
const flag = (key: string, name: string, initial?: boolean) => input(key, name, "boolean", "flag", "", initial);
const enumeration = (key: string, name: string, options: string[], names: string[], initial: string): Field => ({
  ...input(key, name, "enum", key, "", initial),
  options,
  optionNames: Object.fromEntries(options.map((v, i) => [v, names[i]]))
});
export const requestField = (key = "request", direction: Field["direction"] = "input"): Field => ({
  ...record(key, "Условия подбора", "pumpRequest"),
  direction,
  shape: [input("flowRate", "Расход станции", "float", "flow", "м³/ч"), input("head", "Требуемый напор", "float", "head", "м"), input("staticHead", "Статический напор", "float", "head", "м"), input("workingPumpCount", "Рабочих насосов", "int", "count", "шт"), {
    ...input("medium", "Перекачиваемая среда", "enum", "medium"),
    options: ["water", "wastewater"]
  }]
});
const dataset = (key = "value", name = "Кандидаты") => record(key, name, "pumpDataset");
const records = (key = "items", name = "Строки") => ({
  ...input(key, name, "array", "records"),
  item: record("row", "Строка")
});
const optionsField = (key = "options") => ({
  ...input(key, "Варианты выбора", "array", "enumOptions"),
  item: {
    ...record("option", "Вариант", "enumOption"),
    shape: [text("value", "Значение"), text("label", "Название")]
  }
});
const view = () => output(record("value", "Интерфейс", "view"));
const binding = () => record("binding", "Параметр выбора", "parameterBinding");
const diagnostics = () => output(input("issues", "Проверки", "array", "diagnostics"));
export function selectionProofField(key = "selectedPump"): Field {
  return {
    ...record(key, "Выбранное исполнение насоса", "pumpSelectionProof"),
    initial: null,
    shape: [input("variantId", "ID исполнения", "string", "pumpVariantId"), input("snapshotId", "Снимок каталога", "string", "catalogSnapshotId"), input("requestKey", "Условия подтверждения", "string", "selectionRequestKey")].map(field => ({
      ...field,
      required: true
    }))
  };
}

/** Reusable operations only. No production Instrument or project is created by this library. */
export function pumpNodeTypes(): NodeType[] {
  const types: NodeType[] = [];
  const add = (id: string, name: string, description: string, fields: Field[]) => types.push({
    id,
    name,
    description,
    category: id.startsWith("collection.") ? "Коллекции" : id.startsWith("ui.") || ["pump.table", "pump.card"].includes(id) ? "Интерфейс подбора" : "Подбор насосов",
    fields,
    operation: id,
    formulas: {}
  });
  add("pump.catalog", "Новый каталог насосов", "Зарегистрированный источник pump_catalog_v2. Использует загруженный неизменяемый снимок; при ошибке не подменяет его старым каталогом.", [{
    ...input("source", "Зарегистрированный источник", "enum", "source", "", "pump_catalog_v2"),
    options: ["pump_catalog_v2"],
    optionNames: {
      pump_catalog_v2: "Новая база насосов"
    }
  }, output(dataset("value", "Каталог для подбора")), output(records()), output(text("snapshotId", "Снимок каталога")), diagnostics()]);
  add("pump.request", "Условия подбора из настроек", "Читает действующий результат настроек проекта. Статический напор задаётся отдельно; входной напор автоматически не подставляется.", [record("settings", "Результат настроек проекта"), enumeration("contour", "Контур", ["main", "secondary"], ["Основной контур", "Второй контур"], "main"), input("staticHead", "Статический напор", "float", "head", "м", 0), output(requestField("value")), output(input("flowPerPump", "Расход одного рабочего насоса", "float", "flow", "м³/ч")), output(flag("valid", "Условия корректны")), diagnostics()]);
  add("pump.filter", "Фильтрация каталога насосов", "Проверяет активность, среду и Q/H-кривую; применяет строковые фильтры. Пустой фильтр означает «Все».", [dataset("catalog", "Каталог"), requestField(), text("manufacturer", "Производитель"), text("series", "Серия"), text("type", "Тип насоса"), text("search", "Поиск модели"), output(dataset()), output(records()), output(input("count", "Количество", "int", "count", "шт")), diagnostics()]);
  add("pump.reserve", "Проверка напора по характеристике", "Вычисляет напор при расходе Q/n и отбирает кандидатов по минимальному запасу. Применяется существующий алгоритм приложения.", [dataset("candidates", "Отфильтрованный каталог"), input("minimum", "Минимальный запас напора", "float", "percent", "%", -5), output(dataset()), diagnostics()]);
  add("pump.measure", "Рабочая точка кандидатов", "Ищет рабочую точку существующим алгоритмом PCHIP и рассчитывает отклонения. Неизвестная цена остаётся неизвестной.", [dataset("candidates", "Кандидаты с проверенным напором"), record("pricing", "Курсы и скидки из настроек"), output(dataset()), diagnostics()]);
  add("pump.rank", "Сортировка результатов подбора", "Сортирует по существующим правилам приложения. Не выбирает насос автоматически.", [dataset("candidates", "Оценённые кандидаты"), enumeration("mode", "Порядок", ["distance", "price"], ["По рабочей точке", "По цене"], "distance"), {
    ...input("limit", "Максимум строк", "int", "count", "шт", 100),
    min: 1,
    max: 1000
  }, output(dataset()), output(records()), diagnostics()]);
  add("pump.options", "Варианты фильтра из каталога", "Производители, серии и типы формируются из текущего снимка. Необязательные тип и производитель сужают справочник; пустое значение означает «Все». Проверка Q/H здесь не выполняется.", [dataset("catalog", "Каталог"), enumeration("attribute", "Атрибут", ["manufacturer", "series", "type"], ["Производитель", "Серия", "Тип насоса"], "manufacturer"), text("type", "Тип насоса"), text("manufacturer", "Производитель"), output(optionsField())]);
  add("ui.select", "Динамический список выбора", "Связывает строковый параметр с вариантами из каталога. Пустой выбор снимает фильтр. Явно подключённые зависимые пользовательские параметры сбрасываются вместе с изменением выбора.", [binding(), optionsField(), { ...binding(), key: "clear0", name: "Сбросить зависимый параметр 1" }, { ...binding(), key: "clear1", name: "Сбросить зависимый параметр 2" }, dataset("cascadeCatalog", "Каталог зависимых фильтров"), text("cascadeAttribute", "Зависимость: type или manufacturer"), text("cascadeType", "Действующий тип насоса"), text("label", "Подпись"), text("emptyLabel", "Пустой вариант", "Все"), flag("showOrigin", "Показывать источник значения", true), view(), diagnostics()]);
  add("pump.table", "Таблица кандидатов насосов", "Отображает результаты и записывает подтверждение выбранного исполнения в параметр. Пересчёт не выбирает строку сам.", [dataset("candidates", "Результаты подбора"), binding(), text("title", "Заголовок", "Результаты подбора"), enumeration("preset", "Колонки", ["short", "technical", "price", "custom"], ["Основные", "Технические", "Цена и отклонения", "Свой список"], "short"), text("customColumns", "Свои колонки через запятую", "model,manufacturer,series,power,headReservePercent,purchasePriceRub"), view(), diagnostics()]);
  add("pump.select", "Проверка выбранного исполнения", "Проверяет подтверждённые исполнение, снимок каталога и условия. При изменении условий старый выбор становится устаревшим.", [dataset("candidates", "Результаты подбора"), binding(), output(record("value", "Выбранное исполнение", "pumpCatalogItem")), output(record("selection", "Статус подтверждения", "pumpSelectionState")), output(flag("valid", "Выбор действителен")), diagnostics()]);
  add("pump.card", "Карточка выбранного насоса", "Показывает только подтверждённое исполнение и диагностику выбора.", [record("item", "Выбранное исполнение", "pumpCatalogItem"), record("selection", "Статус подтверждения", "pumpSelectionState"), view()]);
  add("collection.filter", "Фильтр строк", "Фильтрует записи по явно выбранному атрибуту и типу сравнения.", [records(), text("attribute", "Атрибут"), enumeration("operator", "Условие", ["eq", "contains", "gt", "gte", "lt", "lte"], ["Равно", "Содержит", "Больше", "Не меньше", "Меньше", "Не больше"], "eq"), enumeration("valueType", "Тип сравнения", ["text", "number", "boolean"], ["Текст", "Число", "Логический"], "text"), text("text", "Текст"), input("number", "Число", "float", "number", "", 0), flag("flag", "Да / нет", false), output(records("value")), output(input("before", "Строк до фильтра", "int", "count", "шт")), output(input("count", "Строк после фильтра", "int", "count", "шт"))]);
  add("collection.sort", "Сортировка строк", "Числа сравниваются как числа, строки как строки; неизвестные значения располагаются в конце.", [records(), text("attribute", "Атрибут"), enumeration("direction", "Направление", ["asc", "desc"], ["По возрастанию", "По убыванию"], "asc"), output(records("value"))]);
  add("collection.limit", "Ограничение строк", "Оставляет указанное количество строк и сообщает полное количество.", [records(), {
    ...input("limit", "Количество", "int", "count", "шт", 100),
    min: 1,
    max: 1000
  }, output(records("value")), output(input("total", "Всего строк", "int", "count", "шт"))]);
  add("collection.lookup", "Найти запись по ID", "Ищет точное совпадение устойчивого идентификатора.", [records(), text("attribute", "Атрибут ID", "id"), text("id", "Значение ID"), output(record("value", "Найденная запись"))]);
  add("collection.options", "Список вариантов из строк", "Создаёт уникальные именованные варианты для динамического списка.", [records(), text("attribute", "Атрибут значения"), text("labelAttribute", "Атрибут названия"), output(optionsField())]);
  for (const kind of ["number", "string", "boolean"] as const) add("collection." + kind, "Атрибут · " + {
    number: "число",
    string: "текст",
    boolean: "логический"
  }[kind], "Читает объявленный атрибут и проверяет его тип. Не преобразует неизвестное значение в ноль или false.", [record("record", "Запись"), text("attribute", "Атрибут"), output(input("value", "Значение", kind === "number" ? "float" : kind, kind === "number" ? "number" : kind === "boolean" ? "flag" : "text"))]);
  const field = selectionProofField();
  const parameter: NodeType = {
    id: "pump.selectionParameter",
    name: "Параметр выбранного насоса",
    category: "Подбор насосов",
    description: "Пользовательское подтверждение исполнения с версией каталога и условиями. Подключите binding к таблице и проверке выбора.",
    operation: "parameter",
    formulas: {},
    parameter: {
      key: field.key,
      field,
      permission: "input"
    },
    fields: [record("values", "Значения инструмента", "toolValues"), record("defaults", "Базовые значения", "toolValues"), input("scope", "Область", "string", "scope"), input("role", "Роль", "string", "role"), flag("active", "Участвует в расчёте", true), {
      ...field,
      key: "computed",
      name: "Вычисленное значение",
      initial: undefined
    }, output({
      ...field,
      key: "value",
      initial: undefined
    }), output(binding()), diagnostics(), output(flag("valid", "Значение корректно")), output(input("origin", "Происхождение", "string", "origin"))]
  };
  types.push(parameter);
  return types;
}
