import { positive, THREAD_SIZES, WELD_RATES } from "./collector-calculations";
import type { InsertPaintingRate } from "./component-painting";

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
  lipOuterDiameterMm?: number | null;
  cylindricalLengthLargeMm?: number | null; cylindricalLengthSmallMm?: number | null;
  standard: string | null; price: number | null; source: string; dimensionSources: Record<string, string>;
  warnings: string[];
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
  warnings?: string[]; dimensions?: InsertDimension[];
};
export type InsertValveReference = { model: string; dn: number; pn: number; bodyLengthMm: number; mounting: string; source: string; allowedFlangeStandards: string[]; warnings?: string[] };
/** Engineering decisions are explicit, sourced inputs, never inferred from names or missing cells. */
export type InsertEngineering = {
  connectionPairs: Array<{ left: InsertConnection; right: InsertConnection; source: string }> | null;
  straightLength: { model: string; basis: "standard-bolt" | "minimum-bolt"; source: string } | null;
  endRules: InsertEndRule[];
  looseFlangeInBom: { include: boolean; source: string } | null;
  sensorNipple: { dn: number; threadGender: "male" | "female"; withPlug?: boolean; source: string } | null;
  boltReferences: InsertBoltReference[];
  flangeAssembly?: { faceOffsetMm: number; clearanceFactor: number; fastenerModels: string[]; source: string };
};
export type InsertSensorPlug = { id: string; name: string; dn: number; pn: number | null; threadGender: "male" | "female" | null; physicalIdentity: string | null; price: number | null; source: string };
export type InsertStandardBolt = { id: string; diameterMm: number; lengthMm: number; source: string };
export type InsertCatalog = { version: string; parts: InsertPart[]; nominalDns: number[]; materials: InsertMaterial[]; engineering: InsertEngineering; issues: string[]; sensorPlugs?: InsertSensorPlug[]; standardBolts?: InsertStandardBolt[]; valveReferences?: InsertValveReference[]; paintingRates?: InsertPaintingRate[] };
export type InsertBomItem = { role: string; componentId: string | null; kind: InsertPartKind | "plug" | "welding" | "painting"; name: string; quantity: number | null; unit: "м" | "шт."; unitPrice: number | null; cost: number | null; source: string | null };
export type InsertDimension = { name: string; value: number | null; unit: "мм"; source: string | null };
export type InsertWeld = { role: string; name: string; count: number; factor: number | null; diameterMm: number | null; lengthMm: number | null; cost: number | null; source: string };
export type InsertConfiguration = {
  version: 1; dnLarge: number; dnSmall: number | null; pn: number | null; material: InsertMaterial; geometry: InsertGeometry;
  base: string; left: { connection: InsertConnection; part: string | null; looseFlange: string | null };
  right: { connection: InsertConnection; part: string | null; looseFlange: string | null };
  sensor: { requested: boolean; dn: number | null; gender: string | null; part: string | null; plug: string | null };
  baseLengthMm: number | null; axialLeftMm: number | null; axialRightMm: number | null;
  /** Audit-only input: physical identity uses actual axial additions, not this choice. */
  seating?: InsertSeatingSettings;
};
export type InsertCalculation = {
  identityKey: string; configuration: InsertConfiguration; catalogVersion: string; name: string;
  dnLarge: number; dnSmall: number | null; pn: number | null; material: InsertMaterial; geometry: InsertGeometry;
  leftConnection: InsertConnection; rightConnection: InsertConnection; threadLeft: string | null; threadRight: string | null;
  withSensorNipple: boolean; baseLengthMm: number | null; totalLengthMm: number | null;
  complete: boolean; warnings: string[]; bom: InsertBomItem[]; welds: InsertWeld[];
  dimensions: InsertDimension[]; weldLengthMm: number | null; weldCost: number | null; price: number | null; description: string;
};

