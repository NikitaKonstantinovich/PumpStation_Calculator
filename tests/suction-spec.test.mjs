import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { createProject,parseProjectConfig }=await loadTs(new URL("../app/project-config.ts",import.meta.url));
const { synchronizeCollectors }=await loadTs(new URL("../app/collector-project.ts",import.meta.url));
const { suctionHydraulics }=await loadTs(new URL("../app/dn-defaults.ts",import.meta.url));
const { buildSuctionSpec,replaceSuctionSpec }=await loadTs(new URL("../app/suction-spec.ts",import.meta.url));
const { makeCollectorCatalog }=await loadTs(new URL("../app/collector-catalog.ts",import.meta.url));
const { normalizeSpecificationItems }=await loadTs(new URL("../app/specification-items.ts",import.meta.url));
const binding=JSON.parse(await readFile(new URL("../public/binding-components.json",import.meta.url),"utf8"));
const catalog=makeCollectorCatalog(binding);
function fixture({pumpDn=40,pumpConnection="threaded",valveDn=40,valveConnection="threaded",type="utility",pn=16,count=3,material="st20",network="flanged"}={}){
  const p=createProject();
  Object.assign(p.entities["system-input"],{selectedPumpId:"manual-test",flowRate:6,head:30,staticHead:0,workingPumpCount:count-1,reservePumpCount:1,calculated:true});
  Object.assign(p.entities["station-settings"],{stationType:type});
  Object.assign(p.entities["station-dn"],{collectorMaterial:material,suctionValveDn:valveDn,dischargeValveDn:valveDn,connectionType:valveConnection,suctionValveType:valveConnection==="threaded"?"ball":"butterfly",pn,pumpSuctionPort:{pumpId:"manual-test",dn:pumpDn,connection:pumpConnection,source:"test"}});
  p.entities["station-collectors"].suction.overrides={connection:network,dn:network==="flanged"?100:50};
  return synchronizeCollectors(p);
}
const build=p=>buildSuctionSpec(p,binding,catalog);
const byRole=(rows,role)=>rows.find(x=>x.assemblyRole===role);
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
  assert.equal(saved.filter(x=>x.section==="suction"&&x.name==="Манометр").length,1);
  assert.equal(saved.find(x=>x.name==="Манометр").quantity,2);
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
  'import {recommendedDn,defaultCollectorMaterial,resolveDnConnection,suctionHydraulics} from "./dn-defaults";',
  'import {buildSuctionSpec,replaceSuctionSpec,suctionFingerprint} from "./suction-spec";',
  'import {normalizeSpecificationItems,specificationOption} from "./specification-items";',
  page.match(/^const isCalculated =.*$/m)[0],page.match(/^const isSecondaryEnabled =.*$/m)[0],
  page.match(/^const componentFieldLabel=.*$/m)[0],
  page.slice(page.indexOf("const isJockeyCircuit="),page.indexOf("function DnCalculator(")),
  page.slice(page.indexOf("const HYDRAULIC_SPEC_OPTIONS:"),page.indexOf("function PanelContent(")),
  "let loadedComponentsDatabase; export {refreshSuctionSpecification};",
].join("\n");
const {refreshSuctionSpecification:refresh}=await loadTs(pageUrl,{[pageUrl.href]:actualSelection});
test("actual page fill uses corrected DN, auto-refreshes changed counts and is idempotent",()=>{
  const db={items:binding.items,collectorCatalog:catalog};
  const once=refresh(fixture({pumpDn:25,valveDn:50}),db,true);
  const rows=once.entities["station-spec"].items;
  assert.match(rows.find(x=>x.option==="primarySuctionValve").name,/DN25/);
  assert.equal(rows.find(x=>x.option==="primarySuctionValve").status,"selected");
  assert.equal(rows.filter(x=>x.option==="primaryCheckValve").length,1);
  assert.deepEqual(refresh(once,db),once);
  once.entities["system-input"].reservePumpCount=3;
  const changed=refresh(synchronizeCollectors(once),db).entities["station-spec"].items;
  assert.equal(byRole(changed,"primary-union").quantity,5);
  assert.equal(byRole(changed,"primary-flax").quantity,1.5);
  assert.equal(changed.find(x=>x.option==="primarySuctionValve").quantity,5);
  assert.equal(changed.filter(x=>x.name==="Манометр").length,1);
});
test("partially entered nozzle never falls back to calculated DN or a catalogue connection",()=>{
  let p=fixture();
  p.entities["station-dn"].pumpSuctionPort.dn=null;
  p=parseProjectConfig(JSON.parse(JSON.stringify(p)));
  assert.equal(p.entities["station-dn"].pumpSuctionPort.dn,null);
  assert.equal(suctionHydraulics(p.entities["station-dn"],p.entities["system-input"],p.entities["station-settings"]).port,null);
  assert.ok(byRole(build(p),"primary-error"));
});
