import { flangeKinds, positive, THREAD_SIZES, WELD_RATES } from "./collector-calculations";
import type { InsertPaintingRate } from "./component-painting";
import type { SensorPressureAcceptance } from "./component-sensor-nipples";
import { planFlangeBoring, type FlangeBoringPolicy, type FlangeBoringRate, type FlangeBoringOperation } from "./component-flange-boring";
import { selectInsertVariants } from "./component-insert-variants";

export type InsertMaterial = "aisi304" | "st20";
export type InsertConnection = "flanged" | "collar" | "threaded";
export type InsertGeometry = "straight" | "concentric" | "eccentric";
export type InsertPartKind = "pipe" | "reducer" | "weldFlange" | "looseFlange" | "collar" | "nipple" | "threadEnd" | "bolt" | "nut" | "washer";
export type InsertSeatingChoice = { mode: "source" | "flush" | "face-offset" | "insertion-depth"; valueMm?: number };
export type InsertSeatingSettings = { flanged: InsertSeatingChoice; collar: InsertSeatingChoice };
export type InsertRequest = { dnFrom: number; dnTo: number; materials: InsertMaterial[]; withSensorNipple: boolean; includeEccentric: boolean; seating?: Partial<InsertSeatingSettings> };
export type InsertPart = {
  id: string; kind: InsertPartKind; name: string; material: InsertMaterial; dn: number; dnSmall: number | null;
  pn: number | null; geometry: InsertGeometry; outerDiameter: number | null; outerDiameterSmall: number | null;
  wallThickness: number | null; wallThicknessSmall: number | null; lengthMm: number | null;
  thicknessMm: number | null; thread: string | null; threadGender: "male" | "female" | null;
  boreDiameterMm?: number | null;
  requiredPipeOuterDiameterMm?: number;
  lipOuterDiameterMm?: number | null;
  cylindricalLengthLargeMm?: number | null; cylindricalLengthSmallMm?: number | null;
  standard: string | null; price: number | null; source: string; dimensionSources: Record<string, string>;
  warnings: string[];
  pressureAcceptance?: SensorPressureAcceptance;
  compatiblePns?: number[];
  origin?: "original" | "supplement";
  lengthAssumptionSource?: string;
};
export type InsertEndRule = {
  connection: InsertConnection; material: InsertMaterial; dn: number; pn: number;
  axialAdditionMm: number; source: string; weldFactor?: number;
  partIdentity?: string; baseOuterDiameter?: number; baseWallThickness?: number;
  allowZeroOverlap?: boolean; allowsCollarInsertion?: boolean;
};
export type InsertBoltReference = {
  dn: number; pn: number; material: InsertMaterial; model: string; threadDiameterMm: number;
  minimumLengthMm: number | null; standardLengthMm: number | null;
  componentId: string | null; source: string;
  leftConnection?: InsertConnection; rightConnection?: InsertConnection;
  endPartId?: string;
  warnings?: string[]; dimensions?: InsertDimension[];
};
export type InsertValveReference = { model: string; dn: number; pn: number; bodyLengthMm: number; mounting: string; source: string; allowedFlangeStandards: string[]; warnings?: string[] };
export type InsertCollarSelection = { dn: number; material: InsertMaterial; componentId: string; wallThicknessMm: number; partPn: number; insertPns: number[]; source: string };
export type InsertCollarAssembly = { insertionDepthMm: number; weldGapMm: number; source: string; weldFactor: number; weldSource: string };
export type InsertWallMismatchAllowance = { material: InsertMaterial; dnLarge: number; dnSmall: number; pn: number; outerDiameterMm: number; outerDiameterSmallMm: number; pipeWallMm: number; reducerWallMm: number; source: string };
export type InsertReducerSeatingApproval = { id: string; reducerId: string; reducerIdentity: string; flangeId: string; flangeIdentity: string; side: "left" | "right"; depthMm: number; source: string };
/** Engineering decisions are explicit, sourced inputs, never inferred from names or missing cells. */
export type InsertEngineering = {
  connectionPairs: Array<{ left: InsertConnection; right: InsertConnection; source: string }> | null;
  flangedEndExclusions?: { dns: number[]; source: string };
  straightLength: { model: string; basis: "standard-bolt" | "minimum-bolt"; source: string } | null;
  endRules: InsertEndRule[];
  looseFlangeInBom: { include: boolean; source: string } | null;
  sensorNipple: { dn: number; threadGender: "male" | "female"; withPlug?: boolean; source: string } | null;
  sensorNipplePn25Allowance?: { pn: number; source: string; parts: Array<{ componentId: string; material: InsertMaterial; dn: number; pressureBar: number; maxTemperatureC: number }> };
  boltReferences: InsertBoltReference[];
  collarSelections?: InsertCollarSelection[];
  collarAssembly?: InsertCollarAssembly;
  flangeAssembly?: { faceOffsetMm: number; clearanceFactor: number; fastenerModels: string[]; source: string };
  /** Legacy input retained for compatibility; pump reducers never use this rule. */
  reducerExtension?: { side: "left"; weldFactor: number; weldGapMm: number; source: string; wallMismatchAllowance?: InsertWallMismatchAllowance };
  flangeBoring?: FlangeBoringPolicy;
  reducerSeatingApprovals?: InsertReducerSeatingApproval[];
  reducerReadyBoreSeating?: { faceOffsetMm: number; source: string };
  variantSelection?: { source: string };
  compactThreaded?: { source: string; weldFactor: number };
};
export type InsertSensorPlug = { id: string; name: string; dn: number; pn: number | null; threadGender: "male" | "female" | null; physicalIdentity: string | null; price: number | null; source: string };
export type InsertStandardBolt = { id: string; diameterMm: number; lengthMm: number; source: string };
export type InsertCatalog = { weldRates?: {aisi304:number;st20:number}; version: string; parts: InsertPart[]; nominalDns: number[]; materials: InsertMaterial[]; engineering: InsertEngineering; issues: string[]; sensorPlugs?: InsertSensorPlug[]; standardBolts?: InsertStandardBolt[]; valveReferences?: InsertValveReference[]; paintingRates?: InsertPaintingRate[]; flangeBoringRates?: FlangeBoringRate[] };
export type InsertBomItem = { role: string; componentId: string | null; kind: InsertPartKind | "plug" | "welding" | "painting" | "machining"; name: string; quantity: number | null; unit: "м" | "шт."; unitPrice: number | null; cost: number | null; source: string | null };
export type InsertDimension = { name: string; value: number | null; unit: "мм" | "бар" | "°C"; source: string | null };
export type InsertWeld = { role: string; name: string; count: number; factor: number | null; diameterMm: number | null; lengthMm: number | null; cost: number | null; source: string };
export type InsertConfiguration = {
  version: 1; dnLarge: number; dnSmall: number | null; pn: number | null; material: InsertMaterial; geometry: InsertGeometry;
  base: string; left: { connection: InsertConnection; part: string | null; looseFlange: string | null };
  right: { connection: InsertConnection; part: string | null; looseFlange: string | null };
  sensor: { requested: boolean; dn: number | null; gender: string | null; part: string | null; plug: string | null };
  baseLengthMm: number | null; axialLeftMm: number | null; axialRightMm: number | null;
  flangeBores?: Array<{ side: "left" | "right"; targetBoreMm: number | null }>;
  extension?: { side: "left"; part: string | null; lengthMm: number | null };
  /** Audit-only input: physical identity uses actual axial additions, not this choice. */
  seating?: InsertSeatingSettings;
  construction?: "compact-threaded";
};
export type InsertCalculation = {
  identityKey: string; configuration: InsertConfiguration; catalogVersion: string; name: string;
  dnLarge: number; dnSmall: number | null; pn: number | null; material: InsertMaterial; geometry: InsertGeometry;
  leftConnection: InsertConnection; rightConnection: InsertConnection; threadLeft: string | null; threadRight: string | null;
  withSensorNipple: boolean; baseLengthMm: number | null; totalLengthMm: number | null;
  complete: boolean; warnings: string[]; bom: InsertBomItem[]; welds: InsertWeld[];
  dimensions: InsertDimension[]; weldLengthMm: number | null; weldCost: number | null; price: number | null; description: string;
  machining?: FlangeBoringOperation[];
  extension?: { side: "left"; componentId: string | null; lengthMm: number | null };
  /** Nonblocking project assumptions, persisted in the audit but not physical identity. */
  assumptions?: Array<{ code: "extension-wall-mismatch" | "sensor-pn25-pressure" | "flange-nominal-fit" | "reducer-analogue-length"; message: string; source: string }>;
  assemblyDecisions?: Array<{ code: "reducer-flange-seating"; ruleId: string; side: "left" | "right"; depthMm: number; message: string; source: string }>;
  selection?: { slot: string; candidateCount: number; reason: string; source: string; alternatives: Array<{ identityKey: string; componentIds: string[]; complete: boolean }> };
};

