import { guardDisabledBetaFeature } from "../../release-server";
import { currentUser, db, json } from "../../auth-server";
import { calculateCollector, collectorCode, collectorStorageCode, configurationWarnings, type CollectorConfiguration } from "../../collector-calculations";
import type { SavedCollector } from "../../collector-project";
import { currentCollectorCatalog } from "../../collector-catalog-server";
import { BaseValuesError, resolveBaseVersions } from "../../base-values-server";
import { applyBaseTariffs } from "../../base-values";
import { applyCollectorSpacingRules, collectorSpacingIsManual } from "../../collector-spacing";
import { canEditAllSettings } from "../../user-types";
import { collectorAccessError } from "../../project-access";
import { collectorInstrumentPortIdentity } from "../../hydraulic-port-ledger";

type Row = { id: string; code: string; configuration_json: string; calculation_json: string; cached_price_microunits: number; price_updated_at: string; source: string };
const mapRow = (row: Row): SavedCollector => {
  const configuration=JSON.parse(row.configuration_json),calculation=JSON.parse(row.calculation_json),code=collectorCode(configuration)??row.code;
  return {id:row.id,code,configuration,calculation:{...calculation,code},price:row.cached_price_microunits/1_000_000,priceUpdatedAt:row.price_updated_at,source:row.source};
};
async function find(code: string) { return db().prepare("SELECT * FROM collectors WHERE code=?").bind(code).first<Row>(); }
function sameExecution(a:CollectorConfiguration,b:CollectorConfiguration) {
  const physical=(c:CollectorConfiguration)=>JSON.stringify({sectionBreaks:c.sectionBreaks??0,dn:c.dn,pn:c.pn,material:c.material,connection:c.connection,eccentric:c.eccentric,circuits:[c.primary,c.secondary].filter(Boolean).map(v=>({dn:v!.dn,pn:v!.pn,connection:v!.connection,spacing:v!.spacing,count:(v!.working??0)+(v!.reserve??0)}))});
  const ports=(c:CollectorConfiguration)=>c.instrumentPorts===undefined?"legacy":collectorInstrumentPortIdentity(c.instrumentPorts);
  return physical(a)===physical(b)&&ports(a)===ports(b);
}
async function findExecution(c:CollectorConfiguration) {
  const code=collectorCode(c)!,storage=collectorStorageCode(c)!,row=await find(storage)??(storage!==code?await find(code):null);
  return row&&sameExecution(JSON.parse(row.configuration_json),c)?row:null;
}

export async function GET(request: Request) {
  const betaDenied = await guardDisabledBetaFeature(request); if (betaDenied) return betaDenied;
  try {
    if (!await currentUser(request)) return json({ error: "Требуется вход." }, 401);
    if (new URL(request.url).searchParams.get("catalog") === "1") return json({ catalog: applyBaseTariffs(await currentCollectorCatalog(),new URL(request.url).searchParams.has("versions") ? await resolveBaseVersions(JSON.parse(new URL(request.url).searchParams.get("versions")!)) : undefined) }, 200, { "Cache-Control": "no-store" });
    const code = new URL(request.url).searchParams.get("code");
    if (!code || code.length > 250) return json({ error: "Не указан канонический код." }, 400);
    const rawConfiguration=new URL(request.url).searchParams.get("configuration");
    if(rawConfiguration&&rawConfiguration.length>20000)return json({error:"Конфигурация слишком большая."},400);
    const configuration=rawConfiguration?parseConfiguration(JSON.parse(rawConfiguration)):null;
    if(rawConfiguration&&(!configuration||collectorCode(configuration)!==code))return json({error:"Код не соответствует конфигурации."},400);
    const row = configuration?await findExecution(configuration):await find(code);
    return json({ collector: row ? mapRow(row) : null }, 200, { "Cache-Control": "no-store" });
  } catch (error) { console.error("Collector lookup failed", error); return json({ error: "База коллекторов недоступна. Проверьте подключение и применение миграции 0005." }, 503); }
}

