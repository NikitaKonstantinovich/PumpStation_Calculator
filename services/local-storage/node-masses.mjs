import { readFileSync } from "node:fs";

const manifest=JSON.parse(readFileSync(new URL("../../data/pump-mass-completion.json",import.meta.url),"utf8"));
const bindings=new Map(manifest.rows.map(row=>[row.variantId,row]));
const positive=n=>typeof n==="number"&&Number.isFinite(n)&&n>0;

/** Fill only missing mass, binding the full model/motor execution, never a name prefix. */
export function catalogMass({variant,model,motor,manufacturer,series},rows=bindings) {
 if(positive(variant.mass_kg))return {kg:variant.mass_kg};
 const row=rows.get(String(variant.id));
 if(!row||row.modelId!==String(model.id)||row.designation!==variant.designation||row.article!==variant.manufacturer_article||row.manufacturer!==manufacturer||row.series!==series||
   !Object.entries(row.motor).every(([key,value])=>(motor?.[key]??null)===value)||!positive(row.kg)||!row.source)return undefined;
 return {kg:row.kg,source:row.source,estimated:row.estimated,provenance:{version:manifest.version,basis:row.basis,source:row.source,estimated:row.estimated,evidence:structuredClone(row.evidence)}};
}
