import { currentUser, db, json } from "../../auth-server";

type CabinetRow={
  id:string;configurationKey:string;stationType:"fire"|"utility"|"combined"|"smart";name:string;
  pumpCount:number;pumpPowerKw:number;breakerCurrentA:number;incomingSwitchCurrentA:number;
  contactorCount:number;vfdCount:number;vfdPowerKw:number;enclosureDimensions:string;
  assemblyKitType:string;laborHours:number;laborRate:number;cachedTotalMicrounits:number;
  currentTotalMicrounits:number;source:string;priceUpdatedAt:string;
};
type ItemRow={
  cabinetId:string;role:string;componentGroup:"dynamic"|"static";quantity:number;sortOrder:number;componentId:string;category:string;
  manufacturer:string|null;article:string|null;name:string;componentType:string|null;
  attributesJson:string;currentPriceMicrounits:number|null;currency:string;
};
type CreateBody={
  action?:"create"|"refresh";
  cabinetId?:string;
  cabinet?:Omit<CabinetRow,"id"|"cachedTotalMicrounits"|"currentTotalMicrounits"|"source"|"priceUpdatedAt"> & {
    id:string;configurationKey:string;cachedTotal:number;source?:string;
    items:Array<{componentId:string;role:string;componentGroup?:"dynamic"|"static";quantity:number;sortOrder:number}>;
  };
};

const amount=(microunits:number|null|undefined)=>typeof microunits==="number"?Math.round(microunits)/1_000_000:null;
const finite=(value:unknown)=>typeof value==="number"&&Number.isFinite(value);
const mapCabinets=(cabinetRows:CabinetRow[],itemRows:ItemRow[])=>cabinetRows.map(row=>({
  id:row.id,configurationKey:row.configurationKey,stationType:row.stationType,name:row.name,
  pumpCount:row.pumpCount,pumpPowerKw:row.pumpPowerKw,breakerCurrentA:row.breakerCurrentA,
  incomingSwitchCurrentA:row.incomingSwitchCurrentA,contactorCount:row.contactorCount,
  vfdCount:row.vfdCount,vfdPowerKw:row.vfdPowerKw,enclosureDimensions:row.enclosureDimensions,
  assemblyKitType:row.assemblyKitType,laborHours:row.laborHours,laborRate:row.laborRate,
  cachedTotal:amount(row.cachedTotalMicrounits),currentTotal:amount(row.currentTotalMicrounits),
  source:row.source,priceUpdatedAt:row.priceUpdatedAt,
  items:itemRows.filter(item=>item.cabinetId===row.id).sort((a,b)=>a.sortOrder-b.sortOrder).map(item=>({
    role:item.role,componentGroup:item.componentGroup,quantity:item.quantity,sortOrder:item.sortOrder,componentId:item.componentId,
    currentCost:amount(item.currentPriceMicrounits===null?null:item.currentPriceMicrounits*item.quantity),
    component:{id:item.componentId,category:item.category,manufacturer:item.manufacturer,article:item.article,
      name:item.name,componentType:item.componentType,attributes:JSON.parse(item.attributesJson||"{}"),
      currentPrice:amount(item.currentPriceMicrounits),currency:item.currency},
  })),
}));

async function readCabinets(stationType:string){
  const database=db();
  const cabinets=await database.prepare(`SELECT
    c.id,c.configuration_key AS configurationKey,c.station_type AS stationType,c.name,
    c.pump_count AS pumpCount,c.pump_power_kw AS pumpPowerKw,c.breaker_current_a AS breakerCurrentA,
    c.incoming_switch_current_a AS incomingSwitchCurrentA,c.contactor_count AS contactorCount,
    c.vfd_count AS vfdCount,c.vfd_power_kw AS vfdPowerKw,c.enclosure_dimensions AS enclosureDimensions,
    c.assembly_kit_type AS assemblyKitType,c.labor_hours AS laborHours,c.labor_rate AS laborRate,
    c.cached_total_microunits AS cachedTotalMicrounits,
    COALESCE(SUM(cc.current_price_microunits*ci.quantity),0) AS currentTotalMicrounits,
    c.source,c.price_updated_at AS priceUpdatedAt
    FROM control_cabinets c
    LEFT JOIN control_cabinet_items ci ON ci.cabinet_id=c.id
    LEFT JOIN control_components cc ON cc.id=ci.component_id
    WHERE c.station_type=?
    GROUP BY c.id ORDER BY c.pump_count,c.pump_power_kw`).bind(stationType).all<CabinetRow>();
  const ids=(cabinets.results??[]).map(item=>item.id);
  if(!ids.length)return [];
  const placeholders=ids.map(()=>"?").join(",");
  const items=await database.prepare(`SELECT ci.cabinet_id AS cabinetId,ci.role,ci.component_group AS componentGroup,ci.quantity,ci.sort_order AS sortOrder,
    cc.id AS componentId,cc.category,cc.manufacturer,cc.article,cc.name,cc.component_type AS componentType,
    cc.attributes_json AS attributesJson,cc.current_price_microunits AS currentPriceMicrounits,cc.currency
    FROM control_cabinet_items ci JOIN control_components cc ON cc.id=ci.component_id
    WHERE ci.cabinet_id IN (${placeholders}) ORDER BY ci.cabinet_id,ci.sort_order`).bind(...ids).all<ItemRow>();
  return mapCabinets(cabinets.results??[],items.results??[]);
}

