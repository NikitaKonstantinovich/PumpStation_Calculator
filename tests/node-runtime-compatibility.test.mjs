import test from "node:test";
import assert from "node:assert/strict";
import {loadTs} from "./load-ts.mjs";

const app=new URL("../app/",import.meta.url);
const compatibility=await loadTs(new URL("node-tools/runtime-compatibility.ts",app));
const {OPERATIONS}=await loadTs(new URL("node-tools/runtime.ts",app));
const program={version:"pinned-v14",plans:{card:{steps:[{id:"layout",operation:"spacing.layout"},{id:"spacing",operation:"spacing.standardWidth"},{id:"view",operation:"form"}]}},tools:[]};

test("old tabs reject the new width operation while current runtime supports the pinned graph",()=>{
 assert.deepEqual(compatibility.missingRuntimeOperations(program),["spacing.standardWidth"]);
 assert.deepEqual(compatibility.missingRuntimeOperations(program,OPERATIONS),[]);
 assert.deepEqual(compatibility.missingRuntimeOperations(program,OPERATIONS.filter(op=>op!=="spacing.standardWidth")),["spacing.standardWidth"]);
 const original={plans:{settings:{steps:[{operation:"source"},{operation:"form"}]}}};
 assert.deepEqual(compatibility.missingRuntimeOperations(original),[],"old algorithms remain available to legacy clients");
});

test("capability negotiation detects future operations and validates bounded headers",()=>{
 assert.deepEqual(compatibility.parseRuntimeOperations(OPERATIONS.join(",")),[...OPERATIONS]);
 assert.equal(compatibility.parseRuntimeOperations(null),undefined);
 assert.throws(()=>compatibility.parseRuntimeOperations("invalid operation"));
 assert.throws(()=>compatibility.parseRuntimeOperations("x,".repeat(257)));
 const future=structuredClone(program);future.plans.card.steps.push({operation:"future.node"});
 assert.deepEqual(compatibility.missingRuntimeOperations(future,OPERATIONS),["future.node"]);
});

test("workspace API stops incompatible execution before loading sources and preserves pins for supported clients",async()=>{
 globalThis.__compatProgram=program;globalThis.__compatResources=[];
 try{
  const route=await loadTs(new URL("api/workspace2/route.ts",app),{
   [new URL("auth-server.ts",app).href]:'export const currentUser=async()=>({role:"admin"});export const json=(body,status,headers)=>Response.json(body,{status,headers});',
   [new URL("release-policy.ts",app).href]:'export const IS_BETA=false;',
   [new URL("node-tools/algorithm-store-server.ts",app).href]:'export const algorithmRow=async()=>({name:"Насосная установка"});',
   [new URL("node-tools/catalog-server.ts",app).href]:'export class CatalogError extends Error{};',
   [new URL("node-tools/storage-server.ts",app).href]:'export class ToolError extends Error{};export const toolProgram=async()=>globalThis.__compatProgram;export const toolDefaults=async versions=>({defaults:{},baseVersions:versions});export const toolResources=async(program,sources,base)=>{globalThis.__compatResources.push({sources,base});return {sourceVersions:sources};};'
  });
  const url="http://fixture/api/workspace2?version=pinned-v14&sources="+encodeURIComponent(JSON.stringify({pump_catalog_v2:"pinned-catalog"}))+"&base="+encodeURIComponent(JSON.stringify({spacing:"pinned-base"}));
  const old=await route.GET(new Request(url));assert.equal(old.status,409);assert.equal((await old.json()).code,"NODE_RUNTIME_UPDATE_REQUIRED");assert.equal(globalThis.__compatResources.length,0);
  const supported=await route.GET(new Request(url,{headers:{[compatibility.NODE_RUNTIME_HEADER]:OPERATIONS.join(",")}}));
  assert.equal(supported.status,200);const body=await supported.json();assert.equal(body.program.version,"pinned-v14");assert.deepEqual(body.sourceVersions,{pump_catalog_v2:"pinned-catalog"});assert.deepEqual(globalThis.__compatResources,[{sources:{pump_catalog_v2:"pinned-catalog"},base:{spacing:"pinned-base"}}]);
 }finally{delete globalThis.__compatProgram;delete globalThis.__compatResources;}
});
