import type { Pump } from "./pump-catalog";

export type EquipmentKind = "drawing" | "model";
export type EquipmentCadModel = {path:string;hash?:string;note?:string;configuration?:string};
export type EquipmentRow = {
  key: string; category: string; categoryName: string; name: string; pump: boolean;
  active: boolean; incomplete: boolean; values: Record<string, unknown>;
  sources: Partial<Record<EquipmentKind, string>>;
  cadModels?: EquipmentCadModel[];
};
export type EquipmentFile = {
  available: boolean; name?: string; size?: number; path?: string; canReveal?: boolean; error?: string; note?:string;
};
export type EquipmentFiles = Partial<Record<EquipmentKind, EquipmentFile>>;
export type EquipmentCatalog = { rows: EquipmentRow[]; warnings: string[] };
export const CAD_EXTENSIONS = ["sldprt", "sldasm", "step", "stp", "iges", "igs", "x_t", "x_b", "zip"];
export const cadSource = (path: string) => CAD_EXTENSIONS.includes(path.split(/[?#]/)[0].split(".").at(-1)?.toLowerCase() ?? "");
export const equipmentFileUrl = (key: string, kind: EquipmentKind) => `/api/admin/equipment/files?key=${encodeURIComponent(key)}&kind=${kind}`;

const labels: Record<string, string> = {
  id:"ID", name:"Наименование", model:"Модель", manufacturer:"Производитель", brand:"Марка", article:"Артикул", series:"Серия", group:"Группа", type:"Тип", execution:"Исполнение", family:"Семейство",
  price:"Цена", priceCurrency:"Валюта", currency:"Валюта", currentPrice:"Текущая цена", power:"Мощность, кВт", powerKw:"Мощность, кВт", pumpPowerKw:"Мощность насоса, кВт", pumpCount:"Количество насосов",
  efficiency:"КПД, %", nominalFlow:"Номинальный расход, м³/ч", minFlow:"Мин. расход, м³/ч", maxFlow:"Макс. расход, м³/ч", minHead:"Мин. напор, м", maxHead:"Макс. напор, м", ratedHead:"Номинальный напор, м",
  weightKg:"Масса, кг", voltage:"Напряжение, В", frequencyHz:"Частота, Гц", speedRpm:"Обороты, об/мин", inletDn:"Вход DN", outletDn:"Выход DN", inlet:"Вход", outlet:"Выход", dimensions:"Размеры", materials:"Материалы", electric:"Электродвигатель", fluid:"Рабочая среда", mounting:"Монтаж",
  curve:"Q–H: расход, м³/ч / напор, м", efficiencyCurve:"КПД: расход, м³/ч / КПД, %", powerCurve:"Мощность: расход, м³/ч / мощность, кВт", npshCurve:"NPSH: расход, м³/ч / NPSH, м", selectionFlowRange:"Диапазон подбора, м³/ч",
  active:"Активна", isActive:"Активна", selectable:"Доступна для подбора", source:"Источник", sourceSheet:"Лист источника", sourceRow:"Строка источника", sourceFile:"Файл источника", priceSource:"Источник цены", description:"Описание", availability:"Наличие", medium:"Среда", manualEntry:"Ручная запись", dataWarnings:"Замечания",
  catalogId:"Категория", tableId:"Таблица источника", fields:"Характеристики источника", prices:"Цены по исполнениям", headerPath:"Название характеристики", value:"Значение", column:"Колонка источника", amount:"Сумма", label:"Наименование", unit:"Единица", comment:"Примечание", numberFormat:"Формат значения", sourceColumn:"Колонка цены",
  assets:"Файлы", drawing:"Чертёж", drawingSource:"Источник чертежа", imagePath:"Изображение", drawingPath:"Путь чертежа", modelPath:"Путь CAD-модели", files:"Загруженные файлы", spatialData:"Пространственные данные", boundsMm:"Границы, мм", ports:"Патрубки", point:"Координаты, мм", axis:"Направление оси", units:"Единицы", warnings:"Замечания", sourceUrls:"Ссылки источников",
  physicalDataSources:"Источники физических данных", physicalNote:"Примечание к физическим данным", connectionSourceValue:"Исходные подключения", catalogSource:"Каталог-источник", priceKind:"Тип цены", discountPercent:"Скидка, %", configuration:"Конфигурация", calculation:"Расчёт", attributes:"Характеристики", items:"Состав", quantity:"Количество", role:"Назначение", code:"Код", stationType:"Тип станции", startType:"Тип пуска", application:"Применение", componentType:"Тип компонента", componentGroup:"Группа компонентов",
  cachedPrice:"Сохранённая цена", cachedTotal:"Сохранённая стоимость", currentTotal:"Текущая стоимость", enclosureDimensions:"Габариты корпуса", breakerCurrentA:"Ток автомата, А", incomingSwitchCurrentA:"Вводной ток, А", contactorCount:"Количество контакторов", vfdCount:"Количество ПЧ", vfdPowerKw:"Мощность ПЧ, кВт", assemblyKitType:"Тип монтажного комплекта", laborHours:"Трудоёмкость, ч", laborRate:"Стоимость часа", updatedAt:"Обновлено", createdAt:"Создано", priceUpdatedAt:"Дата цены", revision:"Ревизия",
  dn:"DN", pn:"PN", voltage_v:"Напряжение, В", current_a:"Ток, А", poles:"Число полюсов", base:"Основание", impeller:"Рабочее колесо", orientation:"Ориентация", pressure_class:"Класс давления", standard:"Стандарт", overall_length:"Длина, мм", overall_width:"Ширина, мм", overall_height:"Высота, мм", base_length:"Длина основания, мм", base_width:"Ширина основания, мм", construction_length:"Монтажная длина, мм", flange_face_to_face:"Межфланцевое расстояние, мм", flange_center_height:"Высота оси фланца, мм",
};
export function equipmentLabel(key: string): string {
  const camel = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  return labels[key] ?? labels[camel] ?? key;
}
export function equipmentValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "number") return value.toLocaleString("ru-RU", { maximumFractionDigits: 8 });
  if (typeof value === "object") return Array.isArray(value) ? `${value.length} значений` : `${Object.keys(value).length} характеристик`;
  return String(value);
}
export function equipmentColumns(rows: EquipmentRow[]) {
  return [...new Set(rows.flatMap(row => Object.keys(row.values).filter(key => row.values[key] === null || typeof row.values[key] !== "object")))];
}
export function pumpEquipment(pump: Pump): EquipmentRow {
  return { key: `pump:${pump.id}`, category:"pumps", categoryName:"Насосы", name:pump.model, pump:true,
    active:pump.active !== false, incomplete:!pump.manufacturer || pump.power == null || pump.price == null || !pump.curve?.length,
    values:{...pump}, sources:{drawing:pump.assets?.drawingPath || pump.drawing || undefined, model:pump.assets?.modelPath || undefined} };
}
export function genericEquipment(prefix: string, category: string, categoryName: string, data: Record<string, unknown>): EquipmentRow {
  const fields = Array.isArray(data.fields) ? data.fields as Array<{headerPath: string[]; value: unknown; column: string}> : [];
  const values: Record<string, unknown> = {...data};
  for (const field of fields) {
    const key = field.headerPath.join(" / ") || field.column;
    values[key in values ? `${key} [${field.column}]` : key] = field.value;
  }
  const variant=fields.filter(f=>/^(DN|PN|DN1|DN2)$/i.test(f.headerPath.at(-1)??"")).map(f=>`${f.headerPath.at(-1)} ${String(f.value??"—").replace(/^(?:DN|PN)\s*/i,"")}`).join(" · ");
  const name = data.name || data.displayName || data.model || fields.find(f => /^Наименование$/i.test(f.headerPath.at(-1) ?? ""))?.value || (data.family?`${data.family}${variant?` · ${variant}`:""}`:data.id);
  const prices = Array.isArray(data.prices) ? data.prices : null;
  return {key:`${prefix}:${data.id}`,category,categoryName,name:String(name),pump:false,active:data.active !== false && data.isActive !== false && data.is_active !== 0,
    incomplete:!name || (prices ? !prices.length : data.price == null && data.currentPrice == null && data.cachedPrice == null && data.cachedTotal == null), values, sources:{}};
}

export function filterEquipment(rows: EquipmentRow[], options: { search: string; field: string; value: string; status: string; sort: string; descending: boolean }) {
  const words = options.search.toLocaleLowerCase("ru").trim().split(/\s+/).filter(Boolean);
  return rows.filter(row => {
    if (options.status === "inactive" && row.active || options.status === "incomplete" && !row.incomplete) return false;
    if (options.field && !equipmentValue(row.values[options.field]).toLocaleLowerCase("ru").includes(options.value.toLocaleLowerCase("ru"))) return false;
    const text = `${row.name} ${JSON.stringify(row.values)}`.toLocaleLowerCase("ru");
    return words.every(word => text.includes(word));
  }).sort((a,b) => {
    const left = options.sort === "name" ? a.name : a.values[options.sort], right = options.sort === "name" ? b.name : b.values[options.sort];
    const order = left == null ? right == null ? 0 : 1 : right == null ? -1 : typeof left === "number" && typeof right === "number" ? left-right : equipmentValue(left).localeCompare(equipmentValue(right),"ru",{numeric:true});
    return (options.descending ? -order : order) || a.key.localeCompare(b.key);
  });
}
