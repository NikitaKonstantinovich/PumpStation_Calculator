import { BASE_SECTIONS } from "./base-values";
import { normalizeHydraulicOptions } from "./hydraulic-option-config";

const object = (raw: unknown) => raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
const list = (raw: unknown): unknown[] => Array.isArray(raw) ? raw : [];
const short = (raw: unknown, limit = 100) => typeof raw === "string" ? raw.slice(0, limit) : null;
const number = (raw: unknown) => typeof raw === "number" && Number.isFinite(raw) ? raw : null;
function fields(raw: unknown, keys: readonly string[], limit = 100) {
  const record = object(raw);
  return Object.fromEntries(keys.map(key => {
    const value = record[key];
    return [key, typeof value === "boolean" ? value : number(value) ?? short(value, limit)];
  }));
}

export const assistantInputKeys = ["flowRate", "head", "staticHead", "workingPumpCount", "reservePumpCount", "medium", "selectedPumpId", "selectedPumpModel", "calculated"];
const settingKeys = ["stationType", "inletHead", "pressureChecksEnabled", "combinedCircuitsSimultaneous", "membraneTank", "membraneTankVolume", "vibrationCompensators", "collectorPlugs", "isolatingValves", "jockeyPump", "usdRate", "cnyRate"];
const dnKeys = ["suctionCollectorDn", "dischargeCollectorDn", "suctionValveDn", "dischargeValveDn", "collectorMaterial", "connectionType", "pn", "suctionValveType", "dischargeValveType", "secondarySuctionCollectorDn", "secondaryDischargeCollectorDn", "secondarySuctionValveDn", "secondaryDischargeValveDn", "secondaryConnectionType", "secondaryPn", "secondarySuctionValveType", "secondaryDischargeValveType"];

function collector(raw: unknown) {
  const card = object(raw), config = object(card.configuration), calculation = object(card.calculation);
  return {
    ...fields(card, ["code", "status", "spacing1", "spacing2", "spacing1Manual", "spacing2Manual", "eccentric", "databaseStatus"]),
    configuration: card.configuration ? fields(config, ["dn", "pn", "material", "connection", "stationType", "simultaneous", "jockey"]) : null,
    calculation: card.calculation ? { ...fields(calculation, ["complete", "flow", "mode", "lengthMm", "weldLengthMm", "catalogVersion", "price"]), velocities: fields(calculation.velocities, ["collector", "primary", "secondary"]) } : null,
  };
}

function line(raw: unknown) {
  const value = object(raw);
  return raw ? {
    ...fields(value, ["dn", "pn", "connection", "valveType"]),
    port: value.port ? fields(value.port, ["dn", "connection", "maxPressure", "maxInletPressure", "source"]) : null,
    inletPressureCheck: value.inletPressureCheck ? fields(value.inletPressureCheck, ["status", "pressureBar", "limitBar"]) : null,
  } : null;
}

function boundedRows(items: unknown[], keys: string[], stringLimit: number, byteLimit: number) {
  const rows = [];
  const encoder = new TextEncoder();
  let bytes = 0;
  for (const item of items) {
    const row = fields(item, keys, stringLimit);
    bytes += encoder.encode(JSON.stringify(row)).length + 1;
    if (bytes > byteLimit) break;
    rows.push(row);
  }
  return rows;
}

export function assistantProductPins(raw: unknown) {
  const value = object(raw), sources = object(value.sourceVersions);
  const identifier = (id: unknown) => typeof id === "string" && /^[\w.-]{1,100}$/.test(id) ? id : null;
  const algorithmId = identifier(value.algorithmId), version = identifier(value.version);
  if (!algorithmId || !version) return null;
  return { algorithmId, version, name: short(value.name, 150),
    sourceVersions: Object.fromEntries(["pump_catalog_v2", "station_catalog"].flatMap(key => {
      const id = identifier(sources[key]);
      return id ? [[key, id]] : [];
    })) };
}

// Used on both sides of the request. No workspace metadata, customer name, raw CAD or base-value payload is included.
export function assistantProjectSnapshot(raw: unknown) {
  const value = object(raw), settings = object(value.settings), collectors = object(value.collectors);
  const versions = object(value.versions);
  const specification = object(value.specification);
  const items = list(specification.items);
  const issues = list(value.issues);
  const product = assistantProductPins(value.product);
  return {
    ...(product ? { product: { ...product,
      tools: boundedRows(list(object(value.product).tools), ["id", "name", "status", "sources"], 180, 4500),
      fields: boundedRows(list(object(value.product).fields), ["tool", "key", "name", "unit", "value", "origin"], 105, 6000),
      pendingInput: object(value.product).pendingInput === true,
    } } : {}),
    versions: Object.fromEntries(BASE_SECTIONS.flatMap(section => {
      const id = short(versions[section]);
      return id ? [[section, id]] : [];
    })),
    primaryInput: fields(value.primaryInput, assistantInputKeys),
    secondaryInput: value.secondaryInput ? fields(value.secondaryInput, assistantInputKeys) : null,
    settings: {
      ...fields(settings, settingKeys),
      geometryEnabled: settings.geometryEnabled === true,
      manufacturerDiscounts: Object.fromEntries(Object.entries(object(settings.manufacturerDiscounts)).filter(([key, discount]) => /^[a-z][a-z0-9-]{0,39}$/i.test(key) && number(discount) !== null).slice(0, 30)),
      hydraulicOptions: normalizeHydraulicOptions(settings.hydraulicOptions),
    },
    dn: fields(value.dn, dnKeys),
    hydraulics: Object.fromEntries(["primarySuction", "primaryDischarge", "secondarySuction", "secondaryDischarge"].map(key => [key, line(object(value.hydraulics)[key])])),
    collectors: { suction: collector(collectors.suction), discharge: collector(collectors.discharge) },
    spacing: Object.fromEntries(["primary", "secondary"].map(key => {
      const item = object(value.spacing)[key];
      return [key, item ? fields(item, ["spacing", "status", "source", "ruleVersion", "calculationRule", "message", "clearanceViolation"], 180) : null];
    })),
    issues: boundedRows(issues.slice(0, 16), ["tool", "severity", "message", "subject"], 180, 5_000),
    issueCount: Math.max(issues.length, number(value.issueCount) ?? 0),
    specification: {
      ...fields(specification, ["status", "message", "compositionComplete", "technicalReady", "pricesComplete", "costComplete", "ready", "knownTotal", "pricedRows"], 150),
      totalRows: Math.max(items.length, number(specification.totalRows) ?? 0),
      items: boundedRows(items, ["position", "name", "details", "section", "option", "quantity", "unit", "price", "equipmentId", "technicalStatus", "status"], 150, 18_000),
    },
  };
}
