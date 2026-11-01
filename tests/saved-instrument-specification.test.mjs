import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fixture,sync,rows,resources,choose,parseProjectConfig,load} from "./fixtures/station-specification.mjs";
import {loadTs} from "./load-ts.mjs";
const {repairSavedInstrumentSpecification:repair}=await load("saved-instrument-specification");
const {specificationItemPresentation:presentation}=await load("specification-presentation");
const {specificationHasPrice}=await load("specification-readiness");
const {checkSuctionSpecPressure}=await load("suction-spec");
const {checkDischargeSpecPressure}=await load("discharge-spec");
const {calculateCollector}=await load("collector-calculations");
const {acceptInstrumentFitting}=await load("instrument-connection");
const data={...resources.components,pumps:resources.pumps};
const converter=p=>rows(p).find(r=>r.assemblyRole==="discharge:transducer");
const kip=r=>r.option==="pressureTransducer"||r.hydraulicPart?.option==="pressureTransducer"||/^(primary|secondary)-sensor-relay$/.test(r.assemblyRole??"")||/резьбовые-фитинги-00[23]-r02(?:25|35)/.test(r.equipmentId??"");
function brokenSnapshot(){
  const p=fixture();Object.assign(p.entities["station-settings"],{stationType:"combined",pressureChecksEnabled:false});
  choose(p,"nu-34f0554f7dc091e4",3,1);choose(p,"nu-34f0554f7dc091e4",2,1,true);
  const selected=sync(p);
  for(const side of ["suction","discharge"]){const c=selected.entities["station-collectors"][side];c.calculation=calculateCollector(c.configuration,resources.components.collectorCatalog);}
  for(const row of rows(selected).filter(kip)){
    row.status="confirmation";row.technicalStatus="unverified";row.technicalNotes=["Паспорт PN требует проверки."];
    row.description="Не указано допустимое рабочее давление.";
    row.dischargePressureCheck={baseStatus:"confirmation",checks:[{status:"unknown",message:"PN не указан."}]};
    if(row.option==="pressureTransducer"||/sensor-relay$/.test(row.assemblyRole??"")){delete row.equipmentId;row.price=null;}
  }
  const main=converter(selected),product=main.hydraulicAssembly.parts.find(r=>r.assemblyRole==="product");
  main.name="Преобразователь давления";product.price=null;delete product.equipmentId;
  rows(selected).push({position:"07.98",section:"electrical",name:"Ручная позиция",quantity:1,details:"Сохранить цену",price:123.45,status:"selected"});
  return parseProjectConfig(JSON.parse(JSON.stringify(selected)),true);
}

test("opened frozen snapshot repairs priced KIP and relays without recalculating the station or other prices",()=>{
  const p=brokenSnapshot(),before=JSON.stringify(p),other=rows(p).filter(r=>!kip(r));
  const next=repair(p,data),main=converter(next);
  assert.equal(main.equipmentId,"station-v11-oni-ppt10-16");assert.equal(main.price,3445.91);assert.equal(main.quantity,2);
  const relay=rows(next).find(r=>r.assemblyRole==="primary-sensor-relay");assert.equal(relay.equipmentId,"кипиа-002-r0015");assert.equal(relay.price,1777.54);assert.equal(relay.quantity,4);
  for(const row of rows(next).filter(kip)){assert.equal(presentation(row).hasWarning,false);assert.ok(specificationHasPrice(row));}
  assert.strictEqual(next.entities["station-collectors"],p.entities["station-collectors"]);
  assert.strictEqual(next.entities["station-dn"],p.entities["station-dn"]);assert.strictEqual(next.entities["station-model"],p.entities["station-model"]);
  assert.equal(JSON.stringify(rows(next).filter(r=>!kip(r))),JSON.stringify(other));assert.equal(JSON.stringify(p),before);
  assert.strictEqual(repair(next,data),next);
  const opened=parseProjectConfig(JSON.parse(JSON.stringify(next)),true);assert.strictEqual(repair(opened,data),opened);
});

