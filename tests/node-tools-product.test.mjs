import assert from "node:assert/strict";
import test from "node:test";
import {loadTs} from "./load-ts.mjs";

const base=new URL("../app/",import.meta.url);
// These tests isolate generic graph execution from the separately tested pump operations.
const replacements={[new URL("node-tools/pump-runtime.ts",base).href]:"export function executePumpOperation(){return undefined;}"};
const load=path=>loadTs(new URL(path+".ts",base),replacements);
const {initialTools}=await load("node-tools/factory");
const {deriveTools,upgradeDocument,productConnectionProblem}=await load("node-tools/product");
const {compileTools,parameterType,runTests}=await load("node-tools/compiler");
const {evaluatePlan,evaluateProduct}=await load("node-tools/runtime");
const field=(key,kind="object",meaning="record",direction="input",unit="")=>({key,name:key,kind,meaning,direction,unit});
const inputValues={stationType:"utility","main.flowRate":10,"main.head":20,"main.workingPumpCount":1,"main.reservePumpCount":0};
const context=values=>({values,defaults:{usdRate:80,cnyRate:12},role:"admin"});

function addConsumer(doc){
 const root=doc.diagrams.find(g=>g.id===doc.product.root);
 const ports=[field("context","object","toolContext"),field("conditions"),field("value","object","record","output"),field("ui","object","view","output")];
 doc.types.push({id:"consumer.in",name:"Входы",category:"Границы",description:"",formulas:{},fields:ports.filter(f=>f.direction==="input").map(f=>({...f,direction:"output"}))},{id:"consumer.out",name:"Выходы",category:"Границы",description:"",formulas:{},fields:ports.filter(f=>f.direction==="output").map(f=>({...f,direction:"input"}))},{id:"consumer",name:"Получатель",category:"Расчёт",description:"",formulas:{},fields:ports,instrument:"consumer.graph"},parameterType("consumer.search","Поиск",field("search","string","text")),{id:"consumer.record",name:"Результат",category:"Расчёт",description:"",formulas:{},operation:"object",fields:[field("upstream"),field("search","string","text"),field("value","object","record","output")]});
 doc.diagrams.push({id:"consumer.graph",name:"Получатель",groups:{},nodes:[{id:"source",type:"consumer.in",name:"Входы",x:0,y:0,values:{}},{id:"project",type:"data.source",name:"Значения",x:300,y:0,values:{source:"workspace2"}},{id:"search",type:"consumer.search",name:"Поиск",x:600,y:0,values:{}},{id:"field",type:"ui.field",name:"Поле",x:900,y:0,values:{}},{id:"form",type:"ui.form",name:"Форма",x:1200,y:0,values:{}},{id:"collect",type:"consumer.record",name:"Результат",x:1200,y:300,values:{}},{id:"result",type:"consumer.out",name:"Выходы",x:1600,y:0,values:{}}],edges:[{from:"source",out:"context",to:"project",input:"context"},{from:"project",out:"value",to:"search",input:"values"},{from:"search",out:"binding",to:"field",input:"binding"},{from:"field",out:"value",to:"form",input:"child0"},{from:"form",out:"value",to:"result",input:"ui"},{from:"source",out:"conditions",to:"collect",input:"upstream"},{from:"search",out:"value",to:"collect",input:"search"},{from:"collect",out:"value",to:"result",input:"value"}]});
 root.nodes.push({id:"selection",type:"consumer",name:"Подбор",x:800,y:0,values:{},tool:{order:1}});root.edges.push({from:"settings",out:"value",to:"selection",input:"conditions"});return root;
}

test("legacy editable documents migrate without losing stable settings identity, metadata, source modes or historical execution",()=>{
 const original=initialTools(),legacy=compileTools(original,"old"),doc=upgradeDocument(original);
 assert.equal(original.product,undefined);assert.equal(doc.product.root,"tools");assert.equal(doc.tools.length,0);
 assert.deepEqual(deriveTools(doc).map(t=>t.id),["settings"]);
 assert.equal(deriveTools(doc)[0].tests.length,original.tools[0].tests.length);
 const graph=doc.diagrams.find(g=>g.id===doc.product.root);graph.nodes.find(n=>n.id==="settings").name="Новые настройки";
 assert.equal(deriveTools(doc)[0].id,"settings");assert.equal(deriveTools(doc)[0].name,"Новые настройки");
 const current=compileTools(doc,"product"),result=evaluateProduct(current,"settings",{settings:context(inputValues)});
 assert.equal(result.value.main.flowRate,10);assert.equal(evaluatePlan(legacy.plans.settings,context(inputValues)).value.main.flowRate,10);
 assert.deepEqual(runTests(doc,context(inputValues)).filter(t=>!t.passed),[]);
});

test("two root uses of one definition own their state; nested Instruments are not workspace tools",()=>{
 const doc=upgradeDocument(initialTools()),root=doc.diagrams.find(g=>g.id===doc.product.root),first=root.nodes.find(n=>n.id==="settings");
 root.nodes.push({...structuredClone(first),id:"other",name:"Другие настройки",x:800,tool:{order:3}});
 assert.deepEqual(deriveTools(doc).map(t=>t.id),["settings","other"]);
 const program=compileTools(doc,"two"),contexts={settings:context(inputValues),other:context({...inputValues,"main.flowRate":22})};
 assert.equal(evaluateProduct(program,"settings",contexts).value.main.flowRate,10);
 const other=evaluateProduct(program,"other",contexts);assert.equal(other.value.main.flowRate,22);
 assert(other.bindings.every(b=>b.toolId==="other"));assert.equal(other.bindings.find(b=>b.key==="main.flowRate").value,22);
});

