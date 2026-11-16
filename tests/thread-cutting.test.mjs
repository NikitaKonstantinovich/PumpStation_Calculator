import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { loadTs } from "./load-ts.mjs";

const thread = await loadTs(new URL("../app/thread-cutting.ts", import.meta.url));
const base = await loadTs(new URL("../app/base-values.ts", import.meta.url));
const rates = () => thread.researchedThreadCuttingRates();

test("sourced prices cover both materials through 2 inches and keep stainless minimum explicit", () => {
  assert.deepEqual(thread.validateThreadCuttingRates(rates()), []);
  assert.equal(rates().length, 12);
  assert.deepEqual(rates().filter(r=>r.material==="st20").map(r=>r.pricePerEnd), [85,100,115,125,135,170]);
  assert.ok(rates().filter(r=>r.material==="aisi304").every(r=>r.pricePerEnd===600 && r.priceKind==="from"));
  assert.equal(thread.threadCuttingQuote(rates(), "st20", 50, 2).cost, 340);
  assert.equal(thread.threadCuttingQuote(rates(), "aisi304", 50, 1).estimated, true);
  assert.equal(thread.threadCuttingQuote(rates(), "aisi304", 50, 1).cost, 600);
  assert.equal(thread.threadCuttingQuote(undefined, "st20", 15, 1).cost, null);
  assert.equal(thread.threadCuttingQuote(rates(), "st20", 65, 1).cost, null);
  const copy = rates(); copy[0].priceKind="confirmed";
  assert.equal(thread.threadCuttingQuote(copy, "st20", 15, 1).estimated, false);
  assert.throws(()=>thread.threadCuttingQuote(rates(), "st20", 15, 0));
});

test("bad sizes, repeated identities, missing provenance and malformed prices are rejected", () => {
  for (const mutate of [r=>r[0].dn=65, r=>r[0].thread='3"', r=>r[1]={...r[0]}, r=>r[0].pricePerEnd=-1, r=>r[0].pricePerEnd=null, r=>r[0].source="", r=>r[0].date="2026-02-30", r=>r[0].priceKind="guessed", r=>r[0]=null]) {
    const values=base.initialBaseValues();values.welding.threadCutting=rates();mutate(values.welding.threadCutting);
    assert.ok(base.validateBaseValues(values).length);
  }
  const values=base.initialBaseValues();values.welding.threadCutting=rates();values.welding.threadCutting[0].pricePerEnd=null;values.welding.threadCutting[0].priceKind="missing";
  assert.deepEqual(base.validateBaseValues(values), []);
  assert.equal(thread.threadCuttingQuote(values.welding.threadCutting,"st20",15,1).cost,null);
  assert.equal(base.initialBaseValues().welding.threadCutting,undefined,"immutable initial version remains unchanged");
});

test("thread tariffs use admin publication, retain old snapshots and reject stale revisions", async () => {
  const sqlite=new DatabaseSync(":memory:");
  const database={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return sqlite.prepare(sql).get(...args)??null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};},async batch(statements){sqlite.exec("BEGIN");try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec("COMMIT");return results;}catch(e){sqlite.exec("ROLLBACK");throw e;}}};
  globalThis.__threadTariffTest={database,user:{id:"u",name:"Admin",role:"admin"}};
  const replacements={[new URL("../app/auth-server.ts",import.meta.url).href]:'export const db=()=>globalThis.__threadTariffTest.database;export const currentUser=async()=>globalThis.__threadTariffTest.user;export const json=(body,status=200,headers)=>Response.json(body,{status,headers});'};
  const route=await loadTs(new URL("../app/api/base-values/route.ts",import.meta.url),replacements),server=await loadTs(new URL("../app/base-values-server.ts",import.meta.url),replacements);
  const send=body=>route.PATCH(new Request("http://local/api/base-values",{method:"PATCH",body:JSON.stringify(body)}));
  const prior=await server.baseAdminState(),values=structuredClone(prior.draft);values.welding.threadCutting=rates();
  for(const role of ["base","plus","pro"]){globalThis.__threadTariffTest.user.role=role;assert.equal((await send({action:"publish",revision:0,values})).status,403);}
  globalThis.__threadTariffTest.user.role="admin";
  const response=await send({action:"publish",revision:0,values});assert.equal(response.status,200);const published=await response.json();
  assert.deepEqual(published.active.values.welding.threadCutting,rates());
  assert.equal((await server.readBasePublication("initial-v1")).values.welding.threadCutting,undefined);
  assert.equal((await send({action:"publish",revision:0,values})).status,409);
  const snapshot=await server.resolveBaseVersions({...base.baseSnapshot("initial-v1",base.initialBaseValues()).versions,welding:published.active.id});
  assert.equal(snapshot.values.welding.threadCutting.length,12);
  const forged=structuredClone(snapshot);forged.values.welding.threadCutting[0].pricePerEnd=1;await assert.rejects(()=>server.verifyAppliedBaseValues(forged),/Подмена/);
  sqlite.close();delete globalThis.__threadTariffTest;
});
