import type { BindingCatalog } from "./collector-catalog";
import { readInsertPaintingRates } from "./component-painting";
import flangeBoringPolicy from "../data/flange-boring-policy.json";
import { readFlangeBoringRates } from "./component-flange-boring";
import { supplierFlangeFor } from "./component-supplier-flanges";
import { positive } from "./collector-calculations";
import valveReference from "../data/insert-valve-reference.json";
import standards from "../data/component-insert-standards.json";
import collarDimensions from "../data/collar-dimensions.json";
import { COLLAR_COLUMNS, COLLAR_LABELS, reviewCollarDimensions, collarLipThickness } from "./component-collar-dimensions";
import flangeDimensions from "../data/flange-dimensions.json";
import { readFlangeDimensions, acceptedFlangeMaterials } from "./flange-dimensions";
import { selectStandardFlatFlangeDimensions } from "./component-insert-standards";
import { selectJointFasteners } from "./line-spec-parts";
import fastenerReference from "./suction-fasteners.json";
import sensorNipples from "../data/sensor-nipple-reference.json";
import sensorNipplePn25Policy from "../data/sensor-nipple-pn25-policy.json";
import { SENSOR_FIELDS, sensorManagedColumns, sensorNippleReferenceFor, adoptedSensorPressure } from "./component-sensor-nipples";
import { collectorInstrumentDimensions } from "./collector-instrument-dimensions";
import cadDimensions from "../data/component-cad-dimensions.json";
import reducerSeatingApprovals from "../data/insert-reducer-seating-approvals.json";
import analogDimensions from "../data/insert-analog-dimensions.json";
import { applyInsertAnalogLengths } from "./component-insert-analogs";
import { CAD_COLUMNS, readCadDimensions } from "./component-cad-dimensions";
import { applySt20ReducerProvenance } from "./component-st20-reducers";
import { deduplicateInsertParts, UNCONFIRMED_INSERT_ENGINEERING, type InsertCatalog, type InsertConnection, type InsertEngineering, type InsertMaterial, type InsertPart, type InsertPartKind, type InsertSensorPlug, type InsertStandardBolt } from "./component-insert-calculations";

type Item = BindingCatalog["items"][number];
type Field = Item["fields"][number];
const findField = (item: Item, pattern: RegExp): Field | undefined => item.fields.find(field => pattern.test(field.headerPath.at(-1) ?? ""));
const numeric = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const match = String(value ?? "").trim().replace(",", ".").match(/^(?:(?:DN|Ду|PN|Ру)\s*)?(\d+(?:\.\d+)?)(?:\s*(?:мм|mm))?$/i);
  return match ? Number(match[1]) : null;
};
const source = (item: Item, field?: Field) => `${item.sourceSheet}!${field?.column ?? "строка "}${item.sourceRow}`;
const fieldValue = (item: Item, pattern: RegExp) => numeric(findField(item, pattern)?.value);
const materialOf = (item: Item): InsertMaterial | null => /AISI\s*304/i.test(item.family) ? "aisi304" : /(?:сталь|ст[.\s]*)\s*20/i.test(item.family) ? "st20" : null;

