import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { createProject, parseProjectConfig, resources, sync, rows } from "./fixtures/station-specification.mjs";
const { parseManualPump, manualPumpDraft } = await loadTs(new URL("../app/manual-pump.ts",import.meta.url));
const { catalogPumpPort, resolvePumpPort, resolvePumpPortData } = await loadTs(new URL("../app/pump-ports.ts",import.meta.url));
const { suctionHydraulics, dischargeHydraulics } = await loadTs(new URL("../app/dn-defaults.ts",import.meta.url));
const { collectorRecommendation } = await loadTs(new URL("../app/collector-project.ts",import.meta.url));
const { collectProjectIssues } = await loadTs(new URL("../app/diagnostics.ts",import.meta.url));
const { collectorAccessError } = await loadTs(new URL("../app/project-access.ts",import.meta.url));
const manual = (extra={},id="manual-dn-fixture") => JSON.parse(JSON.stringify(parseManualPump({model:"Manual DN 80/65",type:"vertical_multistage",inletDn:"80",outletDn:"65",inletType:"flange",outletType:"flange",inletPn:"16",outletPn:"25",curve:"0; 60\n10; 50\n20; 30",...extra},id)));
const select = (p,pump,secondary=false) => Object.assign(p.entities[secondary?"system-input-2":"system-input"],{selectedPumpId:pump.id,flowRate:10,head:50,staticHead:0,workingPumpCount:1,reservePumpCount:1,calculated:true});

test("previously saved manual records provide separate nozzle DN, connection and PN without a generated index", () => {
  const pump=manual(), p=createProject(), dn=p.entities["station-dn"];
  for (const secondary of [false,true]) {
    select(p,pump,secondary); const input=p.entities[secondary?"system-input-2":"system-input"];
    assert.equal(resolvePumpPort(dn,input,secondary,"inlet",pump).dn,80);
    assert.equal(resolvePumpPort(dn,input,secondary,"outlet",pump).dn,65);
    assert.equal(catalogPumpPort(pump.id,"inlet",pump).maxPressure,16);
    assert.equal(catalogPumpPort(pump.id,"outlet",pump).maxPressure,25);
    assert.equal(suctionHydraulics(dn,input,p.entities["station-settings"],secondary,pump).dn,80);
    assert.equal(dischargeHydraulics(dn,input,p.entities["station-settings"],secondary,pump).dn,65);
    assert.equal(resolvePumpPort(dn,input,secondary,"inlet",manual({},"another-id")),null);
  }
  assert.deepEqual(parseManualPump(manualPumpDraft(pump),pump.id),pump);
});

test("partial records display the known DN and keep the missing connection unknown", () => {
  const pump=manual({inletType:"",outletDn:"",outletType:""}), p=createProject(); select(p,pump);
  const input=p.entities["system-input"], dn=p.entities["station-dn"];
  assert.equal(resolvePumpPortData(dn,input,false,"inlet",pump).dn,80);
  assert.equal(resolvePumpPortData(dn,input,false,"inlet",pump).connection,null);
  assert.equal(resolvePumpPort(dn,input,false,"inlet",pump),null);
  assert.equal(resolvePumpPortData(dn,input,false,"outlet",pump),null);
  const hydraulic=suctionHydraulics(dn,input,p.entities["station-settings"],false,pump);
  assert.equal(hydraulic.dn,80);
  assert.match(hydraulic.errors[0],/Укажите тип соединения/);
});

test("project overrides win, reset uses the current manual record, and another pump cannot inherit a nozzle", () => {
  const p=createProject(),pump=manual();select(p,pump);
  const dn=p.entities["station-dn"],input=p.entities["system-input"];
  dn.pumpSuctionPort={pumpId:pump.id,dn:100,connection:"flanged",source:"Указано пользователем"};
  assert.equal(resolvePumpPort(dn,input,false,"inlet",pump).dn,100);
  const saved=parseProjectConfig(JSON.parse(JSON.stringify(p)));
  assert.equal(resolvePumpPort(saved.entities["station-dn"],input,false,"inlet",pump).dn,100);
  dn.pumpSuctionPort=null;
  assert.equal(resolvePumpPort(dn,input,false,"inlet",manual({inletDn:"125"})).dn,125);
  const other=manual({inletDn:"32",inletType:"threaded"},"manual-other"); select(p,other);
  assert.equal(resolvePumpPort(dn,input,false,"inlet",other).dn,32);
  assert.equal(resolvePumpPort(dn,input,false,"inlet",other).connection,"threaded");
});

test("manual nozzles drive collectors, valve and line specifications and diagnostics in both circuits", () => {
  const p=createProject(), first=manual(),second=manual({inletDn:"50",outletDn:"40",inletType:"threaded",outletType:"threaded"},"manual-secondary");
  p.entities["station-settings"].stationType="combined"; select(p,first);select(p,second,true);
  const pumps=[...resources.pumps,first,second], next=sync(p,{...resources,pumps});
  for (const [side,expected] of [["suction",[80,50]],["discharge",[65,40]]]) {
    const c=next.entities["station-collectors"][side].configuration;
    assert.deepEqual([c.primary.dn,c.secondary.dn],expected);
    assert.deepEqual([c.primary.connection,c.secondary.connection],["flanged","threaded"]);
  }
  assert.ok(rows(next).some(item=>item.generatedBy==="suction-line"));
  assert.ok(rows(next).some(item=>item.generatedBy==="discharge-line"));
  assert.ok(!rows(next).some(item=>item.assemblyRole?.endsWith("-error")));
  const issues=collectProjectIssues(next,pumps,resources.components.collectorCatalog,[]);
  assert.ok(!issues.some(issue=>issue.tool==="dn"&&/Укажите DN и соединение/.test(issue.message)));
  // Server-side automatic collector validation uses the same trusted manual data.
  const standard=createProject();select(standard,first);
  const configuration=collectorRecommendation(standard,"suction",[first]);
  assert.equal(collectorAccessError(configuration,"base",undefined,[first]),null);
  assert.ok(collectorAccessError({...configuration,primary:{...configuration.primary,dn:125}},"base",undefined,[first]));
});
