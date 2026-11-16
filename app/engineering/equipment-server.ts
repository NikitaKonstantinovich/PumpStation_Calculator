import { catalogPumpPort } from "../pump-ports";
import type { Pump } from "../pump-catalog";
import {readSavedInsertions,savedInsertionComponent} from "../component-insert-store-server";
import {currentInsertCatalog} from "../component-insert-catalog-server";
import {readManualPumps} from "../manual-pump-server";
import {mergePumpCatalog} from "../pump-catalog-client";
import {assembleComponentDatabase,type RawBindingDatabase,type RawControlDatabase} from "../component-database";
import type {StationSpecificationResources} from "../station-specification";
import { equipmentAsset, readEquipmentCatalog } from "../equipment-catalog-server";
import { equipmentLabel, type EquipmentRow } from "../equipment-admin";
import { makeField, type DataKind, type NodeType } from "./schema";
export async function trialResources():Promise<StationSpecificationResources>{
  async function data<T>(url:string){const response=await equipmentAsset(url);if(!response.ok)throw Error("Каталог недоступен · "+url);return response.json() as Promise<T>;}
  const [base,manual,binding,control,cabinets,saved,catalog]=await Promise.all([data<Pump[]>("/pumps.json"),readManualPumps(),data<RawBindingDatabase>("/binding-components.json"),data<RawControlDatabase&{cabinets:StationSpecificationResources["smartCabinets"]}>("/control-cabinet-database.json"),data<StationSpecificationResources["cabinets"]>("/control-cabinets.json"),readSavedInsertions(),currentInsertCatalog().catch(()=>null)]);
  return {pumps:mergePumpCatalog(base,manual.map(r=>r.pump)),cabinets,smartCabinets:control.cabinets,components:assembleComponentDatabase(binding,control,saved.map(r=>savedInsertionComponent(r,catalog?.version??null)))};
}
const stable = (value: string) => {
  let hash = 2166136261;
  for (const c of value) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
};
export const categoryId = (category: string) => "equipment." + stable(category);
function attributes(row: EquipmentRow) {
  const fields: Record<string, unknown> = {
    ...row.values
  };
  function expand(parent: string, value: unknown, depth: number) {
    if (depth > 8 || !value || typeof value !== "object" || Array.isArray(value)) return;
    for (const [key, child] of Object.entries(value)) {
      const path = parent + "." + key;
      if (!Object.hasOwn(fields, path)) fields[path] = child;
      expand(path, child, depth + 1);
    }
  }
  for (const [key, value] of Object.entries(row.values)) expand(key, value, 1);
  if (row.pump) {
    const pump = row.values as unknown as Pump;
    for (const side of ["inlet", "outlet"] as const) {
      const port = catalogPumpPort(pump.id, side, pump);
      fields[side + "Dn"] = port?.dn ?? null;
      fields[side + ".dn"] = port?.dn ?? null;
      fields[side + ".connection"] = port?.connection ?? null;
    }
  }
  return fields;
}
const attributeKey = (key: string) => /^[a-zA-Z_][\w]*$/.test(key) && !["constructor", "prototype", "__proto__"].includes(key) ? key : "attr_" + stable(key);
export function rowValues(row: EquipmentRow) {
  return Object.fromEntries(Object.entries(attributes(row)).map(([k, v]) => [attributeKey(k), v]));
}
export async function equipmentTypes() {
  const catalog = await readEquipmentCatalog(false);
  const groups = new Map<string, {
    type: NodeType;
    fields: Map<string, ReturnType<typeof makeField>>;
  }>();
  for (const [category, name] of [["collectors", "Коллекторы"], ["insertions", "Расчётные вставки"]]) {
    const id = categoryId(category);
    groups.set(id, {
      type: {
        id,
        name,
        category: "Комплектующие",
        description: name,
        fields: [],
        formulas: {}
      },
      fields: new Map([["id", makeField("id", "Идентификатор", "reference", category)], ["items", makeField("items", "Состав", "array", "components")]])
    });
  }
  for (const row of catalog.rows) {
    const id = categoryId(row.category);
    let group = groups.get(id);
    if (!group) {
      group = {
        type: {
          id,
          name: row.pump ? "Насос" : row.categoryName,
          category: "Комплектующие",
          description: row.categoryName,
          fields: [],
          formulas: {}
        },
        fields: new Map()
      };
      groups.set(id, group);
    }
    for (const [raw, v] of Object.entries(attributes(row))) {
      const key = attributeKey(raw);
      if (v == null || group.fields.has(key)) continue;
      const kind: DataKind = Array.isArray(v) ? "array" : typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : typeof v === "object" ? "object" : "string";
      const name = raw.split(".").map(k => equipmentLabel(k)).join(" → ");
      const dn = ["inletDn", "outletDn", "dn", "inlet.dn", "outlet.dn"].includes(raw) || /^DN$/i.test(raw),
        pn = /^PN$/i.test(raw);
      group.fields.set(key, makeField(key, name, kind, dn ? "dn" : pn ? "pn" : key === "weightKg" ? "mass" : key, key === "weightKg" ? "кг" : ""));
    }
  }
  return [...groups.values()].map(({
    type,
    fields
  }) => ({
    ...type,
    fields: [...fields.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"))
  }));
}
export async function equipmentSamples(category: string, search: string, id?: string) {
  const {
    rows
  } = await readEquipmentCatalog(false);
  const filtered = rows.filter(r => categoryId(r.category) === category);
  if (id) {
    const row = filtered.find(r => r.key === id);
    return row ? {
      name: row.name,
      values: rowValues(row)
    } : null;
  }
  const query = search.trim().toLowerCase();
  return filtered.filter(r => !query || r.name.toLowerCase().includes(query)).slice(0, 45).map(r => ({
    id: r.key,
    name: r.name
  }));
}
