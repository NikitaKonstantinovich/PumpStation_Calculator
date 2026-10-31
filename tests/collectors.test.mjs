globalThis.__PSC_RELEASE_PROFILE__ = "full";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { loadTs } from "./load-ts.mjs";

const calc = await loadTs(new URL("../app/collector-calculations.ts", import.meta.url));
const model = await loadTs(new URL("../app/collector-project.ts", import.meta.url));
const projectModule = await loadTs(new URL("../app/project-config.ts", import.meta.url));
const { collectorCode, calculateCollector, collectorFlow, collectorLength, flowSpeed } = calc;
const config = (patch = {}) => ({ type: "discharge", dn: 100, pn: 16, material: "aisi304", connection: "flanged", eccentric: false, stationType: "utility", simultaneous: false, jockey: false, primary: { flow: 60, working: 2, reserve: 1, dn: 80, connection: "flanged", spacing: 500, pn: 16 }, secondary: null, ...patch });
const two = (patch = {}) => config({ stationType: "combined", secondary: { flow: 10, working: 1, reserve: 0, dn: 50, connection: "threaded", spacing: 400, pn: 16 }, ...patch });
function fixtureCatalog() {
  const components = [];
  const sizes = { 15: [21.3,17.3], 20: [26.9,22.9], 50: [60.3,56.3], 80: [88.9,83.9], 100: [114.3,108.3], 150: [159,153], 250: [273,263] };
  for (const material of ["aisi304", "st20"]) for (const [size, [outerDiameter, innerDiameter]] of Object.entries(sizes)) for (const pn of [10,16,25]) for (const kind of ["pipe", "weldFlange", "looseFlange", "collar", "nipple", "plug"]) {
    components.push({ id: `${material}-${kind}-${size}-${pn}`, name: `${kind} DN${size}`, kind, dn: Number(size), pn, material, threadGender: kind === "plug" ? "female" : undefined, outerDiameter, innerDiameter, price: kind === "pipe" ? 1000 : 100, source: "TEST FIXTURE ONLY" });
  }
  return { version: "fixture-1", components, valveBolts: Object.keys(sizes).flatMap(dn => [10,16,25].flatMap(pn => ["st20","aisi304"].map(material => ({ dn: Number(dn), pn, material, model: "017W", length: 50, minimumLengthMm: 49, componentId: "fixture-bolt", diameter: 16, source: "TEST FIXTURE ONLY", warnings: [] })))), paintingRates: Object.keys(sizes).map(dn => ({ id: `painting-${dn}`, dn: Number(dn), material: "st20", pricePerMeter: { 100: 800, 80: 650, 50: 450 }[dn] ?? 250, source: "TEST FIXTURE ONLY", warnings: [] })), bolts: Object.keys(sizes).flatMap(dn => [10,16,25].map(pn => ({ dn: Number(dn), pn, length: 50, source: "TEST FIXTURE ONLY" }))) };
}
const catalog = fixtureCatalog();
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
test("01 single circuit canonical code", () => assert.equal(collectorCode(config()), "Н100_16_3_500_80_AISI304"));
test("02 two circuit canonical code", () => assert.equal(collectorCode(two()), 'Н100_16_3(1)_500(400)_80(2")_AISI304'));
test("03 eccentric suction canonical code", () => assert.equal(collectorCode(two({ type: "suction", eccentric: true })), 'В100_16_3(1)_500(400)_80(2")_AISI304_Э'));
test("04 discharge eccentric rejected", () => { assert.equal(collectorCode(config({ eccentric: true })), null); assert.equal(calculateCollector(config({ eccentric: true }), catalog).complete, false); });
test("branch larger than the main is an explicit constructor error; equal sizes and inactive circuits remain allowed", () => {
  for(const type of ["suction","discharge"]){const c=config({type,dn:65});assert.match(calc.collectorBranchDiameterErrors(c)[0],/Контур 1:.*DN80.*больше.*DN65/);assert.equal(collectorCode(c),null);const r=calculateCollector(c,catalog);assert.equal(r.complete,false);assert.equal(r.price,null);}
  const twoCircuits=two();twoCircuits.secondary.dn=150;assert.match(calc.collectorBranchDiameterErrors(twoCircuits)[0],/Контур 2:.*DN150.*DN100/);
  twoCircuits.stationType="utility";assert.deepEqual(calc.collectorBranchDiameterErrors(twoCircuits),[]);
  const equal=config({dn:80});assert.deepEqual(calc.collectorBranchDiameterErrors(equal,catalog),[]);assert.equal(calculateCollector(equal,catalog).complete,true);
  const dimensions=structuredClone(catalog);dimensions.components.find(p=>p.kind==="pipe"&&p.dn===80&&p.material==="aisi304"&&p.pn===16).outerDiameter=120;
  assert.match(calc.collectorBranchDiameterErrors(config(),dimensions)[0],/наружный диаметр.*120.*114.3/);assert.equal(calculateCollector(config(),dimensions).price,null);
});
test("05 thread above two inches rejected", () => { assert.equal(collectorCode(config({ connection: "threaded" })), null); const c=two(); c.secondary.dn=65; assert.equal(collectorCode(c),null); });
test("06 exactly two network flanges and two collars for low pressure stainless", () => { const r=calculateCollector(config(),catalog); assert.equal(r.bom.find(i=>i.role==="end-looseFlange").quantity,2); assert.equal(r.bom.find(i=>i.role==="end-collar").quantity,2); });
test("07 no network flanges on threaded collector", () => assert.equal(calculateCollector(config({dn:50,connection:"threaded"}),catalog).bom.filter(i=>i.role.startsWith("end-")).length,0));
test("08 one pump flange per branch including reserve", () => assert.equal(calculateCollector(config(),catalog).bom.find(i=>i.role==="branch1-looseFlange").quantity,3));
test("09 no flange on threaded secondary", () => assert.equal(calculateCollector(two(),catalog).bom.filter(i=>i.role.startsWith("branch2-")&&i.kind!=="pipe").length,0));
test("10 fasteners excluded from BOM and cost", () => { const r=calculateCollector(config(),catalog); assert.ok(r.bom.every(i=>!/(bolt|nut|washer|болт|гайк|шайб)/i.test(i.name))); near(r.price,r.bom.reduce((sum,i)=>sum+i.cost,0)); const changed=structuredClone(catalog); changed.components.push({id:"bolt",kind:"bolt",price:1e12}); near(calculateCollector(config(),changed).price,r.price); });
test("11 length uses both pump groups", () => assert.equal(collectorLength(two()),1900));
test("12 combined alternating flow is max", () => assert.equal(collectorFlow(two()).flow,60));
test("13 combined simultaneous flow is sum", () => assert.equal(collectorFlow(two({simultaneous:true})).flow,70));
test("14 jockey always alternating even with simultaneous flag", () => { const r=collectorFlow(two({stationType:"fire",jockey:true,simultaneous:true})); assert.equal(r.flow,60); assert.equal(r.mode,"Основные насосы и жокей работают раздельно"); });
test("15 stainless welding costs 5000 RUB/m", () => { const r=calculateCollector(config(),catalog); near(r.weldCost,r.weldLengthMm/1000*5000); });
test("16 steel welding costs 2400 RUB/m", () => { const r=calculateCollector(config({material:"st20"}),catalog); near(r.weldCost,r.weldLengthMm/1000*2400); assert.equal(r.bom.find(i=>i.role==="end-weldFlange").quantity,2); });

