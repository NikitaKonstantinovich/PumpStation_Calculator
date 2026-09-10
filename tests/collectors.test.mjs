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
  const sizes = { 15: [21.3,17.3], 20: [26.9,22.9], 50: [60.3,56.3], 80: [88.9,83.9], 100: [114.3,108.3], 250: [273,263] };
  for (const material of ["aisi304", "st20"]) for (const [size, [outerDiameter, innerDiameter]] of Object.entries(sizes)) for (const pn of [10,16,25]) for (const kind of ["pipe", "weldFlange", "looseFlange", "collar", "nipple", "plug"]) {
    components.push({ id: `${material}-${kind}-${size}-${pn}`, name: `${kind} DN${size}`, kind, dn: Number(size), pn, material, outerDiameter, innerDiameter, price: kind === "pipe" ? 1000 : 100, source: "TEST FIXTURE ONLY" });
  }
  return { version: "fixture-1", components, bolts: Object.keys(sizes).flatMap(dn => [10,16,25].map(pn => ({ dn: Number(dn), pn, length: 50, source: "TEST FIXTURE ONLY" }))) };
}
const catalog = fixtureCatalog();
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
test("01 single circuit canonical code", () => assert.equal(collectorCode(config()), "Н100_16_3_500_80_AISI304"));
test("02 two circuit canonical code", () => assert.equal(collectorCode(two()), 'Н100_16_3(1)_500(400)_80(2")_AISI304'));
test("03 eccentric suction canonical code", () => assert.equal(collectorCode(two({ type: "suction", eccentric: true })), 'В100_16_3(1)_500(400)_80(2")_AISI304_Э'));
test("04 discharge eccentric rejected", () => { assert.equal(collectorCode(config({ eccentric: true })), null); assert.equal(calculateCollector(config({ eccentric: true }), catalog).complete, false); });
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
function readyProject() { const p=projectModule.createProject(); Object.assign(p.entities["system-input"],{ flowRate:60,workingPumpCount:2,reservePumpCount:1 }); Object.assign(p.entities["station-dn"],{suctionCollectorDn:100,dischargeCollectorDn:100,suctionValveDn:80,dischargeValveDn:80,pn:16,connectionType:"flanged",collectorMaterial:"aisi304"}); return model.synchronizeCollectors(p); }
test("17 specification synchronization replaces rows without duplicates", () => { let p=readyProject(); for(let i=0;i<4;i++) p=model.synchronizeCollectors(p); const state=p.entities["station-collectors"].discharge; state.calculation=calculateCollector(state.configuration,catalog); state.calculationSourceFingerprint=state.sourceFingerprint; p=model.synchronizeCollectors(p); let rows=p.entities["station-spec"].items; assert.equal(rows.filter(i=>i.option==="dischargeCollector").length,1); assert.equal(rows.find(i=>i.option==="dischargeCollector").status,"confirmation"); const card=p.entities["station-collectors"].discharge; card.database={id:"saved",code:card.code,price:123}; card.databaseStatus="found"; p=model.synchronizeCollectors(p); assert.equal(p.entities["station-spec"].items.find(i=>i.option==="dischargeCollector").status,"selected"); assert.equal(p.entities["station-spec"].items.find(i=>i.option==="dischargeCollector").price,123); });
test("18 old JSON without constructor and legacy collector rows normalize", () => { const p=readyProject(); delete p.entities["station-collectors"]; for(const item of p.entities["station-spec"].items) if(item.option?.endsWith("Collector")) delete item.option; const parsed=projectModule.parseProjectConfig(JSON.parse(JSON.stringify(p))); assert.equal(parsed.entities["station-collectors"].kind,"collectors"); assert.equal(parsed.entities["station-spec"].items.filter(i=>i.option==="suctionCollector").length,1); assert.equal(parsed.entities["station-spec"].items.filter(i=>i.option==="dischargeCollector").length,1); });
test("19 input invalidation clears current price but preserves manual DN", () => { let p=readyProject(); const card=p.entities["station-collectors"].discharge; card.overrides.dn=100; card.calculation=calculateCollector(card.configuration,catalog); card.calculationSourceFingerprint=card.sourceFingerprint; p=model.synchronizeCollectors(p); p.entities["system-input"].flowRate=90; p.entities["station-dn"].dischargeCollectorDn=150; p=model.synchronizeCollectors(p); assert.equal(p.entities["station-collectors"].discharge.status,"stale"); assert.equal(p.entities["station-collectors"].discharge.configuration.dn,100); assert.equal(p.entities["station-spec"].items.find(i=>i.option==="dischargeCollector").price,null); delete p.entities["station-collectors"].discharge.overrides.dn; p=model.synchronizeCollectors(p); assert.equal(p.entities["station-collectors"].discharge.configuration.dn,150); });
test("20 missing prices and diameters cannot produce final price", () => { for(const field of ["price","outerDiameter","innerDiameter"]) { const data=structuredClone(catalog); data.components.find(i=>i.id==="aisi304-pipe-100-16")[field]=null; const r=calculateCollector(config(),data); assert.equal(r.complete,false); assert.equal(r.price,null); assert.ok(r.warnings.length); assert.ok(Number.isFinite(r.subtotal)); } });
test("actual internal diameter, per-working-pump flow and weld quantities", () => { const r=calculateCollector(two(),catalog); near(r.velocities.collector,60/3600/(Math.PI*.1083**2/4)); near(r.velocities.primary,30/3600/(Math.PI*.0839**2/4)); near(r.welds.find(i=>i.role==="end").lengthMm,2*2*Math.PI*114.3); near(r.welds.find(i=>i.role==="branch1-joint").lengthMm,3*1.4*Math.PI*88.9); assert.equal(r.bom.find(i=>i.role==="instrument15").quantity,2); assert.equal(r.bom.find(i=>i.role==="instrument20").quantity,1); assert.equal(flowSpeed(10,null),null); assert.equal(flowSpeed(10,0),null); const c=config();c.primary.working=0;assert.equal(calculateCollector(c,catalog).velocities.primary,null); });
test("high pressure / large stainless flange rules and inactive secondary", () => { assert.deepEqual(calc.flangeKinds("aisi304",200,16),["collar","looseFlange"]); assert.deepEqual(calc.flangeKinds("aisi304",250,16),["weldFlange"]); assert.deepEqual(calc.flangeKinds("aisi304",80,25),["weldFlange"]); assert.equal(collectorLength(two({stationType:"utility"})),1500); });
test("catalogue version changes invalidate persisted prices", () => { let p=readyProject(); const card=p.entities["station-collectors"].discharge; card.calculation=calculateCollector(card.configuration,catalog);card.calculationSourceFingerprint=card.sourceFingerprint;card.currentCatalogVersion="fixture-2";p=model.synchronizeCollectors(p);assert.equal(p.entities["station-collectors"].discharge.status,"stale"); });
test("catalog adapter uses correct metre price, merged PN and source bolt table", async () => { const {makeCollectorCatalog}=await loadTs(new URL("../app/collector-catalog.ts",import.meta.url)); const source=JSON.parse(await readFile(new URL("../public/binding-components.json",import.meta.url),"utf8")); const data=makeCollectorCatalog(source); const pipe=data.components.find(i=>i.kind==="pipe"&&i.dn===100&&i.pn===16&&i.material==="aisi304");assert.ok(pipe);near(pipe.innerDiameter,pipe.outerDiameter-6);assert.ok(pipe.price>0); assert.equal(data.bolts.find(i=>i.dn===80&&i.pn===16).length,47);assert.match(data.bolts.find(i=>i.dn===80&&i.pn===16).source,/Q58/); assert.ok(data.components.find(i=>i.kind==="looseFlange"&&i.dn===80&&i.pn===16));const r=calculateCollector(config(),data);assert.equal(r.price,null);assert.ok(r.warnings.some(i=>i.includes("Заглушка резьбовая"))); });

