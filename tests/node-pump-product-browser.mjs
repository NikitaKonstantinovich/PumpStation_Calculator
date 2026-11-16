import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, basename, join } from "node:path";
import { build } from "esbuild";
import { engineeringStore } from "./fixtures/engineering-store.mjs";
import { addPumpProductFixture } from "./fixtures/pump-product.mjs";

const item = (id, extra={}) => ({modelId:"model-"+id,variantId:id,curveSetId:"qh-"+id,frequencyHz:50,issues:["Точный PN не подтверждён"],provenance:{source:"isolated fixture"},pump:{id,manufacturer:"Fixture",series:"F",group:"F",model:"F "+id,execution:"F "+id+" 380V",type:"vertical_multistage",power:3,efficiency:null,nominalFlow:10,minFlow:0,maxFlow:20,minHead:10,maxHead:30,price:1000,priceCurrency:"RUB",priceKind:"net",priceSource:"fixture",source:"fixture",drawing:null,curve:[[0,30],[10,20],[20,10]],medium:"water",selectable:true,active:true,inletDn:null,outletDn:null,...extra}});
let liveSnapshot={sourceId:"pump_catalog_v2",id:"a".repeat(64),schemaVersion:"fixture-v1",sourceStatus:"isolated test",status:"ready",created:"2026-11-07T00:00:00Z",items:[item("a"),item("b",{price:null,priceCurrency:null}),item("inactive",{active:false})],issues:[]};
const store=await engineeringStore({catalogService:{fetch:async()=>Response.json(liveSnapshot)}});
const admin=await store.load("api/admin/node-tools/route"),runtime=await store.load("api/workspace2/route"),catalogRoute=await store.load("api/node-catalog/route");
const {toolState,toolProgram,toolDefaults,toolCommand,verifyWorkspace}=await store.load("node-tools/storage-server");
const {prepareDocument}=await store.load("node-tools/authoring");
const state=await toolState(),old=await toolProgram(),base=await toolDefaults(),document=addPumpProductFixture(prepareDocument(state.draft));
document.types.find(type=>type.parameter?.key==="medium").parameter.source={mode:"fixed",value:"water"};
await toolCommand({action:"publish",revision:state.revision,document},"Изолированный браузерный тест");
const values={stationType:"utility","main.medium":"wastewater","main.flowRate":10,"main.head":20,"main.workingPumpCount":1,"main.reservePumpCount":0};
const initial={schema:1,tools:{settings:{version:old.version,baseVersions:base.baseVersions,values}}};
let persisted=initial, rejectedForgeries=0;
const screenshot=process.env.NODE_PUMP_SCREENSHOT;
const app=`
import React,{useState} from "react";import {createRoot} from "react-dom/client";import {NodeWorkspace} from "./app/node-tools/workspace";import {createProject,parseProjectConfig} from "./app/project-config";
const seed=${JSON.stringify(initial)};
const sleep=()=>new Promise(r=>setTimeout(r,40));const until=async fn=>{for(let i=0;i<400;i++){const result=fn();if(result)return result;await sleep();}throw Error("Ожидание · "+document.body.innerText.slice(-3000));};const assert=(value,message)=>{if(!value)throw Error(message);};
const buttons=(name,root=document)=>[...root.querySelectorAll("button")].filter(button=>button.textContent.trim()===name);const click=async(name,root=document)=>{(await until(()=>buttons(name,root)[0])).click();await sleep();};
async function fill(el,value){assert(el,"Отсутствует поле "+value);el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));await sleep();el.dispatchEvent(new FocusEvent("focusout",{bubbles:true}));await sleep();}
const nav=()=>document.querySelector('nav[aria-label="Инструменты Workspace 2"]');const firstRadio=()=>document.querySelector('.nt-candidates input[type="radio"]');
function App(){const [project,setProject]=useState(()=>{const cached=localStorage.getItem("pumpProduct");return cached?parseProjectConfig(JSON.parse(cached)):{...createProject("Подбор по общему графу"),workspace2:seed};}),[status,setStatus]=useState("Изолированный проект");return <NodeWorkspace project={project} update={async workspace2=>{const response=await fetch("/fixture-save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(workspace2)}),body=await response.json();if(!response.ok){setStatus(body.error);return;}const next={...project,workspace2};localStorage.setItem("pumpProduct",JSON.stringify(next));setProject(next);setStatus("Сохранено сервером теста");}} back={()=>{}} openMain={()=>{}} navigation={null} status={status}/>;}
createRoot(document.getElementById("root")).render(<App/>);
async function run(){
 window.confirm=()=>true;
 if(sessionStorage.getItem("pumpSaved")){
  await until(nav);await click("Учебный подбор насосов",nav());await until(()=>firstRadio()?.checked);
  assert(!document.querySelector(".nt-selection-stale"),"После перезагрузки действующий выбор стал устаревшим");
  assert(document.querySelector(".nt-pump-card").textContent.includes("F a 380V"),"Выбранное исполнение не восстановилось");
  assert(!document.querySelector(".nt-pump-card").textContent.includes("SOURCE UPDATED"),"Обновление источника неявно изменило закреплённый подбор");
  assert(JSON.parse(localStorage.getItem("pumpProduct")).workspace2.product.sourceVersions.pump_catalog_v2==="${"a".repeat(64)}","Потеряна закреплённая версия каталога");return;
 }
 await until(()=>document.querySelector('[data-parameter="main.medium"] select')?.value==="wastewater");
 assert(!buttons("Учебный подбор насосов",nav()).length,"Публикация изменила старый проект до применения");
 await click("Применить актуальную версию продукта");await until(()=>buttons("Учебный подбор насосов",nav()).length);
 assert(document.querySelector('[data-parameter="main.medium"] select').value==="water","Постоянная среда не применилась");
 await click("Учебный подбор насосов",nav());await until(()=>document.querySelectorAll('.nt-candidates tbody tr').length===2);
 assert([...document.querySelectorAll('.nt-candidates input[type="radio"]')].every(input=>!input.checked),"Подбор автоматически подтвердил насос без действия пользователя");
 firstRadio().click();await until(()=>document.querySelector(".nt-pump-card").textContent.includes("F a 380V"));
 assert(document.querySelector(".nt-pump-card").textContent.includes("Неизвестно"),"Карточка подменила неизвестные DN числом");
 assert(document.querySelector(".nt-pump-card").textContent.includes("Точный PN не подтверждён"),"Карточка скрыла неполноту исходных данных");
 const usedCurve=document.querySelector(".nt-used-curve");assert(usedCurve,"Нет просмотра используемой характеристики");usedCurve.querySelector("summary").click();await sleep();assert(usedCurve.open,"Раздел характеристики не раскрылся");assert(usedCurve.textContent.includes("qh-a")&&usedCurve.textContent.includes("Частота · Гц")&&usedCurve.textContent.includes("50"),"Потеряны набор характеристики или частота");assert([...usedCurve.querySelectorAll("tbody tr")].map(row=>[...row.querySelectorAll("td")].map(cell=>cell.textContent).join(",")).join(";")==="0,30;10,20;20,10","Просмотр изменил исходные Q/H точки");usedCurve.querySelector("summary").click();
 ${screenshot ? 'await fetch("/capture",{method:"POST"});' : ""}
 await click("Сохранить значения");await until(()=>localStorage.getItem("pumpProduct"));
 let saved=JSON.parse(localStorage.getItem("pumpProduct"));const proof=saved.workspace2.tools.pumpFixture.values.selectedPump;assert(proof.variantId==="a"&&proof.snapshotId==="${"a".repeat(64)}"&&proof.requestKey,"Выбор не содержит устойчивого подтверждения");
 assert(!Object.hasOwn(saved.workspace2.tools.settings.values,"main.medium"),"Постоянная среда осталась пользовательским переопределением");
 const forged=structuredClone(saved.workspace2);forged.tools.pumpFixture.values.selectedPump={...proof,variantId:"forged"};
 const response=await fetch("/fixture-save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(forged)});assert(response.status===403,"Сервер принял поддельный выбор исполнения");
 await click("Настройки проекта",nav());await until(()=>document.querySelector('[data-parameter="main.flowRate"] input'));await fill(document.querySelector('[data-parameter="main.flowRate"] input'),"10.5");
 await click("Учебный подбор насосов",nav());await until(()=>document.querySelector(".nt-selection-stale"));
 assert(document.querySelector(".nt-selection-stale").textContent.includes("a"),"Устаревший выбор был подменён другим насосом");
 await click("Сбросить выбор");(await until(()=>{const input=firstRadio();return input&&!input.checked?input:null;})).click();await until(()=>firstRadio()?.checked&&!document.querySelector(".nt-selection-stale"));
 await click("Сохранить значения");await until(()=>JSON.parse(localStorage.getItem("pumpProduct")).workspace2.tools.settings.values["main.flowRate"]===10.5);
 saved=JSON.parse(localStorage.getItem("pumpProduct"));assert(saved.workspace2.tools.pumpFixture.values.selectedPump.requestKey!==proof.requestKey,"Повторный выбор не обновил подтверждение условий");
 await fetch("/fixture-change-source",{method:"POST"});sessionStorage.setItem("pumpSaved","1");location.reload();await new Promise(()=>{});
}
run().then(()=>fetch("/done",{method:"POST",body:"ok"}),error=>fetch("/done",{method:"POST",body:String(error.stack??error)}));
`;
const built=await build({stdin:{contents:app,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,outfile:"pump-product.js",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'}});
let finish;const done=new Promise(resolve=>finish=resolve);
const server=createServer(async(request,response)=>{
  try{
    request.setEncoding("utf8");
    if(request.url==="/done"){let body="";for await(const chunk of request)body+=chunk;response.end("ok");finish(body);return;}
    if(request.url==="/capture"&&screenshot){await capture();response.end("ok");return;}
    if(request.url==="/fixture-change-source"){liveSnapshot={...liveSnapshot,id:"b".repeat(64),items:liveSnapshot.items.map(item=>({...item,pump:{...item.pump,execution:"SOURCE UPDATED"}}))};response.end("ok");return;}
    if(request.url==="/fixture-save"){let body="";for await(const chunk of request)body+=chunk;const next=JSON.parse(body);try{await verifyWorkspace(next,persisted,"admin");persisted=next;response.setHeader("Content-Type","application/json");response.end("{}");}catch(error){if(error.status===403)rejectedForgeries++;response.writeHead(error.status??400,{"Content-Type":"application/json"});response.end(JSON.stringify({error:error.message}));}return;}
    if(request.url.startsWith("/api/")){let body="";for await(const chunk of request)body+=chunk;const req=new Request("http://fixture"+request.url,{method:body?"POST":"GET",headers:{"x-test-role":"admin","Content-Type":"application/json"},...(body?{body}:{})}),route=request.url.startsWith("/api/node-catalog")?catalogRoute:request.url.startsWith("/api/admin/")?admin:runtime,result=await route[body?"POST":"GET"](req);response.writeHead(result.status,{"Content-Type":"application/json"});response.end(await result.text());return;}
    const file=built.outputFiles.find(file=>request.url==="/"+basename(file.path));if(file){response.setHeader("Content-Type",file.path.endsWith(".js")?"application/javascript":"text/css");response.end(file.contents);return;}
    response.end('<!doctype html><meta charset="utf-8"><style>:root{--paper:#fff;--surface:#f4f6f8;--ink:#223;--line:#ccd;--muted:#667;--blue:#2674b9}body{margin:0}</style><link rel="stylesheet" href="/pump-product.css"><div id="root"></div><script src="/pump-product.js"></script>');
  }catch(error){response.writeHead(500);response.end(String(error));finish(String(error));}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const profile=await mkdtemp(join(tmpdir(),"pumpstation-pump-product-ui-"));
const browser=spawn(process.env.CHROME_BIN??"C:/Program Files/Google/Chrome/Application/chrome.exe",["--headless","--disable-gpu","--no-first-run","--disable-extensions",...(screenshot?["--remote-debugging-port=0"]:[]),"--window-size=1800,1100","--user-data-dir="+profile,"http://127.0.0.1:"+server.address().port],{windowsHide:true,stdio:"ignore"});
let debugSocket;
async function capture(){
  let port;
  for(let attempt=0;attempt<150&&!port;attempt++){
    try{port=Number((await readFile(join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0]);}catch{/* Chrome is still starting. */}
    if(!port)await new Promise(resolve=>setTimeout(resolve,65));
  }
  assert.ok(port,"Chrome debugging port is unavailable");
  const pages=await(await fetch("http://127.0.0.1:"+port+"/json/list")).json();
  debugSocket=new WebSocket(pages.find(page=>page.type==="page").webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{debugSocket.addEventListener("open",resolve,{once:true});debugSocket.addEventListener("error",reject,{once:true});});
  let serial=0;const pending=new Map();
  debugSocket.addEventListener("message",event=>{const data=JSON.parse(event.data),item=pending.get(data.id);if(!item)return;pending.delete(data.id);if(data.error)item.reject(Error(data.error.message));else item.resolve(data.result);});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});debugSocket.send(JSON.stringify({id,method,params}));});
  await call("Runtime.evaluate",{expression:"document.activeElement?.blur();window.scrollTo(0,0)"});
  const result=await call("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
  const output=resolve(screenshot);await mkdir(dirname(output),{recursive:true});await writeFile(output,Buffer.from(result.data,"base64"));console.log("Screenshot · "+output);debugSocket.close();
}
const closed=new Promise(resolve=>browser.once("close",resolve));browser.on("error",error=>finish(String(error)));const timeout=setTimeout(()=>finish("Pump product browser timeout"),90000);
try{assert.equal(await done,"ok");assert.equal(rejectedForgeries,1);assert.equal(persisted.tools.pumpFixture.values.selectedPump.variantId,"a");assert.equal(persisted.tools.settings.values["main.flowRate"],10.5);console.log("PASS · upstream effective clean-water values, staged catalogue selection table, explicit proof, server forgery rejection, stale selection/reconfirmation and immutable catalogue reload");}
finally{clearTimeout(timeout);debugSocket?.close();browser.kill();server.closeAllConnections();server.close();await closed;store.close();if(dirname(resolve(profile))===resolve(tmpdir())&&basename(profile).startsWith("pumpstation-pump-product-ui-"))await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300});}
