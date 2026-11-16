import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
const {packTrace,unpackTrace}=await loadTs(new URL("../app/node-tools/trace-transport.ts",import.meta.url));

test("trace transport retains exact JSON data and restores shared object/array identity",()=>{
 const object={zero:0,no:false,empty:null,text:"",skip:undefined},array=[object,0,false,null,undefined];
 const trace={source:{inputs:{object,array},outputs:{object,array},sources:{}},other:{inputs:{nested:{object,array}},outputs:{object,array},sources:{}}};
 const packed=packTrace(trace),transport=JSON.parse(JSON.stringify(packed)),result=unpackTrace(transport);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),JSON.parse(JSON.stringify(trace)));
 assert.equal(result.source.inputs.object,result.source.outputs.object);
 assert.equal(result.source.inputs.array,result.other.outputs.array);
 assert.equal(result.source.inputs.array[0],result.source.inputs.object);
 assert.equal(result.other.inputs.nested.object,result.source.inputs.object);
 assert.equal(result.source.inputs.object.zero,0);assert.equal(result.source.inputs.object.no,false);assert.equal(result.source.inputs.object.empty,null);
 assert(!Object.hasOwn(result.source.inputs.object,"skip"));assert.equal(result.source.inputs.array[4],null);
 assert.notEqual(result.source.inputs.object,object);assert.equal(trace.source.inputs.array,array);
});

test("primitive JSON semantics preserve false/zero and normalize unsupported numeric values and array holes",()=>{
 const list=[undefined,undefined,NaN,Infinity,-Infinity,0,false,null];delete list[0];const trace={node:{inputs:{absent:undefined,nan:NaN,infinite:Infinity,zero:0,no:false,list},outputs:{},sources:{}}};
 const result=unpackTrace(packTrace(trace));
 assert.equal(JSON.stringify(result),JSON.stringify(trace));
 assert.deepEqual(result.node.inputs.list,[null,null,null,null,null,0,false,null]);
});

test("own JSON keys cannot mutate prototypes and inherited paths are rejected",()=>{
 const object=JSON.parse('{"__proto__":{"polluted":"safe-own-data"},"constructor":{"prototype":{"local":true}}}');
 const trace={node:{inputs:{object},outputs:{object},sources:{}}},result=unpackTrace(JSON.parse(JSON.stringify(packTrace(trace))));
 assert.equal(Object.prototype.polluted,undefined);assert.equal(Object.getPrototypeOf(result.node.inputs.object),Object.prototype);
 assert.equal(Object.hasOwn(result.node.inputs.object,"__proto__"),true);assert.equal(result.node.inputs.object.__proto__.polluted,"safe-own-data");
 for(const link of [{at:["__proto__","polluted"],from:["node"]},{at:["node","outputs","alias"],from:["constructor","prototype"]}])assert.throws(()=>unpackTrace({value:{node:{outputs:{alias:null}}},links:[link]}),/ссылки|назначение/);
 assert.equal(Object.prototype.polluted,undefined);
});

test("malformed alias paths, repeated destinations and non-placeholder replacements are rejected",()=>{
 const value={node:{inputs:{first:{x:1},alias:null,list:[null]},outputs:{},sources:{}}};
 const link={at:["node","inputs","alias"],from:["node","inputs","first"]};
 assert.throws(()=>unpackTrace({value,links:[{...link,at:[]}]}));
 assert.throws(()=>unpackTrace({value,links:[{...link,from:["missing"]}]}));
 assert.throws(()=>unpackTrace({value,links:[{...link,at:["node","inputs","missing"]}]}));
 assert.throws(()=>unpackTrace({value,links:[{...link,at:["node","inputs","first","x"]}]}),/заполнитель/);
 assert.throws(()=>unpackTrace({value,links:[link,link]}));
 assert.throws(()=>unpackTrace({value,links:[{...link,at:["node","inputs","list",-1]}]}));
 assert.throws(()=>unpackTrace({value,links:[{...link,at:["node","inputs","list","0"]}]}));
 assert.throws(()=>unpackTrace({value,links:[link,{at:["node","inputs","list",0],from:["node","inputs","alias"]}]}),/источник/);
 assert.equal(value.node.inputs.alias,null);
});

test("cyclic input and aliases forming direct or indirect cycles are rejected",()=>{
 const cyclic={};cyclic.self=cyclic;
 assert.throws(()=>packTrace(cyclic),/Циклическую/);
 assert.throws(()=>unpackTrace({value:{node:null},links:[{at:["node"],from:[]}]}),/цикл/);
 assert.throws(()=>unpackTrace({value:{a:{next:null},b:{next:null}},links:[{at:["a","next"],from:["b"]},{at:["b","next"],from:["a"]}]}),/цикл/);
});

test("large repeated datasets are transported once without losing a single row",()=>{
 const rows=Array.from({length:2000},(_,i)=>({id:"variant-"+i,curve:Array.from({length:12},(_,j)=>[j,i+j]),metadata:{manufacturer:"Fixture",known:false,dn:null}}));
 const trace=Object.fromEntries(Array.from({length:30},(_,i)=>["tool/stage"+i,{inputs:{rows},outputs:{rows},sources:{rows:"catalog.value"}}]));
 const packed=packTrace(trace),size=JSON.stringify(packed).length,originalSize=JSON.stringify(trace).length,result=unpackTrace(JSON.parse(JSON.stringify(packed)));
 assert(size<originalSize/20,`Expected deduplication: ${size}/${originalSize}`);
 assert.equal(result["tool/stage29"].outputs.rows.length,2000);assert.deepEqual(result["tool/stage29"].outputs.rows[1999],rows[1999]);
 assert.equal(result["tool/stage0"].inputs.rows,result["tool/stage29"].outputs.rows);
});
