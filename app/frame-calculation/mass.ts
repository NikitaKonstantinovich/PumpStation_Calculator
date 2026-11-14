import { nonnegative, type Part, type MassResult } from "./types";
/** Exactly one accounting level per assembly; unknown mass is never zero. */
export function stationMass(parts:Part[],waterKg:number):MassResult {
 const rows:MassResult["rows"]=[],seen=new Set<string>();
 function visit(p:Part,multiplier:number){
  if(seen.has(p.id))throw Error("Повторный учёт массы: "+p.id);seen.add(p.id);
  if(!nonnegative(p.quantity))throw Error("Некорректное количество: "+p.name);
  const quantity=p.quantity*multiplier; if(!quantity)return;
  if(p.massAccounting==="children"&&p.children?.length){p.children.forEach(c=>visit(c,quantity));return;}
  rows.push({id:p.id,name:p.name,quantity,massKg:nonnegative(p.unitMassKg)?p.unitMassKg*quantity:null,source:p.source});
 }
 parts.forEach(p=>visit(p,1));
 const missing=rows.filter(r=>r.massKg===null).map(r=>r.name),knownDryKg=rows.reduce((s,r)=>s+(r.massKg??0),0);
 if(!nonnegative(waterKg))throw Error("Не определена масса воды");
 const dryKg=missing.length?null:knownDryKg,operatingKg=dryKg===null?null:dryKg+waterKg;
 return {dryKg,operatingKg,liftingKg:operatingKg,knownDryKg,knownOperatingKg:knownDryKg+waterKg,waterKg,missing,rows};
}