const connectionKinds: InsertConnection[] = ["flanged", "collar", "threaded"];
/** Confirmed in the user's engineering clarification; unrelated unknowns stay unresolved. */
export const CONFIRMED_INSERT_ENGINEERING: InsertEngineering = {
  ...UNCONFIRMED_INSERT_ENGINEERING,
  sensorNipplePn25Allowance: sensorNipplePn25Policy as InsertEngineering["sensorNipplePn25Allowance"],
  variantSelection: { source: "Решение пользователя 26.10.2026: по одному исполнению для DN, PN, материала, геометрии и сгона; разные соединения отдельно. По возможности используются комплектующие исходной базы, недостающие данные принимаются из аналогов. Полный расчёт имеет приоритет; среди полных вариантов предпочтительна исходная база." },
  compactThreaded: { source: "Решения пользователя 29.10.2026: готовые приварные резьбовые концы обоих материалов, только одинаковый DN до 2 дюймов; компактная сборка без дополнительной трубы. Норма стыкового соединения наследует принятую методику воротников 2πD; зазор не прибавляется.", weldFactor: 2 },
  flangeBoring: flangeBoringPolicy as InsertEngineering["flangeBoring"],
  reducerSeatingApprovals: reducerSeatingApprovals.rows as InsertEngineering["reducerSeatingApprovals"],
  reducerReadyBoreSeating: reducerSeatingApprovals.readyBorePolicy,
  flangedEndExclusions: { dns: [15, 20, 25], source: "Уточнение пользователя 26.10.2026: DN15, DN20 и DN25 не используются во фланцевом исполнении вставок. Исключены приварные фланцы и воротники со свободным фланцем на каждом конце; резьбовые концы сохраняются при наличии подтверждённых деталей." },
  collarSelections: collarDimensions.insertSelections as InsertEngineering["collarSelections"],
  collarAssembly: collarDimensions.assembly,
  connectionPairs: connectionKinds.flatMap(left => connectionKinds.map(right => ({ left, right, source: "Уточнение пользователя 04.10.2026: все возможные сочетания; резьба не более 2 дюймов" }))),
  looseFlangeInBom: { include: false, source: "Уточнение пользователя 04.10.2026: свободные фланцы исключаются из длины, состава и стоимости вставки" },
  sensorNipple: { dn: 15, threadGender: "male", withPlug: true, source: "Уточнение пользователя 05.10.2026: приварной сгон DN15 для реле давления с заглушкой; стандартная наружная резьба 1/2 дюйма; длина сгона не требуется для расчёта, стоимость за штуку" },
  straightLength: { model: "017W-line-spec", basis: "standard-bolt", source: "Уточнение пользователя 05.10.2026: длину трубы определять тем же подбором крепежа 017W по DN/PN/материалу, что в обвязке; selectJointFasteners в line-spec-parts.ts; полная длина выбранного каталожного болта" },
  flangeAssembly: { faceOffsetMm: 5, clearanceFactor: 1.1, fastenerModels: ["017W-line-spec", "010C-line-spec"], source: "Уточнение пользователя 05.10.2026: торец основы не доходит до наружной плоскости каждого приварного фланца на 5 мм; уточнение 26.10.2026: только для прямых вставок внутренний зазор между фланцами не менее 1,1 × max(полная длина крепежа затвора 017W, обратного клапана 010C); подбор крепежа из обвязки" },

};