function parseConfiguration(raw: unknown): CollectorConfiguration | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as CollectorConfiguration;
  if (!c.primary || typeof c.primary !== "object" || (c.secondary !== null && typeof c.secondary !== "object")) return null;
  if (typeof c.simultaneous !== "boolean" || typeof c.jockey !== "boolean" || typeof c.eccentric !== "boolean") return null;
  if (configurationWarnings(c).length) return null;
  return c;
}
export async function POST(request: Request) {
  const betaDenied = await guardDisabledBetaFeature(request); if (betaDenied) return betaDenied;
  try {
    const user = await currentUser(request);
    if (!user) return json({ error: "Требуется вход." }, 401);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return json({ error: "Недопустимый источник запроса." }, 403);
    let body: { action?: string; configuration?: unknown; code?: string };
    try { const text = await request.text(); if (text.length > 20000) return json({ error: "Запрос слишком большой." }, 413); body = JSON.parse(text); } catch { return json({ error: "Некорректный JSON." }, 400); }
    if (!body || !["calculate", "create", "refresh"].includes(body.action ?? "")) return json({ error: "Неизвестное действие." }, 400);
    const rawConfiguration=body.configuration as CollectorConfiguration | undefined;
    const applied=rawConfiguration?.baseVersions ? await resolveBaseVersions(rawConfiguration.baseVersions) : undefined;
    if(rawConfiguration?.primary && typeof rawConfiguration.primary === "object" && (rawConfiguration.secondary === null || typeof rawConfiguration.secondary === "object")){
      if(applied)rawConfiguration.velocityRules=applied.values.velocity;
      else delete rawConfiguration.velocityRules;
      applyCollectorSpacingRules(rawConfiguration,applied?.values);
      if(!canEditAllSettings(user.role)&&[rawConfiguration.primary,rawConfiguration.secondary].some(circuit=>circuit&&(collectorSpacingIsManual(circuit)||circuit.spacingConfirmation)))return json({error:"Ручное межосевое расстояние и его подтверждение доступны с уровня pro."},403);
    }
    const configuration = parseConfiguration(body.configuration);
    if (!configuration) {
      const raw = body.configuration as Partial<CollectorConfiguration> | null;
      const errors = raw && raw.primary && typeof raw.primary === "object" && (raw.secondary === null || typeof raw.secondary === "object") ? configurationWarnings(raw as CollectorConfiguration) : [];
      return json({ error: errors.length ? errors.join("\n") : "Некорректная конфигурация: проверьте DN, соединения, PN и количество насосов." }, 400);
    }
    const accessError = collectorAccessError(configuration, user.role, applied);
    if (accessError) return json({ error: accessError }, 403);
    const catalog = applyBaseTariffs(await currentCollectorCatalog(),applied), calculation = calculateCollector(configuration, catalog), code = collectorCode(configuration)!;
    if (body.action === "calculate") return json({ calculation, catalog });
    if (!calculation.complete || calculation.price === null) return json({ error: "Расчёт неполный", calculation }, 422);
    if (body.code !== code) return json({ error: "Код не соответствует конфигурации." }, 400);
    const storageCode=collectorStorageCode(configuration)!,previous = await findExecution(configuration);
    if (body.action === "create" && previous) return json({ error: "Коллектор уже есть в базе.", collector: mapRow(previous) }, 409);
    if (body.action === "refresh" && !previous) return json({ error: "Коллектор не найден." }, 404);
    // Code does not encode all engineering parameters (e.g. separate circuit PN).
    // Never silently overwrite a different physical assembly sharing that code.
    if (previous) {
      const saved = mapRow(previous).configuration;
      if (!sameExecution(saved,configuration)) return json({ error: "Этот код уже занят другим исполнением PN/соединений/отводов КИП. Проверьте сохранённую конфигурацию." }, 409);
    }
    const id = previous?.id ?? crypto.randomUUID(), timestamp = new Date().toISOString(), database = db(), micro = (v: number) => Math.round(v * 1_000_000);
    const statements = previous ? [database.prepare("UPDATE collectors SET configuration_json=?,calculation_json=?,cached_price_microunits=?,weld_length_mm=?,weld_cost_microunits=?,price_updated_at=? WHERE id=?").bind(JSON.stringify(configuration), JSON.stringify(calculation), micro(calculation.price), calculation.weldLengthMm, micro(calculation.weldCost), timestamp, id), database.prepare("DELETE FROM collector_items WHERE collector_id=?").bind(id)] : [database.prepare("INSERT INTO collectors (id,code,type,configuration_json,calculation_json,cached_price_microunits,weld_length_mm,weld_cost_microunits,source,created_by_user_id,price_updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id, storageCode, configuration.type, JSON.stringify(configuration), JSON.stringify(calculation), micro(calculation.price), calculation.weldLengthMm, micro(calculation.weldCost), "Конструктор коллекторов", user.id, timestamp)];
    for (const [index, item] of calculation.bom.entries()) statements.push(database.prepare("INSERT INTO collector_items (collector_id,role,component_source_id,name,kind,quantity,unit,unit_price_microunits,cost_microunits,source,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id, item.role, item.componentId, item.name, item.kind, item.quantity, item.unit, micro(item.unitPrice!), micro(item.cost!), item.source, index));
    try { const results = await database.batch(statements); if (results.some(result => !result.success)) throw new Error("Collector transaction failed"); } catch (error) {
      if (!previous && await find(storageCode)) return json({ error: "Коллектор уже создан. Обновите сведения из базы." }, 409);
      throw error;
    }
    return json({ collector: mapRow((await findExecution(configuration))!), catalog }, previous ? 200 : 201);
  } catch (error) { if(error instanceof BaseValuesError)return json({error:error.message},error.status); console.error("Collector operation failed", error); return json({ error: "Не удалось выполнить операцию с базой коллекторов. Проверьте миграцию 0005." }, 503); }
}
