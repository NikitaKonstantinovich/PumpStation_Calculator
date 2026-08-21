export type PanelKind = "input" | "chart" | "sketch" | "input2" | "chart2" | "sketch2" | "settings" | "spec" | "components" | "model";
export type WorkspaceMode = "free" | "mobile" | "grid";
export type WorkspaceGrid = { columns:number; rows:number; columnSizes:number[]; rowSizes:number[]; cells:Array<string|null> };

export type PanelState = {
  id: string;
  activeTool?: PanelKind;
  entityId: string;
  minimized?: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
};

export type InputEntity = {
  kind: "input";
  flowRate: number | null;
  head: number | null;
  staticHead: number | null;
  workingPumpCount: number | null;
  reservePumpCount: number | null;
  medium: "water" | "wastewater";
  selectedPumpId?: string;
  calculated: boolean;
};

export type ChartEntity = { kind: "chart"; efficiency: number; power: number; npsh: number };
export type SketchEntity = { kind: "sketch" };
export type StationType = "utility" | "fire" | "combined" | "smart";
export type SettingsEntity = {
  kind: "settings";
  stationType: StationType;
  membraneTank: boolean;
  membraneTankVolume: 8 | 50 | 100;
  vibrationCompensators: boolean;
  collectorPlugs: boolean;
  isolatingValves: boolean;
  jockeyPump: boolean;
  usdRate: number;
  cnyRate: number;
  manufacturerDiscounts: { cnp: number; aquastrong: number };
};
export type SpecSection = "pump" | "control" | "suction" | "discharge" | "frame" | "electrical";
export type SpecOption = "secondaryPump" | "membraneTank" | "vibrationCompensators" | "collectorPlugs" | "isolatingValves";
export type SpecItem = {
  position: string;
  name: string;
  details: string;
  quantity: number;
  unit?: string;
  price?: number | null;
  equipmentId?: string;
  listPrice?: number | null;
  priceCurrency?: "USD" | "CNY" | null;
  manufacturer?: string;
  description?: string;
  section?: SpecSection;
  option?: SpecOption;
  status: "selected" | "clarify";
};
export type SpecEntity = { kind: "spec"; items: SpecItem[] };
export type ModelEntity = { kind: "model"; view: { rotation: number; zoom: number } };
export type ComponentsEntity = { kind:"components" };
export type ProjectEntity = InputEntity | ChartEntity | SketchEntity | SettingsEntity | SpecEntity | ComponentsEntity | ModelEntity;

export type ProjectConfig = {
  schemaVersion: 1;
  project: { id: string; name: string; createdAt: string; updatedAt: string };
  station: { selectedPumpId?: string; selectedPumpModel?: string; workingPumpCount?: number; reservePumpCount?: number; totalPumpCount?: number; secondaryPumpId?: string; secondaryPumpModel?: string; secondaryWorkingPumpCount?: number; secondaryReservePumpCount?: number; secondaryTotalPumpCount?: number };
  workspace: { zoom: number; mode:WorkspaceMode; grid:WorkspaceGrid; windows: PanelState[] };
  entities: Record<string, ProjectEntity>;
};

export const DEFAULT_PANELS: PanelState[] = [
  { id: "input", activeTool: "input", entityId: "system-input", x: 18, y: 18, w: 550, h: 545, z: 1 },
  { id: "chart", activeTool: "chart", entityId: "working-point", x: 586, y: 18, w: 510, h: 390, z: 2 },
  { id: "spec", activeTool: "spec", entityId: "station-spec", x: 586, y: 426, w: 510, h: 270, z: 3 },
  { id: "model", activeTool: "model", entityId: "station-model", x: 1114, y: 18, w: 290, h: 390, z: 4 },
  { id: "settings", activeTool: "settings", entityId: "station-settings", x: 1114, y: 426, w: 390, h: 390, z: 5 },
];

