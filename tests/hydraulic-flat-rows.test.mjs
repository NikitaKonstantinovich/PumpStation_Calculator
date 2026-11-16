import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ExcelJS from "exceljs";
import {fixture,sync,rows,load,parseProjectConfig,assessSpecification} from "./fixtures/station-specification.mjs";
import {loadTs} from "./load-ts.mjs";
const {specificationHasPrice,specificationLineTotal}=await load("specification-readiness");
const {visibleSpecificationItems}=await load("specification-presentation");
const {hydraulicAssemblyPrice}=await load("hydraulic-option-assembly");
const exportUrl=new URL("../app/specification-export.ts",import.meta.url);
const source=(await readFile(exportUrl,"utf8")).replace('import("exceljs")',`import(${JSON.stringify(import.meta.resolve("exceljs"))})`);
const {specificationExportRows,specificationExportBlob}=await loadTs(exportUrl,{[exportUrl.href]:source});
const group=(p,location)=>rows(p).filter(r=>r.assemblyRole===location||r.hydraulicPart?.location===location);
const main=(p,location)=>rows(p).find(r=>r.assemblyRole===location);
const child=(p,location,role)=>rows(p).find(r=>r.hydraulicPart?.location===location&&r.hydraulicPart.role===role);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const sections=[{title:"Гидравлика",sections:[{id:"suction"},{id:"discharge"}]}];
function fire(){const p=fixture();p.entities["station-settings"].stationType="fire";return sync(p);}

test("two transducers, adapters, bushes and 0.6 m flax are real separately numbered and priced station rows",()=>{
  const p=fire(),m=main(p,"discharge:transducer"),items=group(p,m.assemblyRole);
  assert.equal(items.length,4);assert.equal(m.unit,"шт.");assert.equal(m.quantity,2);assert.equal(m.price,3445.91);assert.match(m.name,/ONI|РРТ10/);assert.equal(m.hydraulicAssembly.accounting,"parts");
  for(const role of ["резьбовые-фитинги-003-r0235","резьбовые-фитинги-002-r0225"]){const r=child(p,m.assemblyRole,role);assert.equal(r.quantity,2);assert.equal(r.unit,"шт.");assert.equal(r.option,undefined);assert.ok(specificationHasPrice(r));}
  const flax=child(p,m.assemblyRole,"sensor-seals");assert.equal(flax.quantity,.6);assert.equal(flax.unit,"м");assert.equal(flax.price,51.5);
  assert.equal(new Set(items.map(r=>r.position)).size,items.length);assert.ok(!items.some(r=>r.unit==="компл."));
  close(items.reduce((s,r)=>s+specificationLineTotal(r),0),2*hydraulicAssemblyPrice(m.hydraulicAssembly));
  close(assessSpecification(p,items).knownTotal,7178.92);
});

test("missing inlet pressure keeps the default ONI product and its separate connection parts priced",()=>{
  const p=fire();p.entities["station-settings"].inletHead=null;const next=sync(p),items=group(next,"discharge:transducer");
  assert.equal(items[0].price,3445.91);assert.equal(specificationHasPrice(items[0]),true);
  assert.ok(items.every(specificationHasPrice));close(assessSpecification(next,items).knownTotal,7178.92);
  assert.equal(assessSpecification(next,items).pricesComplete,true);
});

test("missing, duplicate or wrong-count accessories are detected as composition errors",()=>{
  for(const mode of ["missing","duplicate","quantity","selection"]){
    const p=fire(),r=child(p,"discharge:transducer","sensor-seals");
    if(mode==="missing")p.entities["station-spec"].items=rows(p).filter(i=>i!==r);
    if(mode==="duplicate")rows(p).push({...r,position:"99"});
    if(mode==="quantity")r.quantity=.3;
    if(mode==="selection")r.equipmentId="wrong-product";
    assert.ok(assessSpecification(p).findings.some(f=>f.category==="composition"&&f.id.includes("parts/discharge:transducer/sensor-seals")),mode);
  }
});

test("tank valve, reducer, hose and mounting hardware have their own quantities and prices",()=>{
  const p=fixture();Object.assign(p.entities["station-settings"],{membraneTank:true,membraneTankVolume:100});const next=sync(p),m=main(next,"discharge:tank");
  assert.equal(m.price,m.hydraulicAssembly.parts.find(p=>p.assemblyRole==="product").price);
  assert.equal(child(next,m.assemblyRole,"tank-diameter-transition").price,90.89);assert.equal(child(next,m.assemblyRole,"tank-hose").price,2350.94);
  assert.equal(child(next,m.assemblyRole,"tank-thread-seals").quantity,.3);assert.equal(child(next,m.assemblyRole,"tank-mount-bolts").quantity,3);assert.equal(child(next,m.assemblyRole,"tank-mount-washers").quantity,6);
  next.entities["station-settings"].membraneTank=false;
  assert.ok(!visibleSpecificationItems(next.entities["station-spec"],next.entities["station-settings"]).some(r=>r.assemblyRole===m.assemblyRole||r.hydraulicPart?.location===m.assemblyRole));
  assert.ok(!group(sync(next),m.assemblyRole).length);
});

test("JSON, recalculation and legacy kit replacement preserve flat rows without duplicates or manual-row loss",()=>{
  let p=fire();rows(p).push({position:"99",section:"electrical",name:"Ручная позиция",details:"",quantity:1,price:123,status:"selected",option:undefined});p=sync(p);
  const expected=rows(p);assert.strictEqual(sync(p),p);p=sync(parseProjectConfig(JSON.parse(JSON.stringify(p))));assert.deepEqual(rows(p),expected);
  const m=main(p,"discharge:transducer");m.hydraulicAssembly.accounting="assembly";m.price=hydraulicAssemblyPrice(m.hydraulicAssembly);m.unit="компл.";
  p.entities["station-spec"].items=rows(p).filter(r=>!r.hydraulicPart);p=sync(p);
  assert.equal(group(p,"discharge:transducer").length,4);assert.equal(main(p,"discharge:transducer").unit,"шт.");assert.equal(rows(p).find(r=>r.name==="Ручная позиция").price,123);
});

test("CSV row model and XLSX contain one priced line per item with the same total",async()=>{
  const p=fire(),items=group(p,"discharge:transducer"),exported=specificationExportRows(items,sections);
  const lines=exported.filter(r=>r.kind==="item");assert.equal(lines.length,4);assert.deepEqual(lines.map(r=>r.cells[2]),items.map(r=>r.quantity));
  assert.ok(lines.every(r=>!r.cells[6].includes("Состав на 1 узел")));close(exported.find(r=>r.kind==="total").cells[5],7178.92);
  const blob=await specificationExportBlob(exported,"xlsx"),book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await blob.arrayBuffer()));
  const sheet=book.worksheets[0];for(const line of lines){const actual=sheet.findRow(exported.indexOf(line)+1);assert.equal(actual.getCell(2).value,line.cells[1]);assert.equal(actual.getCell(3).value,line.cells[2]);assert.equal(actual.getCell(5).value,line.cells[4]);assert.equal(actual.getCell(6).value,line.cells[5]);}
});
