import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { mergeInstrumentValve } from "../scripts/instrument-valve-supplement.mjs";

const { createProject,parseProjectConfig }=await loadTs(new URL("../app/project-config.ts",import.meta.url));
const { synchronizeCollectors }=await loadTs(new URL("../app/collector-project.ts",import.meta.url));
const { suctionHydraulics }=await loadTs(new URL("../app/dn-defaults.ts",import.meta.url));
const { buildSuctionSpec,replaceSuctionSpec }=await loadTs(new URL("../app/suction-spec.ts",import.meta.url));
const { makeCollectorCatalog }=await loadTs(new URL("../app/collector-catalog.ts",import.meta.url));
const { normalizeSpecificationItems }=await loadTs(new URL("../app/specification-items.ts",import.meta.url));
const binding=JSON.parse(await readFile(new URL("../public/binding-components.json",import.meta.url),"utf8"));
const catalog=makeCollectorCatalog(binding);
const instrumentValveData=JSON.parse(await readFile(new URL("../data/instrument-valve.json",import.meta.url),"utf8"));
function fixture({pumpDn=40,pumpConnection="threaded",valveDn=40,valveConnection="threaded",type="utility",pn=16,count=3,material="st20",network="flanged"}={}){
  const p=createProject();
  Object.assign(p.entities["system-input"],{selectedPumpId:"manual-test",flowRate:6,head:30,staticHead:0,workingPumpCount:count-1,reservePumpCount:1,calculated:true});
  Object.assign(p.entities["station-settings"],{stationType:type});
  Object.assign(p.entities["station-dn"],{collectorMaterial:material,suctionValveDn:valveDn,dischargeValveDn:valveDn,connectionType:valveConnection,suctionValveType:valveConnection==="threaded"?"ball":"butterfly",pn,pumpSuctionPort:{pumpId:"manual-test",dn:pumpDn,connection:pumpConnection,source:"test"}});
  p.entities["station-collectors"].suction.overrides={connection:network,dn:network==="flanged"?100:50};
  return synchronizeCollectors(p);
}
const build=p=>buildSuctionSpec(p,binding,catalog);
const byRole=(rows,role)=>rows.find(x=>x.section==="suction"&&x.assemblyRole===role);

test("user instrument valve updates the existing SKU without duplicates and survives repeated merge",()=>{
  const source=structuredClone(binding);
  const original=source.items.find(x=>x.id===instrumentValveData.legacyId);
  original.family="Кран шаровой латунный ВР-ВР · дренаж и воздухоотводчик";
  original.fields=original.fields.filter(f=>f.headerPath.at(-1)!=="Артикул");
  original.prices[0].amount=455.67;
  const merged=mergeInstrumentValve(source,instrumentValveData);
  assert.equal(merged.items.length,source.items.length);
  const selected=merged.items.find(x=>x.id===original.id);
  assert.equal(selected.prices[0].amount,650);
  assert.equal(selected.fields.find(f=>f.headerPath.at(-1)==="PN").value,40);
  assert.deepEqual(mergeInstrumentValve(merged,instrumentValveData),merged);
});