test("steel collector paints the body and all working/reserve branches at their own DN rates", () => {
  for (const type of ["suction", "discharge"]) {
    const c = config({ material: "st20", type }), result = calculateCollector(c, catalog);
    assert.equal(result.complete, true, result.warnings.join("; "));
    const paint = result.bom.filter(item => item.kind === "painting");
    assert.deepEqual(paint.map(item => item.role), ["painting-collector", "painting-branch1"]);
    near(paint[0].quantity, 1.5); near(paint[0].cost, 1.5 * 800);
    near(paint[1].quantity, 3 * (0.5 * 114.3 + 1.1 * 50) / 1000);
    near(paint[1].cost, 3 * 0.11215 * 650);
    assert.ok(paint.every(item => item.unit === "м" && item.source.includes("TEST FIXTURE ONLY")));
    near(result.price, result.bom.filter(item => item.kind !== "painting").reduce((sum, item) => sum + item.cost, 0) + 1418.6925);
    assert.equal(result.code, collectorCode(c));
  }
});

test("two active circuits paint each branch group once, including threaded branches and equal nominal diameters", () => {
  const c = two({ material: "st20" }), result = calculateCollector(c, catalog);
  assert.equal(result.complete, true, result.warnings.join("; "));
  const paint = result.bom.filter(item => item.kind === "painting");
  assert.equal(paint.length, 3);
  near(paint[0].quantity, 1.9); near(paint[0].cost, 1.9 * 800);
  near(paint[1].cost, 3 * 0.11215 * 650); near(paint[2].cost, 0.11215 * 450);
  c.secondary.dn = c.primary.dn; c.secondary.connection = "flanged";
  const sameDn = calculateCollector(c, catalog).bom.filter(item => item.kind === "painting");
  near(sameDn[1].quantity + sameDn[2].quantity, 4 * 0.11215);
  near(sameDn[1].cost + sameDn[2].cost, 4 * 0.11215 * 650);
  const inactive = calculateCollector({ ...c, stationType: "utility" }, catalog);
  assert.equal(inactive.bom.filter(item => item.kind === "painting").length, 2);
  near(inactive.bom.find(item => item.role === "painting-collector").quantity, 1.5);
});

