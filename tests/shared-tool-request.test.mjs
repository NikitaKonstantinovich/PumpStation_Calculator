import test from "node:test";
import assert from "node:assert/strict";
import {loadTs} from "./load-ts.mjs";
const {sharedToolRequest}=await loadTs(new URL("../app/shared-tool-request.ts",import.meta.url));
test("duplicate windows share one read, abort independently, and never share response objects",async()=>{
  const original=globalThis.fetch;let finish,calls=0,signal;
  globalThis.fetch=(_url,options)=>{calls++;signal=options.signal;return new Promise(resolve=>{finish=resolve;});};
  try{
    const a=new AbortController(),b=new AbortController();
    const first=sharedToolRequest("/fixture/shared",{signal:a.signal});const cancelled=assert.rejects(first,e=>e.name==="AbortError");
    const second=sharedToolRequest("/fixture/shared",{signal:b.signal});a.abort();await cancelled;
    assert.equal(signal.aborted,false);assert.equal(calls,1);finish(Response.json({value:42}));
    assert.deepEqual(await (await second).json(),{value:42});assert.deepEqual(await (await sharedToolRequest("/fixture/shared")).json(),{value:42});assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});
test("closing all windows cancels pending source work; reenable requests fresh data",async()=>{
  const original=globalThis.fetch;let signal,calls=0;
  globalThis.fetch=(_url,options)=>{calls++;signal=options.signal;return new Promise((resolve,reject)=>{options.signal.addEventListener("abort",()=>reject(new DOMException("Aborted","AbortError")));});};
  try{
    const controller=new AbortController(),promise=sharedToolRequest("/fixture/cancel",{signal:controller.signal}),rejected=assert.rejects(promise,e=>e.name==="AbortError");
    controller.abort();await rejected;assert(signal.aborted);
    globalThis.fetch=async()=>{calls++;return Response.json({revision:2});};
    assert.deepEqual(await (await sharedToolRequest("/fixture/cancel")).json(),{revision:2});assert.equal(calls,2);
  }finally{globalThis.fetch=original;}
});
test("different pinned source versions and query bodies never share requests",async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>Response.json({call:++calls});
  try{
    const responses=await Promise.all([sharedToolRequest("/fixture?version=one"),sharedToolRequest("/fixture?version=two"),sharedToolRequest("/fixture",{method:"POST",body:"a"}),sharedToolRequest("/fixture",{method:"POST",body:"b"})]);
    assert.equal(new Set(await Promise.all(responses.map(async r=>(await r.json()).call))).size,4);
  }finally{globalThis.fetch=original;}
});