test("threaded pump locks valve to actual nozzle DN, including reload and collector branch",()=>{
  let p=fixture({pumpDn:25,valveDn:50});
  for(p of [p,parseProjectConfig(JSON.parse(JSON.stringify(p)))]) {
    const h=suctionHydraulics(p.entities["station-dn"],p.entities["system-input"],p.entities["station-settings"]);
    assert.equal(h.dn,25);assert.equal(h.locked,true);
    assert.equal(p.entities["station-collectors"].suction.configuration.primary.dn,25);
    const r=build(p);assert.equal(byRole(r,"primary-union").equipmentId,"suction-table:union-25");
    assert.equal(byRole(r,"primary-union").quantity,3);assert.equal(byRole(r,"primary-flax").quantity,.9);
    assert.equal(byRole(r,"network-gaskets").quantity,2);
    assert.ok(!byRole(r,"primary-pump-gasket"));
  }
});
test("flanged pump and ball valve use RF plus one gasket and two threaded joints per pump",()=>{
  const rows=build(fixture({pumpConnection:"flanged"}));
  assert.equal(byRole(rows,"primary-adapter").equipmentId,"suction-table:rf-40");
  assert.equal(byRole(rows,"primary-pump-gasket").quantity,3);
  assert.equal(byRole(rows,"primary-flax").quantity,.6);
  assert.equal(byRole(rows,"primary-adapter-flange-weldFlange").quantity,3);
  assert.equal(byRole(rows,"primary-pump-fasteners-bolts").quantity,12);
  assert.equal(byRole(rows,"primary-pump-fasteners-nuts").quantity,12);
});
test("threaded pump and fire butterfly reverse RF and include both valve gaskets and switch kits",()=>{
  const rows=build(fixture({valveConnection:"flanged",type:"fire"}));
  assert.match(byRole(rows,"primary-adapter").details,/развёрнута/);
  assert.equal(byRole(rows,"primary-flax").quantity,.3);
  assert.equal(byRole(rows,"primary-valve-gaskets").quantity,6);
  assert.equal(byRole(rows,"primary-valve-fasteners-bolts").quantity,12);
  assert.equal(byRole(rows,"primary-limit-switches").quantity,3);
  assert.equal(byRole(rows,"primary-limit-switches").price,3000);
  assert.equal(byRole(rows,"gauge").quantity,2);assert.equal(byRole(rows,"pressure-switch").quantity,2);assert.equal(byRole(rows,"instrument-valve").quantity,2);
});
test("equal flanged diameters use insert with two own flanges, not duplicate collector flanges",()=>{
  const rows=build(fixture({pumpDn:80,valveDn:80,pumpConnection:"flanged",valveConnection:"flanged"}));
  assert.equal(byRole(rows,"primary-insertion").price,4140);
  assert.equal(byRole(rows,"primary-pump-flange-weldFlange").quantity,3);
  assert.equal(byRole(rows,"primary-valve-flange-weldFlange").quantity,3);
  assert.equal(byRole(rows,"primary-pump-gasket").quantity,3);
  assert.equal(byRole(rows,"primary-valve-gaskets").quantity,6);
  assert.ok(!rows.some(x=>x.assemblyRole.endsWith("flax")));
});
test("larger flanged valve chooses reducer by both diameters and material; smaller is an error",()=>{
  const rows=build(fixture({pumpDn:65,valveDn:80,pumpConnection:"flanged",valveConnection:"flanged"}));
  const reducer=byRole(rows,"primary-reducer");assert.match(reducer.name,/DN80–65/);assert.ok(reducer.equipmentId);assert.ok(reducer.price>100);
  const invalid=build(fixture({pumpDn:80,valveDn:65,pumpConnection:"flanged",valveConnection:"flanged"}));
  assert.match(byRole(invalid,"primary-error").details,/больше DN арматуры/);
  assert.ok(!byRole(invalid,"primary-reducer"));assert.ok(!byRole(invalid,"primary-insertion"));
});
test("network seals are per collector, and missing PN or exact mating sizes never use unrelated parts",()=>{
  assert.equal(byRole(build(fixture({network:"threaded",count:5})),"network-flax").quantity,.2);
  assert.equal(byRole(build(fixture({pn:25})),"primary-union").price,null);
  const rows=build(fixture({pumpDn:20,valveDn:20,pumpConnection:"flanged"}));
  assert.equal(byRole(rows,"primary-adapter").price,null,"table DN20 mates with 1/2 inch, not 3/4");
});
test("fasteners select piece price not kilogram price and cannot be too short",()=>{
  const rows=build(fixture({pumpDn:80,valveDn:80,pumpConnection:"flanged",valveConnection:"flanged"}));
  const bolts=byRole(rows,"primary-valve-fasteners-bolts"),nuts=byRole(rows,"primary-valve-fasteners-nuts");
  assert.equal(bolts.quantity,24);assert.equal(nuts.quantity,24);
  assert.ok(nuts.price<10);assert.match(bolts.name,/М16х120/);
  const stainless=build(fixture({pumpConnection:"flanged",material:"aisi304"}));
  assert.equal(byRole(stainless,"primary-pump-fasteners-bolts").price,null,"do not use steel flange thickness for stainless collars");
});
test("repeat fill and save/load preserve instrument quantities without default duplicates",()=>{
  const p=fixture({type:"combined",valveConnection:"flanged"}),rows=build(p);
  const once=normalizeSpecificationItems(replaceSuctionSpec(p.entities["station-spec"].items,rows));
  const twice=normalizeSpecificationItems(replaceSuctionSpec(once,build(p)));
  assert.deepEqual(twice,once);
  p.entities["station-spec"].items=twice;
  const saved=parseProjectConfig(JSON.parse(JSON.stringify(p))).entities["station-spec"].items;
  assert.equal(saved.filter(x=>x.section==="suction"&&x.assemblyRole==="gauge").length,1);
  assert.equal(saved.find(x=>x.assemblyRole==="gauge").quantity,2);
});
test("missing nozzle and conflicting constructor override create visible errors, and pump change clears old port",()=>{
  const p=fixture();p.entities["system-input"].selectedPumpId="another-missing-model";
  assert.equal(suctionHydraulics(p.entities["station-dn"],p.entities["system-input"],p.entities["station-settings"]).port,null);
  assert.ok(byRole(build(synchronizeCollectors(p)),"primary-error"));
  const conflict=fixture();conflict.entities["station-collectors"].suction.overrides.primaryDn=80;
  assert.match(byRole(build(synchronizeCollectors(conflict)),"primary-error").details,/переопределения/);
});
test("secondary branches scale independently while common instruments do not double",()=>{
  let p=fixture({type:"combined",pumpDn:80,valveDn:80,pumpConnection:"flanged",valveConnection:"flanged"});
  Object.assign(p.entities["system-input-2"],{calculated:true,selectedPumpId:"secondary-test",flowRate:2,head:30,workingPumpCount:1,reservePumpCount:1});
  Object.assign(p.entities["station-dn"],{secondaryPumpSuctionPort:{pumpId:"secondary-test",dn:25,connection:"threaded",source:"test"}});
  p=synchronizeCollectors(p);const rows=build(p);
  assert.equal(byRole(rows,"secondary-union").quantity,2);assert.equal(byRole(rows,"secondary-flax").quantity,.6);
  assert.equal(byRole(rows,"network-gaskets").quantity,2);assert.equal(byRole(rows,"gauge").quantity,2);
  assert.ok(!byRole(rows,"secondary-limit-switches"));
});

