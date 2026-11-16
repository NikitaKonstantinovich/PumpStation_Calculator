import type { ComponentItem } from "./component-database-types";
import { readComponentMass, isLinearMassUnit } from "./component-mass";
import reference from "../data/component-mass-reference.json";
import completion from "../data/component-mass-completion.json";
import { tankValve20 } from "./tank-connection";
import flangeHardware from "../data/flange-hardware-supplement.json";
import { massBomSupplements } from "./component-mass-supplement";
import { manufacturingMass } from "./component-mass-manufacturing";
type Bom = Array<{componentId:string|null;quantity:number|null;unit:string;kind:string}>;
type WithInsertion=ComponentItem&{calculatedInsertion?:{calculation?:{bom:Bom}}};
const prefix="COMPONENT_MASS_";
const field=(label:string,value:unknown)=>({column:prefix+label,headerPath:[label],value});
type Reference = typeof reference.rows[number] | typeof completion.rows[number];
const refs=new Map<string,Reference>([...reference.rows,...completion.rows].map(row=>[row.id,row]));
function referenceFor(item:ComponentItem):Reference|undefined {
 const row=refs.get(item.id);
 if(!row||!("identity" in row))return row;
 const article=item.fields.find(f=>f.headerPath.at(-1)==="Артикул")?.value??null;
 return row.identity.catalogId===item.catalogId&&row.identity.family===item.family&&(row.identity.article??null)===article?row:undefined;
}
export function componentMassUnit(item:ComponentItem):string {
 const unit=String(item.fields.find(f=>f.headerPath.at(-1)==="Единица цены")?.value??"");
 return isLinearMassUnit(unit)||refs.get(item.id)?.unit==="м"||item.catalogId==="трубы"||item.id.startsWith("user-seals-2026-09-28:flax-")||item.fields.some(f=>["Масса 1 м, кг","Масса, кг/м","Вес 1 кг/метр"].includes(f.headerPath.at(-1)??""))?"м":"шт.";
}

/** Supplement source rows without replacing prices, dimensions or explicit user masses. */
export function withComponentMasses(input:ComponentItem[],includeSupplements=true):ComponentItem[]{
 const map=new Map(input.map(i=>[i.id,i]));
 if(includeSupplements)for(const item of [tankValve20,...flangeHardware,...massBomSupplements])if(!map.has(item.id))map.set(item.id,item);
 const items=[...map.values()].map(original=>{
  const item={...original,fields:original.fields.filter(f=>!f.column.startsWith(prefix))};
  const entry=referenceFor(item);
  const unit=componentMassUnit(item);
  const mass=readComponentMass(item,unit);
  const declared=item.fields.some(f=>/^(Масса, кг|Вес, кг|Масса 1 м, кг|Масса, кг\/м|Вес 1 кг\/метр|Масса нетто, кг|Масса по каталогу, кг|weightKg)$/.test(f.headerPath.at(-1)??f.column)&&f.value!==null&&f.value!==""&&Number.isFinite(Number(String(f.value).replace(",","."))));
  if(mass&&(!mass.estimated||declared)||!entry&&!mass)return item;
  const result=structuredClone(item),kg=entry?.kg??mass!.kg,source=entry?.source??mass!.source;
  result.fields.push(field(unit==="м"?"Масса 1 м, кг":"Масса, кг",kg),field("Источник массы",source),field("Тип массы",entry&&!("estimated" in entry&&entry.estimated)?"каталожная":"расчётная"));
  if(entry&&"basis" in entry)result.fields.push(field("Основание массы",entry.basis));
  if(entry&&"support" in entry)result.fields=result.fields.map(f=>f.column==="FRAME_SUPPORT"&&typeof f.value==="object"&&f.value?{...f,value:{...f.value,...entry.support,massKg:entry.kg,verified:true,source:entry.source}}:f);
  return result;
 });
 const index=new Map(items.map(i=>[i.id,i]));
 return items.map(item=>{
  const calc=(item as WithInsertion).calculatedInsertion?.calculation;
  if(!calc||readComponentMass(item))return item;
  const physical=calc.bom;
  const values=physical.map(r=>{
   const item=index.get(r.componentId??"");
   const mass=["welding","painting","machining"].includes(r.kind)?manufacturingMass(r.kind,r.unit,item):readComponentMass(item,r.unit);
   return r.quantity===0?0:r.quantity===null?null:mass?.kg??null;
  });
  if(!physical.length||values.some(v=>v===null))return item;
  return {...item,fields:[...item.fields,field("Масса, кг",physical.reduce((n,r,i)=>n+r.quantity!*values[i]!,0)),field("Тип массы","расчётная"),field("Источник массы","Сумма массы деталей сохранённой вставки, включая расчётную массу наплавленного металла и сухого покрытия. Трубы и заготовки по номинальным размерам; технологические вырезы не вычитаются.")]};
 });
}