export const UNCONFIRMED_INSERT_ENGINEERING: InsertEngineering = {
  connectionPairs: null, straightLength: null, endRules: [], looseFlangeInBom: null, sensorNipple: null, boltReferences: [],
};
export const insertMaterialLabel = (material: InsertMaterial) => material === "aisi304" ? "AISI304" : "СТ20";
export const insertGeometryLabel = (geometry: InsertGeometry) => ({ straight: "Прямое", concentric: "Концентрическое", eccentric: "Эксцентрическое" })[geometry];
export const insertConnectionLabel = (connection: InsertConnection) => ({ flanged: "фланец", collar: "воротник", threaded: "резьба" })[connection];
const validDimension = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const hasSource = (value: string | null | undefined) => typeof value === "string" && value.trim().length > 0;
const confirmedCollarAssembly = (engineering: InsertEngineering) => {
  const rule = engineering.collarAssembly;
  return rule && rule.insertionDepthMm === 0 && rule.weldGapMm === 0 && hasSource(rule.source)
    && positive(rule.weldFactor) && hasSource(rule.weldSource) ? rule : null;
};
const canonicalThread = (value: string | null) => value?.replace(/1\s*1\/4/g, "1¼").replace(/1\s*1\/2/g, "1½").replace(/[\s”″]/g, character => character.trim() ? '"' : "").replace(/^(?:G|R)/i, "");
const validThreadEnd = (part: InsertPart) => part.dn <= 50 && canonicalThread(part.thread) === canonicalThread(THREAD_SIZES[part.dn] ?? null) && Boolean(part.thread && part.threadGender);
const sourceSeating = (): InsertSeatingSettings => ({ flanged: { mode: "source" }, collar: { mode: "source" } });

function parseSeating(value: unknown): InsertSeatingSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Параметры посадки должны быть объектом настроек фланца и воротника");
  const settings = value as Record<string, unknown>, result = sourceSeating();
  if (Object.keys(settings).some(key => key !== "flanged" && key !== "collar")) throw new Error("Посадка настраивается только для фланцев и воротников; резьбовые концы используют подтверждённые правила каталога");
  for (const key of ["flanged", "collar"] as const) {
    if (settings[key] === undefined) continue;
    if (!settings[key] || typeof settings[key] !== "object" || Array.isArray(settings[key])) throw new Error(`Некорректная настройка посадки: ${key}`);
    const choice = settings[key] as Record<string, unknown>;
    if (!["source", "flush", "face-offset", "insertion-depth"].includes(String(choice.mode))) throw new Error(`Неизвестный способ посадки: ${key}`);
    if (choice.valueMm !== undefined && (!validDimension(choice.valueMm) || choice.valueMm > 1000)) throw new Error("Размер посадки должен быть конечным числом от 0 до 1000 мм");
    const mode = choice.mode as InsertSeatingChoice["mode"];
    if ((mode === "face-offset" || mode === "insertion-depth") && choice.valueMm === undefined) throw new Error("Для выбранного способа посадки укажите размер в миллиметрах");
    result[key] = mode === "source" || mode === "flush" ? { mode } : { mode, valueMm: choice.valueMm as number };
  }
  return result;
}

export function parseInsertRequest(value: unknown): InsertRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Не заданы параметры расчёта вставок");
  const input = value as Record<string, unknown>;
  if (!positive(input.dnFrom) || !Number.isInteger(input.dnFrom) || !positive(input.dnTo) || !Number.isInteger(input.dnTo) || input.dnFrom > input.dnTo || input.dnTo > 10000) throw new Error("Диапазон DN должен содержать целые положительные значения от меньшего к большему (до 10000)");
  if (!Array.isArray(input.materials) || !input.materials.length || input.materials.some(value => value !== "aisi304" && value !== "st20")) throw new Error("Выберите поддерживаемый материал: AISI304 или СТ20");
  if (typeof input.withSensorNipple !== "boolean" || typeof input.includeEccentric !== "boolean") throw new Error("Опции сгона и эксцентрических переходов должны быть логическими значениями");
  return { dnFrom: input.dnFrom, dnTo: input.dnTo, materials: [...new Set(input.materials)] as InsertMaterial[], withSensorNipple: input.withSensorNipple, includeEccentric: input.includeEccentric, ...(input.seating === undefined ? {} : { seating: parseSeating(input.seating) }) };
}

export function insertCatalogMetadata(catalog: InsertCatalog) {
  const engineeringIssues = [...catalog.issues];
  if (!catalog.engineering.connectionPairs?.length) engineeringIssues.push("Не подтверждены допустимые сочетания соединений двух концов вставки");
  if (!catalog.engineering.straightLength) engineeringIssues.push("Не подтверждены модель затвора и выбор расчётной либо стандартной полной длины болта для прямой вставки");
  else if (!catalog.engineering.boltReferences.length) engineeringIssues.push("Нет данных подбора стандартного болта затвора; таблица двух фланцев не применяется");
  if (!catalog.engineering.endRules.length && !confirmedCollarAssembly(catalog.engineering)) engineeringIssues.push(catalog.engineering.flangeAssembly ? "Для воротников нужны осевые размеры и схема посадки; для приварных фланцев принят отступ торца 5 мм" : "Не подтверждены осевые добавки фланцев и воротников с учётом посадки основной детали");
  if (!catalog.engineering.looseFlangeInBom) engineeringIssues.push("Не подтверждено включение свободных фланцев в состав и стоимость воротниковой вставки");
  if (!catalog.engineering.sensorNipple) engineeringIssues.push("Не подтверждены DN и исполнение сгона датчика/реле давления");
  if (!catalog.parts.some(part => part.kind === "threadEnd")) engineeringIssues.push("В каталоге нет подтверждённых резьбовых концов вставки с PN, длиной и технологией присоединения; предел резьбы — 2 дюйма");
  const excluded = catalog.engineering.flangedEndExclusions?.dns ?? [];
  const connectionNotes = excluded.length ? [`Концы ${excluded.map(dn => `DN${dn}`).join(", ")} используются только в резьбовом исполнении. Фланцы и воротники исключены для каждого конца, в том числе у переходов. Без подтверждённых резьбовых концевых деталей эти варианты не формируются.`] : [];
  connectionNotes.push("Фланцевое исполнение каждого конца определяется общим правилом коллекторов: AISI304 при DN ≤ 200 и PN10/PN16 — воротник; при PN25, DN > 200 или материале СТ20 — приварной фланец. Наличие в базе других фланцев не создаёт дополнительные исполнения. Резьбовые концы до 2 дюймов допускаются только при подтверждённых исходных данных.");
  if (catalog.engineering.variantSelection) connectionNotes.push("На сочетание DN, PN, материала, геометрии, соединений и сгона показывается одна позиция. Приоритет — полный расчёт и комплектующие исходной базы; подходящий аналог используется при необходимости. Разные допустимые типы соединений остаются отдельными строками.");
  if (catalog.engineering.flangeBoring) connectionNotes.push("Предусмотрена расточка приварных фланцев под наружный диаметр трубы/перехода. Обработка учитывается отдельно для каждого конца; до подтверждения посадочного зазора и тарифа строки с расточкой остаются неполными.");
  connectionNotes.push("Переходные вставки устанавливаются у насоса: длина основы равна длине перехода из каталога, без дополнительных труб и требования по длине крепежа 017W/010C. Общая длина включает осевые добавки концов; посадка обоих концов проверяется отдельно.");
  if (catalog.engineering.compactThreaded) connectionNotes.push("Резьбовые вставки — только одинаковый DN до 2 дюймов: компактная сборка готовых приварных патрубков без дополнительной трубы. Длина определяется деталями и посадкой, без правила по болтам затвора. Нарезка резьбы повторно не оплачивается. PN готовой детали ограничивает PN вставки.");
  if (catalog.engineering.reducerReadyBoreSeating?.source) connectionNotes.push("Для переходов с известной толщиной и подходящим готовым отверстием фланца принят общий отступ торца 5 мм: глубина посадки b−5. Это проектное решение сборки, сохраняемое отдельно от обмеров профиля; нехватка размеров и необходимость расточки продолжают проверяться.");
  if (catalog.engineering.reducerSeatingApprovals?.some(rule => rule.id.startsWith("grossner-seating-") && hasSource(rule.source))) connectionNotes.push("В базе сохранены прежние размеры и решения посадки фланцев Grossner для DN50–32 PN10/16. Новый расчёт этих вставок использует воротники по общему правилу коллекторов.");
  if (catalog.engineering.reducerSeatingApprovals?.some(rule => rule.id.startsWith("newkey-seating-") && hasSource(rule.source))) connectionNotes.push("Для концентрического и эксцентрического переходов AISI304 DN50–32 PN25 с Newkey принята такая же посадка: 15 мм на DN50 и 13 мм на DN32, с отступом торца 5 мм. Решение сохраняется в расчёте; дополнительной трубы нет.");
  if (catalog.engineering.sensorNipplePn25Allowance?.pn === 25 && hasSource(catalog.engineering.sensorNipplePn25Allowance.source)) connectionNotes.push("PN25 со сгоном DN15 разрешён к расчёту и выгрузке с предупреждением по проектному решению. Принятые пределы самих сгонов сохраняются: СТ20 — 16 бар, AISI304 — 20 бар, до +40 °C. Пригодность при 25 бар не подтверждена; остальные проверки остаются обязательными.");
  for (const part of catalog.parts.filter(part => part.kind === "nipple" && part.pressureAcceptance)) {
    const accepted = part.pressureAcceptance!;
    connectionNotes.push(`Сгон DN${part.dn} ${insertMaterialLabel(part.material)}: принято ${accepted.pressureBar} бар при температуре среды до +${accepted.maxTemperatureC} °C. Эти условия сохраняются в расчёте; при более высокой температуре требуется отдельная проверка.`);
  }
  // Availability describes source geometries, including incomplete calculations.
  // Supplier duplicates and different PN do not duplicate the geometry hint.
  const reducerAvailability = [...new Map(catalog.parts.filter(part => part.kind === "reducer").map(part => [
    `${part.material}:${part.dn}:${part.geometry}`, { material: part.material, dn: part.dn, geometry: part.geometry },
  ])).values()];
  return { dns: catalog.nominalDns, materials: catalog.materials, pressures: [...new Set(catalog.parts.filter(part => part.kind === "pipe" || part.kind === "reducer").map(part => part.pn).filter(positive))].sort((a, b) => a - b), engineeringIssues: [...new Set(engineeringIssues)], connectionNotes, reducerAvailability };
}

