import { applyBaseTariffs, paintingItemForBase } from "./base-values";
import type { AssemblyComponent } from "./suction-catalog";
import type { ProjectConfig, SettingsEntity } from "./project-config";
import type { CollectorCatalog } from "./collector-calculations";

export function bindProjectComponents<T extends {items:AssemblyComponent[];collectorCatalog:CollectorCatalog}>(project:ProjectConfig,database:T):T {
  const applied=(project.entities["station-settings"] as SettingsEntity).baseValues;if(!applied)return database;
  const items = database.items.map(item => item.calculatedInsertion ? item : paintingItemForBase(item, applied));
  return {...database,items,collectorCatalog:applyBaseTariffs({...database.collectorCatalog,version:database.collectorCatalog.version.split(":base:")[0]},applied)};
}
