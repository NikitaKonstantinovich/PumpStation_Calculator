import { env } from "cloudflare:workers";
import { db } from "./auth-server";
import { readManualPumps } from "./manual-pump-server";
import { mergePumpCatalog } from "./pump-catalog-client";
import { genericEquipment, pumpEquipment, type EquipmentCatalog } from "./equipment-admin";
import type { Pump } from "./pump-catalog";
import physicalSupplement from "./pump-card-supplement.json";
import { pumpSketchFor } from "./pump-sketches";
import { suctionCatalogItems } from "./suction-catalog";
import { withEquipmentCadSources } from "./equipment-cad-sources";

type RecordData = Record<string, unknown>;
type BindingData = {items: RecordData[]; catalogs?: Array<{id:string;name:string}>};
export async function equipmentAsset(path: string, method = "GET") {
  return (env as unknown as {ASSETS: Fetcher}).ASSETS.fetch(new Request(`http://equipment.internal${path}`, {method}));
}
async function assetJson<T>(path: string): Promise<T> {
  const response = await equipmentAsset(path);
  if (!response.ok || !response.headers.get("content-type")?.includes("json")) throw new Error(`Не удалось прочитать ${path}`);
  return response.json() as Promise<T>;
}
async function all(sql: string, ...args: (string | number)[]) {
  const result = await db().prepare(sql).bind(...args).all<RecordData>();
  if (!result.success) throw new Error("Не удалось прочитать каталог оборудования.");
  return result.results ?? [];
}
function decode(row: RecordData): RecordData {
  return Object.fromEntries(Object.entries(row).map(([key,value]) => {
    const name = key.replace(/_json$/, "").replace(/_microunits$/, "").replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    return [name,key.endsWith("_json") && typeof value === "string" ? JSON.parse(value) : key.endsWith("_microunits") && typeof value === "number" ? value / 1_000_000 : key === "is_active" ? Boolean(value) : value];
  }));
}
async function bindingCatalog(): Promise<BindingData> {
  const active = await db().prepare("SELECT id FROM catalog_imports WHERE is_active=1 ORDER BY imported_at DESC,id DESC LIMIT 1").first<{id:number}>();
  if (!active) {
    const [full, supplement] = await Promise.all([assetJson<BindingData>("/binding-components.json"), assetJson<BindingData>("/component-insert-source.json")]);
    const rows = new Map(full.items.map(item => [item.id,item]));
    for (const item of supplement.items) rows.set(item.id,{...rows.get(item.id),...item});
    return {...full,items:[...rows.values()]};
  }
  // Deliberately includes inactive records and every typed attribute (including dates and false).
  const [items, fields, prices, catalogs] = await Promise.all([
    all("SELECT c.*,c.source_id AS sourceId,cat.source_id AS catalogId,f.source_id AS tableId,f.title AS family,cat.source_sheet AS sourceSheet FROM components c JOIN component_families f ON f.id=c.family_id JOIN component_catalogs cat ON cat.id=f.catalog_id WHERE cat.import_id=? ORDER BY c.id",active.id),
    all("SELECT v.*,a.source_column AS sourceColumn,a.header_path_json AS headerPath,a.unit FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id JOIN component_families f ON f.id=a.family_id JOIN component_catalogs cat ON cat.id=f.catalog_id WHERE cat.import_id=? ORDER BY v.id",active.id),
    all("SELECT p.* FROM component_prices p JOIN components c ON c.id=p.component_id JOIN component_families f ON f.id=c.family_id JOIN component_catalogs cat ON cat.id=f.catalog_id WHERE cat.import_id=?",active.id),
    all("SELECT source_id AS id,name FROM component_catalogs WHERE import_id=?",active.id),
  ]);
  const byComponent = (rows:RecordData[]) => {
    const map = new Map<unknown,RecordData[]>();
    for (const row of rows) { const list = map.get(row.component_id) ?? []; list.push(row); map.set(row.component_id,list); }
    return map;
  };
  const fieldMap=byComponent(fields),priceMap=byComponent(prices);
  return {catalogs:catalogs as BindingData["catalogs"],items:items.map(item => ({...decode(item),id:item.sourceId,
    fields:(fieldMap.get(item.id) ?? []).map(field => ({...decode(field),column:field.sourceColumn,headerPath:JSON.parse(String(field.headerPath)),value:field.numeric_value ?? field.text_value ?? (field.boolean_value == null ? null : Boolean(field.boolean_value)) ?? field.date_value ?? (typeof field.json_value === "string" ? JSON.parse(field.json_value) : null)})),
    prices:(priceMap.get(item.id) ?? []).map(price => ({...decode(price),amount:Number(price.amount_microunits)/Number(price.scale)})),
  }))};
}

