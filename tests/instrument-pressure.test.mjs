import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import {loadTs} from "./load-ts.mjs";
import { fixture, sync, choose, rows, resources, load, parseProjectConfig } from "./fixtures/station-specification.mjs";
const {stationInstrumentPressure}=await load("instrument-pressure");
const {selectSuctionInstruments,selectDischargeInstruments}=await load("suction-instruments");
const {normalizeHydraulicOptions}=await load("hydraulic-option-config");
const {transducerSelectionPressure,dischargeInstrumentPressure,instrumentMaximumHead}=await load("instrument-pressure");
const {pressureTransducerCatalog,automaticTransducerId}=await load("pressure-transducers");
const sensor=p=>rows(p).find(r=>r.assemblyRole==="discharge:transducer");
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const field=(label,value)=>({column:label,headerPath:[label],value});
function dataAtBar(bar){
  const h0=bar/.0980665-10;
  return {...resources,pumps:resources.pumps.map(p=>p.id==="318"?{...p,maxHead:h0,curve:[[0,h0],[20,Math.max(0,h0-10)]],selectionFlowRange:[5,20]}:p)};
}

test("PN basis uses source Q=0 plus inlet head, independently of duty head, restricted flow and parallel pump count",()=>{
  const p=fixture(),basis=stationInstrumentPressure(p,resources.pumps);
  close(basis.headM,86);close(basis.pressureBar,86*.0980665);assert.match(basis.source,/H\(Q=0\)=76/);
  p.entities["system-input"].head=200;p.entities["system-input"].workingPumpCount=6;
  close(stationInstrumentPressure(p,resources.pumps).pressureBar,basis.pressureBar);
  close(stationInstrumentPressure(p,dataAtBar(18).pumps).pressureBar,18);
  p.entities["station-settings"].inletHead=0;close(stationInstrumentPressure(p,resources.pumps).headM,76);
});

test("common pressure takes the maximum active circuit including jockey; branch pressure stays local",()=>{
  const p=fixture();Object.assign(p.entities["station-settings"],{stationType:"combined"});choose(p,"318",1,0,true);
  p.entities["system-input-2"].selectedPumpId="higher";
  const pumps=[...resources.pumps,{...resources.pumps.find(p=>p.id==="318"),id:"higher",curve:[[0,180],[20,100]]}];
  close(stationInstrumentPressure(p,pumps).headM,190);
  close(stationInstrumentPressure(p,pumps,"primary").headM,86);
  close(stationInstrumentPressure(p,pumps,"secondary").headM,190);
  Object.assign(p.entities["station-settings"],{stationType:"utility"});close(stationInstrumentPressure(p,pumps).headM,86);
  Object.assign(p.entities["station-settings"],{stationType:"fire",jockeyPump:true});close(stationInstrumentPressure(p,pumps).headM,190);
});

test("missing zero-flow data or inlet does not extrapolate or substitute the requested head",()=>{
  const p=fixture();
  for(const curve of [[[1,100],[20,80]],[[0,NaN],[20,80]],[[0,80],[0,70]],[[0,100]]]){
    const pumps=resources.pumps.map(r=>r.id==="318"?{...r,curve}:r);
    assert.equal(stationInstrumentPressure(p,pumps).pressureBar,null);
  }
  assert.equal(stationInstrumentPressure(p,null).pressureBar,null);
  p.entities["station-settings"].inletHead=null;assert.equal(stationInstrumentPressure(p,resources.pumps).pressureBar,null);
  const draft=fixture();draft.entities["system-input"].calculated=false;assert.equal(stationInstrumentPressure(draft,resources.pumps).pressureBar,null);
});

test("enabled pressure calculation selects by duty head plus inlet with an inclusive 160 m boundary",()=>{
  for(const head of [159.999999,160,160.000001,162,200,300]){
    const p=fixture();p.entities["system-input"].head=head-10;
    const next=sync(p,dataAtBar(26)),s=sensor(next),id=head<=160?"station-v11-oni-ppt10-16":"station-v11-oni-ppt10-25";
    assert.equal(s.equipmentId,id);close(s.hydraulicAssembly.requirement.pressureBar,head*.0980665);
    assert.equal(s.hydraulicAssembly.parts.find(p=>p.assemblyRole==="product").price,head<=160?3445.91:3600);
    assert.equal(s.technicalStatus,"ready");assert.deepEqual(s.technicalNotes,[]);assert.deepEqual(s.hydraulicAssembly.findings,[]);
    assert.strictEqual(sync(next,dataAtBar(26)),next);
  }
  assert.equal(automaticTransducerId(null),"station-v11-oni-ppt10-16");
});

test("disabled pressure calculation uses maximum pump head, ignores inlet/duty head and reselects both directions",()=>{
  let p=fixture();Object.assign(p.entities["station-settings"],{pressureChecksEnabled:false,inletHead:null});p.entities["system-input"].head=300;
  const atHead=h=>dataAtBar((h+10)*.0980665);
  for(const h of [160,160.000001,250,80]){
    p=sync(p,atHead(h));assert.equal(sensor(p).equipmentId,h<=160?"station-v11-oni-ppt10-16":"station-v11-oni-ppt10-25");
    close(transducerSelectionPressure(p,atHead(h).pumps).headM,h);assert.match(sensor(p).hydraulicAssembly.requirement.pressureBasis,/без входного подпора/);
  }
});

