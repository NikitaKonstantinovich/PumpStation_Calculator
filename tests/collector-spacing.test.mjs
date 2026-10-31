import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { loadTs } from "./load-ts.mjs";

globalThis.__PSC_RELEASE_PROFILE__ = "full";
const load = name => loadTs(new URL(`../app/${name}.ts`,import.meta.url));
const spacing = await load("collector-spacing"), calc = await load("collector-calculations"), model = await load("collector-project");
const base = await load("base-values"), projects = await load("project-config"), updates = await load("base-values-project");
const catalog = JSON.parse(await readFile(new URL("../public/collector-catalog.json",import.meta.url),"utf8"));
const applied = () => base.baseSnapshot("initial-v1",base.initialBaseValues());
const configuration = (snapshot = applied(), pumpId = "pump-without-spacing-rule") => {
  const c = { type:"discharge",dn:100,pn:16,material:"aisi304",connection:"flanged",eccentric:false,stationType:"utility",simultaneous:false,jockey:false,
    baseVersions:snapshot.versions,velocityRules:snapshot.values.velocity,
    primary:{flow:30,working:2,reserve:1,dn:80,connection:"flanged",spacing:650,pn:16,pumpId,spacingManual:true},secondary:null };
  spacing.applyCollectorSpacingRules(c,snapshot.values);
  return c;
};
const confirm = (c,index=0) => { (index ? c.secondary : c.primary).spacingConfirmation = spacing.collectorSpacingConfirmation(c,index); return c; };

test("manual spacing enables pricing only after confirmation, including missing rules and both circuits",()=>{
  const c=configuration();
  assert.equal(calc.collectorCode(c),null);
  assert.match(calc.configurationWarnings(c).join(" "),/подтвердите ручное/);
  assert.equal(calc.calculateCollector(c,catalog).price,null);
  confirm(c);
  assert.equal(c.primary.spacingStatus,"missing","manual approval is not dimension confirmation");
  assert.equal(calc.calculateCollector(c,catalog).complete,true);
  assert.ok(calc.calculateCollector(c,catalog).price>0);
  c.stationType="combined";c.secondary={...c.primary,pumpId:"second-pump",spacing:700};
  assert.equal(calc.collectorCode(c),null,"first circuit approval does not approve the second");
  confirm(c,1);assert.ok(calc.collectorCode(c));
  assert.equal(calc.collectorLength(c),4050);
  c.secondary.spacing=750;assert.equal(calc.collectorCode(c),null);
});

test("manual approval cannot bypass known clearance, invalid values or changed rule evidence",()=>{
  const snapshot=applied(),rule=snapshot.values.spacing.rules.find(r=>r.status==="confirmed"&&r.modelIds.length);
  const c=configuration(snapshot,rule.modelIds[0]);c.primary.spacing=rule.spacing+50;confirm(c);
  assert.equal(calc.calculateCollector(c,catalog).complete,true);
  for(const mutate of [v=>v.primary.spacing+=50,v=>v.primary.pumpId="other",v=>v.baseVersions.spacing="new",v=>v.primary.radius+=1,v=>v.primary.spacingBase+=50,v=>v.type="suction"]){
    const changed=structuredClone(c);mutate(changed);assert.equal(spacing.collectorSpacingConfirmed(changed,0),false);
  }
  for(const value of [0,-1,Infinity,100001,2*rule.radius+149]){
    const invalid=structuredClone(c);invalid.primary.spacing=value;confirm(invalid);
    assert.equal(calc.calculateCollector(invalid,catalog).complete,false);
  }
  c.primary.spacing=2*rule.radius+150;confirm(c);assert.equal(calc.calculateCollector(c,catalog).complete,true);
});

test("project reload preserves manual approval; edits, pump changes, base updates and reset invalidate it",()=>{
  const snapshot=applied();let project=projects.createProject("Manual spacing",{baseValues:snapshot});
  Object.assign(project.entities["system-input"],{selectedPumpId:"no-rule",flowRate:30,head:30,workingPumpCount:2,reservePumpCount:1});
  project=model.synchronizeCollectors(project);
  Object.assign(project.entities["station-collectors"].discharge,{spacing1:650,spacing1Manual:true});
  project=model.synchronizeCollectors(project);
  let card=project.entities["station-collectors"].discharge;
  card.spacing1Confirmation=spacing.collectorSpacingConfirmation(card.configuration,0);
  project=model.synchronizeCollectors(project);
  const saved=projects.parseProjectConfig(JSON.parse(JSON.stringify(project)));
  assert.equal(spacing.collectorSpacingConfirmed(saved.entities["station-collectors"].discharge.configuration,0),true);
  assert.equal(saved.entities["station-collectors"].discharge.spacing1,650);
  for(const mutate of [p=>p.entities["station-collectors"].discharge.spacing1=700,p=>p.entities["system-input"].selectedPumpId="another-pump"]){
    const changed=structuredClone(saved);mutate(changed);card=model.synchronizeCollectors(changed).entities["station-collectors"].discharge;
    assert.equal(card.spacing1Confirmation,undefined);assert.equal(card.code,null);
  }
  const latest=base.baseSnapshot("new-spacing",base.initialBaseValues());
  card=model.synchronizeCollectors(updates.applyProjectBaseUpdate(saved,latest,["spacing"])).entities["station-collectors"].discharge;
  assert.equal(card.spacing1,650);assert.equal(card.spacing1Confirmation,undefined);assert.equal(card.code,null);
  const reset=structuredClone(saved);reset.entities["station-collectors"].discharge.spacing1Manual=false;
  card=model.synchronizeCollectors(reset).entities["station-collectors"].discharge;
  assert.equal(card.spacing1,0);assert.equal(card.spacing1Confirmation,undefined);assert.equal(card.code,null);
  assert.equal(spacing.collectorSpacingIsManual(card.configuration.primary),false);
  assert.ok(calc.configurationWarnings(card.configuration).some(message=>message.includes("нет правила")));
  const rule=snapshot.values.spacing.rules.find(r=>r.status==="confirmed"&&r.modelIds.length);
  reset.entities["system-input"].selectedPumpId=rule.modelIds[0];
  card=model.synchronizeCollectors(reset).entities["station-collectors"].discharge;
  assert.equal(card.spacing1,rule.spacing);assert.ok(card.code);
  let old=projects.createProject();Object.assign(old.entities["station-collectors"].discharge,{spacing1:700,spacing1Manual:true});
  old=model.synchronizeCollectors(old);
  let legacy=old.entities["station-collectors"].discharge;
  legacy.spacing1Confirmation=spacing.collectorSpacingConfirmation(legacy.configuration,0);
  legacy=model.synchronizeCollectors(old).entities["station-collectors"].discharge;
  assert.equal(spacing.collectorSpacingConfirmed(legacy.configuration,0),true);
  old.entities["station-collectors"].discharge.spacing1Manual=false;
  assert.equal(model.synchronizeCollectors(old).entities["station-collectors"].discharge.spacing1,500);
});