const now = () => new Date().toISOString();
const projectId = () => `PS-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

export const DEFAULT_SPEC_ITEMS: SpecItem[] = [
  { position: "01", name: "Насос CNP CDM 32-4", details: "22 кВт · 2900 об/мин", quantity: 3, unit: "шт.", price: null, description: "Рабочие и резервные насосы", section: "pump", status: "selected" },
  { position: "03", name: "Шкаф управления", details: "ПЧ · IP54", quantity: 1, unit: "шт.", price: null, description: "Управление насосной установкой", section: "control", status: "selected" },
  { position: "03.01", name: "Коллектор подводящий", details: "Нержавеющая сталь", quantity: 1, unit: "шт.", price: null, description: "Общий всасывающий коллектор", section: "suction", status: "clarify" },
  { position: "03.02", name: "Затвор дисковый", details: "Межфланцевый", quantity: 3, unit: "шт.", price: null, description: "На подводящей линии каждого насоса", section: "suction", status: "clarify" },
  { position: "03.03", name: "Манометр", details: "С комплектом подключения", quantity: 1, unit: "шт.", price: null, description: "Контроль давления на входе", section: "suction", status: "clarify" },
  { position: "03.04", name: "Реле давления", details: "Защита от сухого хода", quantity: 1, unit: "шт.", price: null, description: "Автоматика подводящей линии", section: "suction", status: "clarify" },
  { position: "04.01", name: "Клапан обратный", details: "Межфланцевый", quantity: 3, unit: "шт.", price: null, description: "На напорной линии каждого насоса", section: "discharge", status: "clarify" },
  { position: "04.02", name: "Коллектор напорный", details: "Нержавеющая сталь", quantity: 1, unit: "шт.", price: null, description: "Общий напорный коллектор", section: "discharge", status: "clarify" },
  { position: "04.03", name: "Вставка гибкая", details: "Виброкомпенсатор, фланцевая", quantity: 3, unit: "шт.", price: null, description: "Компенсация вибраций", section: "discharge", option: "vibrationCompensators", status: "clarify" },
  { position: "04.04", name: "Бак мембранный", details: "Объём уточняется настройками", quantity: 1, unit: "шт.", price: null, description: "Стабилизация давления", section: "discharge", option: "membraneTank", status: "clarify" },
  { position: "04.05", name: "Преобразователь давления", details: "Выход 4–20 мА", quantity: 1, unit: "шт.", price: null, description: "Обратная связь для шкафа управления", section: "discharge", status: "clarify" },
  { position: "04.06", name: "Заглушка коллектора", details: "Комплект для подводящего и напорного коллекторов", quantity: 2, unit: "шт.", price: null, description: "Закрытие резервных патрубков", section: "discharge", option: "collectorPlugs", status: "clarify" },
  { position: "04.07", name: "Затвор разделительный", details: "На коллекторах пожаротушения", quantity: 2, unit: "шт.", price: null, description: "Разделение секций коллекторов", section: "discharge", option: "isolatingValves", status: "clarify" },
  { position: "05.01", name: "Рама насосной установки", details: "Сталь с защитным покрытием", quantity: 1, unit: "шт.", price: null, description: "Общая несущая рама", section: "frame", status: "clarify" },
  { position: "05.02", name: "Стойка шкафа управления", details: "Левая и правая", quantity: 2, unit: "шт.", price: null, description: "Крепление шкафа к раме", section: "frame", status: "clarify" },
  { position: "05.03", name: "Комплект крепежа", details: "Болты, шайбы и заклёпочные гайки", quantity: 1, unit: "компл.", price: null, description: "Монтаж оборудования", section: "frame", status: "clarify" },
  { position: "05.04", name: "Виброопора", details: "Типоразмер уточняется", quantity: 4, unit: "шт.", price: null, description: "Установка рамы на основание", section: "frame", status: "clarify" },
];

export function createProject(name = "Новая насосная станция", seed?: { id?: string; timestamp?: string }): ProjectConfig {
  const timestamp = seed?.timestamp ?? now();
  return {
    schemaVersion: 1,
    project: { id: seed?.id ?? projectId(), name, createdAt: timestamp, updatedAt: timestamp },
    station: {},
    workspace: { zoom: 100, mode:"free", grid:{columns:2,rows:2,columnSizes:[1,1],rowSizes:[1,1],cells:["input","chart","spec","model"]}, windows: DEFAULT_PANELS.map(window => ({ ...window })) },
    entities: {
      "system-input": { kind: "input", flowRate: null, head: null, staticHead: null, workingPumpCount: null, reservePumpCount: null, medium: "water", calculated: false },
      "system-input-2": { kind: "input", flowRate: null, head: null, staticHead: null, workingPumpCount: null, reservePumpCount: null, medium: "water", calculated: false },
      "working-point": { kind: "chart", efficiency: 78, power: 22, npsh: 3.2 },
      "working-point-2": { kind: "chart", efficiency: 78, power: 22, npsh: 3.2 },
      "pump-sketch": { kind: "sketch" },
      "pump-sketch-2": { kind: "sketch" },
      "station-settings": { kind: "settings", stationType: "utility", membraneTank: false, membraneTankVolume: 8, vibrationCompensators: false, collectorPlugs: false, isolatingValves: false, jockeyPump: false, usdRate: 85, cnyRate: 13, manufacturerDiscounts: { cnp: 45, aquastrong: 45 } },
      "station-spec": { kind: "spec", items: DEFAULT_SPEC_ITEMS.map(item => ({ ...item })) },
      "station-components": { kind: "components" },
      "station-model": { kind: "model", view: { rotation: 0, zoom: 1 } },
    },
  };
}

function finite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function parseProjectConfig(raw: unknown): ProjectConfig {
  if (!raw || typeof raw !== "object") throw new Error("Файл не содержит объект проекта");
  const candidate = raw as Partial<ProjectConfig>;
  if (candidate.schemaVersion !== 1) throw new Error("Неподдерживаемая версия файла проекта");
  if (!candidate.project || typeof candidate.project.name !== "string" || typeof candidate.project.id !== "string") throw new Error("В файле отсутствуют данные проекта");
  if (!candidate.workspace || !Array.isArray(candidate.workspace.windows) || !candidate.entities || typeof candidate.entities !== "object") throw new Error("В файле отсутствует рабочее пространство");
  const allowed = new Set<PanelKind>(["input", "chart", "sketch", "input2", "chart2", "sketch2", "settings", "spec", "components", "model"]);
  const windows = candidate.workspace.windows.map((window, index) => {
    if (!window || typeof window.id !== "string" || typeof window.entityId !== "string" || !candidate.entities?.[window.entityId]) throw new Error(`Некорректное окно № ${index + 1}`);
    const legacyTool = allowed.has(window.id as PanelKind) ? window.id as PanelKind : undefined;
    const activeTool = allowed.has(window.activeTool as PanelKind) ? window.activeTool : legacyTool;
    const savedHeight = finite(window.h, 260);
    return { ...window, activeTool, minimized: Boolean(window.minimized), x: Math.max(0, finite(window.x, 0)), y: Math.max(0, finite(window.y, 0)), w: Math.max(280, finite(window.w, 320)), h: Math.max(220, activeTool === "input" && savedHeight === 650 ? 545 : savedHeight), z: finite(window.z, index + 1) };
  });
  const needsSettingsPanel = !candidate.entities["station-settings"] && !windows.some(window => window.activeTool === "settings");
  const defaults = createProject(candidate.project.name, { id: candidate.project.id, timestamp: candidate.project.createdAt || now() });
  const entities = { ...defaults.entities, ...candidate.entities } as Record<string, ProjectEntity>;
  const input = entities["system-input"] as InputEntity & { pumpCount?: number } | undefined;
  if (input?.kind === "input") entities["system-input"] = { ...input, staticHead: input.staticHead ?? 0, workingPumpCount: input.workingPumpCount == null ? null : Math.max(1, finite(input.workingPumpCount, Math.max(1, finite(input.pumpCount, 2) - 1))), reservePumpCount: input.reservePumpCount == null ? null : Math.max(0, finite(input.reservePumpCount, 1)), calculated: input.calculated ?? (input.flowRate != null && input.head != null) };
  const input2 = entities["system-input-2"] as InputEntity | undefined;
  if (input2?.kind === "input") entities["system-input-2"] = { ...input2, staticHead: input2.staticHead ?? 0, workingPumpCount: input2.workingPumpCount == null ? null : Math.max(1, finite(input2.workingPumpCount, 1)), reservePumpCount: input2.reservePumpCount == null ? null : Math.max(0, finite(input2.reservePumpCount, 0)), calculated: input2.calculated ?? false };
  const rawSettings = entities["station-settings"] as Partial<SettingsEntity>;
  entities["station-settings"] = { kind: "settings", stationType: rawSettings.stationType ?? "utility", membraneTank: rawSettings.membraneTank ?? false, membraneTankVolume: rawSettings.membraneTankVolume ?? 8, vibrationCompensators: rawSettings.vibrationCompensators ?? false, collectorPlugs: rawSettings.collectorPlugs ?? false, isolatingValves: rawSettings.isolatingValves ?? false, jockeyPump: rawSettings.jockeyPump ?? false, usdRate: finite(rawSettings.usdRate, 85), cnyRate: finite(rawSettings.cnyRate, 13), manufacturerDiscounts: { cnp: finite(rawSettings.manufacturerDiscounts?.cnp, 45), aquastrong: finite(rawSettings.manufacturerDiscounts?.aquastrong, 45) } };
  const spec = entities["station-spec"] as SpecEntity | undefined;
  if (spec?.kind === "spec") {
    const isPumpItem = (item: SpecItem) => item.section === "pump" || /^Насос\b/i.test(item.name);
    const sectionFor = (item: SpecItem): SpecSection => item.section ?? (isPumpItem(item) ? "pump" : /шкаф/i.test(item.name) ? "control" : /кабел|электр|клем|наконечн|провод|гофр|лоток/i.test(item.name) ? "electrical" : /рам|стойк|крепеж|вибро/i.test(item.name) ? "frame" : /подвод|манометр|реле|затвор/i.test(item.name) ? "suction" : "discharge");
    const optionFor = (item: SpecItem): SpecOption | undefined => item.option ?? (/бак мембран/i.test(item.name) ? "membraneTank" : /вставка гибк|виброкомпенс/i.test(item.name) ? "vibrationCompensators" : /заглушк/i.test(item.name) ? "collectorPlugs" : /разделительн/i.test(item.name) ? "isolatingValves" : item.position === "02" && /^Насос\b/i.test(item.name) ? "secondaryPump" : undefined);
    const normalized = Array.isArray(spec.items) ? spec.items.map(item => ({ ...item, unit: item.unit ?? "шт.", price: item.price ?? null, description: item.description ?? "", section: sectionFor(item), option: optionFor(item) })) : [];
    const pumpItems = normalized.filter(isPumpItem);
    const primaryPump = pumpItems.find(item => item.position === "01" && item.option !== "secondaryPump") ?? pumpItems.find(item => item.option !== "secondaryPump");
    const secondaryPump = pumpItems.find(item => item.position === "02" || item.option === "secondaryPump");
    const savedItems = [...normalized.filter(item => !isPumpItem(item)), ...(primaryPump ? [{ ...primaryPump, position: "01", section: "pump" as const, option: undefined }] : []), ...(secondaryPump && secondaryPump !== primaryPump ? [{ ...secondaryPump, position: "02", section: "pump" as const, option: "secondaryPump" as const }] : [])];
    const savedNames = new Set(savedItems.map(item => item.name.trim().toLocaleLowerCase("ru-RU")));
    const additions = DEFAULT_SPEC_ITEMS.filter(item => item.section !== "pump" && !savedNames.has(item.name.toLocaleLowerCase("ru-RU"))).map(item => ({ ...item }));
    const fallbackPump = primaryPump ? [] : DEFAULT_SPEC_ITEMS.filter(item => item.section === "pump").slice(0, 1).map(item => ({ ...item, position: "01" }));
    entities["station-spec"] = { ...spec, items: [...fallbackPump, ...savedItems, ...additions].sort((a,b)=>a.position.localeCompare(b.position,"ru",{numeric:true})) };
  }
  const rawWorkspace=candidate.workspace as Partial<ProjectConfig["workspace"]>,mode:WorkspaceMode=rawWorkspace.mode==="mobile"||rawWorkspace.mode==="grid"?rawWorkspace.mode:"free",rawGrid=rawWorkspace.grid;
  const columns=Math.min(6,Math.max(1,Math.round(finite(rawGrid?.columns,2)))),rows=Math.min(6,Math.max(1,Math.round(finite(rawGrid?.rows,2)))),cellCount=columns*rows;
  const normalizeSizes=(sizes:unknown,count:number)=>Array.isArray(sizes)&&sizes.length===count?sizes.map(value=>Math.max(.1,finite(value,1))):Array.from({length:count},()=>1);
  const hasSavedCells=Array.isArray(rawGrid?.cells),savedCells=hasSavedCells?rawGrid!.cells.slice(0,cellCount).map(id=>typeof id==="string"&&windows.some(panel=>panel.id===id)?id:null):[];
  const fallbackCells=windows.filter(panel=>!panel.minimized).slice(0,cellCount).map(panel=>panel.id);
  const cells=Array.from({length:cellCount},(_,index)=>hasSavedCells?savedCells[index]??null:fallbackCells[index]??null);
  return {
    schemaVersion: 1,
    project: { ...candidate.project, name: candidate.project.name.trim() || "Без названия", createdAt: candidate.project.createdAt || now(), updatedAt: candidate.project.updatedAt || now() },
    station: candidate.station ?? {},
    workspace: { zoom: Math.min(150, Math.max(50, finite(candidate.workspace.zoom, 100))), mode, grid:{columns,rows,columnSizes:normalizeSizes(rawGrid?.columnSizes,columns),rowSizes:normalizeSizes(rawGrid?.rowSizes,rows),cells}, windows: needsSettingsPanel ? [...windows, { ...DEFAULT_PANELS.find(window => window.activeTool === "settings")! }] : windows },
    entities,
  };
}

export function withUpdatedTimestamp(config: ProjectConfig): ProjectConfig {
  return { ...config, project: { ...config.project, updatedAt: now() } };
}

export function projectFilename(config: ProjectConfig) {
  const safe = [...config.project.name.trim()].map(character => character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? "-" : character).join("").replace(/\s+/g, " ") || "project";
  return `${safe}.pumpstation.json`;
}