/** Physical fields deliberately exclude source ID, supplier price and display name. */
export function insertPartIdentity(part: InsertPart): string {
  return JSON.stringify([part.kind, part.material, part.dn, part.dnSmall, part.pn, part.geometry,
    part.outerDiameter, part.outerDiameterSmall, part.wallThickness, part.wallThicknessSmall,
    part.lengthMm, part.thicknessMm, part.boreDiameterMm ?? null, part.cylindricalLengthLargeMm ?? null, part.cylindricalLengthSmallMm ?? null, part.thread, part.threadGender, part.standard,
    ...(part.lipOuterDiameterMm == null ? [] : [{ lipOuterDiameterMm: part.lipOuterDiameterMm }]),
    ...(part.compatiblePns ? [{ compatiblePns: [...part.compatiblePns].sort((a, b) => a - b) }] : [])]);
}

export function deduplicateInsertParts(parts: InsertPart[]): InsertPart[] {
  const groups = new Map<string, InsertPart[]>();
  for (const part of parts) { const key = insertPartIdentity(part); groups.set(key, [...groups.get(key) ?? [], part]); }
  return [...groups.values()].map(group => {
    const incomplete = (part: InsertPart) => !positive(part.price) || part.warnings.length > 0;
    const sorted = [...group].sort((a, b) => Number(incomplete(a)) - Number(incomplete(b)) || Number(a.origin === "supplement") - Number(b.origin === "supplement") || a.id.localeCompare(b.id));
    const first = sorted[0];
    const preferred = sorted.filter(part => incomplete(part) === incomplete(first) && (part.origin === "supplement") === (first.origin === "supplement"));
    const prices = new Set(preferred.map(part => part.price));
    return { ...first, warnings: [...new Set(preferred.flatMap(part => part.warnings).concat(prices.size > 1 ? [`Различающиеся цены физических дублей: ${preferred.map(part => part.id).join(", ")}; требуется выбор источника цены`] : []))] };
  });
}

type End = { connection: InsertConnection; part?: InsertPart; looseFlange?: InsertPart; warnings: string[] };
function endsFor(dn: number | null, pn: number | null, material: InsertMaterial, catalog: InsertCatalog): End[] {
  const parts = catalog.parts.filter(part => part.dn === dn && (part.pn === pn || (pn !== null && part.compatiblePns?.includes(pn)) || (catalog.engineering.compactThreaded && part.kind === "threadEnd" && positive(pn) && positive(part.pn) && part.pn >= pn)) && part.material === material);
  // Intentional scope exclusions must not become fabricated incomplete flange ends.
  // Evaluate each DN independently so a reducer can keep an eligible mixed pair.
  if (dn !== null && catalog.engineering.flangedEndExclusions?.dns.includes(dn)) {
    return parts.filter(part => part.kind === "threadEnd" && validThreadEnd(part)).map(part => ({ connection: "threaded", part, warnings: [] }));
  }
  // Apply the same material/DN/PN rule as collectors and line specifications,
  // independently at each end. Catalogue availability is not an execution rule.
  const connection: InsertConnection = dn !== null && pn !== null && flangeKinds(material, dn, pn).includes("collar") ? "collar" : "flanged";
  const ends: End[] = parts.filter(part => connection === "flanged" && part.kind === "weldFlange").map(part => ({ connection: "flanged", part, warnings: [] }));
  const selection = connection === "collar" ? catalog.engineering.collarSelections?.find(rule => rule.dn === dn && rule.material === material && pn !== null && rule.insertPns.includes(pn)) : undefined;
  const collars = selection ? catalog.parts.filter(part => part.kind === "collar" && part.id === selection.componentId
    && part.dn === dn && part.material === material && part.pn === selection.partPn && part.pn >= pn!
    && part.wallThickness === selection.wallThicknessMm && hasSource(selection.source)) : parts.filter(part => connection === "collar" && part.kind === "collar");
  const flanges = parts.filter(part => part.kind === "looseFlange");
  if (selection && !collars.length) ends.push({ connection: "collar", warnings: [`Нет подтверждённого выбранного воротника ${selection.componentId}: DN${dn}, стенка ${selection.wallThicknessMm} мм, PN${selection.partPn}, для вставки PN${pn}; автоматическая замена другим исполнением запрещена`] });
  for (const part of collars) {
    if (catalog.engineering.looseFlangeInBom?.include === false) ends.push({ connection: "collar", part, warnings: [] });
    else if (flanges.length) for (const looseFlange of flanges) ends.push({ connection: "collar", part, looseFlange, warnings: [] });
    else ends.push({ connection: "collar", part, warnings: [`Нет свободного фланца DN${dn} PN${pn} ${insertMaterialLabel(material)}`] });
  }
  for (const part of parts.filter(part => part.kind === "threadEnd" && validThreadEnd(part))) ends.push({ connection: "threaded", part, warnings: [] });
  // A missing mating part must be visible rather than silently dropping the base geometry.
  if (!ends.length) ends.push({ connection, warnings: [`Нет подтверждённых концевых деталей по правилу коллекторов: ${insertConnectionLabel(connection)} DN${dn ?? "?"} PN${pn ?? "?"} ${insertMaterialLabel(material)}`] });
  return ends;
}

export function insertName(geometry: InsertGeometry, dnLarge: number, dnSmall: number | null, material: InsertMaterial, left: InsertConnection, right: InsertConnection, withSensorNipple: boolean, threadLeft?: string | null, threadRight?: string | null): string {
  const size = (dn: number | null, connection: InsertConnection, thread?: string | null) => connection === "threaded" ? thread ?? (dn !== null ? THREAD_SIZES[dn] : null) ?? `резьба DN${dn ?? "?"} (уточнить)` : `Dn${dn ?? "?"}`;
  return `Вставка ${geometry === "eccentric" ? "Э " : ""}${size(dnLarge, left, threadLeft)}-${size(dnSmall, right, threadRight)} ${insertMaterialLabel(material)}${withSensorNipple ? " t" : ""}`;
}

