import { env } from "cloudflare:workers";
import {storageOperation} from "./project-storage-server";
import { db } from "./auth-server";
import { BASE_SECTIONS, BASE_LABELS, baseSnapshot, spacingForPump, type AppliedBaseValues, type BaseSection } from "./base-values";
import { currentBasePublication, resolveBaseVersions } from "./base-values-server";
import { cataloguePurchasePriceRub, type Pump } from "./pump-catalog";
import { readManualPumps } from "./manual-pump-server";
import { mergePumpCatalog } from "./pump-catalog-client";
import { pumpCardPhysicalData } from "./pump-card-data";
import { currentInsertSource } from "./component-insert-catalog-server";
import { searchProgramDocumentation } from "./assistant-knowledge-server";
import { assistantInputKeys, assistantProductPins, assistantProjectSnapshot } from "./assistant-project";
import type { WorkspaceData } from "./node-tools/schema";
import type { AssistantContext, AssistantSource } from "./assistant-types";
import { canUseGeometry, type UserRole } from "./user-types";

export type AssistantDataAccess = { userId: string; role: UserRole; profile: "full" | "beta"; context?: AssistantContext };
type JsonObject = Record<string, unknown>;
type AssistantProjectData = { data: JsonObject; applied: AppliedBaseValues; product?: NonNullable<ReturnType<typeof assistantProductPins>>; specification?: ReturnType<typeof assistantProjectSnapshot>["specification"] };
const object = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
const short = (value: unknown, limit = 400) => typeof value === "string" ? value.slice(0, limit) : null;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const normalize = (value: string) => value.toLowerCase().replaceAll("ё", "е").replace(/с/g,"c").replace(/м/g,"m").replace(/д/g,"d").replace(/[^\p{L}\p{N}]+/gu, "");
const pick = (value: unknown, keys: string[]) => Object.fromEntries(keys.map(key => {
  const item = object(value)[key];
  return [key, typeof item === "string" ? item.slice(0, 300) : typeof item === "boolean" ? item : number(item)];
}));
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
  tool("search_equipment", "Читать базу комплектующих и сохранённых изделий. project_components — закреплённый каталог комплектации нодового проекта (full); components — действующий каталог D1; insertions — сохранённые расчётные вставки; collectors — сохранённые коллекторы (full); inventory — административная база. Цены сохранённых изделий действительны на дату расчёта.", { catalog: { type: "string", enum: ["project_components", "components", "insertions", "collectors", "inventory"] }, query: querySchema, offset: offsetSchema }),
  tool("read_current_project", "Прочитать текущие результаты нодового продукта: закреплённый алгоритм и справочники, значения параметров, насосы, Q/H, DN, коллекторы, межосевые расстояния, диагностика и итог спецификации. Снимок вкладки может содержать ещё не сохранённые правки. Beta: параметры подбора насосов.", {}),
  tool("read_project_specification", "Прочитать строки и состояние спецификации открытого проекта (full). Цена строки за единицу в рублях. Поиск по разделу, позиции, названию или ID; пустой запрос для всех строк.", { query: querySchema, offset: offsetSchema }),
  tool("search_product_algorithms", "Найти подключённые продукты библиотеки алгоритмов и их текущие публикации. Пустой query перечисляет продукты.", { query: querySchema, offset: offsetSchema }),
  tool("read_product_algorithm", "Прочитать действующий нодовый граф. scope=project выбирает закреплённую версию открытого проекта, algorithmId при этом пустой. Для scope=published укажи ID из search_product_algorithms. Пустой tool перечисляет инструменты и зависимости. С tool вернутся узлы, входные связи и формулы. query — имя, ID или ключевое слово, пустой для всех узлов.", { scope: scopeSchema, algorithmId: { type: "string" }, tool: { type: "string" }, query: querySchema, offset: offsetSchema }),
  tool("search_program_documentation", "Найти разделы актуального руководства и технической документации. query — ключевые слова, document — ID из результата или пустая строка для поиска по всем документам. Ссылайся на citation.", { query: querySchema, document: { type: "string" }, offset: offsetSchema }),
];