const pageUrl=new URL("../app/page.tsx",import.meta.url),page=await readFile(pageUrl,"utf8");
const actualSelection=[
  'import {recommendedDn,defaultCollectorMaterial,resolveDnConnection,suctionHydraulics,dischargeHydraulics} from "./dn-defaults";',
  'import {buildSuctionSpec,replaceSuctionSpec,suctionFingerprint,checkSuctionSpecPressure} from "./suction-spec";',
  'import {buildDischargeSpec,replaceDischargeSpec,checkDischargeSpecPressure} from "./discharge-spec";',
  'import {normalizeSpecificationItems,specificationOption} from "./specification-items";',
  'import {synchronizeCollectors} from "./collector-project";',
  page.match(/^const isCalculated =.*$/m)[0],page.match(/^const isSecondaryEnabled =.*$/m)[0],
  page.match(/^const componentFieldLabel=.*$/m)[0],
  page.slice(page.indexOf("const isJockeyCircuit="),page.indexOf("function DnCalculator(")),
  page.slice(page.indexOf("const HYDRAULIC_SPEC_OPTIONS:"),page.indexOf("function PanelContent(")),
  "let loadedComponentsDatabase; export {refreshSuctionSpecification};",
  'export function changeCollectorMode(project, simultaneous, database) { let updated=project; loadedComponentsDatabase=database; const updateConfig=change=>{updated=refreshSuctionSpecification(synchronizeCollectors(change(updated)),database);}; const catalogue=[{id:"selected-pump"}]; const controlCabinets=[],smartCabinets=[]; const projectControlCabinetItem=()=>{throw new Error("Collector mode must preserve control cabinet items");};',
  page.slice(page.indexOf("  const updateSettings ="),page.indexOf("  const addSelectedPumpToSpec =")),
  'updateSettings({combinedCircuitsSimultaneous:simultaneous}); return updated; }',
].join("\n");
const {refreshSuctionSpecification:refresh,changeCollectorMode}=await loadTs(pageUrl,{[pageUrl.href]:actualSelection});
test("inlet pressure refreshes collector and each selected part through head/PN changes and save/load",()=>{
  const db={items:binding.items,collectorCatalog:catalog};
  let p=fixture({pumpDn:80,valveDn:80,pumpConnection:"flanged",valveConnection:"flanged"});
  p.entities["station-settings"].inletHead=200;
  p=refresh(synchronizeCollectors(p),db,true);
  const collector=()=>p.entities["station-spec"].items.find(i=>i.option==="suctionCollector");
  assert.equal(collector().inletPressureCheck.checks[0].status,"exceeded");
  const rows=p.entities["station-spec"].items;
  for(const item of [rows.find(i=>i.option==="primarySuctionValve"),byRole(rows,"primary-insertion"),byRole(rows,"primary-pump-flange-weldFlange")]) {
    assert.equal(item.inletPressureCheck.checks[0].status,"exceeded");
    assert.equal(item.status,"confirmation");assert.ok(item.price>0);
  }
  const originalPrice=byRole(rows,"primary-insertion").price;
  p.entities["station-settings"].inletHead=30;
  p=refresh(synchronizeCollectors(p),db);
  assert.equal(collector().inletPressureCheck.checks[0].status,"within-limit");
  assert.equal(byRole(p.entities["station-spec"].items,"primary-insertion").status,"selected");
  assert.equal(byRole(p.entities["station-spec"].items,"primary-insertion").price,originalPrice);
  assert.equal(p.entities["station-dn"].pn,16);
  p.entities["station-settings"].inletHead=200;
  p.entities["station-dn"].pn=25;
  p=refresh(synchronizeCollectors(p),db);
  assert.equal(collector().inletPressureCheck.checks[0].status,"within-limit");
  p=refresh(parseProjectConfig(JSON.parse(JSON.stringify(p))),db);
  assert.equal(collector().inletPressureCheck.checks[0].status,"within-limit");
  assert.equal(p.entities["station-dn"].pn,25);
  assert.equal(refresh(p,db),p);
});