test("painting does not affect stainless, geometry, welds or pressure checks", () => {
  const stainless = calculateCollector(config(), { ...catalog, paintingRates: undefined });
  assert.equal(stainless.complete, true); assert.ok(stainless.bom.every(item => item.kind !== "painting"));
  const c = config({ material: "st20", type: "suction" }), before = calculateCollector(c, catalog);
  const changed = structuredClone(catalog); changed.paintingRates.forEach(rate => { rate.pricePerMeter *= 2; });
  const after = calculateCollector(c, changed);
  assert.equal(after.lengthMm, before.lengthMm); assert.deepEqual(after.branchLengthsMm, before.branchLengthsMm);
  assert.deepEqual(after.welds, before.welds); assert.deepEqual(after.velocities, before.velocities);
  near(after.price - before.price, before.bom.filter(item => item.kind === "painting").reduce((sum, item) => sum + item.cost, 0));
  const checks = calc.collectorPressureChecks(c, 10, catalog);
  assert.equal(checks.length, 1 + before.bom.filter(item => !["painting", "welding"].includes(item.kind)).length);
  assert.ok(checks.every(check => !/окраска/i.test(check.message)));
});

test("missing or ambiguous painting rates and missing branch length block final pricing without zero estimates", () => {
  for (const mutate of [
    data => { data.paintingRates = undefined; },
    data => { data.paintingRates = data.paintingRates.filter(rate => rate.dn !== 80); },
    data => { data.paintingRates.find(rate => rate.dn === 80).pricePerMeter = null; },
    data => { data.paintingRates.find(rate => rate.dn === 80).source = ""; },
    data => { data.paintingRates.push({ ...data.paintingRates.find(rate => rate.dn === 80), id: "duplicate" }); },
  ]) {
    const data = structuredClone(catalog); mutate(data);
    const result = calculateCollector(config({ material: "st20" }), data);
    assert.equal(result.complete, false); assert.equal(result.price, null);
    assert.ok(result.warnings.some(warning => /окраски/.test(warning)));
    assert.equal(result.bom.find(item => item.role === "painting-branch1").cost, null);
  }
  const result = calculateCollector(config({ material: "st20" }), { ...catalog, valveBolts: [] });
  const paint = result.bom.find(item => item.role === "painting-branch1");
  assert.equal(paint.quantity, null); assert.equal(paint.cost, null); assert.equal(result.price, null);
});
function readyProject() { const p=projectModule.createProject(); Object.assign(p.entities["system-input"],{ flowRate:60,workingPumpCount:2,reservePumpCount:1 }); Object.assign(p.entities["station-dn"],{suctionCollectorDn:100,dischargeCollectorDn:100,suctionValveDn:80,dischargeValveDn:80,pn:16,connectionType:"flanged",collectorMaterial:"aisi304"}); return model.synchronizeCollectors(p); }
test("legacy complete collector with DN80 branches and DN65 main loses its ready status and price without changing manual DN",async()=>{
  let p=readyProject();const card=p.entities['station-collectors'].discharge;card.overrides.dn=65;p=model.synchronizeCollectors(p);
  const bad=p.entities['station-collectors'].discharge;bad.calculation={...calculateCollector(bad.configuration,catalog),complete:true,code:'legacy-65-80',price:12345};bad.calculationSourceFingerprint=bad.sourceFingerprint;bad.code='legacy-65-80';bad.status='complete';bad.databaseStatus='found';bad.database={id:'legacy',code:'legacy-65-80',price:12345};
  const fixed=model.synchronizeCollectors(p),after=fixed.entities['station-collectors'].discharge;assert.equal(after.configuration.dn,65);assert.equal(after.configuration.primary.dn,80);assert.equal(after.status,'incomplete');assert.equal(after.database,null);assert.equal(fixed.entities['station-spec'].items.find(i=>i.option==='dischargeCollector').price,null);
  const {collectProjectIssues}=await loadTs(new URL('../app/diagnostics.ts',import.meta.url));const issues=collectProjectIssues(fixed,[],null,[]);assert.ok(issues.some(i=>i.tool==='collectors'&&i.severity==='error'&&/DN80.*больше.*DN65/.test(i.message)));
});

