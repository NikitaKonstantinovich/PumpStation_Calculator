import type { PanelKind } from "./project-config";

export const PANEL_INFO: Record<PanelKind, { title: string; eyebrow: string }> = {
  settings: { title: "Настройки проекта", eyebrow: "КОНФИГУРАЦИЯ" },
  collectors: { title: "Конструктор коллекторов", eyebrow: "ГИДРАВЛИКА" },
  dn: { title: "Расчёт DN", eyebrow: "ГИДРАВЛИКА" },
  input: { title: "Подбор насосов", eyebrow: "ИНСТРУМЕНТ" },
  chart: { title: "Гидравлическая кривая", eyebrow: "ИНСТРУМЕНТ" },
  sketch: { title: "Карточка насоса 1", eyebrow: "ХАРАКТЕРИСТИКИ И ГАБАРИТЫ" },
  input2: { title: "Подбор насосов 2", eyebrow: "ВТОРОЙ КОНТУР" },
  chart2: { title: "Гидравлическая кривая 2", eyebrow: "ВТОРОЙ КОНТУР" },
  sketch2: { title: "Карточка насоса 2", eyebrow: "ВТОРОЙ КОНТУР" },
  spec: { title: "Спецификация", eyebrow: "СОСТАВ СТАНЦИИ" },
  components: { title: "База комплектующих", eyebrow: "ОБОРУДОВАНИЕ" },
  cabinet: { title: "Конфигуратор ШУ", eyebrow: "ШКАФ УПРАВЛЕНИЯ" },
  model: { title: "3D-модель", eyebrow: "КОМПОНОВКА" },
  issues: { title: "Ошибки и предупреждения", eyebrow: "ДИАГНОСТИКА ПРОЕКТА" },
};

export const ENTITY_BY_TOOL: Record<PanelKind, string> = {
  input: "system-input", chart: "working-point", sketch: "pump-sketch",
  input2: "system-input-2", chart2: "working-point-2", sketch2: "pump-sketch-2",
  settings: "station-settings", dn: "station-dn", spec: "station-spec",
  components: "station-components", cabinet: "station-control-cabinet",
  collectors: "station-collectors", model: "station-model", issues: "station-issues",
};