test("links execute upstream effective fixed and computed outputs without opening its form or executing save commands",()=>{
 const doc=upgradeDocument(initialTools()),root=addConsumer(doc),medium=doc.types.find(t=>t.parameter?.key==="medium"),flow=doc.types.find(t=>t.parameter?.key==="flowRate"),contour=doc.diagrams.find(g=>g.id==="tool.contour");
 medium.parameter.source={mode:"fixed",value:"water"};flow.parameter.source={mode:"computed"};
 doc.types.push({id:"computed.flow",name:"Расход",category:"Расчёт",description:"",fields:[field("value","float","flow","output","м³/ч")],formulas:{value:"12.5"}});
 contour.nodes.push({id:"calculated",type:"computed.flow",name:"Расход",x:0,y:0,values:{}});contour.edges.push({from:"calculated",out:"value",to:"flowRate",input:"computed"});
 const program=compileTools(doc,"linked"),result=evaluateProduct(program,"selection",{settings:context({...inputValues,"main.medium":"wastewater"}),selection:context({search:"CDM"})});
 assert.equal(result.value.upstream.main.medium,"water");assert.equal(result.value.upstream.main.flowRate,12.5);assert.equal(result.value.search,"CDM");
 assert.deepEqual(program.product.dependencies.selection,["settings"]);assert(!result.trace["settings/form"]);assert(!result.trace["settings/save"]);
 assert.equal(result.bindings.find(b=>b.toolId==="selection"&&b.key==="search").value,"CDM");
 root.nodes.find(n=>n.id==="settings").tool.enabled=false;
 assert.throws(()=>compileTools(doc,"disabled"),/отключён/);
});

function branches(dependent){
 const doc=upgradeDocument(initialTools()),root=doc.diagrams.find(g=>g.id===doc.product.root);
 const scalar=field("value","float","number","output"),port=field("input","float","number");
 doc.types.push({id:"branch.in",name:"Вход",category:"Границы",description:"",fields:[{...port,direction:"output"},field("context","object","toolContext","output")],formulas:{}},{id:"branch.out",name:"Выход",category:"Границы",description:"",fields:[{...scalar,direction:"input"},field("ui","object","view","input")],formulas:{}},{id:"branch",name:"Ветви",category:"Расчёт",description:"",instrument:"branch.graph",fields:[port,field("context","object","toolContext"),scalar,field("ui","object","view","output")],formulas:{}},{id:"branch.calculate",name:"Вычисление",category:"Расчёт",description:"",fields:[port,scalar],formulas:{value:dependent?"input":"7"}});
 doc.diagrams.push({id:"branch.graph",name:"Ветви",groups:{},nodes:[{id:"source",type:"branch.in",name:"Вход",x:0,y:0,values:{}},{id:"calculate",type:"branch.calculate",name:"Вычисление",x:300,y:0,values:{}},{id:"form",type:"ui.form",name:"Форма",x:300,y:300,values:{}},{id:"result",type:"branch.out",name:"Выход",x:600,y:0,values:{}}],edges:[{from:"source",out:"input",to:"calculate",input:"input"},{from:"calculate",out:"value",to:"result",input:"value"},{from:"form",out:"value",to:"result",input:"ui"}]});
 for(const id of ["a","b"])root.nodes.push({id,type:"branch",name:id,x:0,y:0,values:{},tool:{}});
 root.edges.push({from:"a",out:"value",to:"b",input:"input"},{from:"b",out:"value",to:"a",input:"input"});return doc;
}

test("independent output branches avoid false Instrument cycles while actual port cycles identify the offending ports",()=>{
 const independent=branches(false),root=independent.diagrams.find(g=>g.id===independent.product.root);assert.equal(productConnectionProblem(independent,root,{from:"a",out:"value",to:"b",input:"input"}),"");const cyclic=branches(true),badRoot=cyclic.diagrams.find(g=>g.id===cyclic.product.root);assert.match(productConnectionProblem(cyclic,badRoot,{from:"a",out:"value",to:"b",input:"input"}),/Цикл расчётных портов/);
 const valid=compileTools(independent,"independent");assert.equal(evaluateProduct(valid,"a",{a:context({}),settings:context(inputValues)}).value,7);
 assert.throws(()=>compileTools(branches(true),"cycle"),/Цикл расчётных портов.*input/);
});

test("legacy tools sharing one old root migrate as separate wrappers without recursive containment",()=>{const original=initialTools();original.tools.push({...structuredClone(original.tools[0]),id:"copy",name:"Другой инструмент"});const doc=upgradeDocument(original);assert.notEqual(doc.product.root,"tools");assert.deepEqual(deriveTools(doc).map(t=>t.id),["settings","copy"]);const program=compileTools(doc,"migration");assert.equal(evaluateProduct(program,"copy",{copy:context({...inputValues,"main.flowRate":27}),settings:context(inputValues)}).value.main.flowRate,27);});