test("only two ONI variants remain live; legacy or manual transducer pins migrate to automatic",()=>{
  const catalogue=pressureTransducerCatalog(resources.components.items).filter(i=>/преобразоват.*давлен/i.test(i.family));
  assert.deepEqual(catalogue.map(i=>i.id),["station-v11-oni-ppt10-16","station-v11-oni-ppt10-25"]);
  const stale=catalogue.map(i=>({...i,prices:[]}));
  const repaired=pressureTransducerCatalog([...resources.components.items,...stale]).filter(i=>/преобразоват.*давлен/i.test(i.family));
  assert.deepEqual(repaired.map(i=>i.prices[0].amount),[3445.91,3600]);
  const p=fixture();p.entities["system-input"].head=170;p.entities["station-settings"].hydraulicOptions={products:{"discharge:transducer":"кипиа-003-r0021","discharge:tank":"keep-tank"},sensorSupplyVoltage:48};
  let next=sync(p,dataAtBar(18)),s=sensor(next);assert.equal(s.equipmentId,"station-v11-oni-ppt10-25");
  assert.equal(s.hydraulicAssembly.candidates.length,2);
  assert.doesNotMatch(JSON.stringify(s),/Не подтверждено питание|Питание шкафа|необходимо подтвердить.*шкаф|supplyVoltage/);
  next=parseProjectConfig(JSON.parse(JSON.stringify(next)));assert.equal(next.entities["station-settings"].hydraulicOptions.sensorSupplyVoltage,undefined);
  assert.equal(next.entities["station-settings"].hydraulicOptions.products["discharge:transducer"],undefined);assert.equal(next.entities["station-settings"].hydraulicOptions.products["discharge:tank"],"keep-tank");
  assert.deepEqual(normalizeHydraulicOptions({products:{},sensorSupplyVoltage:48}),{products:{}});
  next.entities["station-settings"].hydraulicOptions.products={"discharge:transducer":"station-v11-oni-ppt10-25"};next.entities["system-input"].head=30;
  next=sync(next,dataAtBar(18));assert.equal(sensor(next).equipmentId,"station-v11-oni-ppt10-16");
  const saved=sync(parseProjectConfig(JSON.parse(JSON.stringify(next))),dataAtBar(18));assert.deepEqual(rows(saved),rows(next));
});

test("mode switch uses the maximum active circuit and a zero inlet default",()=>{
  const p=fixture();p.entities["station-settings"].stationType="combined";choose(p,"318",1,0,true);
  p.entities["system-input"].head=100;p.entities["system-input-2"].head=151;
  let next=sync(p);assert.equal(sensor(next).equipmentId,"station-v11-oni-ppt10-25");close(transducerSelectionPressure(next,resources.pumps).headM,161);
  next.entities["station-settings"].pressureChecksEnabled=false;next=sync(next);assert.equal(sensor(next).equipmentId,"station-v11-oni-ppt10-16");close(transducerSelectionPressure(next,resources.pumps).headM,76);
  next.entities["station-settings"].inletHead=null;assert.equal(transducerSelectionPressure(next,resources.pumps).headM,76);
  next.entities["station-settings"].pressureChecksEnabled=true;next=sync(next);assert.equal(sensor(next).equipmentId,"station-v11-oni-ppt10-16");assert.equal(sensor(next).price,3445.91);close(transducerSelectionPressure(next,resources.pumps).headM,151);
});

test("relay PN is checked against shutoff pressure separately from its inlet trip range and overload",()=>{
  const source=resources.components.items.find(i=>i.id==="кипиа-002-r0014");
  const relay=(id,pn)=>({...source,id,fields:[...source.fields,field("PN",pn)]});
  const low=relay("low-pn",10),high=relay("high-pn",25),excess=relay("excess-pn",40),unknown={...source,id:"unknown-pn",fields:[...source.fields,field("Давление перегрузки, бар",100)]};
  const rating=stationInstrumentPressure(fixture(),dataAtBar(18).pumps);
  for(const items of [[low,unknown,excess,high],[high,excess,unknown,low]]){
    const r=selectSuctionInstruments(items,10,rating)[1];assert.equal(r.item.id,"high-pn");assert.equal(r.warning,undefined);assert.match(r.details,/18 бар/);
  }
  assert.equal(selectSuctionInstruments([low],10,rating)[1].item,undefined);
  assert.match(selectSuctionInstruments([unknown],10,rating)[1].warning,/не подтверждено/);
  const fire=relay("fire-pn25",25);fire.fields=fire.fields.map(f=>f.headerPath.at(-1)==="Давление, МПа"?field("Давление, МПа","0…2,5"):f);
  assert.equal(selectDischargeInstruments([fire],rating.headM,rating)[1].item.id,fire.id);
});