async function controlCatalog() {
  // Full local profiles can use the published cabinet catalogue without the
  // optional SQL configurator. Distinguish that supported layout from a broken
  // database: query failures or a partially installed schema must still fail.
  const tables=await all("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('control_cabinets','control_components','control_cabinet_items')");
  if(!tables.length)return [[],[],[]] as RecordData[][];
  if(tables.length!==3)throw new Error("SQL-каталог шкафов установлен не полностью: отсутствуют связанные таблицы.");
  return Promise.all([all("SELECT * FROM control_cabinets"),all("SELECT * FROM control_components"),all("SELECT * FROM control_cabinet_items")]);
}

async function readCatalog(): Promise<EquipmentCatalog> {
  const [pumps, manual, binding, standardCabinets, electrical, [cabinets,controlParts,cabinetItems], collectors, collectorItems, insertions] = await Promise.all([
    assetJson<Pump[]>("/pumps.json"),readManualPumps(),bindingCatalog(),assetJson<RecordData[]>("/control-cabinets.json"),
    assetJson<{components:RecordData[];cabinets:RecordData[]}>("/control-cabinet-database.json"),
    controlCatalog(),
    all("SELECT * FROM collectors"),all("SELECT * FROM collector_items"),all("SELECT * FROM component_insertions"),
  ]);
  const categoryNames = new Map(binding.catalogs?.map(c => [c.id,c.name]));
  categoryNames.set("ответные-части","Ответные части и американки");
  const rows = mergePumpCatalog(pumps,manual.map(record=>record.pump)).map(pump=>{
    const row=pumpEquipment(pump),extra=(physicalSupplement as Record<string,unknown>)[pump.id];
    if(extra)row.values["Дополнительные физические характеристики"]=extra;
    const sketch=pumpSketchFor(pump);
    if(!row.sources.drawing&&sketch){row.sources.drawing=sketch.src;row.values["Каталожный чертёж"]={"Описание":sketch.caption,"Источник":sketch.source};}
    return row;
  });
  const componentRows=new Map([...suctionCatalogItems,...binding.items].map(item=>[item.id,item]));
  rows.push(...[...componentRows.values()].map(item=>genericEquipment("equipment",`binding:${item.catalogId}`,categoryNames.get(String(item.catalogId)) ?? String(item.catalogId),item)));
  rows.push(...standardCabinets.map(item=>genericEquipment("cabinet","cabinets","Шкафы управления",item)));
  rows.push(...(cabinets.length ? cabinets.map(row=>({...decode(row),items:cabinetItems.filter(item=>item.cabinet_id===row.id).map(decode)})) : electrical.cabinets).map(row=>genericEquipment("control-cabinet","cabinets","Шкафы управления",row)));
  rows.push(...(controlParts.length ? controlParts.map(decode) : electrical.components).map(row=>genericEquipment("control-part",`electrical:${row.category}`,`Электрика · ${row.category}`,row)));
  rows.push(...collectors.map(row=>genericEquipment("collector","collectors","Коллекторы",{...decode(row),name:row.code,items:collectorItems.filter(item=>item.collector_id===row.id).map(decode)})));
  rows.push(...insertions.map(row=>genericEquipment("insertion","insertions","Расчётные вставки",decode(row))));
  return {rows:rows.map(withEquipmentCadSources),warnings:[]};
}
// Short request-coalescing cache avoids rereading large catalogues for every file probe.
let cached: {until:number; pending:Promise<EquipmentCatalog>} | undefined;
export function readEquipmentCatalog(fresh = false) {
  if (fresh || !cached || cached.until < Date.now()) {
    const pending=readCatalog(); cached={until:Date.now()+15_000,pending};
    pending.catch(()=>{ if(cached?.pending===pending)cached=undefined; });
  }
  return cached.pending;
}