function calculateVariant(base: InsertPart, left: End, right: End, input: InsertRequest, catalog: InsertCatalog, operatingPn = base.pn): InsertCalculation {
  const compact = base.kind === "threadEnd";
  const dnLarge = base.dn, dnSmall = base.kind === "pipe" || compact ? base.dn : base.dnSmall, pn = operatingPn, material = base.material;
  const engineering = catalog.engineering;
  const seating: InsertSeatingSettings = { ...sourceSeating(), ...input.seating };
  const flangeAssembly = engineering.flangeAssembly;
  const collarAssembly = confirmedCollarAssembly(engineering);
  // A confirmed assembly rule is enforced on the server, including old UI requests.
  if (flangeAssembly) seating.flanged = { mode: "face-offset", valueMm: flangeAssembly.faceOffsetMm };
  if (collarAssembly) seating.collar = { mode: "insertion-depth", valueMm: 0 };
  // Pump reducers do not span valve/check-valve fasteners. Only straight inserts do.
  const checkFlangeClearance = Boolean(base.kind === "pipe" && flangeAssembly && left.connection === "flanged" && right.connection === "flanged");
  const warnings = [...catalog.issues, ...base.warnings, ...left.warnings, ...right.warnings];
  if (engineering.collarAssembly && !collarAssembly && (left.connection === "collar" || right.connection === "collar")) warnings.push("Некорректная подтверждённая схема стыкового соединения воротника; проверьте заход, сварочный зазор и норму сварки");
  if (!positive(pn)) warnings.push(`Не подтверждён PN основной детали: ${base.name}`);
  if (!positive(dnSmall)) warnings.push(`Не определён меньший номинальный DN перехода по наружному диаметру ${base.outerDiameterSmall ?? "?"} мм`);
  const bom: InsertBomItem[] = [], welds: InsertWeld[] = [], dimensions: InsertDimension[] = [];
  const assemblyDecisions: NonNullable<InsertCalculation["assemblyDecisions"]> = [];
  const assumptions: NonNullable<InsertCalculation["assumptions"]> = [];
  if (base.lengthAssumptionSource) assumptions.push({ code: "reducer-analogue-length", message: `Длина перехода ${base.lengthMm} мм принята по аналогу как проектное решение; паспорт конкретной детали не подтверждён.`, source: base.lengthAssumptionSource });
  const machining: FlangeBoringOperation[] = [];
  const addDimension = (name: string, value: number | null, source: string | null) => { dimensions.push({ name, value, unit: "мм", source }); };
  const addPart = (role: string, part: InsertPart | undefined, quantity: number | null) => {
    if (!part) { warnings.push(`Нет компонента для позиции «${role}»`); return; }
    warnings.push(...part.warnings);
    if (!positive(part.price)) warnings.push(`Нет достоверной цены: ${part.name} (${part.id})`);
    if (quantity === null) warnings.push(`Не определено количество: ${part.name}`);
    bom.push({ role, componentId: part.id, kind: part.kind, name: part.name, quantity, unit: part.kind === "pipe" ? "м" : "шт.", unitPrice: positive(part.price) ? part.price : null, cost: positive(part.price) && quantity !== null ? quantity * part.price : null, source: part.source });
  };
  const rate = (catalog.weldRates ?? WELD_RATES)[material];
  if (!positive(rate)) warnings.push(`Нет тарифа сварки для ${insertMaterialLabel(material)}`);
  const weld = (role: string, name: string, factor: number | null, diameterMm: number | null, source: string) => {
    if (!positive(diameterMm)) warnings.push(`Нет наружного диаметра для сварки: ${name}`);
    if (!positive(factor)) warnings.push(`Не подтверждена схема сварки: ${name}`);
    const lengthMm = positive(diameterMm) && positive(factor) ? factor * Math.PI * diameterMm : null;
    welds.push({ role, name, count: 1, factor, diameterMm, lengthMm, cost: lengthMm !== null && positive(rate) ? lengthMm / 1000 * rate : null, source });
  };
  const pair = engineering.connectionPairs?.find(pair => pair.left === left.connection && pair.right === right.connection && hasSource(pair.source));
  if (!pair) warnings.push(`Не подтверждено сочетание соединений: ${left.connection} / ${right.connection}`);

  let baseLengthMm = base.kind === "reducer" && positive(base.lengthMm) ? base.lengthMm : null;
  if (compact) {
    baseLengthMm = positive(base.lengthMm) ? base.lengthMm : null;
    if (!baseLengthMm || !hasSource(base.dimensionSources.lengthMm)) warnings.push(`Нет подтверждённой длины готового резьбового патрубка: ${base.id}`);
    if (!hasSource(engineering.compactThreaded?.source) || !positive(engineering.compactThreaded?.weldFactor)) warnings.push("Не подтверждена компактная сборка резьбовых концов и норма сварки");
    addDimension("Длина готового резьбового патрубка (без дополнительной трубы)", baseLengthMm, base.dimensionSources.lengthMm ?? null);
  } else if (base.kind === "reducer") {
    if (positive(base.outerDiameter) && positive(base.outerDiameterSmall) && base.outerDiameterSmall >= base.outerDiameter) warnings.push(`Недостоверная геометрия перехода: меньший наружный диаметр ${base.outerDiameterSmall} мм должен быть меньше большего ${base.outerDiameter} мм`);
    if (!positive(base.lengthMm)) warnings.push(`Нет длины перехода в каталоге: ${base.name} (${base.id})`);
    if (positive(base.lengthMm) && !hasSource(base.dimensionSources.lengthMm)) warnings.push(`Нет источника длины перехода: ${base.name}`);
    addDimension("Длина перехода", baseLengthMm, base.dimensionSources.lengthMm ?? null);
  } else if (!checkFlangeClearance) {
    const policy = engineering.straightLength;
    if (!policy || !hasSource(policy.source)) warnings.push("Не подтверждены модель затвора и правило выбора полной длины болта для прямой вставки");
    let model = policy?.model;
    if (catalog.valveReferences && policy?.model === "017W-series") {
      const valves = catalog.valveReferences.filter(ref => ref.dn === dnLarge && ref.pn === pn);
      const hasPlateEnd = left.connection === "flanged" || right.connection === "flanged";
      const valve = (hasPlateEnd ? valves.find(ref => ref.mounting === "broad-seat") : null) ?? valves[0];
      if (!valve) warnings.push(`Нет подтверждённого исполнения затвора семейства 017W DN${dnLarge} PN${pn}`);
      else {
        model = valve.model;
        warnings.push(...valve.warnings ?? []);
        addDimension(`Строительная длина корпуса ${valve.model} (не длина болта)`, valve.bodyLengthMm, valve.source);
        if (hasPlateEnd && !valve.allowedFlangeStandards.some(standard => standard.includes("тип01"))) warnings.push(`${valve.model}: применение плоского ответного фланца не подтверждено; ${valve.source}`);
        if (left.connection === "collar" || right.connection === "collar") warnings.push(`${valve.model}: совместимость приварного воротника под DIN2642 со схемой уплотнения затвора не подтверждена; ${valve.source}`);
        if (left.connection === "threaded" || right.connection === "threaded") warnings.push(`${valve.model}: требуется подтверждённый фланцевый узел затвора для определения длины резьбовой вставки`);
      }
    }
    const refs = engineering.boltReferences.filter(ref => ref.dn === dnLarge && ref.pn === pn && ref.material === material && ref.model === model && (!ref.leftConnection || ref.leftConnection === left.connection) && (!ref.rightConnection || ref.rightConnection === right.connection) && hasSource(ref.source));
    const ref = policy && (refs.find(ref => ref.endPartId && ref.endPartId === left.part?.id) ?? refs.find(ref => !ref.endPartId));
    if (!ref) warnings.push(`Нет подтверждённого полного пакета и длины болта затвора${model ? ` ${model}` : ""} DN${dnLarge} PN${pn} ${insertMaterialLabel(material)}`);
    if (ref && policy) {
      warnings.push(...ref.warnings ?? []);
      dimensions.push(...ref.dimensions ?? []);
      const length = policy.basis === "standard-bolt" ? ref.standardLengthMm : ref.minimumLengthMm;
      if (!positive(length)) warnings.push(`Нет ${policy.basis === "standard-bolt" ? "выбранного стандартного болта" : "расчётного минимума болта"} DN${dnLarge} PN${pn}`);
      else if (policy.basis === "standard-bolt" && (!positive(ref.minimumLengthMm) || length < ref.minimumLengthMm)) warnings.push("Длина стандартного болта не подтверждена полным пакетом соединения затвора");
      else if (policy.basis === "standard-bolt" && !catalog.standardBolts?.some(bolt => bolt.id === ref.componentId && bolt.lengthMm === length && bolt.diameterMm === ref.threadDiameterMm)) warnings.push("Выбранный стандартный болт отсутствует в каталоге или его полная длина/резьба не совпадают с расчётной ссылкой");
      else baseLengthMm = length;
      addDimension("Расчётный минимум болта затвора", ref.minimumLengthMm, ref.source);
      addDimension("Полная длина выбранного стандартного болта", ref.standardLengthMm, ref.source);
      addDimension("Диаметр резьбы выбранного болта", ref.threadDiameterMm, ref.source);
    }
    addDimension("Длина трубы", baseLengthMm, ref?.source ?? null);
  }
  for (const [name, diameter, thickness, source, wallSource] of [["Больший конец", base.outerDiameter, base.wallThickness, base.dimensionSources.outerDiameter, base.dimensionSources.wallThickness], ["Меньший конец", base.kind === "pipe" || compact ? base.outerDiameter : base.outerDiameterSmall, base.kind === "pipe" || compact ? base.wallThickness : base.wallThicknessSmall, base.kind === "pipe" || compact ? base.dimensionSources.outerDiameter : base.dimensionSources.outerDiameterSmall, base.kind === "pipe" || compact ? base.dimensionSources.wallThickness : base.dimensionSources.wallThicknessSmall]] as const) {
    addDimension(`${name}: наружный диаметр`, diameter, source ?? null);
    addDimension(`${name}: толщина стенки`, thickness, wallSource ?? null);
    if (!positive(diameter) || !positive(thickness) || 2 * thickness >= diameter) warnings.push(`Нет достоверных размеров основной детали: ${name.toLowerCase()}`);
    if (!hasSource(source) || !hasSource(wallSource)) warnings.push(`Нет источника наружного диаметра или стенки основной детали: ${name.toLowerCase()}`);
  }

  // Both reducer ends attach directly; each seating profile needs its own evidence.
  const reducerSeatingChecks: Array<() => void> = [];
  const endAddition = (end: End, dn: number | null, role: "left" | "right", diameter: number | null) => {
    // The left threaded end IS the base component, not a second purchased part or weld.
    if (compact && role === "left") return 0;
    const thickness = role === "left" || base.kind === "pipe" || compact ? base.wallThickness : base.wallThicknessSmall;
    const eligibleRules = engineering.endRules.filter(rule => rule.connection === end.connection && rule.material === material && rule.dn === dn && rule.pn === pn && hasSource(rule.source) && (!rule.partIdentity || (end.part && rule.partIdentity === insertPartIdentity(end.part))) && (rule.baseOuterDiameter === undefined || rule.baseOuterDiameter === diameter) && (rule.baseWallThickness === undefined || rule.baseWallThickness === thickness));
    const physicalEnds = new Set(endsFor(dn, pn, material, catalog).filter(candidate => candidate.connection === end.connection).map(candidate => candidate.part && insertPartIdentity(candidate.part)));
    const compactRule: InsertEndRule | undefined = compact && end.connection === "threaded" && positive(end.part?.lengthMm) && hasSource(end.part?.dimensionSources.lengthMm) && engineering.compactThreaded && dn !== null && pn !== null
      ? { connection: "threaded", material, dn, pn, axialAdditionMm: end.part.lengthMm, weldFactor: engineering.compactThreaded.weldFactor, source: `${engineering.compactThreaded.source}; ${end.part.dimensionSources.lengthMm}` } : undefined;
    const rule = compact && end.connection === "threaded" ? compactRule : eligibleRules.find(rule => rule.partIdentity) ?? (physicalEnds.size <= 1 ? eligibleRules[0] : undefined);
    const choice = end.connection === "threaded" ? { mode: "source" as const } : seating[end.connection];
    const endLabel = role === "left" ? "левого" : "правого";
    let addition: number | null = null, additionSource: string | null = null;
    const rawAxialSize = end.connection === "flanged" ? end.part?.thicknessMm : end.connection === "collar" ? end.part?.lengthMm : null;
    const axialSizeSource = end.connection === "flanged" ? end.part?.dimensionSources.thicknessMm : end.part?.dimensionSources.lengthMm;
    const axialSize = positive(rawAxialSize) && hasSource(axialSizeSource) ? rawAxialSize : null;
    if (choice.mode !== "source" && end.connection === "flanged" && axialSize === null) warnings.push(`Для выбранной посадки ${endLabel} конца отсутствует подтверждённая полная толщина фланца b; нулевая осевая добавка не заменяет этот размер`);
    if (choice.mode === "source") {
      if (physicalEnds.size > 1 && !rule) warnings.push(`Несколько физических исполнений концевой детали DN${dn ?? "?"}: осевую добавку следует подтвердить для конкретной детали`);
      addition = rule && validDimension(rule.axialAdditionMm) ? rule.axialAdditionMm : null;
      additionSource = rule?.source ?? null;
    } else if (choice.mode === "flush") {
      addition = 0;
      additionSource = "Явный параметр пользователя: торец основы вровень с привалочной плоскостью, Δ = 0 мм";
    } else if (choice.mode === "face-offset") {
      addition = choice.valueMm!;
      additionSource = end.connection === "flanged" && flangeAssembly ? flangeAssembly.source : `Явный параметр пользователя: расстояние от торца основы до привалочной плоскости, Δ = ${addition} мм`;
      if (axialSize !== null && addition > axialSize) warnings.push(`Расстояние до привалочной плоскости ${endLabel} конца ${addition} мм превышает осевой размер детали ${axialSize} мм: между деталями остаётся зазор, дополнительная деталь не задана`);
    } else {
      const butt = end.connection === "collar" ? collarAssembly : null;
      addDimension(`Глубина захода основы от тыльной стороны ${endLabel} конца`, choice.valueMm!, butt?.source ?? "Явный параметр пользователя; посадка не выводится из ГОСТ автоматически");
      if (butt) addDimension(`Прибавка на сварочный зазор ${endLabel} воротника`, butt.weldGapMm, butt.source);
      if (axialSize === null) warnings.push(`Для глубины посадки ${endLabel} конца нет подтверждённого ${end.connection === "flanged" ? "размера b — полной толщины фланца" : "полного осевого размера воротника; толщина стенки или борта не является полной длиной"}`);
      else if (choice.valueMm! > axialSize) warnings.push(`Глубина посадки ${endLabel} конца ${choice.valueMm} мм превышает осевой размер детали ${axialSize} мм`);
      else { addition = axialSize - choice.valueMm!; additionSource = butt ? `${butt.source}; Δ = c = ${axialSize} мм; размер: ${axialSizeSource}` : `Явная глубина пользователя ${choice.valueMm} мм; Δ = ${axialSize} − ${choice.valueMm} мм; осевой размер: ${axialSizeSource}`; }
    }
    if (choice.mode !== "source" && axialSize !== null) {
      addDimension(`Полный осевой размер детали ${endLabel} конца для посадки`, axialSize, axialSizeSource ?? null);
      // Do not invent a minimum weld overlap: precisely zero is already insufficient
      // to justify the inherited two-seam slip-on assembly without an explicit rule.
      if (end.connection === "flanged" && addition === axialSize && !rule?.allowZeroOverlap) warnings.push(`Нулевой заход основы в фланец ${endLabel} конца: двухшовное соединение требует отдельного подтверждения`);
      // Evaluate actual overlap rather than the UI mode so equivalent input methods
      // cannot bypass a physical collar-assembly restriction.
      if (end.connection === "collar" && addition !== null && addition < axialSize && !rule?.allowsCollarInsertion) warnings.push(`Взаимное проникновение основы и воротника ${endLabel} конца требует подтверждённой схемы сечения и сварного соединения`);
    }
    if (base.kind === "reducer" && end.connection === "flanged" && axialSize !== null && addition !== null && axialSize > addition) {
      const overlap = axialSize - addition;
      reducerSeatingChecks.push(() => {
        const cylinderLength = role === "left" ? base.cylindricalLengthLargeMm : base.cylindricalLengthSmallMm;
        const cylinderSource = base.dimensionSources[role === "left" ? "cylindricalLengthLargeMm" : "cylindricalLengthSmallMm"];
        addDimension(`Заход перехода внутрь фланца ${endLabel} конца`, overlap, `${axialSizeSource}; ${additionSource}`);
        addDimension(`Длина цилиндрического участка перехода ${endLabel} конца`, cylinderLength ?? null, cylinderSource ?? null);
        const approval = engineering.reducerSeatingApprovals?.find(rule => rule.side === role && rule.reducerId === base.id && rule.flangeId === end.part?.id
          && rule.reducerIdentity === insertPartIdentity(base) && end.part && rule.flangeIdentity === insertPartIdentity(end.part)
          && positive(rule.depthMm) && rule.depthMm === overlap && hasSource(rule.source));
        const policy = engineering.reducerReadyBoreSeating;
        const bore = end.part?.boreDiameterMm;
        const baseDiameterSource = base.dimensionSources[role === "left" ? "outerDiameter" : "outerDiameterSmall"];
        const readyBoreApproved = policy?.faceOffsetMm === 5 && hasSource(policy.source) && addition === policy.faceOffsetMm
          && end.part?.kind === "weldFlange" && positive(diameter) && positive(bore) && bore >= diameter
          && hasSource(end.part.dimensionSources.boreDiameterMm) && hasSource(baseDiameterSource);
        if (approval || readyBoreApproved) {
          // This is an approved assembly, not a fabricated cylindrical-neck measurement.
          const decisionSource = approval?.source ?? policy!.source;
          addDimension(`Принятая глубина посадки перехода ${endLabel} конца`, overlap, decisionSource);
          assemblyDecisions.push({ code: "reducer-flange-seating", ruleId: approval?.id ?? `ready-bore:${base.id}:${end.part!.id}:${role}`, side: role, depthMm: overlap,
            message: `Посадка ${endLabel} конца перехода DN${dn} на ${overlap} мм во фланец ${end.part!.id} принята по проектному решению.`, source: decisionSource });
          return;
        }
        // GOST 17378 section 4.3 leaves execution-2 radii to manufacturer drawings.
        if (!validDimension(cylinderLength) || !hasSource(cylinderSource)) warnings.push(`Посадка перехода в фланец ${endLabel} конца на ${overlap} мм: нет подтверждённой длины цилиндрического участка или профиля по КД изготовителя; торцевой диаметр не подтверждает проход по всей глубине`);
        else if (overlap > cylinderLength) warnings.push(`Заход перехода ${overlap} мм превышает подтверждённую длину цилиндрического участка ${endLabel} конца ${cylinderLength} мм; посадка на конический профиль не подтверждена`);
      });
    }
    if (addition === null) warnings.push(`Не подтверждена осевая добавка ${role === "left" ? "левого" : "правого"} конца (${end.connection}, DN${dn}, PN${pn}, ${insertMaterialLabel(material)}) с учётом посадки`);
    addDimension(`Осевая добавка ${role === "left" ? "левого" : "правого"} конца`, addition, additionSource);
    if (positive(end.part?.thicknessMm)) addDimension(`Толщина концевой детали ${role === "left" ? "слева" : "справа"} (не осевая добавка)`, end.part.thicknessMm, end.part.dimensionSources.thicknessMm ?? null);
    if (end.connection === "collar" && end.part) {
      const selection = engineering.collarSelections?.find(rule => rule.componentId === end.part!.id && rule.dn === dn && rule.material === material && pn !== null && rule.insertPns.includes(pn));
      addDimension(`Стенка выбранного воротника ${endLabel} конца`, end.part.wallThickness, end.part.dimensionSources.wallThickness ?? null);
      if (selection) addDimension(`Принятая стенка воротника ${endLabel} конца для вставки PN${pn}; воротник PN${end.part.pn}`, selection.wallThicknessMm, selection.source);
      addDimension(`Полная осевая длина воротника ${role === "left" ? "слева" : "справа"} (c)`, end.part.lengthMm, end.part.dimensionSources.lengthMm ?? null);
      addDimension(`Наружный диаметр борта воротника ${role === "left" ? "слева" : "справа"} (e)`, end.part.lipOuterDiameterMm ?? null, end.part.dimensionSources.lipOuterDiameterMm ?? null);
    }
    if (end.connection === "flanged" && end.part?.kind === "weldFlange" && engineering.flangeBoring) {
      const plan = planFlangeBoring({ side: role, flangeId: end.part.id, dn: end.part.dn, pn, material,
        originalBoreMm: end.part.boreDiameterMm ?? null, baseOuterDiameterMm: diameter,
        originalSource: end.part.dimensionSources.boreDiameterMm,
        baseSource: base.dimensionSources[role === "left" || base.kind === "pipe" || compact ? "outerDiameter" : "outerDiameterSmall"] }, engineering.flangeBoring, catalog.flangeBoringRates ?? []);
      warnings.push(...plan.warnings);
      assumptions.push(...plan.assumptions);
      const operation = plan.operation;
      if (operation) {
        machining.push(operation);
        addDimension(`Исходный диаметр отверстия ${endLabel} фланца до расточки`, operation.originalBoreMm, end.part.dimensionSources.boreDiameterMm);
        addDimension(`Наружный диаметр основы для расточки ${endLabel} фланца`, operation.baseOuterDiameterMm, operation.source);
        addDimension(`Диаметральный посадочный зазор ${endLabel} фланца`, operation.diametralClearanceMm, engineering.flangeBoring.clearanceSource);
        addDimension(`Диаметр отверстия ${endLabel} фланца после расточки`, operation.targetBoreMm, operation.source);
        addDimension(`Радиальный съём материала ${endLabel} фланца`, operation.radialRemovalMm, operation.source);
        bom.push({ role: `${role}-flange-boring`, componentId: operation.rateId, kind: "machining", quantity: 1, unit: "шт.",
          name: `Расточка ${endLabel} фланца DN${dn} PN${pn}: Ø${operation.originalBoreMm} → ${operation.targetBoreMm === null ? `уточнить (под основу Ø${diameter})` : `Ø${operation.targetBoreMm}`} мм`,
          unitPrice: operation.unitPrice, cost: operation.cost, source: operation.source });
      } else if (positive(end.part.boreDiameterMm)) addDimension(`Посадочный диаметр фланца ${role === "left" ? "слева" : "справа"}`, end.part.boreDiameterMm, end.part.dimensionSources.boreDiameterMm ?? null);
    } else if (positive(end.part?.boreDiameterMm)) {
      addDimension(`Посадочный диаметр фланца ${role === "left" ? "слева" : "справа"}`, end.part.boreDiameterMm, end.part.dimensionSources.boreDiameterMm ?? null);
      if (positive(diameter) && diameter > end.part.boreDiameterMm) warnings.push(`Основная деталь Ø${diameter} мм не проходит в посадочное отверстие фланца Ø${end.part.boreDiameterMm} мм (${role === "left" ? "левый" : "правый"} конец)`);
      if (positive(diameter) && diameter === end.part.boreDiameterMm) warnings.push(`Номинальные диаметры основы и отверстия фланца равны ${diameter} мм (${role === "left" ? "левый" : "правый"} конец): фактический посадочный зазор и допуски не подтверждены`);
    }
    if (end.connection === "flanged" && end.part?.requiredPipeOuterDiameterMm && positive(diameter) && Math.abs(end.part.requiredPipeOuterDiameterMm - diameter) > .001)
      warnings.push(`${end.part.name}: посадка на основную деталь Ø${diameter} мм не подтверждена; размерный ряд рассчитан под Ø${end.part.requiredPipeOuterDiameterMm} мм (${role === "left" ? "левый" : "правый"} конец). Требуется подходящее отверстие или согласованное исполнение соединения.`);
    addPart(`${role}-${end.connection}`, end.part, 1);
    if (end.connection === "collar") {
      if (!engineering.looseFlangeInBom || !hasSource(engineering.looseFlangeInBom.source)) warnings.push("Не подтверждено включение свободных фланцев в состав и стоимость");
      // Free flanges never contribute to axial length or a second collar weld.
      if (engineering.looseFlangeInBom?.include !== false) addPart(`${role}-looseFlange`, end.looseFlange, 1);
    }
    if (end.connection === "collar" && positive(end.part?.outerDiameter) && positive(diameter) && Math.abs(end.part.outerDiameter - diameter) > 0.01) warnings.push(`Наружный диаметр воротника ${role} не совпадает с основной деталью`);
    if (compact && end.connection === "threaded" && (!positive(end.part?.outerDiameter) || !positive(diameter) || Math.abs(end.part.outerDiameter - diameter) > 0.01)) warnings.push(`Не согласованы наружные диаметры стыка готовых резьбовых патрубков DN${dn}`);
    if (compact && end.connection === "threaded" && (!positive(end.part?.wallThickness) || !hasSource(end.part?.dimensionSources.wallThickness) || end.part.wallThickness !== thickness)) warnings.push(`Не согласованы стенки стыка готовых резьбовых патрубков DN${dn}`);
    if (compact && end.connection === "flanged" && positive(baseLengthMm) && axialSize !== null && addition !== null && axialSize - addition >= baseLengthMm) warnings.push(`Фланец перекрывает всю длину резьбового патрубка DN${dn}; компактная сборка невозможна`);
    const factor = end.connection === "threaded" ? rule?.weldFactor ?? null : end.connection === "collar" && collarAssembly ? collarAssembly.weldFactor : 2;
    const weldSource = end.connection === "threaded" ? rule?.source ?? "Нет подтверждённой схемы" : end.connection === "collar" && collarAssembly ? collarAssembly.weldSource : "collector-calculations.ts: 2πD на приварной фланец/воротник";
    weld(`${role}-weld`, `Приварка ${role === "left" ? "левого" : "правого"} конца`, factor, diameter, weldSource);
    return addition;
  };
  const axialLeftMm = endAddition(left, dnLarge, "left", base.outerDiameter);
  const axialRightMm = endAddition(right, dnSmall, "right", base.kind === "pipe" || compact ? base.outerDiameter : base.outerDiameterSmall);

  if (checkFlangeClearance && flangeAssembly) {
    const lengths: number[] = [];
    let fastenersComplete = true;
    // Check both actual flange executions of the straight insert.
    const endPairs = [[dnLarge, left], [dnSmall, right]] as const;
    for (const [dn, end] of endPairs) for (const model of flangeAssembly.fastenerModels) {
      const label = `${model.replace("-line-spec", "")} DN${dn ?? "?"} PN${pn}`;
      const refs = engineering.boltReferences.filter(ref => ref.dn === dn && ref.pn === pn && ref.material === material && ref.model === model && hasSource(ref.source));
      // Different flanges of one DN can need different standard bolt lengths.
      const ref = refs.find(ref => ref.endPartId && ref.endPartId === end.part?.id) ?? refs.find(ref => !ref.endPartId);
      if (!ref) { warnings.push(`Нет полного пакета и выбранного крепежа ${label} ${insertMaterialLabel(material)} для проверки внутреннего зазора`); fastenersComplete = false; continue; }
      warnings.push(...ref.warnings ?? []);
      dimensions.push(...ref.dimensions ?? []);
      addDimension(`${label}: расчётный минимум крепежа`, ref.minimumLengthMm, ref.source);
      addDimension(`${label}: полная длина выбранного крепежа`, ref.standardLengthMm, ref.source);
      const actual = catalog.standardBolts?.find(item => item.id === ref.componentId && item.lengthMm === ref.standardLengthMm && item.diameterMm === ref.threadDiameterMm);
      if (!positive(ref.minimumLengthMm) || !positive(ref.standardLengthMm) || ref.standardLengthMm < ref.minimumLengthMm || !actual || ref.warnings?.length) {
        warnings.push(`Не подтверждена полная длина выбранного крепежа ${label}; нельзя определить максимум по двум видам арматуры`);
        fastenersComplete = false;
      } else lengths.push(ref.standardLengthMm);
    }
    const maximum = fastenersComplete && lengths.length ? Math.max(...lengths) : null;
    // Round away binary floating point noise, not down to an integer millimetre.
    const requiredGap = maximum !== null ? Number((flangeAssembly.clearanceFactor * maximum).toFixed(9)) : null;
    addDimension("Наибольшая полная длина крепежа затвора / обратного клапана", maximum, flangeAssembly.source);
    addDimension("Минимальный внутренний зазор между фланцами", requiredGap, `${flangeAssembly.source}; ${flangeAssembly.clearanceFactor} × наибольшая полная длина крепежа`);
    const thicknessLeft = positive(left.part?.thicknessMm) && hasSource(left.part?.dimensionSources.thicknessMm) ? left.part.thicknessMm : null;
    const thicknessRight = positive(right.part?.thicknessMm) && hasSource(right.part?.dimensionSources.thicknessMm) ? right.part.thicknessMm : null;
    const overlap = thicknessLeft !== null && thicknessRight !== null && axialLeftMm !== null && axialRightMm !== null ? thicknessLeft + thicknessRight - axialLeftMm - axialRightMm : null;
    if (overlap === null) warnings.push("Нет подтверждённых толщин обоих фланцев и посадки для проверки внутреннего зазора");
    const lengthSource = `${flangeAssembly.source}; Lтрубы = Lзазора + (bлев − Δлев) + (bправ − Δправ); bлев: ${left.part?.dimensionSources.thicknessMm ?? "нет данных"}; bправ: ${right.part?.dimensionSources.thicknessMm ?? "нет данных"}`;
    if (base.kind === "pipe") {
      baseLengthMm = requiredGap !== null && overlap !== null ? Number((requiredGap + overlap).toFixed(9)) : null;
      addDimension("Длина трубы", baseLengthMm, lengthSource);
    }
    const actualGap = baseLengthMm !== null && overlap !== null ? Number((baseLengthMm - overlap).toFixed(9)) : null;
    addDimension("Фактический внутренний зазор между фланцами", actualGap, `${lengthSource}; Lзазора = Lосновы − (bлев − Δлев) − (bправ − Δправ)`);
  }
  for (const check of reducerSeatingChecks) check();
  if (base.kind === "reducer" && positive(baseLengthMm)) {
    const overlaps = [[left, axialLeftMm], [right, axialRightMm]].map(([end, addition]) => {
      const connection = end as End, axial = addition as number | null;
      return connection.connection === "flanged" && positive(connection.part?.thicknessMm) && axial !== null ? Math.max(0, connection.part.thicknessMm - axial) : 0;
    });
    if (overlaps[0] + overlaps[1] > baseLengthMm) warnings.push(`Суммарный заход фланцев ${overlaps[0] + overlaps[1]} мм превышает длину перехода ${baseLengthMm} мм: концевые детали перекрываются`);
  }
  addPart("base", base, base.kind === "pipe" ? baseLengthMm !== null ? baseLengthMm / 1000 : null : 1);

  let sensor: InsertPart | undefined;
  let sensorPlug: InsertSensorPlug | undefined;
  if (input.withSensorNipple) {
    const specification = engineering.sensorNipple;
    if (!specification || !hasSource(specification.source)) warnings.push("Не подтверждены DN и исполнение приварного сгона для датчика/реле давления");
    if (specification) {
      const nominal = catalog.parts.filter(part => part.kind === "nipple" && part.material === material && part.dn === specification.dn && part.threadGender === specification.threadGender && canonicalThread(part.thread) === canonicalThread(THREAD_SIZES[specification.dn] ?? null));
      const rated = nominal.filter(part => positive(part.pn) && positive(pn) && part.pn >= pn).sort((a, b) => a.pn! - b.pn!);
      const allowance = engineering.sensorNipplePn25Allowance;
      const allowedWithWarning = (part: InsertPart) => {
        const accepted = part.pressureAcceptance;
        return pn === 25 && allowance?.pn === 25 && hasSource(allowance.source) && !part.warnings.length
          && accepted && hasSource(accepted.source) && positive(part.pn) && part.pn < pn && accepted.pressureBar === part.pn
          && allowance.parts.some(rule => rule.componentId === part.id && rule.material === part.material && rule.dn === 15 && rule.dn === part.dn
            && rule.pressureBar === accepted.pressureBar && rule.maxTemperatureC === accepted.maxTemperatureC && rule.maxTemperatureC === 40);
      };
      // Prefer a genuinely rated part; the project exception only admits the exact reviewed DN15 items.
      const eligible = rated.length ? rated : nominal.filter(allowedWithWarning);
      const candidates = eligible.filter(part => part.pn === eligible[0]?.pn);
      if (candidates.length === 1) sensor = candidates[0];
      else {
        warnings.push(`Сгон DN${specification.dn} PN${pn} ${insertMaterialLabel(material)}: ${candidates.length ? "неоднозначный выбор исполнения" : "нет подтверждённого исполнения с допустимым давлением не ниже давления вставки"}`);
        // Retain a unique unverified source in the audit/BOM without making it exportable.
        if (!candidates.length && nominal.length === 1) sensor = nominal[0];
      }
      addPart("sensor-nipple", sensor, 1);
      if (sensor) {
        if (allowedWithWarning(sensor)) {
          const message = `Предупреждение: вставка PN25 со сгоном DN15 ${insertMaterialLabel(material)} разрешена по проектному допущению. Принятое давление сгона — ${sensor.pn} бар при температуре до +${sensor.pressureAcceptance!.maxTemperatureC} °C; пригодность сгона при 25 бар не подтверждена.`;
          assumptions.push({ code: "sensor-pn25-pressure", message, source: allowance!.source });
          const item = bom.find(item => item.role === "sensor-nipple")!;
          item.source = `${item.source}; ${message} ${allowance!.source}`;
        }
        const accepted = sensor.pressureAcceptance;
        const adoptedRating = accepted && accepted.pressureBar === sensor.pn && positive(accepted.pressureBar) && Number.isFinite(accepted.maxTemperatureC) && hasSource(accepted.source);
        // Wall is not used for piece price or circumference. Only exact adopted parts may leave it unknown.
        if (!sensor.thread || (!adoptedRating && (!positive(sensor.wallThickness) || !hasSource(sensor.dimensionSources.wallThickness)))) warnings.push("Нет подтверждённых резьбы и толщины стенки сгона датчика/реле давления");
        if (sensor.wallThickness !== null && (!positive(sensor.wallThickness) || !positive(sensor.outerDiameter) || 2 * sensor.wallThickness >= sensor.outerDiameter)) warnings.push("Некорректная геометрия стенки сгона датчика/реле давления");
        if (adoptedRating) {
          dimensions.push({ name: "Принятое давление сгона", value: accepted.pressureBar, unit: "бар", source: accepted.source },
            { name: "Максимальная температура среды для принятого давления сгона", value: accepted.maxTemperatureC, unit: "°C", source: accepted.source });
        }
        if (positive(sensor.lengthMm) && hasSource(sensor.dimensionSources.lengthMm)) addDimension("Справочная длина сгона (не влияет на расчёт вставки)", sensor.lengthMm, sensor.dimensionSources.lengthMm);
        addDimension("Толщина стенки сгона датчика/реле давления", sensor.wallThickness, sensor.dimensionSources.wallThickness ?? (adoptedRating ? "Не задана; давление принято отдельным решением, для стоимости и длины шва толщина стенки не используется" : null));
      }
      if (specification.withPlug) {
        const plugGender = specification.threadGender === "male" ? "female" : "male";
        sensorPlug = catalog.sensorPlugs?.filter(plug => plug.dn === specification.dn && plug.threadGender === plugGender && positive(plug.pn) && positive(pn) && plug.pn >= pn).sort((a, b) => a.pn! - b.pn! || a.id.localeCompare(b.id))[0];
        if (!sensorPlug) warnings.push(`Нет резьбовой заглушки ${plugGender === "female" ? "ВР" : "НР"} DN${specification.dn} с подтверждённым PN не ниже ${pn}`);
        else {
          if (!positive(sensorPlug.price)) warnings.push(`Нет цены заглушки: ${sensorPlug.name}`);
          if (!hasSource(sensorPlug.physicalIdentity)) warnings.push(`Не подтверждены производитель, артикул и физическое исполнение заглушки: ${sensorPlug.name}`);
          bom.push({ role: "sensor-plug", componentId: sensorPlug.id, kind: "plug", name: sensorPlug.name, quantity: 1, unit: "шт.", unitPrice: sensorPlug.price, cost: positive(sensorPlug.price) ? sensorPlug.price : null, source: sensorPlug.source });
        }
      }
    }
    weld("sensor-weld", "Приварка сгона датчика/реле давления", 1, sensor?.outerDiameter ?? null, "collector-calculations.ts: πD на приварной сгон");
    addDimension("Наружный диаметр сгона", sensor?.outerDiameter ?? null, sensor?.dimensionSources.outerDiameter ?? null);
  }
  const totalLengthMm = baseLengthMm !== null && axialLeftMm !== null && axialRightMm !== null ? Number((baseLengthMm + axialLeftMm + axialRightMm).toFixed(9)) : null;
  addDimension("Общая длина вставки", totalLengthMm, "Lосновы + Δлевого конца + Δправого конца");
  const weldLengthMm = welds.every(row => row.lengthMm !== null) ? welds.reduce((sum, row) => sum + row.lengthMm!, 0) : null;
  const weldCost = weldLengthMm !== null && positive(rate) ? weldLengthMm / 1000 * rate : null;
  bom.push({ role: "welding", componentId: null, kind: "welding", name: "Сварочные работы", quantity: weldLengthMm !== null ? weldLengthMm / 1000 : null, unit: "м", unitPrice: positive(rate) ? rate : null, cost: weldCost, source: "Базовые значения применённой версии, ₽/м" });
  if (material === "st20") {
    const rates = catalog.paintingRates?.filter(rate => rate.dn === dnLarge && rate.material === material) ?? [];
    const painting = rates.length === 1 ? rates[0] : undefined;
    if (!painting) warnings.push(`${rates.length ? "Неоднозначный" : "Отсутствует"} тариф окраски СТ20 DN${dnLarge}, ₽/м`);
    if (painting) warnings.push(...painting.warnings);
    if (painting && (!positive(painting.pricePerMeter) || !hasSource(painting.source))) warnings.push(`Нет достоверной цены или источника окраски СТ20 DN${dnLarge}`);
    if (!positive(baseLengthMm)) warnings.push("Не определена длина основной детали для окраски");
    const secondLength = compact && right.connection === "threaded" ? right.part?.lengthMm : 0;
    const quantity = positive(baseLengthMm) && (secondLength === 0 || positive(secondLength)) ? (baseLengthMm + secondLength) / 1000 : null;
    const unitPrice = painting && !painting.warnings.length && hasSource(painting.source) && positive(painting.pricePerMeter) ? painting.pricePerMeter : null;
    bom.push({ role: "painting", componentId: painting?.id ?? null, kind: "painting", name: `Окраска ${compact ? "готовых патрубков" : base.kind === "reducer" ? "перехода по большему" : "трубы"} DN${dnLarge} СТ20`, quantity, unit: "м", unitPrice,
      cost: quantity !== null && unitPrice !== null ? quantity * unitPrice : null,
      source: `${painting?.source ?? "Тариф не найден"}; стоимость = ${compact ? "сумма длин готовых патрубков" : "Lосновы"} / 1000 × тариф DN${dnLarge}; без фланцев и воротников` });
  }
  const uniqueWarnings = [...new Set(warnings)], complete = !uniqueWarnings.length && totalLengthMm !== null && bom.every(row => row.cost !== null);
  const physicalConfiguration: InsertConfiguration = { version: 1, ...(compact ? { construction: "compact-threaded" as const } : {}), dnLarge, dnSmall, pn, material, geometry: base.geometry, base: insertPartIdentity(base), left: { connection: left.connection, part: left.part ? insertPartIdentity(left.part) : null, looseFlange: left.looseFlange && engineering.looseFlangeInBom?.include !== false ? insertPartIdentity(left.looseFlange) : null }, right: { connection: right.connection, part: right.part ? insertPartIdentity(right.part) : null, looseFlange: right.looseFlange && engineering.looseFlangeInBom?.include !== false ? insertPartIdentity(right.looseFlange) : null }, sensor: { requested: input.withSensorNipple, dn: input.withSensorNipple ? engineering.sensorNipple?.dn ?? null : null, gender: input.withSensorNipple ? engineering.sensorNipple?.threadGender ?? null : null, part: sensor ? insertPartIdentity(sensor) : null, plug: sensorPlug?.physicalIdentity ?? null }, baseLengthMm, axialLeftMm, axialRightMm, ...(machining.length ? { flangeBores: machining.map(operation => ({ side: operation.side, targetBoreMm: operation.targetBoreMm })) } : {}) };
  const configuration = { ...physicalConfiguration, seating };
  const name = insertName(base.geometry, dnLarge, dnSmall, material, left.connection, right.connection, input.withSensorNipple, left.part?.thread, right.part?.thread);
  return { identityKey: `insert:v1:${JSON.stringify(physicalConfiguration)}`, configuration, catalogVersion: catalog.version, name, dnLarge, dnSmall, pn, material, geometry: base.geometry, leftConnection: left.connection, rightConnection: right.connection, threadLeft: left.connection === "threaded" ? left.part?.thread ?? null : null, threadRight: right.connection === "threaded" ? right.part?.thread ?? null : null, withSensorNipple: input.withSensorNipple, baseLengthMm, totalLengthMm, complete, warnings: uniqueWarnings, ...(assumptions.length ? { assumptions } : {}), ...(assemblyDecisions.length ? { assemblyDecisions } : {}), bom, welds, dimensions, ...(machining.length ? { machining } : {}), weldLengthMm, weldCost, price: complete ? bom.reduce((sum, row) => sum + row.cost!, 0) : null, description: `${insertGeometryLabel(base.geometry)} исполнение; ${insertConnectionLabel(left.connection)} / ${insertConnectionLabel(right.connection)}; PN${pn ?? "?"}; основа: ${base.name}${machining.length ? `; предусмотрена расточка фланцев: ${machining.length} шт.` : ""}; ${input.withSensorNipple ? "со сгоном" : "без сгона"}${assemblyDecisions.length ? `; ${assemblyDecisions.map(item => item.message).join(" ")}` : ""}${sensor?.pressureAcceptance ? `; давление сгона принято ${sensor.pressureAcceptance.pressureBar} бар при температуре среды до +${sensor.pressureAcceptance.maxTemperatureC} °C` : ""}${assumptions.length ? `; ${assumptions.map(item => item.message).join(" ")}` : ""}` };
}