/** Converts source cells only. Missing reducer length, axial dimensions and PN remain null. */
export function makeInsertCatalog(data: BindingCatalog, engineering: InsertEngineering = CONFIRMED_INSERT_ENGINEERING): InsertCatalog {
  const parts: InsertPart[] = [];
  const tablePressure = new Map<string, { value: number; source: string }>();
  const rows = [...data.items].sort((a, b) => a.tableId.localeCompare(b.tableId) || a.sourceRow - b.sourceRow);
  for (const item of rows) {
    const material = materialOf(item);
    if (!material) continue;
    let kind: InsertPartKind | null = null;
    if (item.catalogId === "трубы") kind = "pipe";
    if (item.catalogId === "переходы" && /[эе]ксцентр|концентр/i.test(item.family)) kind = "reducer";
    if (item.catalogId === "воротники") kind = "collar";
    if (item.catalogId === "фланцы" && /свободн/i.test(item.family)) kind = "looseFlange";
    if (item.catalogId === "фланцы" && /плоск|приварн/i.test(item.family)) kind = "weldFlange";
    if (item.catalogId === "сгоны-резьба") kind = "nipple";
    // Future catalogue records can explicitly identify an engineered threaded end.
    if (String(findField(item, /^Назначение$/i)?.value ?? "") === "Резьбовой конец вставки") kind = "threadEnd";
    if (!kind) continue;
    const dn = fieldValue(item, /^DN$/i);
    if (!positive(dn)) continue;
    const name = String(findField(item, /^Наименование$/i)?.value ?? `${item.family} DN${dn}`);
    const pnField = findField(item, /^PN$|^Давление$/i), directPn = numeric(pnField?.value);
    // PN is merged only inside a source table. Nipples do not acquire a pressure from neighbours.
    if (positive(directPn)) tablePressure.set(item.tableId, { value: directPn, source: source(item, pnField) });
    const pn = directPn ?? (["collar", "weldFlange", "looseFlange"].includes(kind) ? tablePressure.get(item.tableId)?.value ?? null : null);
    const price = item.prices.find(price => price.currency === "RUB" && /(?:^|\/)\s*Цена(?:,|\s|$)/i.test(price.label) && (kind === "pipe" ? /₽\s*\/м|руб.*\/м/i.test(price.label) : !/\/кг|\/м(?:\.|\b)/i.test(price.label)));
    const dimensionSources: Record<string, string> = {};
    const dimension = (key: string, pattern: RegExp) => {
      const field = findField(item, pattern), value = numeric(field?.value);
      const collarSource = kind === "collar" && field && [COLLAR_COLUMNS.length, COLLAR_COLUMNS.thickness, COLLAR_COLUMNS.diameter].some(column => column === field.column) ? findField(item, /^Источник размеров воротника$/i)?.value : null;
      const explicitSource = collarSource ?? (key === "lengthMm" ? findField(item, /^Источник длины$/i)?.value : kind === "threadEnd" ? findField(item, /^Источник размеров$/i)?.value : null);
      if (value !== null) dimensionSources[key] = explicitSource ? String(explicitSource) : source(item, field);
      return value;
    };
    let outerDiameter = dimension("outerDiameter", /^(?:Наружный )?Диаметр, мм$/i);
    let wallThickness = dimension("wallThickness", /^Толщина(?: 1)?, мм$/i);
    if (kind === "collar" && (!positive(outerDiameter) || !positive(wallThickness))) {
      const dimensions = name.match(/\(\s*(\d+(?:[.,]\d+)?)\s*[xх×]\s*(\d+(?:[.,]\d+)?)\s*(?:мм)?\s*\)/i);
      if (dimensions) {
        outerDiameter = Number(dimensions[1].replace(",", ".")); wallThickness = Number(dimensions[2].replace(",", "."));
        dimensionSources.outerDiameter = `${source(item, findField(item, /^Наименование$/i))}: наружный Ø из наименования`;
        dimensionSources.wallThickness = `${source(item, findField(item, /^Наименование$/i))}: стенка из наименования (не осевая добавка)`;
      }
    }
    if (kind === "nipple" && !positive(outerDiameter)) {
      const ref = data.collectorReference?.nippleDiameters.find(ref => ref.dn === dn && ref.material === material);
      if (ref && positive(ref.outerDiameter)) { outerDiameter = ref.outerDiameter; dimensionSources.outerDiameter = ref.source; }
    }
    const threadField = findField(item, /^Резьба, дюйм$|^DN, дюйм$/i);
    const gender = String(findField(item, /^Резьба$|^Исполнение резьбы$/i)?.value ?? "");
    const thread = threadField ? String(threadField.value).trim().replace(/[”″]/g, '"') : null;
    const standard = name.match(/(?:ГОСТ|DIN|EN|ISO)\s*\d+(?:[-.]\d+)*/i)?.[0].toUpperCase().replace(/\s+/g, "") ?? null;
    const warnings: string[] = [];
    if (kind === "threadEnd") {
      const issue = findField(item, /^Неподтверждённые данные$/i)?.value;
      if (issue) warnings.push(String(issue));
    }
    if (!positive(pn) && (kind === "pipe" || kind === "reducer")) warnings.push(`Не подтверждён PN основной детали: ${name}`);
    const acceptedMaterials = acceptedFlangeMaterials(item, pn, flangeDimensions, data.source.sha256);
    if (material === "aisi304" && /12Х18Н10Т/i.test(name) && !acceptedMaterials) warnings.push(`Материал источника противоречив: семейство AISI304, наименование 12Х18Н10Т (${item.id})`);
    const part: InsertPart = { id: item.id, kind, name, material, dn, dnSmall: kind === "pipe" ? dn : dimension("dnSmall", /^DN меньший$|^DN2$|^Меньший DN$/i), pn,
      geometry: kind !== "reducer" ? "straight" : /[эе]ксцентр/i.test(item.family) ? "eccentric" : "concentric", outerDiameter,
      outerDiameterSmall: kind === "pipe" ? outerDiameter : dimension("outerDiameterSmall", /^Диаметр меньший, мм$/i), wallThickness,
      wallThicknessSmall: kind === "pipe" ? wallThickness : dimension("wallThicknessSmall", /^Толщина 2, мм$/i),
      lengthMm: dimension("lengthMm", /^(?:(?:Строительная |Полная осевая )?Длина(?: перехода| детали| воротника)?), мм$/i), thicknessMm: dimension("thicknessMm", /^Толщина (?:фланца|борта), мм$/i),
      ...(kind === "collar" ? { lipOuterDiameterMm: dimension("lipOuterDiameterMm", /^Наружный диаметр борта, мм$/i) } : {}),
      cylindricalLengthLargeMm: dimension("cylindricalLengthLargeMm", /^Длина цилиндрического участка большого конца, мм$/i),
      cylindricalLengthSmallMm: dimension("cylindricalLengthSmallMm", /^Длина цилиндрического участка малого конца, мм$|^Длина цилиндрического участка меньшего конца, мм$/i),
      thread, threadGender: gender === "НР" ? "male" : gender === "ВР" ? "female" : null, standard, price: positive(price?.amount) ? price.amount : null,
      source: `${source(item)}${price ? `; цена ${price.sourceColumn}${item.sourceRow}` : ""}`, dimensionSources, warnings };
    if (acceptedMaterials) part.source += `; ${acceptedMaterials.materials}; ${acceptedMaterials.source}`;
    if (kind === "threadEnd") {
      part.origin = "supplement";
      part.source += `; ${findField(item, /^Источник размеров$/i)?.value ?? ""}; цена: ${findField(item, /^Источник цены$/i)?.value ?? ""}; ${findField(item, /^Дата проверки$/i)?.value ?? ""}`;
    }
    const supplierFlange = supplierFlangeFor(item, data.source.sha256);
    if (supplierFlange) {
      if ("requiredPipeOuterDiameterMm" in supplierFlange && typeof supplierFlange.requiredPipeOuterDiameterMm === "number") part.requiredPipeOuterDiameterMm = supplierFlange.requiredPipeOuterDiameterMm;
      part.origin = "supplement";
      part.compatiblePns = supplierFlange.compatiblePns;
      part.source = `${supplierFlange.url}; ${price?.label ?? "Цена не задана"}: ${price?.amount ?? "не задана"} ₽/шт., дата источника ${String(findField(item, /^Дата цены$/i)?.value ?? "не задана")}; ${supplierFlange.vat}`;
    } else if (item.fields.some(field => field.column === "compatiblePns")) warnings.push(`Подтверждённые PN фланца не соответствуют записи поставщика: ${item.id}`);
    if (kind === "nipple") {
      const reviewed = sensorNippleReferenceFor(item, data.source.sha256, sensorNipples);
      for (const [key, fieldKey, expected] of [["outerDiameter", "diameter", reviewed?.outerDiameterMm], ["wallThickness", "wall", reviewed?.wallThicknessMm], ["threadGender", "gender", "male"]] as const) {
        if (!item.fields.some(field => field.column === SENSOR_FIELDS[fieldKey][0])) continue;
        if (!reviewed || part[key] !== expected) { part[key] = null; delete dimensionSources[key]; warnings.push("Проверенные данные сгона устарели или изменены; повторите проверку источника, DN, материала и размеров"); }
        else dimensionSources[key] = reviewed.source;
      }
      if (reviewed) {
        const accepted = adoptedSensorPressure(item, data.source.sha256, sensorNipples);
        part.pn = accepted?.pressureBar ?? null;
        if (accepted) { part.pressureAcceptance = accepted; part.source += `; ${accepted.source}; принято ${accepted.pressureBar} бар, температура среды до +${accepted.maxTemperatureC} °C`; }
        else warnings.push("Принятое давление сгона не применено: исходные данные или атрибуты решения отсутствуют, изменены либо противоречивы; требуется проверка записи");
        part.source += `; ${reviewed.source}`;
        if (item.fields.some(field => field.column === SENSOR_FIELDS.standard[0])) part.standard = reviewed.standard;
      } else if (item.fields.some(field => sensorManagedColumns.includes(field.column))) { part.pn = null; warnings.push("Справочная проверка сгона не соответствует текущей записи каталога"); }
    }
    if (kind === "nipple") {
      const dimensions = collectorInstrumentDimensions(item, data.source.sha256);
      if (dimensions) {
        part.outerDiameter = dimensions.outerDiameterMm; part.wallThickness = dimensions.wallThicknessMm;
        dimensionSources.outerDiameter = dimensions.source; dimensionSources.wallThickness = dimensions.source;
      }
    }
    if (kind === "collar") {
      if (engineering.collarSelections?.some(rule => rule.componentId === item.id) && data.source.sha256 !== collarDimensions.sourceSha256) warnings.push("Источник выбранного воротника изменён; требуется повторное подтверждение применения во вставках");
      const review = reviewCollarDimensions(item, data.source.sha256, collarDimensions, pn);
      const lip = collarLipThickness(item, data.source.sha256, collarDimensions);
      const managed = [["lengthMm", "length", review?.row.c], ["thicknessMm", "thickness", lip?.valueMm ?? review?.row.a], ["lipOuterDiameterMm", "diameter", review?.row.e]] as const;
      for (const [key, columnKey, expected] of managed) {
        const field = item.fields.find(field => field.headerPath.at(-1) === COLLAR_LABELS[columnKey]);
        if (field?.column !== COLLAR_COLUMNS[columnKey]) continue;
        if (!(key === "thicknessMm" && lip ? true : review?.approved) || part[key] !== expected) {
          part[key] = null; delete part.dimensionSources[key];
          warnings.push("Размеры воротника устарели или не соответствуют исходному чертежу, DN, диаметру и стенке; требуется повторная проверка");
        } else part.dimensionSources[key] = key === "thicknessMm" && lip ? lip.source : review!.source;
      }
      if (review && !review.approved) warnings.push(review.reason);
    }
    if (kind === "weldFlange") {
      const flange = selectStandardFlatFlangeDimensions({ name, dn, pn, material, sourceSha256: data.source.sha256 });
      if (flange) {
        part.standard = "ГОСТ33259-2015:01:1:B";
        if (part.thicknessMm === null) { part.thicknessMm = flange.thicknessMm; part.dimensionSources.thicknessMm = flange.source; }
        part.boreDiameterMm = flange.boreDiameterMm; part.dimensionSources.boreDiameterMm = flange.source;
      }
    }
    if (kind === "weldFlange" || kind === "looseFlange") {
      const measured = readFlangeDimensions(item, pn, flangeDimensions, data.source.sha256);
      if (measured.standard) part.standard = measured.standard;
      // Persisted dimensions take precedence, including invalidation of a managed field.
      if (item.fields.some(field => field.column.startsWith("CALC_FLANGE_") && field.column !== "CALC_FLANGE_REVIEW")) {
        part.thicknessMm = measured.dimensions.thicknessMm ?? null;
        part.boreDiameterMm = measured.dimensions.boreDiameterMm ?? null;
        if (measured.dimensions.pipeOuterDiameterMm) part.requiredPipeOuterDiameterMm = measured.dimensions.pipeOuterDiameterMm;
        if (part.thicknessMm !== null) part.dimensionSources.thicknessMm = measured.source;
        else delete part.dimensionSources.thicknessMm;
        if (part.boreDiameterMm !== null) part.dimensionSources.boreDiameterMm = measured.source;
        else delete part.dimensionSources.boreDiameterMm;
        warnings.push(...measured.warnings);
      } else if (part.thicknessMm === null) warnings.push(...measured.warnings);
    }
    applySt20ReducerProvenance(item, data.source.sha256, part);
    const syntheticLength = findField(item, /^(?:Строительная )?Длина(?: перехода| детали)?, мм$/i)?.column === "CALC_INSERT_LENGTH_MM";
    if (syntheticLength) {
      const reference = data.source.sha256 === standards.sourceSha256 && standards.reducerLengths.find(ref => ref.componentId === part.id && ref.material === material && ref.geometry === part.geometry && ref.outerDiameter === part.outerDiameter && ref.outerDiameterSmall === part.outerDiameterSmall && ref.wallThickness === part.wallThickness && ref.wallThicknessSmall === part.wallThicknessSmall && ref.lengthMm === part.lengthMm
        && (ref.basis === "project-analogue-length" ? ref.adoptionId === standards.reducerAnalogueLengthPolicy.id
          && standards.reducerAnalogueLengthPolicy.rows.some(row => row.componentId === ref.componentId && row.material === ref.material && row.geometry === ref.geometry && row.outerDiameter === ref.outerDiameter && row.outerDiameterSmall === ref.outerDiameterSmall && row.wallThickness === ref.wallThickness && row.wallThicknessSmall === ref.wallThicknessSmall && row.lengthMm === ref.lengthMm)
          : ref.basis === "adopted-standard-geometry" ? ref.adoptionId === standards.reducerLengthPolicy.id && ref.standard === standards.reducerLengthPolicy.standard : /^ГОСТ17378(?:-|$)/.test(part.standard ?? "")));
      if (reference) {
        part.dimensionSources.lengthMm = reference.source;
        if (reference.basis === "project-analogue-length") part.lengthAssumptionSource = reference.source;
      }
      else { part.lengthMm = null; delete part.dimensionSources.lengthMm; part.warnings.push("Нормативная длина перехода устарела: изменились исходная книга или физические размеры; требуется повторная проверка ГОСТ"); }
    }
    if (part.kind === "reducer" && item.fields.some(field => field.column.startsWith("CALC_CAD_"))) {
      const cad = readCadDimensions(item, data.source.sha256, cadDimensions);
      for (const key of ["cylindricalLengthLargeMm", "cylindricalLengthSmallMm"] as const) {
        // Never let unverified persisted CAD values pass through the generic cell reader.
        if (item.fields.some(field => field.column === CAD_COLUMNS[key])) { part[key] = null; delete part.dimensionSources[key]; }
        if (cad.dimensions[key] !== undefined) { part[key] = cad.dimensions[key]; part.dimensionSources[key] = cad.source; }
      }
      if (cad.dimensions.lengthMm !== undefined && (part.lengthMm === null || part.lengthMm === cad.dimensions.lengthMm)) {
        part.lengthMm = cad.dimensions.lengthMm; part.dimensionSources.lengthMm = cad.source;
      }
      part.warnings.push(...cad.warnings);
    }
    const lengthReview = data.source.sha256 === standards.sourceSha256 && standards.reducerLengthReviews.find(ref => ref.componentId === part.id && ref.material === material && ref.geometry === part.geometry && ref.outerDiameter === part.outerDiameter && ref.outerDiameterSmall === part.outerDiameterSmall && ref.wallThickness === part.wallThickness && ref.wallThicknessSmall === part.wallThicknessSmall);
    if (part.kind === "reducer" && part.lengthMm === null && lengthReview && lengthReview.status !== "confirmed") {
      part.warnings.push(`Проверка длины: ${lengthReview.reason}${lengthReview.candidateLengthsMm.length ? ` Варианты по источнику: ${lengthReview.candidateLengthsMm.join(" / ")} мм.` : ""} Источник: ${lengthReview.source}`);
    } else {
      const lengthConflict = standards.conflicts.find(ref => ref.material === material && ref.outerDiameter === part.outerDiameter && ref.outerDiameterSmall === part.outerDiameterSmall && ref.wallThickness === part.wallThickness && ref.wallThicknessSmall === part.wallThicknessSmall);
      if (part.kind === "reducer" && part.lengthMm === null && lengthConflict) part.warnings.push(`${lengthConflict.reason}: ${lengthConflict.lengthsMm.join(" / ")} мм; ${lengthConflict.source}`);
    }
    parts.push(part);
  }
  const pipes = parts.filter(part => part.kind === "pipe");
  for (const part of parts.filter(part => part.kind === "reducer" && !positive(part.dnSmall))) {
    const matchingPipes = pipes.filter(pipe => pipe.material === part.material && positive(pipe.outerDiameter) && positive(part.outerDiameterSmall) && Math.abs(pipe.outerDiameter - part.outerDiameterSmall) < 0.001);
    const dns = [...new Set(matchingPipes.map(pipe => pipe.dn))];
    if (dns.length === 1) { part.dnSmall = dns[0]; part.dimensionSources.dnSmall = `Соответствие наружного Ø ${part.outerDiameterSmall} мм номинальному DN${part.dnSmall}: ${matchingPipes[0].dimensionSources.outerDiameter ?? matchingPipes[0].source}`; }
    else part.warnings.push(`Меньший наружный Ø ${part.outerDiameterSmall ?? "?"} мм не имеет однозначного DN в каталоге труб ${part.material === "aisi304" ? "AISI304" : "СТ20"}`);
  }
  applyInsertAnalogLengths(parts, data, analogDimensions);
  const usable = deduplicateInsertParts(parts);
  const nominalDns = [...new Set(parts.filter(part => part.kind === "pipe" || part.kind === "reducer").map(part => part.dn))].sort((a, b) => a - b);
  const sensorPlugs: InsertSensorPlug[] = data.items.filter(item => item.catalogId === "заглушки" && /резьб/i.test(item.family)).flatMap(item => {
    const dn = fieldValue(item, /^DN$/i);
    if (!positive(dn)) return [];
    const thread = findField(item, /^Резьба$/i)?.value;
    const price = item.prices.find(price => price.currency === "RUB" && /(?:^|\/)\s*Цена(?:,|\s|$)/i.test(price.label));
    const supplierUrl = findField(item, /^Источник URL$/i)?.value, priceDate = findField(item, /^Дата цены$/i)?.value;
    const manufacturer = findField(item, /^Производитель$/i)?.value, article = findField(item, /^Артикул$/i)?.value, material = findField(item, /^Материал$/i)?.value, alloy = findField(item, /^Сплав$/i)?.value, threadSize = findField(item, /^Размер резьбы$/i)?.value;
    const pn = fieldValue(item, /^PN$|^Давление$/i);
    const physicalIdentity = manufacturer && article && material && threadSize && thread ? JSON.stringify([String(manufacturer), String(article), dn, pn, String(material), alloy ?? null, String(threadSize), String(thread)]) : null;
    return [{ id: item.id, name: String(findField(item, /^Наименование$/i)?.value ?? `${item.family} DN${dn}`), dn, pn, threadGender: thread === "ВР" ? "female" as const : thread === "НР" ? "male" as const : null, physicalIdentity, price: positive(price?.amount) ? price.amount : null, source: supplierUrl ? `${supplierUrl}; цена с НДС ${priceDate ?? "без даты"}` : source(item) }];
  });
  const standardBolts: InsertStandardBolt[] = data.items.filter(item => item.catalogId === "метизы" && /^(?:Болт|Шпилька)\s/i.test(String(findField(item, /^Наименование$/i)?.value ?? ""))).flatMap(item => {
    const diameterMm = fieldValue(item, /^Диаметр резьбы, мм$/i), lengthMm = fieldValue(item, /^Длина (?:болта|шпильки), мм$/i);
    return positive(diameterMm) && positive(lengthMm) ? [{ id: item.id, diameterMm, lengthMm, source: source(item, findField(item, /^Длина (?:болта|шпильки), мм$/i)) }] : [];
  });
  const effectiveEngineering = structuredClone(engineering);
  if (data.source.sha256 !== reducerSeatingApprovals.sourceSha256) {
    effectiveEngineering.reducerSeatingApprovals = [];
    delete effectiveEngineering.reducerReadyBoreSeating;
  }
  if (effectiveEngineering.straightLength?.model === "017W-line-spec") {
    const combinations = new Map(parts.filter(part => (part.kind === "pipe" || part.kind === "reducer") && positive(part.pn)).flatMap(part => [...new Set([part.dn, part.dnSmall].filter(positive))].map(dn => [`${dn}:${part.pn}:${part.material}`, { ...part, dn }] as const)));
    const models = [...new Set(["017W-line-spec", ...effectiveEngineering.flangeAssembly?.fastenerModels ?? []])];
    effectiveEngineering.boltReferences = [...combinations.values()].flatMap(part => {
      const flangeIds = usable.filter(end => end.kind === "weldFlange" && end.dn === part.dn && end.material === part.material && (end.pn === part.pn || end.compatiblePns?.includes(part.pn!))).map(end => end.id);
      return [undefined, ...flangeIds].flatMap(endPartId => models.flatMap(model => {
      const reference = fastenerReference.find(row => row.dn === part.dn && row.pn === part.pn);
      const check = model === "010C-line-spec", label = check ? "010C" : "017W";
      const collarSelection = effectiveEngineering.collarSelections?.find(rule => rule.dn === part.dn && rule.material === part.material && rule.insertPns.includes(part.pn!));
      const selected = selectJointFasteners(data, part.material, part.dn, part.pn!, check ? { gaskets: 2, thickness: reference?.wafer010CLength ?? null, fastener: "stud", source: reference?.checkValveSource } : true, collarSelection?.componentId, endPartId);
      if (!selected) return [];
      const warnings: string[] = [...selected.warnings];
      if (selected.flangeThickness === null) warnings.push(`Подбор крепежа ${label} из обвязки: нет суммарной толщины фланцев ${part.material === "aisi304" ? "AISI304" : "СТ20"} DN${part.dn} PN${part.pn}`);
      if (selected.stack.thickness === null) warnings.push(`Подбор крепежа ${label} из обвязки: нет длины корпуса DN${part.dn} PN${part.pn}`);
      if (!selected.nutWidth) warnings.push(`Нет осевого размера гайки М${selected.diameter} в каталоге крепежа`);
      if (!selected.washerWidth) warnings.push(`Нет толщины шайбы М${selected.diameter} в каталоге крепежа`);
      if (selected.length !== null && !selected.bolt) warnings.push(`Нет ${check ? "стандартной шпильки" : "стандартного болта"} М${selected.diameter} длиной не менее ${selected.length} мм в каталоге крепежа`);
      const provenance = `${effectiveEngineering.straightLength!.source}; ${label}: ${selected.source}; гаек ${selected.ends} × ${selected.nut?.id ?? "не найдена"}; шайб ${selected.ends} × ${selected.washer?.id ?? "не найдена"}; ${check ? "шпилька" : "болт"} ${selected.bolt?.id ?? "не найден"}`;
      const dimensionValues: Array<[string, number | null]> = [[`${label}: суммарная толщина двух фланцев`, selected.flangeThickness], [`${label}: длина корпуса для подбора крепежа`, selected.stack.thickness], [`${label}: суммарная толщина прокладок`, selected.stack.gaskets * 2], [`${label}: осевой размер гайки`, selected.nutWidth], [`${label}: толщина шайбы`, selected.washerWidth], [`${label}: суммарный выступ резьбы`, selected.ends * 5]];
      return [{ dn: part.dn, pn: part.pn!, material: part.material, model, threadDiameterMm: selected.diameter,
        ...(endPartId ? { endPartId } : {}),
        minimumLengthMm: selected.length, standardLengthMm: selected.standardLength, componentId: selected.bolt?.id ?? null, source: provenance, warnings,
        dimensions: [...dimensionValues.map(([name, value]) => ({ name, value, unit: "мм" as const, source: provenance })), ...selected.flangeDimensions] }];
      }));
    });
  }
  return { version: `${data.source.sha256}:${data.source.importedAt}`, parts: usable, nominalDns, materials: [...new Set(parts.filter(part => part.kind === "pipe" || part.kind === "reducer").map(part => part.material))].sort(), engineering: effectiveEngineering, issues: [], sensorPlugs, standardBolts, valveReferences: valveReference.rows, paintingRates: readInsertPaintingRates(data), flangeBoringRates: readFlangeBoringRates(data) };
}

/** No collector two-flange bolt table is accepted here. The caller must supply a verified valve stack. */
export function selectStandardInsertBolt(data: BindingCatalog, threadDiameterMm: number, minimumLengthMm: number) {
  if (!positive(threadDiameterMm) || !positive(minimumLengthMm)) return null;
  const matches = data.items.filter(item => item.catalogId === "метизы" && /^Болт\s/i.test(String(findField(item, /^Наименование$/i)?.value ?? "")) && fieldValue(item, /^Диаметр резьбы, мм$/i) === threadDiameterMm)
    .map(item => ({ id: item.id, lengthMm: fieldValue(item, /^Длина болта, мм$/i), source: source(item, findField(item, /^Длина болта, мм$/i)) }))
    .filter((item): item is { id: string; lengthMm: number; source: string } => positive(item.lengthMm) && item.lengthMm >= minimumLengthMm)
    .sort((a, b) => a.lengthMm - b.lengthMm || a.id.localeCompare(b.id));
  return matches[0] ?? null;
}
