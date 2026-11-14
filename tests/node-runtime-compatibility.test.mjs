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
 globalThis.__compatProgram=program;globalThis.__compatResources=[];globalThis.__compatSourcePins=[];
 try{
  const route=await loadTs(new URL("api/workspace2/route.ts",app),{
   [new URL("auth-server.ts",app).href]:'export const currentUser=async request=>({role:request.headers.get("x-test-role")??"admin"});export const json=(body,status,headers)=>Response.json(body,{status,headers});',
   [new URL("release-policy.ts",app).href]:'export const IS_BETA=false;',
   [new URL("node-tools/algorithm-store-server.ts",app).href]:'export const algorithmInfo=async()=>({name:"Насосная установка"});',
   [new URL("node-tools/catalog-server.ts",app).href]:'export class CatalogError extends Error{};',
   [new URL("node-tools/storage-server.ts",app).href]:`
     export class ToolError extends Error { status=400; }
     export const toolProgram=async()=>globalThis.__compatProgram;
     export const toolDefaults=async versions=>({defaults:{},baseVersions:versions});
     export const toolResources=async(program,sources,base)=>{
       globalThis.__compatResources.push({sources,base});
       return {sourceVersions:sources,resources:{pump_catalog_v2:{items:[]}}};
     };
     export const toolSourceVersions=async(program,sources,base)=>{
       globalThis.__compatSourcePins.push({sources,base});
       return {...sources,station_catalog:"resolved-station"};
     };
   `
  });
  const url="http://fixture/api/workspace2?version=pinned-v14&sources="+encodeURIComponent(JSON.stringify({pump_catalog_v2:"pinned-catalog"}))+"&base="+encodeURIComponent(JSON.stringify({spacing:"pinned-base"}));
  const old=await route.GET(new Request(url));assert.equal(old.status,409);assert.equal((await old.json()).code,"NODE_RUNTIME_UPDATE_REQUIRED");assert.equal(globalThis.__compatResources.length,0);
  const headers={[compatibility.NODE_RUNTIME_HEADER]:OPERATIONS.join(",")};
  const supported=await route.GET(new Request(url,{headers}));
  assert.equal(supported.status,200);const body=await supported.json();assert.equal(body.program.version,"pinned-v14");assert.deepEqual(body.sourceVersions,{pump_catalog_v2:"pinned-catalog"});assert.deepEqual(body.resources,{pump_catalog_v2:{items:[]}});assert.deepEqual(globalThis.__compatResources,[{sources:{pump_catalog_v2:"pinned-catalog"},base:{spacing:"pinned-base"}}]);

  const manifestUrl=url+"&manifest=1";
  const manifest=await route.GET(new Request(manifestUrl,{headers}));
  assert.equal(manifest.status,200);
  assert.deepEqual(await manifest.json(),{
    program,algorithm:{name:"Насосная установка"},defaults:{},baseVersions:{spacing:"pinned-base"},
    role:"admin",sourceVersions:{pump_catalog_v2:"pinned-catalog"}
  });
  assert.equal(globalThis.__compatResources.length,1);
  assert.deepEqual(globalThis.__compatSourcePins,[]);
  assert.equal((await route.GET(new Request(manifestUrl))).status,409);
  const invalidManifest=new URL(manifestUrl);invalidManifest.searchParams.set("sources","[]");
  assert.equal((await route.GET(new Request(invalidManifest,{headers}))).status,400);

  const resolved=await route.GET(new Request(manifestUrl+"&resolveSources=1",{headers}));
  assert.equal(resolved.status,200);
  const pins=await resolved.json();
  assert.deepEqual(pins.sourceVersions,{pump_catalog_v2:"pinned-catalog",station_catalog:"resolved-station"});
  assert.equal(Object.hasOwn(pins,"resources"),false);
  assert.equal(globalThis.__compatResources.length,1);
  assert.deepEqual(globalThis.__compatSourcePins,[{sources:{pump_catalog_v2:"pinned-catalog"},base:{spacing:"pinned-base"}}]);
  delete globalThis.__compatProgram;
  const defaultsUrl=url+"&editor=1&defaults=1";
  const defaults=await route.GET(new Request(defaultsUrl));
  assert.equal(defaults.status,200);
  assert.deepEqual(await defaults.json(),{defaults:{},baseVersions:{spacing:"pinned-base"},role:"admin"});
  assert.equal(globalThis.__compatResources.length,1);
  assert.equal((await route.GET(new Request(defaultsUrl,{headers:{"x-test-role":"pro"}}))).status,403);
 }finally{delete globalThis.__compatProgram;delete globalThis.__compatResources;delete globalThis.__compatSourcePins;}
});