test("snapshot repair obeys calculated pressure or maximum pump head and preserves saved fitting prices",()=>{
  const p=brokenSnapshot();p.entities["station-settings"].pressureChecksEnabled=true;
  p.entities["system-input"].head=160;p.entities["system-input-2"].head=120;p.entities["station-settings"].inletHead=10;
  const adapter=rows(p).find(r=>r.hydraulicPart?.role==="резьбовые-фитинги-003-r0235");adapter.price=72.5;
  let next=repair(p,data);assert.equal(converter(next).equipmentId,"station-v11-oni-ppt10-25");assert.equal(converter(next).price,3600);
  assert.equal(rows(next).find(r=>r.hydraulicPart?.role===adapter.hydraulicPart.role).price,72.5);
  assert.equal(converter(next).hydraulicAssembly.parts.find(r=>r.assemblyRole===adapter.hydraulicPart.role).price,72.5);
  next.entities["station-settings"].pressureChecksEnabled=false;next=repair(next,data);
  assert.equal(converter(next).equipmentId,"station-v11-oni-ppt10-16");assert.equal(converter(next).price,3445.91);
});

test("legacy kit is expanded once into four separately priced rows on snapshot opening",()=>{
  const p=brokenSnapshot(),main=converter(p);main.hydraulicAssembly.accounting="assembly";main.unit="компл.";
  p.entities["station-spec"].items=rows(p).filter(r=>!r.hydraulicPart);
  const next=repair(p,data),group=rows(next).filter(r=>r.option==="pressureTransducer"||r.hydraulicPart?.option==="pressureTransducer");
  assert.equal(group.length,4);assert.equal(new Set(group.map(r=>r.position)).size,4);assert.equal(group[0].unit,"шт.");
  assert.deepEqual(group.map(r=>r.quantity),[2,2,2,.6]);assert.equal(Math.round(group.reduce((s,r)=>s+r.price*r.quantity,0)*100)/100,7178.92);
  assert.strictEqual(repair(next,data),next);
});

test("catalogue loading does not replace a saved 25 bar instrument with a provisional 16 bar choice",()=>{
  const p=brokenSnapshot();converter(p).equipmentId="station-v11-oni-ppt10-25";converter(p).price=3600;
  assert.strictEqual(repair(p,{...data,pumps:null}),p);
});

test("pressure validation cannot restore fitting warnings in either mode; manual fittings keep their notes",()=>{
  for(const enabled of [false,true]){
    const p=brokenSnapshot();p.entities["station-settings"].pressureChecksEnabled=enabled;
    const managed=rows(p).filter(r=>/резьбовые-фитинги-00[23]-r02(?:25|35)/.test(r.equipmentId??""));
    const manual={...managed[0],generatedBy:undefined,assemblyRole:undefined,hydraulicPart:undefined};
    const checked=checkDischargeSpecPressure(p,checkSuctionSpecPressure(p,managed,resources.components,resources.components.collectorCatalog),resources.components,resources.components.collectorCatalog);
    assert.ok(checked.every(r=>!presentation(r).hasWarning));
    assert.strictEqual(acceptInstrumentFitting(manual),manual);
  }
});

test("actual workspace hydration effect repairs a frozen saved project after resources arrive",async()=>{
  const url=new URL("../app/full-workspace.tsx",import.meta.url),page=(await readFile(url,"utf8")).replace(/\r\n/g,"\n");
  const start=page.indexOf('  useEffect(()=>{\n    if(!suctionEnabled)');assert.ok(start>0);
  const effect=page.slice(start,page.indexOf('\n\n  useEffect(() => {',start));
  const code=`import {repairSavedInstrumentSpecification} from './saved-instrument-specification';
  export async function hydrate(project,resources){
    const config=project,snapshot=true,suctionEnabled=true,catalogue=resources.pumps,suctionSource='snapshot';
    let current=project;const setConfig=change=>{current=change(current)};
    const loadComponentsDatabase=async()=>resources;
    const synchronizeFullProject=()=>{throw new Error('Snapshot must not trigger full recalculation')};
    const useEffect=callback=>callback(),setSaveMessage=message=>{throw new Error(message)},setAssetErrors=()=>{};
    ${effect}
    await Promise.resolve();await Promise.resolve();return current;
  }`;
  const {hydrate}=await loadTs(url,{[url.href]:code});
  const p=brokenSnapshot(),next=await hydrate(p,data);
  assert.equal(converter(next).equipmentId,"station-v11-oni-ppt10-16");assert.equal(converter(next).price,3445.91);
  assert.ok(!presentation(converter(next)).hasWarning);assert.strictEqual(next.entities["station-collectors"],p.entities["station-collectors"]);
});
