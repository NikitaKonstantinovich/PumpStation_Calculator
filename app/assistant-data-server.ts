import { env } from "cloudflare:workers";
import { db } from "./auth-server";
import { BASE_SECTIONS, BASE_LABELS, baseSnapshot, spacingForPump, type AppliedBaseValues, type BaseSection } from "./base-values";
import { currentBasePublication, resolveBaseVersions } from "./base-values-server";
import { cataloguePurchasePriceRub, type Pump } from "./pump-catalog";
import { pumpCardPhysicalData } from "./pump-card-data";
import { currentInsertSource } from "./component-insert-catalog-server";
import type { AssistantContext, AssistantSource } from "./assistant-types";
import type { UserRole } from "./user-types";

export type AssistantDataAccess = { userId: string; role: UserRole; profile: "full" | "beta"; context?: AssistantContext };
type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
const short = (value: unknown, limit = 400) => typeof value === "string" ? value.slice(0, limit) : null;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const normalize = (value: string) => value.toLowerCase().replaceAll("ё", "е").replace(/с/g,"c").replace(/м/g,"m").replace(/д/g,"d").replace(/[^\p{L}\p{N}]+/gu, "");
const pick = (value: unknown, keys: string[]) => Object.fromEntries(keys.map(key => {
  const item = object(value)[key];
  return [key, typeof item === "string" ? item.slice(0, 300) : typeof item === "boolean" ? item : number(item)];
}));
const inputKeys = ["flowRate", "head", "staticHead", "workingPumpCount", "reservePumpCount", "medium", "selectedPumpId", "calculated"];
const settingKeys = ["stationType", "inletHead", "pressureChecksEnabled", "combinedCircuitsSimultaneous", "membraneTank", "membraneTankVolume", "vibrationCompensators", "collectorPlugs", "isolatingValves", "jockeyPump", "usdRate", "cnyRate"];
const dnKeys = ["suctionCollectorDn", "dischargeCollectorDn", "suctionValveDn", "dischargeValveDn", "collectorMaterial", "connectionType", "pn", "suctionValveType", "dischargeValveType", "secondarySuctionCollectorDn", "secondaryDischargeCollectorDn", "secondarySuctionValveDn", "secondaryDischargeValveDn", "secondaryConnectionType", "secondaryPn"];
const safeDiscounts = (raw: unknown) => Object.fromEntries(Object.entries(object(raw)).slice(0, 50).filter(([key,value]) => key.length <= 80 && number(value) !== null));
const page = <T,>(items: T[], offset: number, limit: number) => ({ total: items.length, offset, nextOffset: offset + limit < items.length ? offset + limit : null, items: items.slice(offset, offset + limit) });
class DataError extends Error {}

const querySchema = { type: "string", description: "Краткое название, точная модель или ID; пустая строка для списка. Не передавай весь вопрос." };
const offsetSchema = { type: "integer", minimum: 0, maximum: 10000, description: "Смещение страницы, сначала 0." };
const scopeSchema = { type: "string", enum: ["published", "project"], description: "published — актуальные опубликованные правила для общих вопросов; project — закреплённая версия текущего проекта. Никогда не подменяй одно другим." };
function tool(name: string, description: string, properties: JsonObject) {
  return { type: "function", name, description, strict: true, parameters: { type: "object", properties, required: Object.keys(properties), additionalProperties: false } };
}
export const assistantDataDefinitions = [
  tool("read_base_values", "Прочитать реальные базовые значения из D1: межосевые расстояния, скорости, курсы/скидки, сварка, окраска, сгоны и предпочтения. Для расстояния конкретного насоса удобнее search_pumps. Только опубликованные или закреплённые версии, без черновиков.", { scope: scopeSchema, section: { type: "string", enum: [...BASE_SECTIONS] }, query: querySchema, offset: offsetSchema }),
  tool("search_pumps", "Найти насос в действующем каталоге по точной модели (например CDM 10-5), серии, производителю или ID. Возвращает реальные характеристики, патрубки, цену и межосевое расстояние, рассчитанное кодом приложения по выбранной версии правил. Если точная модель не найдена, не подменяй её соседней.", { query: querySchema, scope: scopeSchema, offset: offsetSchema }),
  tool("search_equipment", "Читать базу комплектующих и сохранённых изделий. components — действующий каталог D1; insertions — сохранённые расчётные вставки; collectors — сохранённые коллекторы (только full). Цены сохранённых изделий являются снимком на указанную дату.", { catalog: { type: "string", enum: ["components", "insertions", "collectors"] }, query: querySchema, offset: offsetSchema }),
  tool("read_current_project", "Прочитать разрешённые технические поля текущего проекта: насосы, Q/H, настройки, DN, расстояния и версии базовых значений. Full: последняя сохранённая версия только собственного проекта. Beta: параметры текущей вкладки. Не изменяет проект.", {}),
];