test("fallback gasket warning and price survive pressure warning removal; changed catalogue rating is rechecked",()=>{
  let p=fixture({pumpDn:150,valveDn:150,pumpConnection:"flanged",valveConnection:"flanged",pn:25});
  const items=structuredClone(binding.items);
  // Only a lower PN16 gasket remains for this DN; selection still uses the existing fallback rule.
  const candidates=items.filter(i=>i.catalogId==="прокладки"&&i.fields.some(f=>f.headerPath.at(-1)==="DN"&&Number(f.value)===150));
  assert.ok(candidates.length);
  for(const item of candidates) for(const field of item.fields) {
    if(field.headerPath.at(-1)==="PN")field.value=16;
    if(field.headerPath.at(-1)==="Совместимые PN")field.value="16";
  }
  const db={items,collectorCatalog:catalog};
  p.entities["station-settings"].inletHead=200;
  p=refresh(synchronizeCollectors(p),db,true);
  const high=byRole(p.entities["station-spec"].items,"primary-pump-gasket");
  assert.equal(high.inletPressureCheck.checks[0].status,"exceeded");
  assert.match(high.description,/PN прокладки ниже требуемого/);
  assert.ok(high.price>0);
  p.entities["station-settings"].inletHead=30;
  p=refresh(p,db);
  const low=byRole(p.entities["station-spec"].items,"primary-pump-gasket");
  assert.equal(low.inletPressureCheck.checks[0].status,"within-limit");
  assert.equal(low.description,high.description);
  assert.equal(low.status,"confirmation");assert.equal(low.price,high.price);
  const item=items.find(i=>i.id===low.equipmentId);
  item.fields.find(f=>f.headerPath.at(-1)==="PN").value=1;
  p=refresh(p,db);
  assert.equal(byRole(p.entities["station-spec"].items,"primary-pump-gasket").inletPressureCheck.checks[0].status,"exceeded");
});