test("D1 API create, exact lookup, authoritative repricing, auth and migration constraints", async () => {
  const sqlite=new DatabaseSync(":memory:");
  for(const file of ["0000_burly_jackpot.sql","0001_organic_lady_bullseye.sql","0002_control_cabinet_configurator.sql","0003_control_cabinet_item_groups.sql","0004_smart_power_ranges.sql","0005_collectors.sql"]) sqlite.exec(await readFile(new URL(`../drizzle/${file}`,import.meta.url),"utf8"));
  sqlite.exec("INSERT INTO users (id,email,name,password_hash) VALUES ('test','test@example.invalid','Test','unused')");
  const database={prepare(sql) { let args=[];return {bind(...values){args=values;return this;},async first(){return sqlite.prepare(sql).get(...args)??null;},async all(){return {success:true,results:sqlite.prepare(sql).all(...args)};},async run(){sqlite.prepare(sql).run(...args);return {success:true};}};},async batch(statements){sqlite.exec("BEGIN");try {const results=[];for(const s of statements) results.push(await s.run());sqlite.exec("COMMIT");return results;}catch(e){sqlite.exec("ROLLBACK");throw e;}}};
  globalThis.__collectorTest={database,user:{id:"test"}};
  const routeUrl=new URL("../app/api/collectors/route.ts",import.meta.url);
  const route=await loadTs(routeUrl,{[new URL("../app/auth-server.ts",import.meta.url).href]:'export const db=()=>globalThis.__collectorTest.database; export const currentUser=async()=>globalThis.__collectorTest.user; export const json=(body,status=200,headers)=>Response.json(body,{status,headers});',[new URL("../public/collector-catalog.json",import.meta.url).href]:JSON.stringify(catalog)});
  const send=body=>route.POST(new Request("http://local/api/collectors",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}));
  globalThis.__collectorTest.user=null;assert.equal((await send({action:"create",configuration:config()})).status,401);globalThis.__collectorTest.user={id:"test"};
  assert.equal((await send({action:"create",configuration:config({connection:"threaded"})})).status,400);
  assert.equal((await send({action:"create",configuration:config({eccentric:true})})).status,400);
  const c=config(),code=collectorCode(c); let response=await send({action:"create",configuration:c,code,price:1,bom:[]}); assert.equal(response.status,201);const saved=(await response.json()).collector;near(saved.price,calculateCollector(c,catalog).price);
  assert.equal((await send({action:"create",configuration:c,code})).status,409);
  assert.equal((await (await route.GET(new Request(`http://local/api/collectors?code=${encodeURIComponent(code.slice(0,8))}`))).json()).collector,null);
  const count=sqlite.prepare("SELECT count(*) AS count FROM collector_items").get().count; assert.ok(count>5);assert.equal(sqlite.prepare("SELECT count(*) AS count FROM collector_items WHERE kind IN ('bolt','nut','washer')").get().count,0);
  sqlite.prepare("UPDATE collectors SET cached_price_microunits=1,price_updated_at='2000-01-01'").run();response=await send({action:"refresh",configuration:c,code});assert.equal(response.status,200);const refreshed=(await response.json()).collector;near(refreshed.price,saved.price);assert.notEqual(refreshed.priceUpdatedAt,"2000-01-01");assert.equal(sqlite.prepare("SELECT count(*) AS count FROM collector_items").get().count,count);
  assert.throws(()=>sqlite.prepare("INSERT INTO collectors SELECT 'duplicate',code,type,configuration_json,calculation_json,cached_price_microunits,weld_length_mm,weld_cost_microunits,source,created_by_user_id,price_updated_at,created_at FROM collectors").run(),/UNIQUE/);
  const plan=sqlite.prepare("EXPLAIN QUERY PLAN SELECT * FROM collectors WHERE code=?").all(code);assert.ok(plan.some(i=>i.detail.includes("uq_collectors_code")));
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
