import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";
const {makeInsertCatalog}=await loadTs(new URL("../app/component-insert-catalog.ts",import.meta.url));
const source=JSON.parse(await readFile(new URL("../public/component-insert-source.json",import.meta.url),"utf8"));
const id="сгоны-резьба-002-r0018";
test("reviewed DN20 geometry preserves catalogue identity, pressure, prices and source rows",()=>{
  const before=JSON.stringify(source),catalog=makeInsertCatalog(source),part=catalog.parts.find(p=>p.id===id);
  assert.equal(part.wallThickness,2.6);assert.equal(part.outerDiameter,26.9);assert.equal(part.pn,null);assert.equal(part.lengthMm,null);assert.equal(part.price,350);
  assert.match(part.dimensionSources.wallThickness,/lunda.ru/);assert.equal(JSON.stringify(source),before);
});
test("the review is not transferred to changed sources, IDs, DN, materials, threads or manual dimensions",()=>{
  for(const change of [s=>s.source.sha256="changed",(s,r)=>r.id+="-changed",(s,r)=>r.family="Сгон · ГОСТ 8969-15 Сталь 20",(s,r)=>r.fields.find(f=>f.headerPath.at(-1)==="DN").value="DN25",(s,r)=>r.fields.find(f=>f.headerPath.at(-1)==="Резьба, дюйм").value='1/2"',(s,r)=>r.fields.push({column:"MANUAL_WALL",headerPath:["Толщина, мм"],value:3})]){
    const changed=structuredClone(source),row=changed.items.find(p=>p.id===id);change(changed,row);
    const part=makeInsertCatalog(changed).parts.find(p=>p.id===row.id);assert.notEqual(part?.wallThickness,2.6);
  }
});
