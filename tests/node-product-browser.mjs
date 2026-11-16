import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, basename, join } from "node:path";
import { build } from "esbuild";
import { engineeringStore } from "./fixtures/engineering-store.mjs";

const store = await engineeringStore();
const admin = await store.load("api/admin/node-tools/route"), runtime = await store.load("api/workspace2/route");
const { toolProgram, toolDefaults, verifyWorkspace } = await store.load("node-tools/storage-server");
const program = await toolProgram(), base = await toolDefaults();
const values = { stationType:"utility", "main.flowRate":10, "main.head":20, "main.workingPumpCount":1, "main.reservePumpCount":0 };
const initial = {schema:1,tools:{settings:{version:program.version,baseVersions:base.baseVersions,values}}};
let persisted = initial;
const app = `
import React,{useState} from "react";import {createRoot} from "react-dom/client";
import {ToolEditor} from "./app/node-tools/editor";import {NodeWorkspace} from "./app/node-tools/workspace";import {createProject,parseProjectConfig} from "./app/project-config";
const seed=${JSON.stringify(initial)};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,40));
const until=async fn=>{for(let i=0;i<400;i++){const result=fn();if(result)return result;await sleep();}throw Error("Ожидание · "+document.body.innerText.slice(-2500));};
const assert=(value,message)=>{if(!value)throw Error(message);};
const buttons=(text,root=document)=>[...root.querySelectorAll("button")].filter(button=>button.textContent.trim()===text);
const click=async(text,root=document)=>{(await until(()=>buttons(text,root)[0])).click();await sleep();};
async function fill(el,value){assert(el,"Поле отсутствует: "+value);el.focus();const prototype=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,"value").set.call(el,value);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?"change":"input",{bubbles:true}));await sleep();el.dispatchEvent(new FocusEvent("focusout",{bubbles:true}));await sleep();}
function App(){const [project,setProject]=useState(()=>{const cached=localStorage.getItem("productProject");return cached?parseProjectConfig(JSON.parse(cached)):{...createProject("Общий граф"),workspace2:seed};}),[view,setView]=useState(sessionStorage.getItem("productView")??"editor"),[status,setStatus]=useState("Тестовый проект");const nav=<nav><button onClick={()=>{setView("runtime");sessionStorage.setItem("productView","runtime");}}>Открыть рабочее пространство теста</button></nav>;return <>{nav}{view==="editor"?<ToolEditor project={project} back={()=>{}} openMain={()=>{}} navigation={null}/>:<NodeWorkspace project={project} update={async workspace2=>{const response=await fetch("/fixture-save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(workspace2)});const data=await response.json();if(!response.ok){setStatus(data.error);return;}const next={...project,workspace2};localStorage.setItem("productProject",JSON.stringify(next));setProject(next);setStatus("Сохранено сервером теста");}} back={()=>{}} openMain={()=>{}} navigation={null} status={status}/>}</>;}
createRoot(document.getElementById("root")).render(<App/>);
async function run(){
 window.confirm=()=>true;window.prompt=()=>"Подбор насосов";
 if(sessionStorage.getItem("productSaved")){
  await until(()=>document.querySelector('.nt-workspace nav[aria-label="Инструменты Workspace 2"]'));
  await click("Подбор насосов",document.querySelector('.nt-workspace nav[aria-label="Инструменты Workspace 2"]'));
  await until(()=>document.querySelector('[data-parameter="designation"] input')?.value==="НУ-ПРОДУКТ");
  const p=JSON.parse(localStorage.getItem("productProject"));assert(p.workspace2.product?.version,"Общая версия продукта не закреплена");assert(p.workspace2.tools.settings.values["main.flowRate"]===10,"Состояние другого инструмента потеряно");return;
 }
 await until(()=>document.querySelector('.gn-node[data-address="settings"]'));
 await click("＋ Инструмент");
 const selector=document.querySelector('select[aria-label="Инструмент"]'),id=selector.value;
 assert(id!=="settings"&&[...selector.options].some(option=>option.value==="settings"),"Новый инструмент заменил прежний");
 assert(document.querySelector('.gn-node[data-address="settings"]')&&document.querySelector('.gn-node[data-address="'+id+'"]'),"Инструменты находятся на разных корневых полотнах");
 await click("Показать все инструменты");
 for(const key of ["settings",id]){const rect=document.querySelector('.gn-node[data-address="'+key+'"]').getBoundingClientRect(),canvas=document.querySelector(".gn-canvas").getBoundingClientRect();assert(rect.x+rect.width/2>canvas.x&&rect.x+rect.width/2<canvas.right,"Инструмент не виден на общем плане: "+key);}
 await fill(selector,id);await click("Раскрыть Instrument");
 await click("Новый параметр");await click("Создать параметр");
 await until(()=>document.querySelector('.nt-preview [data-parameter="designation"] input'));
 await fill(document.querySelector('.nt-preview [data-parameter="designation"] input'),"Тестовый ввод");
 assert(document.querySelector('.nt-preview [data-parameter="designation"] input').value==="Тестовый ввод","Каркас нового инструмента не принимает введённые значения");
 await click("Сохранить");await until(()=>document.querySelector(".gn-status")?.textContent.includes("Черновик сохранён"));
 await click("Опубликовать");await until(()=>document.querySelector(".gn-status")?.textContent.includes("Публикация обновлена"));
 await click("Открыть рабочее пространство теста");
 await until(()=>document.querySelector('.nt-workspace nav[aria-label="Инструменты Workspace 2"]'));
 assert(!buttons("Подбор насосов",document.querySelector('.nt-workspace nav[aria-label="Инструменты Workspace 2"]')).length,"Публикация неявно применила новую версию к старому проекту");
 await click("Применить актуальную версию продукта");
 await until(()=>buttons("Подбор насосов",document.querySelector('.nt-workspace nav[aria-label="Инструменты Workspace 2"]')).length);
 await click("Подбор насосов",document.querySelector('.nt-workspace nav[aria-label="Инструменты Workspace 2"]'));
 await until(()=>document.querySelector('[data-parameter="designation"] input'));
 await fill(document.querySelector('[data-parameter="designation"] input'),"НУ-ПРОДУКТ");
 await click("Сохранить значения");await until(()=>localStorage.getItem("productProject"));
 const saved=JSON.parse(localStorage.getItem("productProject"));assert(saved.workspace2.product?.version,"Сохранение потеряло общую версию");assert(saved.workspace2.tools[id].values.designation==="НУ-ПРОДУКТ","Параметр не сохранился в пространстве своего инструмента");assert(saved.workspace2.tools.settings.values["main.flowRate"]===10,"Новое сохранение изменило состояние настроек проекта");
 sessionStorage.setItem("productSaved","1");location.reload();await new Promise(()=>{});
}
run().then(()=>fetch("/done",{method:"POST",body:"ok"}),error=>fetch("/done",{method:"POST",body:String(error.stack??error)}));
`;
const built = await build({stdin:{contents:app,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,outfile:"product.js",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'}});
let finish;
const done = new Promise(resolve=>finish=resolve);
const server = createServer(async(request,response)=>{
  try {
    request.setEncoding("utf8");
    if(request.url==="/done"){let body="";for await(const chunk of request)body+=chunk;response.end("ok");finish(body);return;}
    if(request.url==="/fixture-save"){
      let body="";for await(const chunk of request)body+=chunk;const next=JSON.parse(body);
      try{await verifyWorkspace(next,persisted,"admin");persisted=next;response.setHeader("Content-Type","application/json");response.end("{}");}catch(error){response.writeHead(400,{"Content-Type":"application/json"});response.end(JSON.stringify({error:error.message}));}
      return;
    }
    if(request.url.startsWith("/api/")){let body="";for await(const chunk of request)body+=chunk;const req=new Request("http://fixture"+request.url,{method:body?"POST":"GET",headers:{"x-test-role":"admin","Content-Type":"application/json"},...(body?{body}:{})}),route=request.url.startsWith("/api/admin/")?admin:runtime,result=await route[body?"POST":"GET"](req);response.writeHead(result.status,{"Content-Type":"application/json"});response.end(await result.text());return;}
    const file=built.outputFiles.find(file=>request.url==="/"+basename(file.path));
    if(file){response.setHeader("Content-Type",file.path.endsWith(".js")?"application/javascript":"text/css");response.end(file.contents);return;}
    response.end('<!doctype html><meta charset="utf-8"><style>:root{--paper:#fff;--surface:#f4f6f8;--ink:#223;--line:#ccd;--muted:#667;--blue:#2674b9}body{margin:0}</style><link rel="stylesheet" href="/product.css"><div id="root"></div><script src="/product.js"></script>');
  } catch(error){response.writeHead(500);response.end(String(error));finish(String(error));}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const profile=await mkdtemp(join(tmpdir(),"pumpstation-product-ui-"));
const browser=spawn(process.env.CHROME_BIN??"C:/Program Files/Google/Chrome/Application/chrome.exe",["--headless","--disable-gpu","--no-first-run","--disable-extensions","--window-size=1800,1100","--user-data-dir="+profile,"http://127.0.0.1:"+server.address().port],{windowsHide:true,stdio:"ignore"});
const closed=new Promise(resolve=>browser.once("close",resolve));browser.on("error",error=>finish(String(error)));
const timeout=setTimeout(()=>finish("Product browser timeout"),90000);
try{assert.equal(await done,"ok");assert(persisted.product?.version);assert.equal(Object.values(persisted.tools).filter(tool=>tool.values.designation==="НУ-ПРОДУКТ").length,1);console.log("PASS · shared root canvas, automatic tool state/form/save scaffold, explicit product application, isolated state, server validation and reload");}
finally{clearTimeout(timeout);browser.kill();server.closeAllConnections();server.close();await closed;store.close();if(dirname(resolve(profile))===resolve(tmpdir())&&basename(profile).startsWith("pumpstation-product-ui-"))await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300});}