function commonSuctionProject(stationType = "combined") {
  const p = readyProject();
  Object.assign(p.entities["station-settings"], { stationType, jockeyPump: stationType === "fire" });
  Object.assign(p.entities["system-input"], { flowRate: 50 });
  Object.assign(p.entities["system-input-2"], { flowRate: 50, workingPumpCount: 2, reservePumpCount: 3 });
  Object.assign(p.entities["station-dn"], { secondarySuctionCollectorDn: 100, secondarySuctionValveDn: 80 });
  return model.synchronizeCollectors(p);
}

test("common suction uses 50 or 100 m3/h and recommends DN100 or DN150", () => {
  let p = commonSuctionProject();
  for (const [simultaneous, flow, dn, diameter] of [[false, 50, 100, 108.3], [true, 100, 150, 153], [false, 50, 100, 108.3]]) {
    p.entities["station-settings"].combinedCircuitsSimultaneous = simultaneous;
    p = model.synchronizeCollectors(p);
    const state = p.entities["station-collectors"].suction;
    const result = calculateCollector(state.configuration, catalog);
    assert.equal(state.recommended.dn, dn);
    assert.equal(state.configuration.dn, dn);
    assert.equal(collectorFlow(state.configuration).flow, flow);
    assert.equal(result.flow, flow);
    near(result.velocities.collector, flowSpeed(flow, diameter));
    assert.equal(calc.collectorVelocityWarning(dn, result.velocities.collector), null);
    assert.match(p.entities["station-spec"].items.find(i => i.option === "suctionCollector").details, new RegExp(`^В${dn}_`));
  }
});

test("jockey flow, working pumps and reserves never increase common suction flow", () => {
  let p = commonSuctionProject("fire");
  for (const flowRate of [5, 50, 200, null]) {
    Object.assign(p.entities["system-input-2"], { flowRate, workingPumpCount: 4, reservePumpCount: 5 });
    p.entities["station-settings"].combinedCircuitsSimultaneous = true;
    p = model.synchronizeCollectors(p);
    const c = p.entities["station-collectors"].suction.configuration;
    assert.equal(collectorFlow(c).flow, 50);
    assert.equal(c.dn, 100);
    near(calculateCollector(c, catalog).velocities.collector, flowSpeed(50, 108.3));
  }
});

test("fire-only common suction uses first circuit even when second is larger or missing", () => {
  let p = commonSuctionProject();
  for (const flow of [200, null]) {
    p.entities["system-input-2"].flowRate = flow;
    p = model.synchronizeCollectors(p);
    const c = p.entities["station-collectors"].suction.configuration;
    assert.equal(collectorFlow(c).flow, 50);
    assert.equal(c.dn, 100);
    assert.equal(collectorFlow({ ...c, simultaneous: true }).flow, flow === null ? null : 250);
  }
  p.entities["station-settings"].combinedCircuitsSimultaneous = true;
  p = model.synchronizeCollectors(p);
  assert.equal(p.entities["station-collectors"].suction.recommended.dn, null);
});

test("manual common DN survives mode changes and reload with an excess velocity warning", () => {
  let p = commonSuctionProject();
  p.entities["station-collectors"].suction.overrides.dn = 100;
  p.entities["station-settings"].combinedCircuitsSimultaneous = true;
  p = projectModule.parseProjectConfig(JSON.parse(JSON.stringify(p)));
  const state = p.entities["station-collectors"].suction;
  assert.equal(state.recommended.dn, 150);
  assert.equal(state.configuration.dn, 100);
  const result = calculateCollector(state.configuration, catalog);
  assert.equal(result.flow, 100);
  near(result.velocities.collector, flowSpeed(100, 108.3));
  assert.match(calc.collectorVelocityWarning(100, result.velocities.collector), /превышает допустимую 2 м\/с/);
  assert.equal(calc.collectorVelocityWarning(250, 2), null);
  assert.match(calc.collectorVelocityWarning(250, 2.1), /2 м\/с/);
  assert.equal(calc.collectorVelocityWarning(300, 3), null);
  assert.match(calc.collectorVelocityWarning(300, 3.1), /3 м\/с/);
});