export function createAssistantDataTools(access: AssistantDataAccess) {
  const sources: AssistantSource[] = [];
  let dataReads = 0;
  let publishedPromise: Promise<{ applied: AppliedBaseValues; publishedAt: string }> | undefined;
  let projectPromise: Promise<AssistantProjectData> | undefined;
  let pumpsPromise: Promise<Pump[]> | undefined;
  const published = () => publishedPromise ??= currentBasePublication().then(publication => ({ applied: baseSnapshot(publication.id, publication.values), publishedAt: publication.createdAt }));
  const pumps = () => pumpsPromise ??= (async () => {
    const assets = (env as unknown as { ASSETS?: { fetch: typeof fetch } }).ASSETS;
    if (!assets) throw new DataError("Каталог насосов недоступен.");
    const response = await assets.fetch("https://assets.local/pumps.json");
    if (!response.ok) throw new DataError("Каталог насосов недоступен.");
    const result = await response.json();
    if (!Array.isArray(result)) throw new DataError("Каталог насосов имеет неверный формат.");
    return mergePumpCatalog(result as Pump[], (await readManualPumps()).map(record => record.pump));
  })();
  async function nodeProject(snapshot: ReturnType<typeof assistantProjectSnapshot>, origin: string) {
    const { versions, specification, ...summary } = snapshot;
    const applied = await resolveBaseVersions(Object.keys(versions).length ? versions : undefined);
    if (!canUseGeometry(access.role)) summary.settings.geometryEnabled = false;
    const { items, ...readiness } = specification;
    return { applied, product: summary.product, specification,
      data: { origin, ...summary, specification: { ...readiness, availableRows: items.length }, baseVersions: applied.versions } };
  }

  const project = (): Promise<AssistantProjectData> => projectPromise ??= (async () => {
    const context = access.context;
    if (access.profile === "beta") {
      if (!context?.beta || context.projectId || context.workspace) throw new DataError("Параметры текущей beta-вкладки не переданы.");
      const applied = await resolveBaseVersions(context.beta.versions);
      return { applied, data: { origin: "Текущая beta-вкладка, ввод пользователя; это не сохранённый проект D1", input: pick(context.beta.input, assistantInputKeys), baseVersions: applied.versions } };
    }
    if (!context?.projectId) throw new DataError("Текущий проект не передан. Для общего вопроса используйте опубликованные правила.");
    if (context.workspace && assistantProductPins(object(context.workspace).product)) return nodeProject(assistantProjectSnapshot(context.workspace), "Открытый нодовый продукт, снимок вкладки на момент вопроса");
    const response=await storageOperation(access.userId,{action:"load",id:context.projectId});
    if (!response.ok) throw new DataError("Текущий проект не сохранён или недоступен этой учётной записи.");
    const row=await response.json() as {config:unknown;updatedAt:string};
    const raw=object(row.config), entities=object(raw.entities), settings=object(entities["station-settings"]);
    if (raw.workspace2) {
      const workspace = raw.workspace2 as WorkspaceData;
      if (!workspace.product) throw new DataError("В проекте не закреплена публикация продукта. Примените версию в рабочем пространстве.");
      const { readSavedNodeWorkspace } = await import("./node-tools/assistant-server");
      return nodeProject(await readSavedNodeWorkspace(workspace, access.role), "Последняя сохранённая версия нодового проекта PostgreSQL");
    }
    if (!raw.schemaVersion || !entities["system-input"] || !entities["station-settings"]) throw new DataError("Не удалось прочитать технические поля проекта.");
    // Resolve version IDs through D1; never trust values embedded in project JSON.
    const applied = await resolveBaseVersions(object(settings.baseValues).versions);
    const collectors = object(entities["station-collectors"]);
    const data = { origin: "Последняя сохранённая версия собственного проекта PostgreSQL", savedAt: row.updatedAt,
      primaryInput: pick(entities["system-input"], assistantInputKeys), secondaryInput: pick(entities["system-input-2"], assistantInputKeys),
      settings: { ...pick(settings, settingKeys), manufacturerDiscounts: safeDiscounts(settings.manufacturerDiscounts) },
      dn: pick(entities["station-dn"], dnKeys),
      collectors: Object.fromEntries(["suction", "discharge"].map(side => [side, pick(collectors[side], ["spacing1", "spacing2", "spacing1Manual", "spacing2Manual", "eccentric"])])),
      baseVersions: applied.versions,
    };
    return { data, applied };
  })();
  const scoped = async (scope: string) => scope === "published" ? { ...await published(), origin: "Опубликованные базовые значения" } : { applied: (await project()).applied, origin: "Закреплённые версии текущего проекта или beta-вкладки", publishedAt: null };

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
    if (args.scope === "project" && access.profile === "full" && (await project().catch(() => undefined))?.product) {
      const { product } = await project();
      const pin = product?.sourceVersions.pump_catalog_v2;
      if (!pin) throw new DataError("Каталог насосов не закреплён за этим продуктом.");
      const { catalogSnapshot } = await import("./node-tools/catalog-server");
      const snapshot = await catalogSnapshot(pin);
      const query = normalize(String(args.query));
      const exact = snapshot.items.filter(({ pump, variantId, modelId }) => query && [pump.id, pump.model, `${pump.manufacturer} ${pump.model}`, variantId, modelId].some(value => normalize(value) === query));
      const matching = exact.length ? exact : snapshot.items.filter(({ pump, variantId }) => !query || normalize(`${pump.manufacturer} ${pump.series} ${pump.model} ${pump.article ?? ""} ${variantId}`).includes(query));
      const result = page(matching, Number(args.offset), 5);
      return { title: "Закреплённый каталог насосов продукта", data: { snapshot: snapshot.id, created: snapshot.created, exactMatch: exact.length > 0, ...result,
        items: result.items.map(({ pump, variantId, modelId, frequencyHz }) => ({ ...pick(pump, ["manufacturer", "model", "series", "power", "minFlow", "maxFlow", "minHead", "maxHead", "medium", "article", "price", "priceCurrency", "availability"]), variantId, modelId, frequencyHz, physical: pumpCardPhysicalData(pump) })) } };
    }
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
    if (catalog === "inventory") {
      if (access.role !== "admin") throw new DataError("Административная база комплектующих доступна с ролью admin.");
      const { readEquipmentCatalog } = await import("./equipment-catalog-server");
      const { rows } = await readEquipmentCatalog();
      const terms = query.split(/\s+/).map(normalize).filter(Boolean);
      const keys = ["id", "article", "manufacturer", "model", "family", "name", "code", "dn", "pn", "material", "weightKg", "price", "priceCurrency", "currentPrice", "currency", "cachedPrice", "cachedTotal", "priceUpdatedAt"];
      const items = rows.filter(row => !row.pump && (access.profile === "full" || row.category !== "collectors")).map(row => {
        const attributes = Object.entries(row.values).filter(([key, value]) => /(?:артикул|масса|диаметр|толщина|длина|материал|давление|\bDN\b|\bPN\b)/i.test(key) && (typeof value === "string" || typeof value === "number"));
        return {
          key: row.key, category: row.categoryName, name: short(row.name, 180), active: row.active, incomplete: row.incomplete,
          details: pick(row.values, keys), attributes: Object.fromEntries(attributes.slice(0, 20).map(([key, value]) => [key.slice(0, 120), number(value) ?? short(value, 180)])),
        };
      }).filter(item => { const text = normalize(JSON.stringify(item)); return terms.every(term => text.includes(term)); });
      return { title: "База комплектующих администратора", data: page(items, offset, 5) };
    }
    if (catalog === "components" || catalog === "project_components") {
      const terms = query.split(/\s+/).map(normalize).filter(Boolean);
      const getSource = async () => {
        if (catalog === "components") return { ...await currentInsertSource(), origin: "Действующий импорт комплектующих D1" };
        if (access.profile !== "full") throw new DataError("Снимок комплектации продукта доступен в full.");
        const { product, applied } = await project(), pin = product?.sourceVersions.station_catalog;
        if (!pin) throw new DataError("Справочники комплектации не закреплены за этим продуктом.");
        const { stationCatalogSnapshot } = await import("./node-tools/station-catalog-server");
        const snapshot = await stationCatalogSnapshot(pin, applied.versions);
        return { items: snapshot.components.items, databaseRevision: snapshot.id, origin: "Закреплённые справочники комплектации продукта" };
      };
      const source = await getSource();
      const matches = source.items.filter(item => { const text = normalize(`${item.id} ${item.family} ${item.catalogId} ${item.fields.map(field => `${field.headerPath.join(" ")} ${String(field.value ?? "")}`).join(" ")}`); return terms.every(term => text.includes(term)); });
      const result = page(matches, offset, 5);
      return { title: "База комплектующих", data: { origin: source.origin, databaseRevision: source.databaseRevision, ...result,
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

  async function readSpecification(args: JsonObject) {
    if (access.profile !== "full") throw new DataError("Спецификация недоступна в beta.");
    const { specification } = await project();
    if (!specification) throw new DataError("Строки спецификации не переданы из рабочей вкладки.");
    const query = normalize(String(args.query));
    const { items, ...summary } = specification;
    const matching = items.filter(item => !query || normalize(`${item.position} ${item.name} ${item.section} ${item.details} ${item.equipmentId}`).includes(query));
    return { title: "Спецификация открытого проекта", data: { ...summary, availableRows: items.length, ...page(matching, Number(args.offset), 15) } };
  }

  const handlers = {
    read_base_values: readBase,
    search_pumps: searchPumps,
    search_equipment: searchEquipment,
    read_current_project: async () => ({ title: "Текущий проект", data: (await project()).data }),
    read_project_specification: readSpecification,
    search_product_algorithms: async (args: JsonObject) => {
      if (access.profile !== "full") throw new DataError("Библиотека нодовых продуктов доступна в full.");
      const { searchPublishedAlgorithms } = await import("./node-tools/assistant-server");
      return { title: "Библиотека алгоритмов продуктов", data: await searchPublishedAlgorithms(String(args.query), Number(args.offset)) };
    },
    read_product_algorithm: async (args: JsonObject) => {
      if (access.profile !== "full") throw new DataError("Библиотека нодовых продуктов доступна в full.");
      const current = args.scope === "project" ? (await project()).product : undefined;
      const id = current?.algorithmId ?? String(args.algorithmId);
      if ((args.scope === "project" && !current) || !/^[\w.-]{1,100}$/.test(id)) throw new DataError("Укажите доступный продукт с закреплённой версией или ID из библиотеки.");
      const { readAlgorithmGraph } = await import("./node-tools/assistant-server");
      return { title: "Нодовый алгоритм продукта", data: await readAlgorithmGraph(id, current?.version, String(args.tool), String(args.query), Number(args.offset)) };
    },
  };

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
      if (name === "search_program_documentation") {
        const { sources: documents, ...result } = searchProgramDocumentation(String(args.query), String(args.document), Number(args.offset), access.role, access.profile);
        sources.push(...documents);
        return JSON.stringify(result);
      }
      const result = await handlers[name as keyof typeof handlers](args);
      const text = JSON.stringify(result.data);
      if (text.length > 24000) throw new DataError("Результат слишком большой. Уточните модель, раздел или название.");
      const id = `DATA-${String(++dataReads).padStart(3,"0")}`, fetchedAt = new Date().toISOString();
      sources.push({ id, title: `${result.title} · ${fetchedAt.slice(0,16).replace("T"," ")} UTC`, url: "", kind: "data" });
      return JSON.stringify({ citation: id, fetchedAt, data: result.data });
    } catch (error) {
      return JSON.stringify({ error: error instanceof DataError ? error.message : "Источник данных временно недоступен. Не подставляйте неподтверждённые значения." });
    }
  }
  const definitions = access.profile === "full" ? assistantDataDefinitions : assistantDataDefinitions.filter(definition => !["read_project_specification", "search_product_algorithms", "read_product_algorithm"].includes(definition.name));
  return { definitions, run, sources };
}