test("station relay output carries H0 requirement and cannot certify a missing PN",()=>{
  const p=sync(fixture(),dataAtBar(18)),r=rows(p).find(r=>r.assemblyRole==="pressure-switch");
  assert.match(r.details,/P₀=/);assert.match(r.description,/PN.*не подтверждено/);assert.notEqual(r.technicalStatus,"ready");
  const off=fixture();off.entities["station-settings"].pressureChecksEnabled=false;
  const missing=sync(off,{...resources,pumps:resources.pumps.map(p=>p.id==="318"?{...p,curve:[[1,100],[20,80]]}:p)});
  close(sensor(missing).hydraulicAssembly.requirement.pressureBar,100*.0980665);assert.equal(sensor(missing).technicalStatus,"ready");
  assert.deepEqual(sensor(missing).technicalNotes,[]);
});

test("maximum pump head includes interior curve peaks and catalogue values without extrapolation",()=>{
  const base=resources.pumps.find(p=>p.id==="318");
  assert.equal(instrumentMaximumHead({...base,maxHead:170,curve:[[.8,80],[20,165],[40,50]]}),170);
  assert.equal(instrumentMaximumHead({...base,maxHead:70,curve:[[.8,80],[20,165],[40,50]]}),165);
  assert.equal(instrumentMaximumHead({...base,maxHead:170,curve:[]}),170);
  assert.equal(instrumentMaximumHead(undefined),null);
  const p=fixture();Object.assign(p.entities["station-settings"],{pressureChecksEnabled:false,stationType:"combined"});choose(p,"318",2,1,true);
  p.entities["system-input-2"].selectedPumpId="higher";
  const pumps=[{...base,maxHead:90,curve:[[.8,80],[20,90],[40,50]]},{...base,id:"higher",maxHead:165,curve:[[.8,80],[20,165],[40,50]]}];
  close(dischargeInstrumentPressure(p,pumps).headM,165);close(dischargeInstrumentPressure(p,pumps,"primary").headM,90);
  assert.equal(sensor(sync(p,{...resources,pumps})).equipmentId,"station-v11-oni-ppt10-25");
});

test("real ONIS MBL with no Q=0 point produces priced ONI and fire-branch relay without confirmations",()=>{
  const p=fixture();Object.assign(p.entities["station-settings"],{stationType:"combined",pressureChecksEnabled:false});choose(p,"nu-34f0554f7dc091e4",3,1);choose(p,"nu-34f0554f7dc091e4",2,1,true);
  const next=sync(p),r=rows(next).find(r=>r.assemblyRole==="primary-sensor-relay"),s=sensor(next);
  close(transducerSelectionPressure(next,resources.pumps).headM,88.32);
  assert.equal(s.equipmentId,"station-v11-oni-ppt10-16");assert.equal(s.price,3445.91);assert.equal(r.equipmentId,"кипиа-002-r0015");assert.equal(r.quantity,4);assert.equal(r.price,1777.54);
  for(const row of rows(next).filter(r=>r.option==="pressureTransducer"||r.hydraulicPart?.option==="pressureTransducer"||/^primary-sensor-/.test(r.assemblyRole??""))){assert.equal(row.technicalStatus,"ready");assert.equal(row.status,"selected");assert.ok(!row.technicalNotes?.length);}
  for(const [enabled,head,relayId] of [[true,20,"кипиа-002-r0013"],[true,120,"кипиа-002-r0016"],[false,120,"кипиа-002-r0015"]]){
    p.entities["station-settings"].pressureChecksEnabled=enabled;p.entities["system-input"].head=head;
    const branch=rows(sync(p)).find(r=>r.assemblyRole==="primary-sensor-relay");assert.equal(branch.equipmentId,relayId);assert.equal(branch.status,"selected");assert.equal(branch.technicalStatus,"ready");
    assert.match(branch.details,enabled?/Hраб/:/Hmax/);
  }
});

test("actual hydraulic option UI shows cabinet supply and shutoff basis without a voltage confirmation input",async()=>{
  const url=new URL("../app/specification-hydraulic-options.tsx",import.meta.url);
  const source=(await readFile(url,"utf8")).replace('import "./specification-insertions.css";',"");
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('"react/jsx-runtime"',JSON.stringify(import.meta.resolve("react/jsx-runtime")));
  const {SpecificationHydraulicOption}=await loadTs(url,{[url.href]:compiled});
  const p=sync(fixture(),dataAtBar(14));
  const html=renderToStaticMarkup(createElement(SpecificationHydraulicOption,{item:sensor(p),settings:p.entities["station-settings"],onChange:()=>{}}));
  assert.match(html,/Питание КИП обеспечивается от шкафа управления/);assert.match(html,/Hраб/);assert.match(html,/160 м/);assert.match(html,/ONI/);
  assert.doesNotMatch(html,/<input|<select|Подтверждённое питание|Не подтверждено питание|Питание шкафа вне/);
  assert.doesNotMatch(html,/Стоимость комплекта|Известная часть стоимости комплекта|<b>Переходник|<b>Футорка/);
});