test("PN25 common collector retains a warning on actual PN16 equipment in its first circuit",()=>{
  const db={items:binding.items,collectorCatalog:catalog};
  let p=fixture({type:"combined",pumpDn:80,valveDn:80,pumpConnection:"flanged",valveConnection:"flanged"});
  p.entities["station-settings"].inletHead=200;
  Object.assign(p.entities["system-input-2"],{flowRate:20,head:30,workingPumpCount:1,reservePumpCount:0,calculated:true});
  p.entities["station-dn"].secondaryPn=25;
  p=refresh(synchronizeCollectors(p),db,true);
  const rows=p.entities["station-spec"].items;
  assert.equal(p.entities["station-collectors"].suction.configuration.pn,25);
  assert.equal(rows.find(i=>i.option==="suctionCollector").inletPressureCheck.checks[0].status,"within-limit");
  const valve=rows.find(i=>i.option==="primarySuctionValve");
  assert.equal(valve.inletPressureCheck.checks[0].status,"exceeded");
  assert.equal(valve.status,"confirmation");assert.ok(valve.price>0);
});

test("zero/negative inlet head retains vacuum instrument selection without PN excess warnings",()=>{
  const db={items:binding.items,collectorCatalog:catalog};
  for(const head of [0,-3]) {
    let p=fixture();p.entities["station-settings"].inletHead=head;
    p=refresh(synchronizeCollectors(p),db,true);
    assert.ok(p.entities["station-spec"].items.every(i=>!i.inletPressureCheck?.checks.some(c=>c.status==="exceeded")));
    assert.match(byRole(p.entities["station-spec"].items,"gauge").details,/учтено разрежение/);
  }
});
test("common suction mode refreshes network parts and survives project reload without losing user items",()=>{
  const db={items:binding.items,collectorCatalog:catalog};
  let p=fixture({type:"combined"});
  p.entities["station-collectors"].suction.overrides={};
  p.entities["system-input"].flowRate=50;
  Object.assign(p.entities["system-input-2"],{flowRate:50,head:30,workingPumpCount:2,reservePumpCount:1,calculated:true});
  const custom={position:"09",name:"Пользовательская позиция",section:"frame",details:"Сохранить",quantity:7,unit:"шт.",price:123,description:"Вручную"};
  const customCabinet={...custom,position:"10",name:"Пользовательский шкаф",section:"control"};
  p.station.selectedPumpId="selected-pump";
  p.station.totalPumpCount=3;
  p.entities["station-spec"].items.push(custom,customCabinet);
  p=refresh(synchronizeCollectors(p),db,true);
  for(const simultaneous of [false,true,false,true]) {
    p=changeCollectorMode(p,simultaneous,db);
    const expected=simultaneous?150:100;
    for(let reload=0;reload<2;reload++) {
      const rows=p.entities["station-spec"].items;
      assert.equal(p.entities["station-collectors"].suction.configuration.dn,expected);
      assert.equal(rows.filter(i=>i.option==="suctionCollector").length,1);
      assert.match(rows.find(i=>i.option==="suctionCollector").details,new RegExp(`^В${expected}_`));
      assert.match(byRole(rows,"network-gaskets").details,new RegExp(`DN${expected}\\b`));
      assert.match(byRole(rows,"network-fasteners-bolts").details,new RegExp(`DN${expected}\\b`));
      assert.equal(rows.filter(i=>i.section==="suction"&&i.assemblyRole==="network-gaskets").length,1);
      assert.deepEqual(rows.find(i=>i.name===custom.name),{...custom,option:undefined});
      assert.deepEqual(rows.find(i=>i.name===customCabinet.name),{...customCabinet,option:undefined});
      p=refresh(parseProjectConfig(JSON.parse(JSON.stringify(p))),db);
    }
    assert.deepEqual(refresh(p,db),p);
  }
});
test("actual page fill uses corrected DN, auto-refreshes changed counts and is idempotent",()=>{
  const db={items:binding.items,collectorCatalog:catalog};
  const once=refresh(fixture({pumpDn:25,valveDn:50}),db,true);
  const rows=once.entities["station-spec"].items;
  assert.match(rows.find(x=>x.option==="primarySuctionValve").name,/DN25/);
  assert.equal(rows.find(x=>x.option==="primarySuctionValve").status,"confirmation");
  assert.equal(rows.find(x=>x.option==="primarySuctionValve").inletPressureCheck.checks[0].status,"missing-head");
  assert.equal(rows.filter(x=>x.option==="primaryCheckValve").length,1);
  assert.deepEqual(refresh(once,db),once);
  once.entities["system-input"].reservePumpCount=3;
  const changed=refresh(synchronizeCollectors(once),db).entities["station-spec"].items;
  assert.equal(byRole(changed,"primary-union").quantity,5);
  assert.equal(byRole(changed,"primary-flax").quantity,1.5);
  assert.equal(changed.find(x=>x.option==="primarySuctionValve").quantity,5);
  assert.equal(changed.filter(x=>x.section==="suction"&&x.assemblyRole==="gauge").length,1);
});
test("partially entered nozzle never falls back to calculated DN or a catalogue connection",()=>{
  let p=fixture();
  p.entities["station-dn"].pumpSuctionPort.dn=null;
  p=parseProjectConfig(JSON.parse(JSON.stringify(p)));
  assert.equal(p.entities["station-dn"].pumpSuctionPort.dn,null);
  assert.equal(suctionHydraulics(p.entities["station-dn"],p.entities["system-input"],p.entities["station-settings"]).port,null);
  assert.ok(byRole(build(p),"primary-error"));
});