export async function GET(request:Request){
  const user=await currentUser(request);if(!user)return json({error:"Требуется вход."},401);
  const stationType=new URL(request.url).searchParams.get("stationType")??"smart";
  if(!["fire","utility","combined","smart"].includes(stationType))return json({error:"Неизвестный тип шкафа."},400);
  try{return json({cabinets:await readCabinets(stationType)});}
  catch{return json({error:"SQL-база шкафов ещё не инициализирована."},503);}
}

export async function POST(request:Request){
  const user=await currentUser(request);if(!user)return json({error:"Требуется вход."},401);
  let body:CreateBody;
  try{body=await request.json() as CreateBody;}catch{return json({error:"Запрос не содержит корректную конфигурацию шкафа."},400);}
  if(body.action!=="refresh")return json({error:"Создание новых шкафов для насосных станций SMART отключено."},405);
  const database=db();
  if(body.action==="refresh"){
    if(!body.cabinetId)return json({error:"Не указан шкаф."},400);
    try{
      const result=await database.prepare(`UPDATE control_cabinets SET
        cached_total_microunits=CAST(ROUND((SELECT COALESCE(SUM(cc.current_price_microunits*ci.quantity),0)
          FROM control_cabinet_items ci JOIN control_components cc ON cc.id=ci.component_id
          WHERE ci.cabinet_id=control_cabinets.id)) AS INTEGER),
        price_updated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.cabinetId).run();
      if(!result.success)return json({error:"Не удалось обновить стоимость."},500);
      const cabinets=await readCabinets("smart");
      return json({cabinet:cabinets.find(item=>item.id===body.cabinetId)});
    }catch{return json({error:"SQL-база шкафов не инициализирована. Примените миграцию 0002."},503);}
  }
  const cabinet=body.cabinet;
  if(!cabinet||cabinet.stationType!=="smart"||!cabinet.id||!cabinet.configurationKey||!cabinet.name
    ||!Number.isInteger(cabinet.pumpCount)||cabinet.pumpCount<1||!finite(cabinet.pumpPowerKw)||cabinet.pumpPowerKw<=0
    ||!Array.isArray(cabinet.items)||!cabinet.items.length||!finite(cabinet.cachedTotal)||cabinet.cachedTotal<=0)
    return json({error:"Некорректная конфигурация шкафа."},400);
  let duplicate:{id:string}|null;
  try{duplicate=await database.prepare("SELECT id FROM control_cabinets WHERE configuration_key=?").bind(cabinet.configurationKey).first<{id:string}>();}
  catch{return json({error:"SQL-база шкафов не инициализирована. Примените миграцию 0002."},503);}
  if(duplicate)return json({error:"Такая конфигурация уже существует.",cabinetId:duplicate.id},409);
  const statements=[
    database.prepare(`INSERT INTO control_cabinets
      (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,
      contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,
      cached_total_microunits,source,created_by_user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        cabinet.id,cabinet.configurationKey,cabinet.stationType,cabinet.name,cabinet.pumpCount,cabinet.pumpPowerKw,
        cabinet.breakerCurrentA,cabinet.incomingSwitchCurrentA,cabinet.contactorCount,cabinet.vfdCount,
        cabinet.vfdPowerKw,cabinet.enclosureDimensions,cabinet.assemblyKitType,cabinet.laborHours,cabinet.laborRate,
        Math.round(cabinet.cachedTotal*1_000_000),cabinet.source??"Конфигуратор ШУ",user.id,
      ),
    ...cabinet.items.map(item=>database.prepare(`INSERT INTO control_cabinet_items
      (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES (?,?,?,?,?,?)`).bind(
        cabinet.id,item.componentId,item.role,item.componentGroup==="static"?"static":"dynamic",item.quantity,item.sortOrder,
      )),
  ];
  try{
    const results=await database.batch(statements);
    if(results.some(result=>!result.success))throw new Error();
    const cabinets=await readCabinets("smart");
    return json({cabinet:cabinets.find(item=>item.id===cabinet.id)},201);
  }catch{return json({error:"Не удалось сохранить шкаф в SQL-базу."},500);}
}
