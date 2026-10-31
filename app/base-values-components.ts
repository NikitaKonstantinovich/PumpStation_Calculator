import { applyBaseTariffs, paintingItemForBase, type AppliedBaseValues } from "./base-values";
import { insertionPrice, type CalculatedInsertion } from "./calculated-insertion";
import type { AssemblyComponent } from "./suction-catalog";
import type { ProjectConfig, SettingsEntity } from "./project-config";
import type { CollectorCatalog } from "./collector-calculations";

/** Replace only labour tariffs; unrelated source revisions remain stale. */
export function bindInsertionTariffs(snapshot:CalculatedInsertion, applied:AppliedBaseValues):CalculatedInsertion {
  const s=structuredClone(snapshot),c=s.calculation;
  const core=(version:string)=>version.split(":base:")[0],suffix=applied.versions.welding==="legacy-v1"&&applied.versions.painting==="legacy-v1"?"":`:base:${applied.versions.welding}:${applied.versions.painting}`;
  c.catalogVersion=core(s.catalogVersion)+suffix;s.catalogVersion=c.catalogVersion;
  s.currentCatalogVersion=s.currentCatalogVersion?core(s.currentCatalogVersion)+suffix:null;
  const rate=applied.values.welding[c.material];
  for(const w of c.welds)w.cost=w.lengthMm===null?null:w.lengthMm/1000*rate;
  c.weldCost=c.weldLengthMm===null?null:c.weldLengthMm/1000*rate;
  for(const row of c.bom) {
    if(row.kind==="welding"){row.unitPrice=rate;row.cost=row.quantity===null?null:row.quantity*rate;row.source=`Базовые значения ${applied.versions.welding}, ₽/м`;}
    if(row.kind==="painting") {const tariff=applied.values.painting.find(p=>p.id===row.componentId)??applied.values.painting.find(p=>p.dn===c.dnLarge);row.unitPrice=tariff?.pricePerMeter??null;row.cost=row.quantity===null||row.unitPrice===null?null:row.quantity*row.unitPrice;row.source=tariff?.source??"Тариф не задан";if(row.unitPrice===null){c.complete=false;c.warnings=[...new Set([...c.warnings,"Нет тарифа окраски в применённой версии"])];}}
  }
  c.price=c.complete&&c.bom.every(r=>r.cost!==null)?c.bom.reduce((sum,r)=>sum+r.cost!,0):null;
  return s;
}
export function bindProjectComponents<T extends {items:AssemblyComponent[];collectorCatalog:CollectorCatalog}>(project:ProjectConfig,database:T):T {
  const applied=(project.entities["station-settings"] as SettingsEntity).baseValues;if(!applied)return database;
  const items=database.items.map(item=>{
    if(!item.calculatedInsertion)return paintingItemForBase(item,applied);
    // The loaded catalogue owns product revisions and BOM. A project snapshot
    // must not replace a recalculated product with its earlier stale revision.
    // Only the project's explicit labour tariffs are retained here; physical
    // compatibility with its selected design is checked by the line builder.
    const snapshot=bindInsertionTariffs(item.calculatedInsertion,applied);
    const price=insertionPrice(snapshot);
    return {...item,calculatedInsertion:snapshot,prices:price===null?[]:[{label:"Цена по тарифам проекта, ₽",amount:price,currency:"RUB"}]};
  });
  return {...database,items,collectorCatalog:applyBaseTariffs({...database.collectorCatalog,version:database.collectorCatalog.version.split(":base:")[0]},applied)};
}