test("inlet head refreshes instruments and persists without affecting system static head",()=>{
  const db={items:binding.items,collectorCatalog:catalog};
  let p=refresh(fixture(),db,true);
  assert.equal(byRole(p.entities["station-spec"].items,"gauge").name,"Манометр");
  assert.equal(byRole(p.entities["station-spec"].items,"gauge").status,"confirmation");
  p.entities["station-settings"].inletHead=30;
  p=refresh(p,db);
  const gauge=byRole(p.entities["station-spec"].items,"gauge");
  assert.equal(gauge.equipmentId,"кипиа-001-r0005");
  assert.equal(gauge.price,511.79);
  assert.equal(gauge.status,"confirmation");
  assert.equal(gauge.inletPressureCheck.checks[0].status,"unknown-limit");
  assert.ok(!gauge.description.includes("Предупреждение:"));
  assert.match(gauge.details,/0…0,6 МПа/);
  assert.equal(byRole(p.entities["station-spec"].items,"pressure-switch").equipmentId,"кипиа-002-r0013");
  const saved=parseProjectConfig(JSON.parse(JSON.stringify(p)));
  assert.equal(saved.entities["station-settings"].inletHead,30);
  assert.equal(saved.entities["system-input"].staticHead,0);
  const reloaded=refresh(saved,db);
  assert.equal(byRole(reloaded.entities["station-spec"].items,"gauge").equipmentId,gauge.equipmentId);
  assert.equal(refresh(reloaded,db),reloaded);
  saved.entities["station-settings"].inletHead=null;
  const cleared=refresh(saved,db);
  const rows=parseProjectConfig(JSON.parse(JSON.stringify(cleared))).entities["station-spec"].items;
  assert.equal(byRole(rows,"gauge").name,"Манометр");
  assert.equal(byRole(rows,"gauge").price,511.79);
  assert.equal(byRole(rows,"gauge").status,"confirmation");
  assert.match(byRole(rows,"gauge").details,/⚠ Предупреждение:/);
  assert.match(byRole(rows,"gauge").description,/Требуется -0,1…0,15 МПа, выбран 0…0,6 МПа/);
  assert.equal(rows.filter(x=>x.section==="suction"&&/^(Манометр|Мановакуумметр)$/.test(x.name)).length,1);
});

