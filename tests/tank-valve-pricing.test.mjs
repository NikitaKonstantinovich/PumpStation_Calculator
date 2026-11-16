import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fixture,sync,rows,resources,load} from "./fixtures/station-specification.mjs";

const {tankValve20,TANK_VALVE_20_ID}=await load("tank-connection");
const {specificationExportRows}=await load("specification-export");
const {frameTankConnection}=await load("frame-calculation/tank-connection");
const estimate=JSON.parse(await readFile(new URL("../data/tank-valve-pricing.json",import.meta.url),"utf8"));
function calculate(item){
  const project=fixture();Object.assign(project.entities["station-settings"],{membraneTank:true,membraneTankVolume:8});
  const data=item?{...resources,components:{...resources.components,items:[...resources.components.items.filter(i=>i.id!==TANK_VALVE_20_ID),item]}}:resources;
  return sync(project,data);
}
const valve=p=>rows(p).find(row=>row.hydraulicPart?.role==="tank-valve");

test("approved DN20 analogue estimate is counted once and retains its provenance in export",()=>{
  const project=calculate(),row=valve(project),tank=rows(project).find(r=>r.assemblyRole==="discharge:tank");
  assert.equal(row.price,1220);assert.equal(row.quantity,1);assert.equal(row.status,"selected");
  assert.equal(row.price,Math.round(estimate.offers.reduce((sum,o)=>sum+o.priceRub,0)/estimate.offers.length*100)/100);
  assert.equal(row.technicalStatus,"unverified","an estimated price does not confirm the LD article");
  assert.match(row.description,/Ориентировочная стоимость по аналогу/);
  for(const offer of estimate.offers)assert.ok(row.description.includes(offer.url));
  assert.equal(tank.price,tank.hydraulicAssembly.parts.find(p=>p.assemblyRole==="product").price);
  const exported=specificationExportRows(rows(project),[{title:"Напор",sections:[{id:"discharge"}]}]);
  const exportedValve=exported.filter(r=>r.kind==="item"&&r.cells[1]===row.name);
  assert.equal(exportedValve.length,1);assert.equal(exportedValve[0].cells[4],1220);assert.equal(exportedValve[0].cells[5],1220);
  assert.match(exportedValve[0].cells[7],/Ориентировочная стоимость по аналогу/);
  assert.strictEqual(sync(project),project,"unchanged calculations remain stable");
});

test("a catalogued DN20 price overrides the estimate; unknown prices remain missing",()=>{
  const confirmed={...structuredClone(tankValve20),fields:tankValve20.fields.filter(f=>!["ARTICLE_REVIEW","PRICE_SOURCE"].includes(f.column)),prices:[{label:"Цена, ₽/шт.",amount:1555,currency:"RUB"}]};
  const row=valve(calculate(confirmed));assert.equal(row.price,1555);assert.equal(row.technicalStatus,"ready");assert.equal(row.status,"selected");
  assert.doesNotMatch(row.description,/по аналогу|требуют подтверждения/);
  for(const prices of [[],[{label:"Цена",amount:0,currency:"RUB"}],[{label:"Цена",amount:100,currency:"EUR"}]]){
    const unknown=valve(calculate({...confirmed,prices}));assert.equal(unknown.price,null);assert.equal(unknown.status,"clarify");
  }
});

test("frame-mounted tanks respect catalog price overrides and include the estimate source",()=>{
  for(const volume of [50,80,100]){
    const next=calculate();next.entities["station-settings"].membraneTankVolume=volume;
    const fallback=frameTankConnection({next,resources});
    assert.equal(valve(fallback.next).price,1220);assert.match(valve(fallback.next).description,/Ориентировочная стоимость по аналогу/);
    const priced={...tankValve20,prices:[{label:"Цена, ₽/шт.",amount:1555,currency:"RUB"}],fields:tankValve20.fields.filter(f=>f.column!=="PRICE_SOURCE")};
    const result=frameTankConnection({next,resources:{...resources,components:{...resources.components,items:[...resources.components.items,priced]}}});
    assert.equal(valve(result.next).price,1555);assert.doesNotMatch(valve(result.next).description,/по аналогу/);
  }
});
