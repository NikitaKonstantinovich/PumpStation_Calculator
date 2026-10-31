import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";
import { extensionCatalog, extensionInput } from "./fixtures/insert-extension.mjs";
globalThis.__PSC_RELEASE_PROFILE__="full";
const load=name=>loadTs(new URL(`../app/${name}.ts`,import.meta.url));
const base=await load("base-values"),projects=await load("project-config"),access=await load("project-access"),updates=await load("base-values-project"),collectors=await load("collector-calculations"),dn=await load("dn-defaults");
const initial=()=>base.baseSnapshot("initial-v1",base.initialBaseValues());
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≠ ${b}`);
const spacing=await load("base-values-spacing");

test("new catalogue series bind every selected model without changing existing rule snapshots",()=>{
  const model={manufacturer:"New pump brand",series:"VM",type:"vertical_multistage",nominalFlow:3,inletDn:25,outletDn:25};
  const catalog={a:{...model},b:{...model},inactive:{...model,series:"Inactive",active:false},disabled:{...model,series:"Disabled",selectable:false},horizontal:{...model,type:"horizontal_multistage"},unknown:{...model,nominalFlow:null}};
  const choices=spacing.availableSpacingSeries([],catalog);assert.equal(choices.length,1);assert.deepEqual(choices[0].modelIds,["a","b"]);
  const rule=spacing.createSpacingRule(choices[0].key,[],{spacing:450},catalog);
  assert.equal(rule.manufacturer,model.manufacturer);assert.equal(rule.series,"VM");assert.equal(rule.nominalFlow,3);assert.equal(rule.inletDn,null);assert.equal(rule.status,"conditional");assert.equal(rule.radius,null);assert.equal(rule.source,"");assert.deepEqual(rule.modelIds,["a","b"]);
  assert.equal(spacing.availableSpacingSeries([rule],catalog).length,0);
  assert.throws(()=>spacing.createSpacingRule(choices[0].key,[rule],{spacing:450},catalog),/уже есть правило/);
  const newCatalog={...catalog,c:{...model},d:{...model,series:"VM New",nominalFlow:10}};
  const newChoices=spacing.availableSpacingSeries([rule],newCatalog);assert.equal(newChoices.length,1);assert.equal(newChoices[0].series,"VM New");assert.deepEqual(newChoices[0].modelIds,["d"]);assert.deepEqual(rule.modelIds,["a","b"]);
  assert.throws(()=>spacing.createSpacingRule(newChoices[0].key,[],{spacing:450},catalog),/отсутствует/);
});

test("inline series group by both nozzle diameters, keep brands apart and exclude linked models",()=>{
  const pump={manufacturer:"Brand",series:"INL",type:"inline",nominalFlow:30,inletDn:65,outletDn:65};
  const catalog={a:pump,b:{...pump,nominalFlow:60},c:{...pump,outletDn:50},d:{...pump,manufacturer:"Other"},missing:{...pump,inletDn:null}};
  const choices=spacing.availableSpacingSeries([],catalog);assert.equal(choices.length,3);
  const same=choices.find(c=>c.manufacturer==="Brand"&&c.outletDn===65);assert.deepEqual(same.modelIds,["a","b"]);assert.equal(same.nominalFlow,null);assert.equal(spacing.spacingNominal(same),"DN 65");
  assert.equal(spacing.spacingNominal(choices.find(c=>c.outletDn===50)),"DN 65 / 50");
  const rule=spacing.createSpacingRule(same.key,[],{spacing:600,radius:200,source:"Checked dimensions"},catalog);
  assert.equal(rule.status,"confirmed");assert.equal(rule.spacing-2*rule.radius,200);
  const exact={...rule,series:"Combined old series",modelId:"a",modelIds:[]};
  assert.ok(!spacing.availableSpacingSeries([exact],catalog).some(c=>c.key===same.key));
});

test("new spacing rules require a valid step and explicit evidence to confirm clearance",()=>{
  const catalog={a:{manufacturer:"Brand",series:"VM",type:"vertical_multistage",nominalFlow:5,inletDn:null,outletDn:null}};
  const key=spacing.availableSpacingSeries([],catalog)[0].key;
  for(const value of [0,350,425,NaN,Infinity])assert.throws(()=>spacing.createSpacingRule(key,[],{spacing:value},catalog),/400/);
  assert.throws(()=>spacing.createSpacingRule(key,[],{spacing:600,radius:250,source:"Drawing"},catalog),/150/);
  assert.throws(()=>spacing.createSpacingRule(key,[],{spacing:650,radius:250},catalog),/источник/);
  assert.throws(()=>spacing.createSpacingRule(key,[],{spacing:650,source:"Drawing"},catalog),/вылет/);
  assert.throws(()=>spacing.createSpacingRule(key,[],{spacing:650,radius:-1,source:"Drawing"},catalog),/положительный/);
  const confirmed=spacing.createSpacingRule(key,[],{spacing:650,radius:250,source:" Drawing "},catalog);
  assert.equal(confirmed.status,"confirmed");assert.equal(confirmed.source,"Drawing");assert.equal(confirmed.spacing-2*confirmed.radius,150);
});

test("research rules retain missing and conditional data; known clearances and grouped lengths",()=>{
  const values=base.initialBaseValues();assert.deepEqual(base.validateBaseValues(values),[]);assert.equal(values.spacing.rules.length,134);
  assert.equal(values.spacing.rules.filter(r=>r.spacing===null).length,1);
  assert.ok(values.spacing.rules.some(r=>r.status==="conditional"));
  for(const r of values.spacing.rules)if(r.spacing!==null){assert.ok(r.spacing>=400&&r.spacing%50===0);assert.ok(r.spacing-2*r.radius>=150);for(const n of [2,3,4])assert.equal((n-1)*r.spacing+2*r.spacing/2,n*r.spacing);}
  assert.equal(base.spacingForPump(values,"not-in-catalogue").spacing,null);
  const missing=values.spacing.rules.find(r=>r.spacing===null);assert.equal(base.spacingForPump(values,missing.modelIds[0]).spacing,null);
  const general=values.spacing.rules.find(r=>r.status==="confirmed"&&r.modelIds.length),pump=general.modelIds[0];
  values.spacing.rules.push({...general,id:"specific",modelId:pump,modelIds:[],powerMin:null,powerMax:null,spacing:general.spacing+50});
  assert.deepEqual(base.validateBaseValues(values),[]);assert.equal(base.spacingForPump(values,pump).rule.id,"specific");
  values.spacing.rules.push({...values.spacing.rules.at(-1),id:"conflict"});assert.match(base.validateBaseValues(values).join(" "),/Пересечение/);
});
test("validation rejects malformed tables, impossible dates, gaps, overlaps and unsafe clearance",()=>{
  for(const section of ["velocity","painting"]){const values=base.initialBaseValues();values[section]=[null];assert.ok(base.validateBaseValues(values).length);}
  for(const mutate of [v=>v.velocity[1].fromDn=250,v=>v.velocity[1].fromDn=252,v=>v.velocity[0].limit=0,v=>v.welding.aisi304=-1,v=>v.financial.date="2026-02-30",v=>v.spacing.rules[0].radius=1000,v=>v.financial.discounts.cnp=101]){const values=base.initialBaseValues();mutate(values);assert.ok(base.validateBaseValues(values).length);}
  const values=base.initialBaseValues();values.painting[0].pricePerMeter=null;assert.deepEqual(base.validateBaseValues(values),[]);
});
test("DN thresholds and configurable nominal selection stay distinct from actual inner-diameter speed",()=>{
  const rules=base.initialBaseValues().velocity;assert.equal(base.baseVelocityLimit(250,rules),2);assert.equal(base.baseVelocityLimit(251,rules),3);
  assert.ok(dn.recommendedDn(100,[{fromDn:1,toDn:null,limit:1}])>dn.recommendedDn(100,rules));
  assert.equal(base.baseVelocityLimit(250,[{fromDn:1,toDn:250,limit:1.5},{fromDn:251,toDn:null,limit:2.5}]),1.5);
});
test("old base/plus projects stay valid; partial update preserves manual inputs and remaining warnings",()=>{
  const legacy=projects.parseProjectConfig(JSON.parse(JSON.stringify(projects.createProject())));
  for(const role of ["base","plus"])assert.equal(access.projectAccessError(legacy,role),null);
  const project=projects.createProject("Old",{baseValues:initial()}),settings=project.entities["station-settings"];
  settings.usdRate=97;
  const latest=base.baseSnapshot("second",base.initialBaseValues());latest.values.financial.usdRate=105;latest.values.financial.cnyRate=15;latest.values.welding.aisi304=6000;
  const next=updates.applyProjectBaseUpdate(project,latest,["financial"]);
  assert.equal(next.entities["station-settings"].usdRate,97);assert.equal(next.entities["station-settings"].cnyRate,15);
  assert.equal(next.entities["station-settings"].baseValues.versions.financial,"second");assert.equal(next.entities["station-settings"].baseValues.versions.welding,"initial-v1");
  assert.ok(updates.projectBaseChanges(next,latest).some(c=>c.section==="welding"));
  assert.equal(updates.applyProjectBaseUpdate(project,latest,["financial"],true).entities["station-settings"].usdRate,105);
  assert.equal(settings.cnyRate,13);assert.equal(settings.baseValues.versions.financial,"initial-v1");
  const oldStandard=projects.createProject("Old standard",{baseValues:initial()});
  for(const role of ["base","plus"])assert.equal(access.projectAccessError(oldStandard,role),null);
  const updated=updates.applyProjectBaseUpdate(oldStandard,latest,["financial"]);
  for(const role of ["base","plus"])assert.equal(access.projectAccessError(updated,role),null);
});
test("automatic spacing remains automatic after project save/reopen for base and plus",async()=>{
  const model=await load("collector-project"),applied=initial();
  const rule=applied.values.spacing.rules.find(r=>r.status==="confirmed"&&r.spacing!==500&&r.modelIds.length);
  let project=projects.createProject("Automatic spacing",{baseValues:applied});
  Object.assign(project.entities["system-input"],{selectedPumpId:rule.modelIds[0],flowRate:30,head:30,workingPumpCount:2,reservePumpCount:1});
  project=model.synchronizeCollectors(project);
  const reopened=projects.parseProjectConfig(JSON.parse(JSON.stringify(project)));
  for(const side of ["suction","discharge"]){assert.equal(reopened.entities["station-collectors"][side].spacing1,rule.spacing);assert.equal(reopened.entities["station-collectors"][side].spacing1Manual,false);}
  for(const role of ["base","plus"])assert.equal(access.projectAccessError(reopened,role),null);
});
test("published labour tariffs are used once in collector and insert BOM, missing paint remains unknown",async()=>{
  const catalog=JSON.parse(await readFile(new URL("../public/collector-catalog.json",import.meta.url),"utf8"));
  const configuration={type:"discharge",dn:100,pn:16,material:"st20",connection:"flanged",eccentric:false,stationType:"utility",simultaneous:false,jockey:false,primary:{flow:30,working:2,reserve:1,dn:80,connection:"flanged",spacing:500,pn:16},secondary:null};
  const applied=initial();applied.values.welding.st20=3456;applied.values.painting.forEach(p=>p.pricePerMeter=777);
  const work={id:applied.values.painting[0].id,prices:[{label:"Original",amount:10,currency:"RUB"}]};
  const projected=base.paintingItemForBase(work,applied);assert.equal(projected.id,work.id);assert.equal(projected.prices.length,1);assert.equal(projected.prices[0].amount,777);assert.equal(work.prices[0].amount,10);
  const result=collectors.calculateCollector(configuration,base.applyBaseTariffs(catalog,applied));
  assert.equal(result.complete,true,result.warnings.join("\n"));near(result.weldCost,result.weldLengthMm/1000*3456);near(result.price,result.bom.reduce((sum,r)=>sum+r.cost,0));
  const inserts=await load("component-insert-calculations"),binding=await load("base-values-components");
  const rows=inserts.generateInsertCalculations({...extensionInput,materials:["st20"]},base.applyBaseTariffs(extensionCatalog("st20"),applied));
  const row=rows.find(r=>r.complete);assert.ok(row);near(row.weldCost,row.weldLengthMm/1000*3456);near(row.price,row.bom.reduce((sum,r)=>sum+r.cost,0));
  assert.equal(row.bom.find(r=>r.kind==="painting").unitPrice,777);
  const old=initial(),snapshot={version:1,id:"fixture",catalogVersion:row.catalogVersion,currentCatalogVersion:row.catalogVersion,calculation:row};
  const bound=binding.bindInsertionTariffs(snapshot,old);near(bound.calculation.weldCost,row.weldLengthMm/1000*2400);assert.notEqual(bound.calculation.price,row.price);
  const again=binding.bindInsertionTariffs(bound,old);assert.deepEqual(again,bound);
  old.values.painting.forEach(p=>p.pricePerMeter=null);const unpriced=binding.bindInsertionTariffs(snapshot,old);assert.equal(unpriced.calculation.price,null);assert.equal(unpriced.calculation.complete,false);
});
test("net pump prices bypass manufacturer discount",async()=>{
  const pricing=await load("pump-catalog"),source=await readFile(new URL("../app/pump-catalog.ts",import.meta.url),"utf8");
  assert.match(source,/priceKind === "net"/);assert.equal(pricing.catalogueDiscount({manufacturer:"CNP",priceKind:"net",discountPercent:99},{usdRate:85,cnyRate:13,manufacturerDiscounts:{cnp:45}}),0);
});

test("admin API authorization, immutable history, optimistic conflicts and trusted per-section snapshots",async()=>{
  const sqlite=new DatabaseSync(":memory:");
  const database={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return sqlite.prepare(sql).get(...args)??null;},async all(){return {success:true,results:sqlite.prepare(sql).all(...args)};},async run(){const result=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}};}};},async batch(statements){sqlite.exec("BEGIN");try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec("COMMIT");return results;}catch(e){sqlite.exec("ROLLBACK");throw e;}}};
  globalThis.__baseTest={database,user:null};
  const replacements={[new URL("../app/auth-server.ts",import.meta.url).href]:'export const db=()=>globalThis.__baseTest.database;export const ensureAuthSchema=async()=>{};export const currentUser=async()=>globalThis.__baseTest.user;export const json=(body,status=200,headers)=>Response.json(body,{status,headers});'};
  const route=await loadTs(new URL("../app/api/base-values/route.ts",import.meta.url),replacements),effective=await loadTs(new URL("../app/api/base-values/effective/route.ts",import.meta.url),replacements),server=await loadTs(new URL("../app/base-values-server.ts",import.meta.url),replacements);
  const get=()=>route.GET(new Request("http://local/api/base-values")),send=body=>route.PATCH(new Request("http://local/api/base-values",{method:"PATCH",body:JSON.stringify(body)}));
  assert.equal((await get()).status,401);assert.equal((await effective.GET(new Request("http://local/api/base-values/effective"))).status,401);
  for(const role of ["base","plus","pro"]){globalThis.__baseTest.user={id:role,name:role,role};assert.equal((await get()).status,403);assert.equal((await send({})).status,403);assert.equal((await effective.GET(new Request("http://local/api/base-values/effective"))).status,200);}
  globalThis.__baseTest.user={id:"admin",name:"Admin",role:"admin"};
  const original=await (await get()).json();assert.equal(original.revision,0);assert.equal(original.active.id,"initial-v1");
  const values=structuredClone(original.draft);values.financial.usdRate=101;
  assert.equal((await send({action:"save",revision:0,values})).status,200);assert.equal((await get()).status,200);assert.equal((await (await get()).json()).active.values.financial.usdRate,85);
  assert.equal((await send({action:"publish",revision:0,values})).status,409);
  const published=await (await send({action:"publish",revision:1,values})).json();assert.equal(published.revision,2);assert.equal(published.active.values.financial.usdRate,101);assert.equal(published.history.length,3);
  assert.throws(()=>sqlite.prepare("UPDATE base_value_versions SET author='forged'").run(),/immutable/);assert.throws(()=>sqlite.prepare("DELETE FROM base_value_versions").run(),/immutable/);
  assert.deepEqual(await server.verifyAppliedBaseValues(initial()),initial());
  const forged=initial();forged.values.welding.st20=1;await assert.rejects(()=>server.verifyAppliedBaseValues(forged),/Подмена/);
  const mixed={...initial().versions,financial:published.active.id};const resolved=await server.resolveBaseVersions(mixed);assert.equal(resolved.values.financial.usdRate,101);assert.equal(resolved.versions.welding,"initial-v1");
  const malformed=structuredClone(values);malformed.painting=[null];assert.equal((await send({action:"save",revision:2,values:malformed})).status,400);
  const unknown={...mixed,spacing:"does-not-exist"};await assert.rejects(()=>server.resolveBaseVersions(unknown),/не найдена/);
  const choice=spacing.availableSpacingSeries(values.spacing.rules)[0];assert.ok(choice,"The current catalogue contains unassigned nominal sizes");
  const newRule=spacing.createSpacingRule(choice.key,values.spacing.rules,{spacing:800,radius:300,source:"Test drawing"});
  const expanded=structuredClone(values);expanded.spacing.rules.unshift(newRule);
  assert.deepEqual(base.validateBaseValues(expanded),[]);
  assert.equal((await send({action:"save",revision:2,values:expanded})).status,200);
  const savedRuleState=await (await get()).json();assert.deepEqual(savedRuleState.draft.spacing.rules[0],newRule);assert.equal(savedRuleState.active.values.spacing.rules.length,134);
  assert.equal((await send({action:"publish",revision:3,values:expanded})).status,200);
  const active=await server.currentBasePublication();assert.equal(base.spacingForPump(active.values,newRule.modelIds[0]).spacing,800);
  assert.equal((await server.readBasePublication("initial-v1")).values.spacing.rules.length,134);
  const duplicate=structuredClone(expanded);duplicate.spacing.rules.push({...newRule,id:"duplicate-series"});
  assert.equal((await send({action:"save",revision:4,values:duplicate})).status,400);
  const nonexistent=structuredClone(expanded);nonexistent.spacing.rules[0].modelIds=["unknown-new-pump"];
  assert.equal((await send({action:"save",revision:4,values:nonexistent})).status,400);
  sqlite.exec("CREATE TABLE user_projects(id TEXT PRIMARY KEY,user_id TEXT,name TEXT,config_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)");
  const projectRoute=await loadTs(new URL("../app/api/projects/route.ts",import.meta.url),replacements);
  const put=config=>projectRoute.PUT(new Request("http://local/api/projects",{method:"PUT",body:JSON.stringify({config})}));
  for(const role of ["base","plus"]){
    globalThis.__baseTest.user={id:role,name:role,role};
    const old=projects.createProject(`Old ${role}`);
    assert.equal((await put(old)).status,200,"legacy project saves after a newer publication");
    const saved=JSON.parse(sqlite.prepare("SELECT config_json FROM user_projects WHERE id=?").get(old.project.id).config_json);
    assert.equal(saved.entities["station-settings"].usdRate,85);assert.equal(saved.entities["station-settings"].baseValues.versions.financial,"legacy-v1");
    assert.equal((await put(saved)).status,200);
    saved.entities["station-settings"].baseValues.values.welding.st20=1;
    assert.equal((await put(saved)).status,403,"forged project snapshot cannot be stored");
  }
  globalThis.__baseTest.user={id:"admin",name:"Admin",role:"admin"};
  const current=await server.baseAdminState(),withNipples=structuredClone(current.active.values);
  withNipples.preferences.collectorNipples={...base.DEFAULT_COLLECTOR_NIPPLES,dischargeDn15:3};
  const nippleResponse=await send({action:"publish",revision:current.revision,values:withNipples});assert.equal(nippleResponse.status,200);
  const nipplePublication=(await nippleResponse.json()).active;
  const versions={...initial().versions,preferences:nipplePublication.id};
  assert.equal(base.collectorNippleRules((await server.resolveBaseVersions(versions)).values).dischargeDn15,3);
  assert.equal((await server.readBasePublication("initial-v1")).values.preferences.collectorNipples,undefined,"old immutable publication is not rewritten");
  const fake=await server.resolveBaseVersions(versions);fake.values.preferences.collectorNipples.dischargeDn15=4;
  await assert.rejects(()=>server.verifyAppliedBaseValues(fake),/Подмена/);
  const {collectorRuleSet}=await load("collector-nipple-rules"),stateWithParameters=await server.baseAdminState(),parameterValues=structuredClone(stateWithParameters.active.values);
  parameterValues.preferences.collectorNipples=collectorRuleSet();parameterValues.preferences.collectorNipples.rules[0].outputs[0].lengthMm=90;
  const parameterResponse=await send({action:"publish",revision:stateWithParameters.revision,values:parameterValues});assert.equal(parameterResponse.status,200);const parameterPublication=(await parameterResponse.json()).active;
  const parameterSnapshot=await server.resolveBaseVersions({...versions,preferences:parameterPublication.id});assert.equal(parameterSnapshot.values.preferences.collectorNipples.version,2);assert.equal(parameterSnapshot.values.preferences.collectorNipples.rules[0].outputs[0].lengthMm,90);
  assert.deepEqual(await server.verifyAppliedBaseValues(parameterSnapshot),parameterSnapshot);
  const {collectorCombinationSettings}=await load("collector-nipple-rules"),combinationState=await server.baseAdminState(),combinationValues=structuredClone(combinationState.active.values);
  combinationValues.preferences.collectorNipples=collectorCombinationSettings(combinationValues.preferences.collectorNipples);
  combinationValues.preferences.collectorNipples.combinations[7].outputs[0].quantity=4;
  const combinationResponse=await send({action:"publish",revision:combinationState.revision,values:combinationValues});assert.equal(combinationResponse.status,200);
  const combinationPublication=(await combinationResponse.json()).active;
  const combinationSnapshot=await server.resolveBaseVersions({...versions,preferences:combinationPublication.id});assert.equal(combinationSnapshot.values.preferences.collectorNipples.version,3);
  assert.equal(combinationSnapshot.values.preferences.collectorNipples.combinations[7].outputs[0].quantity,4);
  assert.equal(combinationSnapshot.values.preferences.collectorNipples.combinations[0].outputs[0].lengthMm,90);
  assert.deepEqual(await server.verifyAppliedBaseValues(combinationSnapshot),combinationSnapshot);
  assert.equal((await server.resolveBaseVersions({...versions,preferences:parameterPublication.id})).values.preferences.collectorNipples.version,2,"previous immutable publication remains unchanged");
  sqlite.close();delete globalThis.__baseTest;
});


test("catalogue refresh replaces a stale project insertion snapshot and retains project labour tariffs", async () => {
  const { calculations, component, requirement, insertionDesign, selectStationInsertion } = await import("./fixtures/station-insertions.mjs");
  const { bindProjectComponents } = await load("base-values-components");
  const { insertionPrice } = await load("calculated-insertion");
  const c = structuredClone(calculations.find(c => c.complete && c.material === "aisi304" && c.pn === 16 && c.geometry === "straight" && c.dnLarge === 80));
  assert.ok(c);
  const old = component(c, "refresh", { revision: 0, catalogVersion: "old-source", currentCatalogVersion: "new-source" });
  const fresh = component(c, "refresh", { revision: 1, catalogVersion: "new-source", currentCatalogVersion: "new-source", pricedAt: "2026-10-31" });
  fresh.calculatedInsertion.calculation.catalogVersion = "new-source";
  const part = fresh.calculatedInsertion.calculation.bom.find(row => row.role === "base");
  part.unitPrice += 100; part.cost = part.unitPrice * part.quantity;
  fresh.calculatedInsertion.calculation.price = fresh.calculatedInsertion.calculation.bom.reduce((sum, row) => sum + row.cost, 0);
  const applied = initial(); applied.values.welding.aisi304 = 1234;
  const project = projects.createProject("refresh", { baseValues: applied });
  project.entities["station-spec"].items = [{ position: "04.13", name: c.name, details: "PN16", section: "discharge", quantity: 4, status: "clarify", insertionAssembly: { snapshot: old.calculatedInsertion, reversed: false, accounting: "assembly" } }];
  const req = requirement(c);
  project.entities["station-dn"].insertionDesigns = { [req.location]: insertionDesign(c) };
  const database = { items: [fresh], collectorCatalog: { version: "new-source", components: [] } };
  const beforeProject = structuredClone(project), beforeDatabase = structuredClone(database);
  const bound = bindProjectComponents(project, database), actual = bound.items[0].calculatedInsertion;
  assert.equal(actual.revision, 1);
  assert.equal(actual.pricedAt, "2026-10-31");
  assert.equal(actual.calculation.bom.find(r => r.role === "base").unitPrice, part.unitPrice);
  near(actual.calculation.weldCost, c.weldLengthMm / 1000 * 1234);
  assert.ok(insertionPrice(actual) > 0);
  assert.equal(selectStationInsertion(bound.items, req).technicalStatus, "ready");
  assert.deepEqual(bindProjectComponents(project, bound), bound, "repeated tariff binding is idempotent");
  assert.deepEqual(project, beforeProject); assert.deepEqual(database, beforeDatabase);
  const reloaded = projects.parseProjectConfig(JSON.parse(JSON.stringify(project)));
  assert.equal(bindProjectComponents(reloaded, database).items[0].calculatedInsertion.revision, 1);

  const stale = structuredClone(database); stale.items[0].calculatedInsertion.currentCatalogVersion = "even-newer-source";
  assert.equal(insertionPrice(bindProjectComponents(project, stale).items[0].calculatedInsertion), null, "tariffs never freshen a stale product");
  const invalid = structuredClone(database); invalid.items[0].calculatedInsertion.currentCatalogVersion = null;
  assert.equal(insertionPrice(bindProjectComponents(project, invalid).items[0].calculatedInsertion), null);
  const incomplete = structuredClone(database); incomplete.items[0].calculatedInsertion.calculation.bom = incomplete.items[0].calculatedInsertion.calculation.bom.filter(r => r.role !== "base");
  assert.equal(insertionPrice(bindProjectComponents(project, incomplete).items[0].calculatedInsertion), null);
  const changed = structuredClone(database); changed.items[0].calculatedInsertion.calculation.totalLengthMm += 10;
  changed.items[0].calculatedInsertion.calculation.configuration.baseLengthMm += 10;
  assert.equal(selectStationInsertion(bindProjectComponents(project, changed).items, req).item, undefined, "old selected dimensions cannot override new product geometry");
});