test("saved specifications using the previous gauge policy refresh to a priced fallback with warning",()=>{
  const db={items:binding.items,collectorCatalog:catalog};
  const p=refresh(fixture(),db,true);
  for(const row of p.entities["station-spec"].items.filter(x=>x.generatedBy==="suction-line"))row.sourceFingerprint=row.sourceFingerprint.replace("instruments-v2","instruments-v1");
  const old=byRole(p.entities["station-spec"].items,"gauge");
  old.name="Мановакуумметр";old.price=null;old.equipmentId=undefined;
  const updated=refresh(p,db);
  const gauge=byRole(updated.entities["station-spec"].items,"gauge");
  assert.equal(gauge.name,"Манометр");assert.equal(gauge.price,511.79);
  assert.equal(gauge.status,"confirmation");assert.match(gauge.description,/Предупреждение:/);
  assert.equal(updated.entities["station-spec"].items.filter(x=>x.section==="suction"&&x.assemblyRole==="gauge").length,1);
});

test("old and invalid saved inlet heads remain unspecified; negative heads survive reload",()=>{
  for(const value of [undefined,null,"30",Infinity,NaN]) {
    const p=fixture();p.entities["station-settings"].inletHead=value;
    assert.equal(parseProjectConfig(p).entities["station-settings"].inletHead,null);
  }
  const p=fixture();p.entities["station-settings"].inletHead=-3;
  assert.equal(parseProjectConfig(p).entities["station-settings"].inletHead,-3);
});

test("gaskets fill every existing flange role with compatible execution, quantities and max prices",()=>{
  const rows=build(fixture({pumpDn:80,valveDn:80,pumpConnection:"flanged",valveConnection:"flanged"}));
  for(const role of ["primary-pump-gasket","primary-valve-gaskets"]) {
    assert.equal(byRole(rows,role).price,32.94);assert.equal(byRole(rows,role).status,"selected");
    assert.match(byRole(rows,role).details,/PN прокладки 10\/16\/25\/40/);
  }
  assert.equal(byRole(rows,"primary-pump-gasket").quantity,3);
  assert.equal(byRole(rows,"primary-valve-gaskets").quantity,6);
  assert.equal(byRole(rows,"network-gaskets").quantity,2);
  assert.equal(byRole(rows,"network-gaskets").price,47.58);
  const pn25=build(fixture({pumpDn:100,valveDn:100,pumpConnection:"flanged",valveConnection:"flanged",pn:25}));
  assert.equal(byRole(pn25,"primary-pump-gasket").price,100);
  const missing=build(fixture({pumpDn:200,valveDn:200,pumpConnection:"flanged",valveConnection:"flanged",pn:25}));
  assert.equal(byRole(missing,"primary-pump-gasket").price,800);
  assert.equal(byRole(missing,"primary-pump-gasket").status,"confirmation");
  assert.match(byRole(missing,"primary-pump-gasket").details,/⚠ Предупреждение:.*требуется PN25.*PN40/);
});