test("legacy simultaneous boolean restores common suction mode and invalidates old calculation", () => {
  for (const simultaneous of [false, true, undefined]) {
    let p = commonSuctionProject();
    const state = p.entities["station-collectors"].suction;
    state.calculation = calculateCollector(state.configuration, catalog);
    state.calculationSourceFingerprint = state.sourceFingerprint;
    p.entities["station-settings"].combinedCircuitsSimultaneous = simultaneous;
    p = projectModule.parseProjectConfig(JSON.parse(JSON.stringify(p)));
    assert.equal(p.entities["station-settings"].combinedCircuitsSimultaneous, simultaneous === true);
    assert.equal(p.entities["station-collectors"].suction.configuration.dn, simultaneous ? 150 : 100);
    if (simultaneous) {
      assert.equal(p.entities["station-collectors"].suction.status, "stale");
      assert.equal(p.entities["station-spec"].items.find(i => i.option === "suctionCollector").price, null);
    }
  }
});

test("utility and SMART common suction retain single-circuit sizing rules", () => {
  for (const stationType of ["utility", "smart"]) {
    const p = commonSuctionProject(stationType);
    const c = p.entities["station-collectors"].suction.configuration;
    assert.equal(c.dn, 100);
    assert.equal(c.secondary, null);
    assert.equal(collectorFlow(c).flow, 50);
  }
});

test("old maximum-flow calculation is stale even when collector DN and configuration match", () => {
  let p = commonSuctionProject();
  p.entities["system-input-2"].flowRate = 60;
  p = model.synchronizeCollectors(p);
  const state = p.entities["station-collectors"].suction;
  state.calculation = { ...calculateCollector(state.configuration, catalog), flow: 60 };
  state.calculationSourceFingerprint = state.sourceFingerprint;
  p = projectModule.parseProjectConfig(JSON.parse(JSON.stringify(p)));
  assert.equal(p.entities["station-collectors"].suction.configuration.dn, 100);
  assert.equal(p.entities["station-collectors"].suction.status, "stale");
  assert.equal(p.entities["station-spec"].items.find(i => i.option === "suctionCollector").price, null);
});
test("17 specification synchronization replaces rows without duplicates", () => { let p=readyProject(); for(let i=0;i<4;i++) p=model.synchronizeCollectors(p); const state=p.entities["station-collectors"].discharge; state.calculation=calculateCollector(state.configuration,catalog); state.calculationSourceFingerprint=state.sourceFingerprint; p=model.synchronizeCollectors(p); let rows=p.entities["station-spec"].items; assert.equal(rows.filter(i=>i.option==="dischargeCollector").length,1); assert.equal(rows.find(i=>i.option==="dischargeCollector").status,"confirmation"); const card=p.entities["station-collectors"].discharge; card.database={id:"saved",code:card.code,price:123,calculation:card.calculation}; card.databaseStatus="found"; p=model.synchronizeCollectors(p); assert.equal(p.entities["station-spec"].items.find(i=>i.option==="dischargeCollector").status,"selected"); assert.equal(p.entities["station-spec"].items.find(i=>i.option==="dischargeCollector").price,123); });
test("18 old JSON without constructor and legacy collector rows normalize", () => { const p=readyProject(); delete p.entities["station-collectors"]; for(const item of p.entities["station-spec"].items) if(item.option?.endsWith("Collector")) delete item.option; const parsed=projectModule.parseProjectConfig(JSON.parse(JSON.stringify(p))); assert.equal(parsed.entities["station-collectors"].kind,"collectors"); assert.equal(parsed.entities["station-spec"].items.filter(i=>i.option==="suctionCollector").length,1); assert.equal(parsed.entities["station-spec"].items.filter(i=>i.option==="dischargeCollector").length,1); });
test("19 input invalidation clears current price but preserves manual DN", () => { let p=readyProject(); const card=p.entities["station-collectors"].discharge; card.overrides.dn=100; card.calculation=calculateCollector(card.configuration,catalog); card.calculationSourceFingerprint=card.sourceFingerprint; p=model.synchronizeCollectors(p); p.entities["system-input"].flowRate=90; p.entities["station-dn"].dischargeCollectorDn=150; p=model.synchronizeCollectors(p); assert.equal(p.entities["station-collectors"].discharge.status,"stale"); assert.equal(p.entities["station-collectors"].discharge.configuration.dn,100); assert.equal(p.entities["station-spec"].items.find(i=>i.option==="dischargeCollector").price,null); delete p.entities["station-collectors"].discharge.overrides.dn; p=model.synchronizeCollectors(p); assert.equal(p.entities["station-collectors"].discharge.configuration.dn,150); });
test("20 missing prices and diameters cannot produce final price", () => { for(const field of ["price","outerDiameter","innerDiameter"]) { const data=structuredClone(catalog); data.components.find(i=>i.id==="aisi304-pipe-100-16")[field]=null; const r=calculateCollector(config(),data); assert.equal(r.complete,false); assert.equal(r.price,null); assert.ok(r.warnings.length); assert.ok(Number.isFinite(r.subtotal)); } });
test("actual internal diameter, per-working-pump flow and weld quantities", () => { const r=calculateCollector(two(),catalog); near(r.velocities.collector,60/3600/(Math.PI*.1083**2/4)); near(r.velocities.primary,30/3600/(Math.PI*.0839**2/4)); near(r.welds.find(i=>i.role==="end").lengthMm,2*2*Math.PI*114.3); near(r.welds.find(i=>i.role==="branch1-joint").lengthMm,3*1.4*Math.PI*88.9); assert.equal(r.bom.find(i=>i.role==="instrument15").quantity,2); assert.equal(r.bom.find(i=>i.role==="instrument20").quantity,1); assert.equal(flowSpeed(10,null),null); assert.equal(flowSpeed(10,0),null); const c=config();c.primary.working=0;assert.equal(calculateCollector(c,catalog).velocities.primary,null); });
test("high pressure / large stainless flange rules and inactive secondary", () => { assert.deepEqual(calc.flangeKinds("aisi304",200,16),["collar","looseFlange"]); assert.deepEqual(calc.flangeKinds("aisi304",250,16),["weldFlange"]); assert.deepEqual(calc.flangeKinds("aisi304",80,25),["weldFlange"]); assert.equal(collectorLength(two({stationType:"utility"})),1500); });
test("catalogue version changes invalidate persisted prices", () => { let p=readyProject(); const card=p.entities["station-collectors"].discharge; card.calculation=calculateCollector(card.configuration,catalog);card.calculationSourceFingerprint=card.sourceFingerprint;card.currentCatalogVersion="fixture-2";p=model.synchronizeCollectors(p);assert.equal(p.entities["station-collectors"].discharge.status,"stale"); });

