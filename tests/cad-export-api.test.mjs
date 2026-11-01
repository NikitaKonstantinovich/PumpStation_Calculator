globalThis.__PSC_RELEASE_PROFILE__ = "full";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";
globalThis.__cadTest={env:{},user:{id:"owner",role:"pro"},calls:[],response:()=>Response.json({job:null})};
const url=new URL("../app/cad-export-server.ts",import.meta.url);
const source=(await readFile(url,"utf8")).replace('import { env } from "cloudflare:workers";','const env=globalThis.__cadTest.env;').replace('await fetch(','await globalThis.__cadTest.fetch(');
globalThis.__cadTest.fetch=async(url,options)=>{globalThis.__cadTest.calls.push({url,options});return globalThis.__cadTest.response();};
const {cadRequest,readCadBody,CAD_MAX_BYTES}=await loadTs(url,{[url.href]:source,[new URL("../app/auth-server.ts",import.meta.url).href]:'export async function currentUser(){return globalThis.__cadTest.user} export const json=(data,status=200,headers)=>Response.json(data,{status,headers});'});
test("CAD export requires login, geometry access, server configuration and same origin",async()=>{
  const s=globalThis.__cadTest,r=new Request("https://app.test/api/cad-export");
  s.user=null;assert.equal((await cadRequest(r,"/v1/jobs")).status,401);
  s.user={id:"owner",role:"plus"};assert.equal((await cadRequest(r,"/v1/jobs")).status,403);
  s.user={id:"owner",role:"pro"};assert.equal((await cadRequest(r,"/v1/jobs")).status,503);
  s.env.CAD_EXPORT_URL="https://cad.test";s.env.CAD_EXPORT_TOKEN="server-only-token";
  assert.equal((await cadRequest(new Request(r,{headers:{origin:"https://evil.test"}}),"/v1/jobs","{}")).status,403);
  assert.equal(s.calls.length,0);
  await cadRequest(r,"/v1/jobs","{}");
  assert.equal(s.calls[0].options.headers["X-Cad-Owner"],"owner");assert.equal(s.calls[0].options.redirect,"manual");
});
test("download streams private bytes; redirect cannot leak credentials",async()=>{
  const s=globalThis.__cadTest,r=new Request("https://app.test/api/cad-export");
  s.response=()=>new Response(new Uint8Array([9,8,7]),{headers:{"Content-Type":"application/zip"}});
  const res=await cadRequest(r,"/v1/jobs/id/download",undefined,true);
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())],[9,8,7]);assert.match(res.headers.get("Cache-Control"),/private/);
  assert.match(res.headers.get("Content-Disposition"),/pumpstation.zip/);
  s.response=()=>new Response(null,{status:302,headers:{Location:"https://evil.test"}});
  assert.equal((await cadRequest(r,"/v1/jobs")).status,502);
});
test("manifest body rejects malformed and oversized requests before forwarding",async()=>{
  const req=body=>new Request("https://app.test/api/cad-export",{method:"POST",body});
  assert.equal((await readCadBody(req("bad"))).status,400);
  assert.equal((await readCadBody(req(" ".repeat(CAD_MAX_BYTES+1)))).status,413);
  const {snapshotKey} = await loadTs(new URL("../app/cad-export.ts",import.meta.url));
  const valid=JSON.stringify({snapshotKey:await snapshotKey([]),manifest:{version:1,instances:[]}});
  assert.equal((await readCadBody(req(valid.replace(/"snapshotKey":"[^"]+"/,'"snapshotKey":"wrong"')))).status,400);
  assert.equal(await readCadBody(req(valid)),valid);
});