export function generateInsertCandidates(request: InsertRequest, originalCatalog: InsertCatalog): InsertCalculation[] {
  const input = parseInsertRequest(request);
  const catalog = { ...originalCatalog, parts: deduplicateInsertParts(originalCatalog.parts) };
  const dns = new Set(catalog.nominalDns.filter(dn => dn >= input.dnFrom && dn <= input.dnTo));
  const bases = catalog.parts.filter(part => (part.kind === "pipe" || part.kind === "reducer") && dns.has(part.dn) && input.materials.includes(part.material) && (part.kind === "pipe" || part.dnSmall === null || part.dnSmall < part.dn) && (part.geometry !== "eccentric" || input.includeEccentric));
  const rows = new Map<string, InsertCalculation>();
  for (const base of bases) {
    const dnSmall = base.kind === "pipe" ? base.dn : base.dnSmall;
    const leftEnds = endsFor(base.dn, base.pn, base.material, catalog), rightEnds = endsFor(dnSmall, base.pn, base.material, catalog);
    for (const left of leftEnds) for (const right of rightEnds) {
      // Project decision: a threaded end is only allowed on an equal-DN straight insert.
      if ((base.kind !== "pipe" || catalog.engineering.compactThreaded) && (left.connection === "threaded" || right.connection === "threaded")) continue;
      if (catalog.engineering.connectionPairs?.length && !catalog.engineering.connectionPairs.some(pair => pair.left === left.connection && pair.right === right.connection)) continue;
      // Straight inserts have no preferred direction: mirror endpoints are one physical item.
      const signature = (end: End) => JSON.stringify([end.connection, end.part && insertPartIdentity(end.part), catalog.engineering.looseFlangeInBom?.include !== false && end.looseFlange ? insertPartIdentity(end.looseFlange) : null]);
      const reverseAllowed = !catalog.engineering.connectionPairs?.length || catalog.engineering.connectionPairs.some(pair => pair.left === right.connection && pair.right === left.connection);
      if (base.kind === "pipe" && reverseAllowed && signature(left).localeCompare(signature(right)) > 0) continue;
      const result = calculateVariant(base, left, right, input, catalog);
      rows.set(result.identityKey, result);
    }
  }
  if (catalog.engineering.compactThreaded) {
    const stubs = catalog.parts.filter(p => p.kind === "threadEnd" && validThreadEnd(p) && dns.has(p.dn) && input.materials.includes(p.material));
    for (const base of stubs) for (const pn of [10, 16, 25]) {
      if (!positive(base.pn) || base.pn < pn) continue;
      const left: End = { connection: "threaded", part: base, warnings: [] };
      for (const right of endsFor(base.dn, pn, base.material, catalog)) {
        if (right.connection === "threaded" && right.part && insertPartIdentity(base).localeCompare(insertPartIdentity(right.part)) > 0) continue;
        if (catalog.engineering.connectionPairs?.length && !catalog.engineering.connectionPairs.some(pair => pair.left === "threaded" && pair.right === right.connection)) continue;
        const result = calculateVariant(base, left, right, input, catalog, pn);
        rows.set(result.identityKey, result);
      }
    }
  }
  return [...rows.values()].sort((a, b) => a.dnLarge - b.dnLarge || (a.dnSmall ?? 0) - (b.dnSmall ?? 0) || a.material.localeCompare(b.material) || (a.pn ?? 0) - (b.pn ?? 0) || a.identityKey.localeCompare(b.identityKey));
}

export function generateInsertCalculations(request: InsertRequest, catalog: InsertCatalog): InsertCalculation[] {
  const rows = generateInsertCandidates(request, catalog);
  if (!catalog.engineering.variantSelection) return rows;
  const core = request.withSensorNipple ? generateInsertCandidates({ ...request, withSensorNipple: false }, catalog) : rows;
  return selectInsertVariants(rows, core, catalog);
}