export const UNCONFIRMED_INSERT_ENGINEERING: InsertEngineering = {
  connectionPairs: null, straightLength: null, endRules: [], looseFlangeInBom: null, sensorNipple: null, boltReferences: [],
};
export const insertMaterialLabel = (material: InsertMaterial) => material === "aisi304" ? "AISI304" : "СТ20";
export const insertGeometryLabel = (geometry: InsertGeometry) => ({ straight: "Прямое", concentric: "Концентрическое", eccentric: "Эксцентрическое" })[geometry];
export const insertConnectionLabel = (connection: InsertConnection) => ({ flanged: "фланец", collar: "воротник", threaded: "резьба" })[connection];
const validDimension = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const hasSource = (value: string | null | undefined) => typeof value === "string" && value.trim().length > 0;
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
  if (!catalog.engineering.endRules.length) engineeringIssues.push(catalog.engineering.flangeAssembly ? "Для воротников нужны осевые размеры и схема посадки; для приварных фланцев принят отступ торца 5 мм" : "Не подтверждены осевые добавки фланцев и воротников с учётом посадки основной детали");
  if (!catalog.engineering.looseFlangeInBom) engineeringIssues.push("Не подтверждено включение свободных фланцев в состав и стоимость воротниковой вставки");
  if (!catalog.engineering.sensorNipple) engineeringIssues.push("Не подтверждены DN и исполнение сгона датчика/реле давления");
  if (!catalog.parts.some(part => part.kind === "threadEnd")) engineeringIssues.push("В каталоге нет подтверждённых резьбовых концов вставки с PN, длиной и технологией присоединения; предел резьбы — 2 дюйма");
  return { dns: catalog.nominalDns, materials: catalog.materials, pressures: [...new Set(catalog.parts.filter(part => part.kind === "pipe" || part.kind === "reducer").map(part => part.pn).filter(positive))].sort((a, b) => a - b), engineeringIssues: [...new Set(engineeringIssues)] };
}

/** Physical fields deliberately exclude source ID, supplier price and display name. */
export function insertPartIdentity(part: InsertPart): string {
  return JSON.stringify([part.kind, part.material, part.dn, part.dnSmall, part.pn, part.geometry,
    part.outerDiameter, part.outerDiameterSmall, part.wallThickness, part.wallThicknessSmall,
    part.lengthMm, part.thicknessMm, part.boreDiameterMm ?? null, part.cylindricalLengthLargeMm ?? null, part.cylindricalLengthSmallMm ?? null, part.thread, part.threadGender, part.standard,
    ...(part.lipOuterDiameterMm == null ? [] : [{ lipOuterDiameterMm: part.lipOuterDiameterMm }])]);
}

export function deduplicateInsertParts(parts: InsertPart[]): InsertPart[] {
  const groups = new Map<string, InsertPart[]>();
  for (const part of parts) { const key = insertPartIdentity(part); groups.set(key, [...groups.get(key) ?? [], part]); }
  return [...groups.values()].map(group => {
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    const first = sorted[0];
    const prices = new Set(sorted.map(part => part.price));
    return { ...first, warnings: [...new Set(sorted.flatMap(part => part.warnings).concat(prices.size > 1 ? [`Различающиеся цены физических дублей: ${sorted.map(part => part.id).join(", ")}; требуется выбор источника цены`] : []))] };
  });
}

type End = { connection: InsertConnection; part?: InsertPart; looseFlange?: InsertPart; warnings: string[] };
function endsFor(dn: number | null, pn: number | null, material: InsertMaterial, catalog: InsertCatalog): End[] {
  const parts = catalog.parts.filter(part => part.dn === dn && part.pn === pn && part.material === material);
  const ends: End[] = parts.filter(part => part.kind === "weldFlange").map(part => ({ connection: "flanged", part, warnings: [] }));
  const collars = parts.filter(part => part.kind === "collar"), flanges = parts.filter(part => part.kind === "looseFlange");
  for (const part of collars) {
    if (catalog.engineering.looseFlangeInBom?.include === false) ends.push({ connection: "collar", part, warnings: [] });
    else if (flanges.length) for (const looseFlange of flanges) ends.push({ connection: "collar", part, looseFlange, warnings: [] });
    else ends.push({ connection: "collar", part, warnings: [`Нет свободного фланца DN${dn} PN${pn} ${insertMaterialLabel(material)}`] });
  }
  for (const part of parts.filter(part => part.kind === "threadEnd" && validThreadEnd(part))) ends.push({ connection: "threaded", part, warnings: [] });
  // A missing mating part must be visible rather than silently dropping the base geometry.
  if (!ends.length) ends.push({ connection: material === "aisi304" && dn !== null && dn <= 200 && pn !== null && pn < 25 ? "collar" : "flanged", warnings: [`Нет подтверждённых концевых деталей DN${dn ?? "?"} PN${pn ?? "?"} ${insertMaterialLabel(material)}`] });
  return ends;
}

