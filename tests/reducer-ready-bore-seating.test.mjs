import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { extensionCatalog, extensionInput } from "./fixtures/insert-extension.mjs";
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const { generateInsertCalculations } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const data = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url),"utf8"));
const input = { dnFrom:50,dnTo:50,materials:["aisi304"],withSensorNipple:false,includeEccentric:true };
const catalog=makeInsertCatalog(data);

test("DN50-40 PN10/16 uses only butt collars with actual lengths under the collector rule",()=>{
  const rows=generateInsertCalculations(input,catalog).filter(row=>row.dnSmall===40&&[10,16].includes(row.pn));
  assert.equal(rows.length,4);
  for(const row of rows){
    assert.ok(row.complete,row.warnings.join("; "));
    assert.equal(row.baseLengthMm,76);assert.equal(row.extension,undefined);
    assert.deepEqual([row.leftConnection,row.rightConnection],["collar","collar"]);
    assert.equal(row.totalLengthMm,116);
    assert.equal(row.assemblyDecisions?.length??0,0);
    assert.equal(row.bom.filter(item=>item.kind==="collar").length,2);
    assert.equal(row.welds.length,2);assert.ok(Math.abs(row.weldLengthMm-2*Math.PI*(60.3+48.3))<1e-8);
  }
  const measured=catalog.parts.find(part=>part.kind==="reducer"&&part.dn===50&&part.dnSmall===40&&part.pn===10&&part.geometry==="concentric");
  assert.equal(measured.cylindricalLengthLargeMm,13.7179);
});

function fixture(){
  const c=extensionCatalog();c.engineering.reducerReadyBoreSeating={faceOffsetMm:5,source:"TEST explicit assembly decision"};
  c.parts.find(p=>p.kind==="reducer").cylindricalLengthLargeMm=2;
  c.parts.find(p=>p.kind==="reducer").cylindricalLengthSmallMm=null;
  return c;
}
const reducer=c=>generateInsertCalculations(extensionInput,c).find(row=>row.geometry==="concentric");
test("general rule is independent of reducer DN/profile measurements, but needs known ready bore and sourced thickness",()=>{
  assert.ok(reducer(fixture()).complete);
  for(const mutate of [
    c=>{delete c.engineering.reducerReadyBoreSeating;},
    c=>{c.engineering.reducerReadyBoreSeating.source="";},
    c=>{c.engineering.reducerReadyBoreSeating.faceOffsetMm=0;},
    c=>{c.parts.find(p=>p.id==="ext-left").boreDiameterMm=59;},
    c=>{c.parts.find(p=>p.id==="ext-left").boreDiameterMm=null;},
    c=>{delete c.parts.find(p=>p.id==="ext-left").dimensionSources.boreDiameterMm;},
    c=>{c.parts.find(p=>p.id==="ext-left").thicknessMm=null;},
    c=>{delete c.parts.find(p=>p.id==="ext-left").dimensionSources.thicknessMm;},
  ]){const c=fixture();mutate(c);const row=reducer(c);assert.ok(!row.complete&&row.price===null,row.warnings.join("; "));}
  const changed=structuredClone(data);changed.source.sha256="unknown";
  assert.equal(makeInsertCatalog(changed).engineering.reducerReadyBoreSeating,undefined);
});
test("accepted assembly cannot bypass overlapping ends, absent prices or base length",()=>{
  for(const mutate of [
    c=>{c.parts.find(p=>p.kind==="reducer").lengthMm=20;},
    c=>{c.parts.find(p=>p.kind==="reducer").lengthMm=null;},
    c=>{c.parts.find(p=>p.id==="ext-left").price=null;},
  ]){const c=fixture();mutate(c);const row=reducer(c);assert.ok(!row.complete&&row.price===null);}
  const short=fixture();short.parts.find(p=>p.kind==="reducer").lengthMm=20;
  assert.ok(reducer(short).warnings.some(w=>/концевые детали перекрываются/.test(w)));
});
test("PN25 nipples carry a warning and undersized original flanges still need machining",()=>{
  const rows=generateInsertCalculations({...input,withSensorNipple:true},catalog).filter(row=>row.pn===25);
  assert.ok(rows.length);assert.ok(rows.every(row=>row.complete&&row.price>0&&row.assumptions?.some(item=>item.code==="sensor-pn25-pressure")));
  const c=fixture();c.engineering.flangeBoring={source:"TEST machining",diametralClearanceMm:null,clearanceSource:null};c.parts.find(p=>p.id==="ext-left").boreDiameterMm=59;
  const row=reducer(c);assert.ok(row.warnings.some(w=>/Расточка/.test(w)));assert.equal(row.price,null);
  assert.ok(!row.assemblyDecisions?.some(d=>d.side==="left"));
});