test("flax is priced in metres for pump branches and common threaded network connections",()=>{
  const p=fixture({network:"threaded"});
  const rows=build(p),branch=byRole(rows,"primary-flax"),network=byRole(rows,"network-flax");
  for(const row of [branch,network]) {
    assert.equal(row.unit,"м");assert.equal(row.price,51.5);assert.equal(row.status,"selected");assert.ok(row.equipmentId);
  }
  assert.equal(branch.quantity,.9);assert.equal(network.quantity,.2);
  assert.equal(Number(((branch.quantity+network.quantity)*branch.price).toFixed(2)),56.65);
  const db={items:binding.items,collectorCatalog:catalog};
  const saved=refresh(p,db,true);
  for(const row of saved.entities["station-spec"].items.filter(x=>x.generatedBy==="suction-line"))row.sourceFingerprint=row.sourceFingerprint.replace("seals-v2","seals-v1");
  byRole(saved.entities["station-spec"].items,"primary-flax").price=null;
  const updated=refresh(saved,db);
  assert.equal(byRole(updated.entities["station-spec"].items,"primary-flax").price,51.5);
  assert.equal(refresh(updated,db),updated);
  const loaded=parseProjectConfig(JSON.parse(JSON.stringify(updated))).entities["station-spec"].items;
  assert.equal(loaded.filter(x=>x.section==="suction"&&x.assemblyRole==="primary-flax").length,1);
  assert.equal(byRole(loaded,"primary-flax").price,51.5);
});

test("nearest lower PN gasket remains priced with a persisted warning; exact matches stay green",()=>{
  const p=fixture({pumpDn:300,valveDn:300,pumpConnection:"flanged",valveConnection:"flanged",pn:16});
  const rows=build(p),gasket=byRole(rows,"primary-pump-gasket");
  assert.equal(gasket.price,350);assert.equal(gasket.status,"confirmation");
  assert.match(gasket.description,/PN прокладки ниже требуемого/);
  p.entities["station-spec"].items=replaceSuctionSpec(p.entities["station-spec"].items,rows);
  const loaded=parseProjectConfig(JSON.parse(JSON.stringify(p))).entities["station-spec"].items;
  assert.equal(byRole(loaded,"primary-pump-gasket").status,"confirmation");
  const exact=byRole(build(fixture({pumpDn:80,valveDn:80,pumpConnection:"flanged",valveConnection:"flanged"})),"primary-pump-gasket");
  assert.equal(exact.status,"selected");assert.ok(!exact.description.includes("Предупреждение:"));
});

test("instrument valve uses the specified article, price and station quantities, including saved specs",()=>{
  for(const [type,quantity] of [["utility",1],["smart",1],["fire",2],["combined",2]]) {
    const p=fixture({type}),row=byRole(build(p),"instrument-valve");
    assert.equal(row.equipmentId,instrumentValveData.legacyId);assert.equal(row.price,650);
    assert.equal(row.quantity,quantity);assert.equal(row.status,"selected");
    assert.match(row.name,/44\.15\.В-В\.С\.Б/);assert.match(row.details,/PN40/);
  }
  const db={items:binding.items,collectorCatalog:catalog};
  const saved=refresh(fixture(),db,true);
  for(const row of saved.entities["station-spec"].items.filter(x=>x.generatedBy==="suction-line"))row.sourceFingerprint=row.sourceFingerprint.replace(',"instrument-valve-v1"','');
  byRole(saved.entities["station-spec"].items,"instrument-valve").price=null;
  const updated=refresh(saved,db);
  assert.equal(byRole(updated.entities["station-spec"].items,"instrument-valve").price,650);
  assert.equal(refresh(updated,db),updated);
  const loaded=parseProjectConfig(JSON.parse(JSON.stringify(updated))).entities["station-spec"].items;
  assert.equal(loaded.filter(x=>x.section==="suction"&&x.assemblyRole==="instrument-valve").length,1);
  assert.equal(byRole(loaded,"instrument-valve").price,650);
});

test("missing and stale valve prices refresh even when the saved selection fingerprint is current",()=>{
  const db={items:binding.items,collectorCatalog:catalog};
  for(const price of [null,455.67]) {
    const saved=refresh(fixture(),db,true);
    const old=byRole(saved.entities["station-spec"].items,"instrument-valve");
    old.price=price;old.status="clarify";
    const updated=refresh(saved,db);
    const row=byRole(updated.entities["station-spec"].items,"instrument-valve");
    assert.equal(row.price,650);assert.equal(row.status,"confirmation");
    assert.equal(row.inletPressureCheck.checks[0].status,"missing-head");
    assert.equal(row.sourceFingerprint,old.sourceFingerprint);
    assert.equal(refresh(updated,db),updated);
  }
});