export function insertName(geometry: InsertGeometry, dnLarge: number, dnSmall: number | null, material: InsertMaterial, left: InsertConnection, right: InsertConnection, withSensorNipple: boolean, threadLeft?: string | null, threadRight?: string | null): string {
  const size = (dn: number | null, connection: InsertConnection, thread?: string | null) => connection === "threaded" ? thread ?? (dn !== null ? THREAD_SIZES[dn] : null) ?? `резьба DN${dn ?? "?"} (уточнить)` : `Dn${dn ?? "?"}`;
  return `Вставка ${geometry === "eccentric" ? "Э " : ""}${size(dnLarge, left, threadLeft)}-${size(dnSmall, right, threadRight)} ${insertMaterialLabel(material)}${withSensorNipple ? " t" : ""}`;
}

function calculateVariant(base: InsertPart, left: End, right: End, input: InsertRequest, catalog: InsertCatalog): InsertCalculation {
  const dnLarge = base.dn, dnSmall = base.kind === "pipe" ? base.dn : base.dnSmall, pn = base.pn, material = base.material;
  const engineering = catalog.engineering;
  const seating: InsertSeatingSettings = { ...sourceSeating(), ...input.seating };
  const flangeAssembly = engineering.flangeAssembly;
  // A confirmed assembly rule is enforced on the server, including old UI requests.
  if (flangeAssembly) seating.flanged = { mode: "face-offset", valueMm: flangeAssembly.faceOffsetMm };
  const checkFlangeClearance = Boolean(flangeAssembly && left.connection === "flanged" && right.connection === "flanged");
  const warnings = [...catalog.issues, ...base.warnings, ...left.warnings, ...right.warnings];
  if (!positive(pn)) warnings.push(`Не подтверждён PN основной детали: ${base.name}`);
  if (!positive(dnSmall)) warnings.push(`Не определён меньший номинальный DN перехода по наружному диаметру ${base.outerDiameterSmall ?? "?"} мм`);
  const bom: InsertBomItem[] = [], welds: InsertWeld[] = [], dimensions: InsertDimension[] = [];
  const addDimension = (name: string, value: number | null, source: string | null) => { dimensions.push({ name, value, unit: "мм", source }); };
  const addPart = (role: string, part: InsertPart | undefined, quantity: number | null) => {
    if (!part) { warnings.push(`Нет компонента для позиции «${role}»`); return; }
    warnings.push(...part.warnings);
    if (!positive(part.price)) warnings.push(`Нет достоверной цены: ${part.name} (${part.id})`);
    if (quantity === null) warnings.push(`Не определено количество: ${part.name}`);
    bom.push({ role, componentId: part.id, kind: part.kind, name: part.name, quantity, unit: part.kind === "pipe" ? "м" : "шт.", unitPrice: positive(part.price) ? part.price : null, cost: positive(part.price) && quantity !== null ? quantity * part.price : null, source: part.source });
  };
  const rate = WELD_RATES[material];
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
  if (base.kind === "reducer") {
    if (positive(base.outerDiameter) && positive(base.outerDiameterSmall) && base.outerDiameterSmall >= base.outerDiameter) warnings.push(`Недостоверная геометрия перехода: меньший наружный диаметр ${base.outerDiameterSmall} мм должен быть меньше большего ${base.outerDiameter} мм`);
    if (!positive(base.lengthMm)) warnings.push(`Нет длины перехода в каталоге: ${base.name} (${base.id}); удлиняющая труба не добавляется`);
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
    const ref = policy && engineering.boltReferences.find(ref => ref.dn === dnLarge && ref.pn === pn && ref.material === material && ref.model === model && (!ref.leftConnection || ref.leftConnection === left.connection) && (!ref.rightConnection || ref.rightConnection === right.connection) && hasSource(ref.source));
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
  for (const [name, diameter, thickness, source, wallSource] of [["Больший конец", base.outerDiameter, base.wallThickness, base.dimensionSources.outerDiameter, base.dimensionSources.wallThickness], ["Меньший конец", base.kind === "pipe" ? base.outerDiameter : base.outerDiameterSmall, base.kind === "pipe" ? base.wallThickness : base.wallThicknessSmall, base.kind === "pipe" ? base.dimensionSources.outerDiameter : base.dimensionSources.outerDiameterSmall, base.kind === "pipe" ? base.dimensionSources.wallThickness : base.dimensionSources.wallThicknessSmall]] as const) {
    addDimension(`${name}: наружный диаметр`, diameter, source ?? null);
    addDimension(`${name}: толщина стенки`, thickness, wallSource ?? null);
    if (!positive(diameter) || !positive(thickness) || 2 * thickness >= diameter) warnings.push(`Нет достоверных размеров основной детали: ${name.toLowerCase()}`);
    if (!hasSource(source) || !hasSource(wallSource)) warnings.push(`Нет источника наружного диаметра или стенки основной детали: ${name.toLowerCase()}`);
  }

  const endAddition = (end: End, dn: number | null, role: "left" | "right", diameter: number | null) => {
    const thickness = role === "left" || base.kind === "pipe" ? base.wallThickness : base.wallThicknessSmall;
    const eligibleRules = engineering.endRules.filter(rule => rule.connection === end.connection && rule.material === material && rule.dn === dn && rule.pn === pn && hasSource(rule.source) && (!rule.partIdentity || (end.part && rule.partIdentity === insertPartIdentity(end.part))) && (rule.baseOuterDiameter === undefined || rule.baseOuterDiameter === diameter) && (rule.baseWallThickness === undefined || rule.baseWallThickness === thickness));
    const physicalEnds = new Set(endsFor(dn, pn, material, catalog).filter(candidate => candidate.connection === end.connection).map(candidate => candidate.part && insertPartIdentity(candidate.part)));
    const rule = eligibleRules.find(rule => rule.partIdentity) ?? (physicalEnds.size <= 1 ? eligibleRules[0] : undefined);
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
      addDimension(`Глубина захода основы от тыльной стороны ${endLabel} конца`, choice.valueMm!, "Явный параметр пользователя; посадка не выводится из ГОСТ автоматически");
      if (axialSize === null) warnings.push(`Для глубины посадки ${endLabel} конца нет подтверждённого ${end.connection === "flanged" ? "размера b — полной толщины фланца" : "полного осевого размера воротника; толщина стенки или борта не является полной длиной"}`);
      else if (choice.valueMm! > axialSize) warnings.push(`Глубина посадки ${endLabel} конца ${choice.valueMm} мм превышает осевой размер детали ${axialSize} мм`);
      else { addition = axialSize - choice.valueMm!; additionSource = `Явная глубина пользователя ${choice.valueMm} мм; Δ = ${axialSize} − ${choice.valueMm} мм; осевой размер: ${axialSizeSource}`; }
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
      const cylinderLength = role === "left" ? base.cylindricalLengthLargeMm : base.cylindricalLengthSmallMm;
      const cylinderSource = base.dimensionSources[role === "left" ? "cylindricalLengthLargeMm" : "cylindricalLengthSmallMm"];
      addDimension(`Заход перехода внутрь фланца ${endLabel} конца`, overlap, `${axialSizeSource}; ${additionSource}`);
      addDimension(`Длина цилиндрического участка перехода ${endLabel} конца`, cylinderLength ?? null, cylinderSource ?? null);
      // A terminal diameter does not describe the profile inside the flange. In
      // particular GOST 17378 section 4.3 leaves execution-2 radii to manufacturer
      // drawings; neither a linear cone nor an extra pipe may be inferred here.
      if (!validDimension(cylinderLength) || !hasSource(cylinderSource)) warnings.push(`Посадка перехода в фланец ${endLabel} конца на ${overlap} мм: нет подтверждённой длины цилиндрического участка или профиля по КД изготовителя; торцевой диаметр не подтверждает проход по всей глубине`);
      else if (overlap > cylinderLength) warnings.push(`Заход перехода ${overlap} мм превышает подтверждённую длину цилиндрического участка ${endLabel} конца ${cylinderLength} мм; посадка на конический профиль не подтверждена`);
    }
    if (addition === null) warnings.push(`Не подтверждена осевая добавка ${role === "left" ? "левого" : "правого"} конца (${end.connection}, DN${dn}, PN${pn}, ${insertMaterialLabel(material)}) с учётом посадки`);
    addDimension(`Осевая добавка ${role === "left" ? "левого" : "правого"} конца`, addition, additionSource);
    if (positive(end.part?.thicknessMm)) addDimension(`Толщина концевой детали ${role === "left" ? "слева" : "справа"} (не осевая добавка)`, end.part.thicknessMm, end.part.dimensionSources.thicknessMm ?? null);
    if (end.connection === "collar" && end.part) {
      addDimension(`Полная осевая длина воротника ${role === "left" ? "слева" : "справа"} (c)`, end.part.lengthMm, end.part.dimensionSources.lengthMm ?? null);
      addDimension(`Наружный диаметр борта воротника ${role === "left" ? "слева" : "справа"} (e)`, end.part.lipOuterDiameterMm ?? null, end.part.dimensionSources.lipOuterDiameterMm ?? null);
    }
    if (positive(end.part?.boreDiameterMm)) {
      addDimension(`Посадочный диаметр фланца ${role === "left" ? "слева" : "справа"}`, end.part.boreDiameterMm, end.part.dimensionSources.boreDiameterMm ?? null);
      if (positive(diameter) && diameter > end.part.boreDiameterMm) warnings.push(`Основная деталь Ø${diameter} мм не проходит в посадочное отверстие фланца Ø${end.part.boreDiameterMm} мм (${role === "left" ? "левый" : "правый"} конец)`);
      if (positive(diameter) && diameter === end.part.boreDiameterMm) warnings.push(`Номинальные диаметры основы и отверстия фланца равны ${diameter} мм (${role === "left" ? "левый" : "правый"} конец): фактический посадочный зазор и допуски не подтверждены`);
    }
    addPart(`${role}-${end.connection}`, end.part, 1);
    if (end.connection === "collar") {
      if (!engineering.looseFlangeInBom || !hasSource(engineering.looseFlangeInBom.source)) warnings.push("Не подтверждено включение свободных фланцев в состав и стоимость");
      // Free flanges never contribute to axial length or a second collar weld.
      if (engineering.looseFlangeInBom?.include !== false) addPart(`${role}-looseFlange`, end.looseFlange, 1);
    }
    if (end.connection === "collar" && positive(end.part?.outerDiameter) && positive(diameter) && Math.abs(end.part.outerDiameter - diameter) > 0.01) warnings.push(`Наружный диаметр воротника ${role} не совпадает с основной деталью`);
    const factor = end.connection === "threaded" ? rule?.weldFactor ?? null : 2;
    weld(`${role}-weld`, `Приварка ${role === "left" ? "левого" : "правого"} конца`, factor, diameter, end.connection === "threaded" ? rule?.source ?? "Нет подтверждённой схемы" : "collector-calculations.ts: 2πD на приварной фланец/воротник");
    return addition;
  };
  const axialLeftMm = endAddition(left, dnLarge, "left", base.outerDiameter);
  const axialRightMm = endAddition(right, dnSmall, "right", base.kind === "pipe" ? base.outerDiameter : base.outerDiameterSmall);

  if (checkFlangeClearance && flangeAssembly) {
    const lengths: number[] = [];
    let fastenersComplete = true;
    // A reducer may adjoin different device sizes. Neither end may be ignored.
    for (const dn of [...new Set([dnLarge, dnSmall])]) for (const model of flangeAssembly.fastenerModels) {
      const label = `${model.replace("-line-spec", "")} DN${dn ?? "?"} PN${pn}`;
      const ref = engineering.boltReferences.find(ref => ref.dn === dn && ref.pn === pn && ref.material === material && ref.model === model && hasSource(ref.source));
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
    if (actualGap !== null && requiredGap !== null && actualGap + 1e-9 < requiredGap) warnings.push(`Недостаточный внутренний зазор между фланцами: ${actualGap} мм, требуется не менее ${requiredGap} мм; длина перехода ${baseLengthMm} мм сохраняется, удлиняющая труба не добавляется`);
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
      const candidates = rated.filter(part => part.pn === rated[0]?.pn);
      if (candidates.length === 1) sensor = candidates[0];
      else {
        warnings.push(`Сгон DN${specification.dn} PN${pn} ${insertMaterialLabel(material)}: ${candidates.length ? "неоднозначный выбор исполнения" : "нет подтверждённого исполнения с допустимым давлением не ниже давления вставки"}`);
        // Retain a unique unverified source in the audit/BOM without making it exportable.
        if (!candidates.length && nominal.length === 1) sensor = nominal[0];
      }
      addPart("sensor-nipple", sensor, 1);
      if (sensor) {
        if (!sensor.thread || !positive(sensor.wallThickness) || !hasSource(sensor.dimensionSources.wallThickness)) warnings.push("Нет подтверждённых резьбы и толщины стенки сгона датчика/реле давления");
        if (positive(sensor.lengthMm) && hasSource(sensor.dimensionSources.lengthMm)) addDimension("Справочная длина сгона (не влияет на расчёт вставки)", sensor.lengthMm, sensor.dimensionSources.lengthMm);
        addDimension("Толщина стенки сгона датчика/реле давления", sensor.wallThickness, sensor.dimensionSources.wallThickness ?? null);
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
  const totalLengthMm = baseLengthMm !== null && axialLeftMm !== null && axialRightMm !== null ? baseLengthMm + axialLeftMm + axialRightMm : null;
  addDimension("Общая длина вставки", totalLengthMm, "Lосновы + Δлевого конца + Δправого конца");
  const weldLengthMm = welds.every(row => row.lengthMm !== null) ? welds.reduce((sum, row) => sum + row.lengthMm!, 0) : null;
  const weldCost = weldLengthMm !== null && positive(rate) ? weldLengthMm / 1000 * rate : null;
  bom.push({ role: "welding", componentId: null, kind: "welding", name: "Сварочные работы", quantity: weldLengthMm !== null ? weldLengthMm / 1000 : null, unit: "м", unitPrice: positive(rate) ? rate : null, cost: weldCost, source: "collector-calculations.ts: WELD_RATES, ₽/м" });
  if (material === "st20") {
    const rates = catalog.paintingRates?.filter(rate => rate.dn === dnLarge && rate.material === material) ?? [];
    const painting = rates.length === 1 ? rates[0] : undefined;
    if (!painting) warnings.push(`${rates.length ? "Неоднозначный" : "Отсутствует"} тариф окраски СТ20 DN${dnLarge}, ₽/м`);
    if (painting) warnings.push(...painting.warnings);
    if (painting && (!positive(painting.pricePerMeter) || !hasSource(painting.source))) warnings.push(`Нет достоверной цены или источника окраски СТ20 DN${dnLarge}`);
    if (!positive(baseLengthMm)) warnings.push("Не определена длина основной детали для окраски");
    const quantity = positive(baseLengthMm) ? baseLengthMm / 1000 : null;
    const unitPrice = painting && !painting.warnings.length && hasSource(painting.source) && positive(painting.pricePerMeter) ? painting.pricePerMeter : null;
    bom.push({ role: "painting", componentId: painting?.id ?? null, kind: "painting", name: `Окраска ${base.kind === "reducer" ? "перехода по большему" : "трубы"} DN${dnLarge} СТ20`, quantity, unit: "м", unitPrice,
      cost: quantity !== null && unitPrice !== null ? quantity * unitPrice : null,
      source: `${painting?.source ?? "Тариф не найден"}; стоимость = Lосновы / 1000 × тариф DN${dnLarge}; без осевых добавок концевых деталей` });
  }
  const uniqueWarnings = [...new Set(warnings)], complete = !uniqueWarnings.length && totalLengthMm !== null && bom.every(row => row.cost !== null);
  const physicalConfiguration: InsertConfiguration = { version: 1, dnLarge, dnSmall, pn, material, geometry: base.geometry, base: insertPartIdentity(base), left: { connection: left.connection, part: left.part ? insertPartIdentity(left.part) : null, looseFlange: left.looseFlange && engineering.looseFlangeInBom?.include !== false ? insertPartIdentity(left.looseFlange) : null }, right: { connection: right.connection, part: right.part ? insertPartIdentity(right.part) : null, looseFlange: right.looseFlange && engineering.looseFlangeInBom?.include !== false ? insertPartIdentity(right.looseFlange) : null }, sensor: { requested: input.withSensorNipple, dn: input.withSensorNipple ? engineering.sensorNipple?.dn ?? null : null, gender: input.withSensorNipple ? engineering.sensorNipple?.threadGender ?? null : null, part: sensor ? insertPartIdentity(sensor) : null, plug: sensorPlug?.physicalIdentity ?? null }, baseLengthMm, axialLeftMm, axialRightMm };
  const configuration = { ...physicalConfiguration, seating };
  const name = insertName(base.geometry, dnLarge, dnSmall, material, left.connection, right.connection, input.withSensorNipple, left.part?.thread, right.part?.thread);
  return { identityKey: `insert:v1:${JSON.stringify(physicalConfiguration)}`, configuration, catalogVersion: catalog.version, name, dnLarge, dnSmall, pn, material, geometry: base.geometry, leftConnection: left.connection, rightConnection: right.connection, threadLeft: left.connection === "threaded" ? left.part?.thread ?? null : null, threadRight: right.connection === "threaded" ? right.part?.thread ?? null : null, withSensorNipple: input.withSensorNipple, baseLengthMm, totalLengthMm, complete, warnings: uniqueWarnings, bom, welds, dimensions, weldLengthMm, weldCost, price: complete ? bom.reduce((sum, row) => sum + row.cost!, 0) : null, description: `${insertGeometryLabel(base.geometry)} исполнение; ${insertConnectionLabel(left.connection)} / ${insertConnectionLabel(right.connection)}; PN${pn ?? "?"}; основа: ${base.name}; ${input.withSensorNipple ? "со сгоном" : "без сгона"}` };
}

export function generateInsertCalculations(request: InsertRequest, originalCatalog: InsertCatalog): InsertCalculation[] {
  const input = parseInsertRequest(request);
  const catalog = { ...originalCatalog, parts: deduplicateInsertParts(originalCatalog.parts) };
  const dns = new Set(catalog.nominalDns.filter(dn => dn >= input.dnFrom && dn <= input.dnTo));
  const bases = catalog.parts.filter(part => (part.kind === "pipe" || part.kind === "reducer") && dns.has(part.dn) && input.materials.includes(part.material) && (part.kind === "pipe" || part.dnSmall === null || part.dnSmall < part.dn) && (part.geometry !== "eccentric" || input.includeEccentric));
  const rows = new Map<string, InsertCalculation>();
  for (const base of bases) {
    const dnSmall = base.kind === "pipe" ? base.dn : base.dnSmall;
    const leftEnds = endsFor(base.dn, base.pn, base.material, catalog), rightEnds = endsFor(dnSmall, base.pn, base.material, catalog);
    for (const left of leftEnds) for (const right of rightEnds) {
      if (catalog.engineering.connectionPairs?.length && !catalog.engineering.connectionPairs.some(pair => pair.left === left.connection && pair.right === right.connection)) continue;
      // Straight inserts have no preferred direction: mirror endpoints are one physical item.
      const signature = (end: End) => JSON.stringify([end.connection, end.part && insertPartIdentity(end.part), catalog.engineering.looseFlangeInBom?.include !== false && end.looseFlange ? insertPartIdentity(end.looseFlange) : null]);
      const reverseAllowed = !catalog.engineering.connectionPairs?.length || catalog.engineering.connectionPairs.some(pair => pair.left === right.connection && pair.right === left.connection);
      if (base.kind === "pipe" && reverseAllowed && signature(left).localeCompare(signature(right)) > 0) continue;
      const result = calculateVariant(base, left, right, input, catalog);
      rows.set(result.identityKey, result);
    }
  }
  return [...rows.values()].sort((a, b) => a.dnLarge - b.dnLarge || (a.dnSmall ?? 0) - (b.dnSmall ?? 0) || a.material.localeCompare(b.material) || (a.pn ?? 0) - (b.pn ?? 0) || a.identityKey.localeCompare(b.identityKey));
}