test("pump-line insertion designs do not invalidate either collector or its saved database selection",()=>{
  let p=readyProject();
  for(const side of ["suction","discharge"]){const c=p.entities["station-collectors"][side];c.calculation=calculateCollector(c.configuration,catalog);c.calculationSourceFingerprint=c.sourceFingerprint;c.databaseStatus="found";c.database={id:`saved-${side}`,code:c.code,price:123,calculation:c.calculation};}
  p=model.synchronizeCollectors(p);const before=structuredClone(p.entities["station-collectors"]);
  p.entities["station-settings"].vibrationCompensators=true;
  p.entities["station-dn"].insertionDesigns={"suction:primary-after-vibration-insertion":{totalLengthMm:186},"discharge:primary-after-vibration-insertion":{totalLengthMm:186}};
  p=model.synchronizeCollectors(p);
  for(const side of ["suction","discharge"]){const c=p.entities["station-collectors"][side];assert.equal(c.status,"complete");assert.deepEqual(c.calculation,before[side].calculation);assert.deepEqual(c.database,before[side].database);assert.equal(c.sourceFingerprint,before[side].sourceFingerprint);}
  delete p.entities["station-dn"].insertionDesigns;
  p=model.synchronizeCollectors(p);assert.equal(p.entities["station-collectors"].suction.status,"complete");
});

test("legacy collector fingerprints heal only insertion-design differences on JSON reload",()=>{
  let p=projectModule.parseProjectConfig(JSON.parse(JSON.stringify(readyProject())));
  for(const side of ["suction","discharge"]){const c=p.entities["station-collectors"][side];c.calculation=calculateCollector(c.configuration,catalog);const legacy=JSON.parse(c.sourceFingerprint);legacy[1].insertionDesigns={"discharge:primary-between-valves-insertion":{totalLengthMm:186}};c.calculationSourceFingerprint=JSON.stringify(legacy);}
  p=projectModule.parseProjectConfig(JSON.parse(JSON.stringify(p)));
  for(const side of ["suction","discharge"])assert.equal(p.entities["station-collectors"][side].status,"complete");
  p.entities["system-input"].head+=5;p=model.synchronizeCollectors(p);
  for(const side of ["suction","discharge"])assert.equal(p.entities["station-collectors"][side].status,"stale","working-point changes still invalidate calculation");
});
test("catalog adapter uses correct metre price, merged PN and source bolt table", async () => { const {makeCollectorCatalog}=await loadTs(new URL("../app/collector-catalog.ts",import.meta.url)); const source=JSON.parse(await readFile(new URL("../public/binding-components.json",import.meta.url),"utf8")); const data=makeCollectorCatalog(source); const pipe=data.components.find(i=>i.kind==="pipe"&&i.dn===100&&i.pn===16&&i.material==="aisi304");assert.ok(pipe);near(pipe.innerDiameter,pipe.outerDiameter-6);assert.ok(pipe.price>0); assert.equal(data.bolts.find(i=>i.dn===80&&i.pn===16).length,47);assert.match(data.bolts.find(i=>i.dn===80&&i.pn===16).source,/Q58/); assert.ok(data.components.find(i=>i.kind==="looseFlange"&&i.dn===80&&i.pn===16));const r=calculateCollector(config(),data);assert.ok(r.price>0);assert.deepEqual(r.warnings,[]); });