test("collector API requires pro/admin confirmation, rejects stale or forged rule data, and stores confirmed pricing",async()=>{
  const sqlite=new DatabaseSync(":memory:");
  for(const file of ["0000_burly_jackpot.sql","0001_organic_lady_bullseye.sql","0005_collectors.sql"])sqlite.exec(await readFile(new URL(`../drizzle/${file}`,import.meta.url),"utf8"));
  sqlite.exec("INSERT INTO users (id,email,name,password_hash) VALUES ('test','spacing@example.invalid','Test','unused')");
  const database={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return sqlite.prepare(sql).get(...args)??null;},async run(){sqlite.prepare(sql).run(...args);return {success:true};}};},async batch(statements){sqlite.exec("BEGIN");try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec("COMMIT");return result;}catch(e){sqlite.exec("ROLLBACK");throw e;}}};
  globalThis.__spacingTest={database,user:{id:"test",role:"pro"},applied:applied(),catalog};
  const replacements={
    [new URL("../app/auth-server.ts",import.meta.url).href]:'export const db=()=>globalThis.__spacingTest.database;export const currentUser=async()=>globalThis.__spacingTest.user;export const json=(body,status=200,headers)=>Response.json(body,{status,headers});',
    [new URL("../app/base-values-server.ts",import.meta.url).href]:'export class BaseValuesError extends Error{};export const resolveBaseVersions=async()=>globalThis.__spacingTest.applied;',
    [new URL("../app/collector-catalog-server.ts",import.meta.url).href]:'export const currentCollectorCatalog=async()=>globalThis.__spacingTest.catalog;'
  };
  const route=await loadTs(new URL("../app/api/collectors/route.ts",import.meta.url),replacements);
  const send=(c,action="calculate")=>route.POST(new Request("http://local/api/collectors",{method:"POST",body:JSON.stringify({action,configuration:c,code:calc.collectorCode(c)})}));
  try {
    const c=configuration();assert.equal((await send(c)).status,400);confirm(c);
    for(const role of ["base","plus"]){globalThis.__spacingTest.user.role=role;for(const action of ["calculate","create","refresh"])assert.equal((await send(c,action)).status,403);}
    for(const role of ["pro","admin"]){globalThis.__spacingTest.user.role=role;const response=await send(c);assert.equal(response.status,200);const result=(await response.json()).calculation;assert.equal(result.complete,true);assert.equal(result.fingerprint,calc.configurationFingerprint(c));}
    const forged=structuredClone(c);forged.primary.spacingStatus="confirmed";forged.primary.radius=1;delete forged.primary.spacingConfirmation;
    assert.equal((await send(forged)).status,400);
    const stale=structuredClone(c);stale.primary.spacing+=50;assert.equal((await send(stale)).status,400);
    const created=await send(c,"create");assert.equal(created.status,201);const saved=(await created.json()).collector;
    assert.equal(saved.configuration.primary.spacingConfirmation,c.primary.spacingConfirmation);assert.ok(saved.price>0);
    assert.equal((await send(c,"refresh")).status,200);
    const rule=globalThis.__spacingTest.applied.values.spacing.rules.find(r=>r.status==="confirmed"&&r.modelIds.length);
    const difference=configuration(globalThis.__spacingTest.applied,rule.modelIds[0]);difference.primary.spacing=rule.spacing+50;delete difference.primary.spacingManual;
    assert.equal((await send(difference)).status,400,"omitting the manual flag cannot bypass confirmation");
    const automatic=structuredClone(difference);automatic.primary.spacing=rule.spacing;
    assert.equal((await send(automatic)).status,200);
    const unsafe=configuration(globalThis.__spacingTest.applied,rule.modelIds[0]);unsafe.primary.spacing=2*rule.radius+149;confirm(unsafe);
    assert.equal((await send(unsafe)).status,400);
  } finally {delete globalThis.__spacingTest;sqlite.close();}
});