export function createAssistantDataTools(access: AssistantDataAccess) {
  const sources: AssistantSource[] = [];
  let publishedPromise: Promise<{ applied: AppliedBaseValues; publishedAt: string }> | undefined;
  let projectPromise: Promise<{ data: JsonObject; applied: AppliedBaseValues }> | undefined;
  let pumpsPromise: Promise<Pump[]> | undefined;
  const published = () => publishedPromise ??= currentBasePublication().then(publication => ({ applied: baseSnapshot(publication.id, publication.values), publishedAt: publication.createdAt }));
  const pumps = () => pumpsPromise ??= (async () => {
    const assets = (env as unknown as { ASSETS?: { fetch: typeof fetch } }).ASSETS;
    if (!assets) throw new DataError("Каталог насосов недоступен.");
    const response = await assets.fetch("https://assets.local/pumps.json");
    if (!response.ok) throw new DataError("Каталог насосов недоступен.");
    const result = await response.json();
    if (!Array.isArray(result)) throw new DataError("Каталог насосов имеет неверный формат.");
    return result as Pump[];
  })();
  const project = () => projectPromise ??= (async () => {
    const context = access.context;
    if (access.profile === "beta") {
      if (!context?.beta || context.projectId) throw new DataError("Параметры текущей beta-вкладки не переданы.");
      const applied = await resolveBaseVersions(context.beta.versions);
      return { applied, data: { origin: "Текущая beta-вкладка, ввод пользователя; это не сохранённый проект D1", input: pick(context.beta.input, inputKeys), baseVersions: applied.versions } };
    }
    if (!context?.projectId) throw new DataError("Текущий проект не передан. Для общего вопроса используйте опубликованные правила.");
    const row = await db().prepare("SELECT config_json AS config,updated_at AS updatedAt FROM user_projects WHERE id=? AND user_id=?")
      .bind(context.projectId, access.userId).first<{ config: string; updatedAt: string }>();
    if (!row) throw new DataError("Текущий проект не сохранён или недоступен этой учётной записи.");
    const raw = object(JSON.parse(row.config)), entities = object(raw.entities), settings = object(entities["station-settings"]);
    if (!raw.schemaVersion || !entities["system-input"] || !entities["station-settings"]) throw new DataError("Не удалось прочитать технические поля проекта.");
    // Resolve version IDs through D1; never trust values embedded in project JSON.
    const applied = await resolveBaseVersions(object(settings.baseValues).versions);
    const collectors = object(entities["station-collectors"]);
    const data = { origin: "Последняя сохранённая версия собственного проекта D1", savedAt: row.updatedAt,
      primaryInput: pick(entities["system-input"], inputKeys), secondaryInput: pick(entities["system-input-2"], inputKeys),
      settings: { ...pick(settings, settingKeys), manufacturerDiscounts: safeDiscounts(settings.manufacturerDiscounts) },
      dn: pick(entities["station-dn"], dnKeys),
      collectors: Object.fromEntries(["suction", "discharge"].map(side => [side, pick(collectors[side], ["spacing1", "spacing2", "spacing1Manual", "spacing2Manual", "eccentric"])])),
      baseVersions: applied.versions,
    };
    return { data, applied };
  })();
  const scoped = async (scope: string) => scope === "published" ? { ...await published(), origin: "Опубликованные базовые значения" } : { applied: (await project()).applied, origin: access.profile === "beta" ? "Версии текущей beta-вкладки" : "Версии сохранённого текущего проекта", publishedAt: null };

  async function readBase(args: JsonObject) {
    const section = args.section as BaseSection, result = await scoped(String(args.scope)), values = result.applied.values, query = normalize(String(args.query));
    let data: unknown = values[section];
    const matches = (row: unknown) => !query || normalize(JSON.stringify(row)).includes(query);
    if (section === "spacing") {
      data = { ...values.spacing, rules: page(values.spacing.rules.filter(matches).map(({ modelIds, ...rule }) => ({ ...rule, modelCount: modelIds.length })), Number(args.offset), 20) };
    } else if (section === "painting") data = page(values.painting.filter(matches), Number(args.offset), 20);
    else if (section === "preferences") data = { ...values.preferences, rules: page(values.preferences.rules.filter(matches), Number(args.offset), 20) };
    else if (section === "welding") data = { ...values.welding, threadCutting: page((values.welding.threadCutting ?? []).filter(matches), Number(args.offset), 20) };
    return { title: `Базовые значения: ${BASE_LABELS[section]}`, data: { origin: result.origin, version: result.applied.versions[section], publishedAt: result.publishedAt, section, values: data } };
  }
  async function searchPumps(args: JsonObject) {
    const list = await pumps(), query = normalize(String(args.query));
    const exact = list.filter(p => query && [p.id, p.model, `${p.manufacturer} ${p.model}`, p.execution ?? ""].some(value => normalize(value) === query));
    const matches = exact.length ? exact : list.filter(p => !query || [p.id, p.model, p.manufacturer, p.series, `${p.manufacturer} ${p.model}`, p.type, p.article ?? ""].some(value => normalize(value).includes(query)));
    let base: Awaited<ReturnType<typeof scoped>> | undefined, baseError: string | undefined;
    try { base = await scoped(String(args.scope)); } catch (error) { baseError = error instanceof DataError ? error.message : "Версия базовых значений недоступна."; }
    const result = page(matches, Number(args.offset), 5);
    const items = result.items.map(pump => {
      const spacing = base ? spacingForPump(base.applied.values, pump.id) : null;
      const financial = base?.applied.values.financial;
      return { ...pick(pump, ["id", "manufacturer", "series", "model", "execution", "type", "power", "nominalFlow", "minFlow", "maxFlow", "minHead", "maxHead", "medium", "active", "selectable", "article", "price", "priceCurrency", "priceKind", "priceSource", "availability"]),
        units: { power: "кВт", flow: "м³/ч", head: "м", spacing: "мм", weight: "кг" }, physical: pumpCardPhysicalData(pump),
        dimensions: Object.fromEntries(Object.entries(object(pump.dimensions)).slice(0, 35).map(([key,value]) => [key.slice(0,100), number(value) ?? short(value)])),
        priceRubWithBaseDiscount: financial ? cataloguePurchasePriceRub(pump, { usdRate: financial.usdRate, cnyRate: financial.cnyRate, manufacturerDiscounts: { cnp: financial.discounts.cnp ?? 0, aquastrong: financial.discounts.aquastrong ?? 0, ...financial.discounts } }) : null,
        spacing: spacing ? { mm: spacing.spacing, radiusMm: spacing.radius, gapMm: spacing.gap, status: spacing.status, message: spacing.message, ruleId: spacing.rule?.id ?? null, execution: spacing.rule?.execution ?? null, source: spacing.rule?.source ?? null, note: spacing.rule?.note ?? null,
          legacySecondaryMm: spacing.status === "legacy" ? spacingForPump(base!.applied.values, pump.id, true).spacing : null } : null,
      };
    });
    return { title: "Каталог насосов и правила расстояний", data: { ...result, items, exactMatch: exact.length > 0, origin: "Действующий каталог приложения /pumps.json", ruleScope: base?.origin ?? null, baseVersions: base?.applied.versions ?? null, publishedAt: base?.publishedAt ?? null, baseError, note: "Цена и наличие — данные каталога на дату источника, не подтверждение склада. Расстояние вычислено spacingForPump; ручное расстояние проекта проверяйте отдельно через read_current_project." } };
  }
  async function searchEquipment(args: JsonObject) {
    const catalog = String(args.catalog), query = String(args.query), offset = Number(args.offset);
    if (catalog === "collectors" && access.profile !== "full") throw new DataError("База коллекторов недоступна в beta.");
    if (catalog === "components") {
      const source = await currentInsertSource(), terms = query.split(/\s+/).map(normalize).filter(Boolean);
      const matches = source.items.filter(item => { const text = normalize(`${item.id} ${item.family} ${item.catalogId} ${item.fields.map(field => `${field.headerPath.join(" ")} ${String(field.value ?? "")}`).join(" ")}`); return terms.every(term => text.includes(term)); });
      const result = page(matches, offset, 5);
      return { title: "База комплектующих", data: { origin: "Действующий импорт комплектующих D1 (при отсутствии импорта — поставляемый каталог)", databaseRevision: source.databaseRevision, ...result,
        items: result.items.map(item => ({ id: item.id, catalogId: item.catalogId, family: short(item.family), fields: item.fields.slice(0,30).map(field => ({ name: field.headerPath.join(" / ").slice(0,180), value: typeof field.value === "boolean" ? field.value : number(field.value) ?? short(field.value) })), prices: item.prices.slice(0,8).map(price => ({ label: short(price.label), amount: number(price.amount), currency: short(price.currency,10) })) })) } };
    }
    const pattern = `%${query.replace(/[!%_]/g, character => `!${character}`)}%`;
    // Fixed projections and bound values: no SQL, table names or owner IDs supplied by the model.
    const rows = catalog === "insertions"
      ? await db().prepare("SELECT id,name,configuration_json AS configuration,cached_price_microunits AS price,price_updated_at AS pricedAt,catalog_version AS catalogVersion,revision FROM component_insertions WHERE name LIKE ? ESCAPE '!' ORDER BY name,id LIMIT 6 OFFSET ?").bind(pattern,offset).all<JsonObject>()
      : await db().prepare("SELECT id,code AS name,configuration_json AS configuration,cached_price_microunits AS price,price_updated_at AS pricedAt FROM collectors WHERE code LIKE ? ESCAPE '!' ORDER BY code,id LIMIT 6 OFFSET ?").bind(pattern,offset).all<JsonObject>();
    const entries = rows.results ?? [];
    return { title: catalog === "insertions" ? "Сохранённые вставки" : "Сохранённые коллекторы", data: { origin: "Сохранённые изделия D1", offset, nextOffset: entries.length > 5 ? offset + 5 : null, note: "Сохранённая цена может устареть. Это не новый расчёт и не подтверждение наличия.", items: entries.slice(0,5).map(row => ({ ...pick(row,["id","name","pricedAt","catalogVersion","revision"]), savedPriceRub: number(row.price) === null ? null : Number(row.price)/1_000_000, configuration: pick(JSON.parse(String(row.configuration)), ["type","dn","pn","material","connection","eccentric","dnLarge","dnSmall","geometry","construction","baseLengthMm","axialLeftMm","axialRightMm"]) })) } };
  }

  async function run(name: string, rawArguments: string): Promise<string> {
    try {
      if (rawArguments.length > 2000) throw new DataError("Параметры запроса слишком большие.");
      const parsed: unknown = JSON.parse(rawArguments);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new DataError("Некорректные параметры.");
      const args = object(parsed), definition = assistantDataDefinitions.find(item => item.name === name);
      if (!definition) throw new DataError("Такой инструмент недоступен.");
      const keys = Object.keys(definition.parameters.properties);
      if (Object.keys(args).length !== keys.length || keys.some(key => !Object.hasOwn(args,key))) throw new DataError("Некорректный набор параметров.");
      for (const key of keys) {
        const schema = object(definition.parameters.properties[key]), value = args[key];
        if (schema.type === "string" && (typeof value !== "string" || value.length > 120) || schema.type === "integer" && (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 10000) || Array.isArray(schema.enum) && !schema.enum.includes(value)) throw new DataError("Некорректные параметры поиска.");
      }
      const result = name === "read_base_values" ? await readBase(args) : name === "search_pumps" ? await searchPumps(args) : name === "search_equipment" ? await searchEquipment(args) : { title: "Текущий проект", data: (await project()).data };
      const text = JSON.stringify(result.data);
      if (text.length > 24000) throw new DataError("Результат слишком большой. Уточните модель, раздел или название.");
      const id = `DATA-${String(sources.length+1).padStart(3,"0")}`, fetchedAt = new Date().toISOString();
      sources.push({ id, title: `${result.title} · ${fetchedAt.slice(0,16).replace("T"," ")} UTC`, url: "", kind: "data" });
      return JSON.stringify({ citation: id, fetchedAt, data: result.data });
    } catch (error) {
      return JSON.stringify({ error: error instanceof DataError ? error.message : "Источник данных временно недоступен. Не подставляйте неподтверждённые значения." });
    }
  }
  return { definitions: assistantDataDefinitions, run, sources };
}