test("D1 API create, exact lookup, authoritative repricing, auth and migration constraints", async () => {
  const sqlite=new DatabaseSync(":memory:");
  for(const file of ["0000_burly_jackpot.sql","0001_organic_lady_bullseye.sql","0002_control_cabinet_configurator.sql","0003_control_cabinet_item_groups.sql","0004_smart_power_ranges.sql","0005_collectors.sql"]) sqlite.exec(await readFile(new URL(`../drizzle/${file}`,import.meta.url),"utf8"));
  sqlite.exec("INSERT INTO users (id,email,name,password_hash) VALUES ('test','test@example.invalid','Test','unused')");
  const database={prepare(sql) { let args=[];return {bind(...values){args=values;return this;},async first(){return sqlite.prepare(sql).get(...args)??null;},async all(){return {success:true,results:sqlite.prepare(sql).all(...args)};},async run(){sqlite.prepare(sql).run(...args);return {success:true};}};},async batch(statements){sqlite.exec("BEGIN");try {const results=[];for(const s of statements) results.push(await s.run());sqlite.exec("COMMIT");return results;}catch(e){sqlite.exec("ROLLBACK");throw e;}}};
  globalThis.__collectorTest={database,user:{id:"test",role:"pro"}};
  const routeUrl=new URL("../app/api/collectors/route.ts",import.meta.url);
  const route=await loadTs(routeUrl,{[new URL("../app/auth-server.ts",import.meta.url).href]:'export const db=()=>globalThis.__collectorTest.database; export const currentUser=async()=>globalThis.__collectorTest.user; export const json=(body,status=200,headers)=>Response.json(body,{status,headers});',[new URL("../public/collector-catalog.json",import.meta.url).href]:JSON.stringify(catalog)});
  const send=body=>route.POST(new Request("http://local/api/collectors",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}));
  globalThis.__collectorTest.user=null;assert.equal((await send({action:"create",configuration:config()})).status,401);globalThis.__collectorTest.user={id:"test",role:"pro"};
  const invalid=await send({action:'create',configuration:config({dn:65}),code:'legacy-65-80'});assert.equal(invalid.status,400);assert.match((await invalid.json()).error,/DN80.*больше.*DN65/);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM collectors').get().n,0);
  const standardProject=projectModule.createProject();
  Object.assign(standardProject.entities["system-input"],{flowRate:60,workingPumpCount:2,reservePumpCount:1});
  const standard=model.synchronizeCollectors(standardProject).entities["station-collectors"].discharge.configuration;
  for(const role of ["base","plus"]) {
    globalThis.__collectorTest.user={id:"test",role};
    assert.equal((await send({action:"calculate",configuration:standard})).status,200);
    for(const action of ["calculate","create","refresh"]) {
      const custom={...standard,dn:250};
      assert.equal((await send({action,configuration:custom,code:collectorCode(custom)})).status,403);
    }
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM collectors").get().count,0);
  }
  globalThis.__collectorTest.user={id:"test",role:"pro"};
  assert.equal((await send({action:"create",configuration:config({connection:"threaded"})})).status,400);
  assert.equal((await send({action:"create",configuration:config({eccentric:true})})).status,400);
  const c=config(),code=collectorCode(c); let response=await send({action:"create",configuration:c,code,price:1,bom:[]}); assert.equal(response.status,201);const saved=(await response.json()).collector;near(saved.price,calculateCollector(c,catalog).price);
  assert.equal((await send({action:"create",configuration:c,code})).status,409);
  assert.equal((await (await route.GET(new Request(`http://local/api/collectors?code=${encodeURIComponent(code.slice(0,8))}`))).json()).collector,null);
  const count=sqlite.prepare("SELECT count(*) AS count FROM collector_items").get().count; assert.ok(count>5);assert.equal(sqlite.prepare("SELECT count(*) AS count FROM collector_items WHERE kind IN ('bolt','nut','washer')").get().count,0);
  sqlite.prepare("UPDATE collectors SET cached_price_microunits=1,price_updated_at='2000-01-01'").run();response=await send({action:"refresh",configuration:c,code});assert.equal(response.status,200);const refreshed=(await response.json()).collector;near(refreshed.price,saved.price);assert.notEqual(refreshed.priceUpdatedAt,"2000-01-01");assert.equal(sqlite.prepare("SELECT count(*) AS count FROM collector_items").get().count,count);
  assert.throws(()=>sqlite.prepare("INSERT INTO collectors SELECT 'duplicate',code,type,configuration_json,calculation_json,cached_price_microunits,weld_length_mm,weld_cost_microunits,source,created_by_user_id,price_updated_at,created_at FROM collectors").run(),/UNIQUE/);
  const plan=sqlite.prepare("EXPLAIN QUERY PLAN SELECT * FROM collectors WHERE code=?").all(code);assert.ok(plan.some(i=>i.detail.includes("uq_collectors_code")));
  const execution={...c,instrumentPorts:[{id:"kip-1",dn:15,state:"occupied"},{id:"tank",dn:20,state:"capped"}]};
  const other={...execution,instrumentPorts:[execution.instrumentPorts[0],{id:"tank",dn:20,state:"occupied"}]};
  const a=await send({action:"create",configuration:execution,code}),aBody=await a.json();assert.equal(a.status,201);assert.equal(aBody.collector.code,code);assert.equal(aBody.collector.calculation.code,code);
  const b=await send({action:"create",configuration:other,code}),bBody=await b.json();assert.equal(b.status,201);assert.notEqual(aBody.collector.id,bBody.collector.id);assert.equal(bBody.collector.code,code);
  for(const [configuration,id]of [[execution,aBody.collector.id],[other,bBody.collector.id]]){const found=await (await route.GET(new Request(`http://local/api/collectors?code=${encodeURIComponent(code)}&configuration=${encodeURIComponent(JSON.stringify(configuration))}`))).json();assert.equal(found.collector.id,id);assert.equal(found.collector.code,code);}
  const incomplete=config({dn:600});assert.equal((await send({action:"create",configuration:incomplete,code:collectorCode(incomplete)})).status,422);
  // An active D1 import becomes authoritative, including changed and missing prices.
  sqlite.exec(`INSERT INTO catalog_imports (id,source_file,source_sha256,source_size_bytes,source_modified_at) VALUES (1,'test','${"a".repeat(64)}',1,'2026-01-01');
    INSERT INTO component_catalogs (id,import_id,source_id,name,source_sheet) VALUES (1,1,'трубы','Трубы','Трубы');
    INSERT INTO component_families (id,catalog_id,source_id,title,source_range) VALUES (1,1,'трубы-test','Трубы AISI304','B1:I2');
    INSERT INTO components (id,family_id,source_id,source_row) VALUES (1,1,'live-pipe',2);`);
  for(const [id,column,label,value] of [[1,"B","DN",100],[2,"C","PN",16],[3,"D","Диаметр, мм",114.3],[4,"E","Толщина, мм",3]]) {
    sqlite.prepare("INSERT INTO attribute_definitions (id,family_id,source_column,key,label,header_path_json,data_type) VALUES (?,1,?,?,?,?, 'number')").run(id,column,column,label,JSON.stringify([label]));
    sqlite.prepare("INSERT INTO component_attribute_values (component_id,attribute_definition_id,value_type,numeric_value) VALUES (1,?,'number',?)").run(id,value);
  }
  sqlite.exec("INSERT INTO component_prices (component_id,label,amount_microunits,source_column) VALUES (1,'Цена, ₽/м.п.',500000000,'I')");
  const liveCatalog=async()=> (await (await route.GET(new Request("http://local/api/collectors?catalog=1"))).json()).catalog;
  let live=await liveCatalog();assert.equal(live.components[0].price,500);near(live.components[0].innerDiameter,108.3);const version=live.version;
  sqlite.exec("UPDATE component_prices SET amount_microunits=700000000");live=await liveCatalog();assert.equal(live.components[0].price,700);assert.notEqual(live.version,version);
  sqlite.exec("DELETE FROM component_prices");live=await liveCatalog();assert.equal(live.components[0].price,null);
  assert.equal((await send({action:"refresh",configuration:c,code})).status,422);
  near(sqlite.prepare("SELECT cached_price_microunits AS price FROM collectors").get().price/1e6,saved.price);
  delete globalThis.__collectorTest;sqlite.close();
});
