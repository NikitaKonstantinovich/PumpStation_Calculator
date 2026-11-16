import assert from "node:assert/strict";
import {createServer} from "node:http";
import {spawn} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve,dirname,basename,join} from "node:path";
import {build} from "esbuild";
import {engineeringStore} from "./fixtures/engineering-store.mjs";
const store=await engineeringStore(),admin=await store.load("api/admin/node-tools/route"),runtime=await store.load("api/workspace2/route");
const app=`
import React,{useState} from "react";import {createRoot} from "react-dom/client";
import {ToolEditor} from "./app/node-tools/editor";import {NodeWorkspace} from "./app/node-tools/workspace";import {createProject,parseProjectConfig} from "./app/project-config";
const sleep=()=>new Promise(r=>setTimeout(r,35));
const until=async(fn)=>{for(let i=0;i<300;i++){const v=fn();if(v)return v;await sleep();}throw Error("Ожидание · "+document.body.innerText.slice(-1000));};
const button=text=>[...document.querySelectorAll("button")].find(b=>b.textContent.trim()===text);
const click=async text=>{(await until(()=>button(text))).click();await sleep();};
async function fill(el,value){if(!el)throw Error("Поле отсутствует · "+value);const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(el,value);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?"change":"input",{bubbles:true}));el.dispatchEvent(new FocusEvent("focusout",{bubbles:true}));await sleep();}
function App(){const [p,setP]=useState(()=>parseProjectConfig(JSON.parse(localStorage.getItem("project")??JSON.stringify(createProject("Workspace 2"))))),[view,setView]=useState(sessionStorage.getItem("view")??"editor");const nav=<button onClick={()=>{const v=view==="editor"?"runtime":"editor";sessionStorage.setItem("view",v);setView(v);}}>Переключить режим</button>;return <>{nav}{view==="editor"?<ToolEditor project={p} back={()=>{}} openMain={()=>{}} navigation={null}/>:<NodeWorkspace project={p} update={workspace2=>{const next={...p,workspace2};localStorage.setItem("project",JSON.stringify(next));setP(next);}} back={()=>{}} openMain={()=>{}} navigation={null} status="Сохранено в тестовом проекте"/>}</>;}
createRoot(document.getElementById("root")).render(<App/>);
async function run(){
 window.confirm=()=>true;
 if(sessionStorage.getItem("saved")){await until(()=>document.querySelector('[data-parameter="designation"] input')?.value==="НУ-2");await until(()=>document.querySelector('[data-parameter="main.flowRate"] input')?.value==="10");return;}
 await until(()=>document.querySelector(".gn-canvas"));await click("Раскрыть Instrument");
 await click("Новый параметр");await click("Создать параметр");
 await until(()=>document.querySelector('.nt-preview [data-parameter="designation"] input'));
 await click("Сохранить");await until(()=>document.querySelector(".gn-status")?.textContent.includes("Черновик сохранён"));
 await click("▷ Проверить");await until(()=>document.querySelector(".nt-tests"));if(document.querySelector(".nt-tests").textContent.includes("Ошибка"))throw Error("Проверочные примеры не пройдены");await click("Закрыть");
 await click("Опубликовать");await until(()=>document.querySelector(".gn-status")?.textContent.includes("Публикация обновлена"));
 await click("Переключить режим");
 await until(()=>document.querySelector('[data-parameter="designation"] input'));
 for(const [key,val] of [["designation","НУ-2"],["main.flowRate","10"],["main.head","20"],["main.workingPumpCount","1"],["main.reservePumpCount","0"]])await fill(document.querySelector('[data-parameter="'+key+'"] input'),val);
 await fill(document.querySelector('[data-parameter="stationType"] select'),"combined");
 await until(()=>document.querySelector('[data-parameter="secondary.flowRate"] input'));
 for(const [key,val] of [["secondary.flowRate","5"],["secondary.head","15"],["secondary.workingPumpCount","1"],["secondary.reservePumpCount","0"]])await fill(document.querySelector('[data-parameter="'+key+'"] input'),val);
 await fill(document.querySelector('[data-parameter="stationType"] select'),"utility");
 await until(()=>!document.querySelector('[data-parameter="secondary.flowRate"] input'));
 await click("Сохранить значения");await until(()=>localStorage.getItem("project").includes("НУ-2"));
 sessionStorage.setItem("saved","1");location.reload();await new Promise(()=>{});
}
run().then(()=>fetch("/done",{method:"POST",body:"ok"}),e=>fetch("/done",{method:"POST",body:String(e.stack??e)}));
`;
const built=await build({stdin:{contents:app,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,outfile:"browser.js",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'}});
let finish;const done=new Promise(r=>finish=r);
const server=createServer(async(req,res)=>{
 try{
  req.setEncoding("utf8");
  if(req.url==="/done"){let text="";for await(const chunk of req)text+=chunk;res.end("ok");finish(text);return;}
  if(req.url.startsWith("/api/")){let text="";for await(const chunk of req)text+=chunk;const request=new Request("http://fixture"+req.url,{method:text?"POST":"GET",headers:{"x-test-role":"admin","Content-Type":"application/json"},...(text?{body:text}:{})}),route=req.url.startsWith("/api/admin/")?admin:runtime;const response=await route[text?"POST":"GET"](request);res.writeHead(response.status,{"Content-Type":"application/json"});res.end(await response.text());return;}
  const file=built.outputFiles.find(f=>req.url==="/"+basename(f.path));if(file){res.setHeader("Content-Type",file.path.endsWith(".js")?"application/javascript":"text/css");res.end(file.contents);return;}
  res.end('<!doctype html><meta charset="utf-8"><style>:root{--paper:#fff;--surface:#f4f6f8;--ink:#223;--line:#ccd;--muted:#667;--blue:#2674b9}body{margin:0}</style><link rel="stylesheet" href="/browser.css"><div id="root"></div><script src="/browser.js"></script>');
 }catch(e){res.writeHead(500);res.end(String(e));finish(String(e));}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));const dir=await mkdtemp(join(tmpdir(),"pumpstation-tools-ui-"));
const browser=spawn(process.env.CHROME_BIN??"C:/Program Files/Google/Chrome/Application/chrome.exe",["--headless","--disable-gpu","--no-first-run","--disable-extensions","--window-size=1700,1000","--user-data-dir="+dir,"http://127.0.0.1:"+server.address().port],{windowsHide:true,stdio:"ignore"});
const closed=new Promise(r=>browser.once("close",r));browser.on("error",e=>finish(String(e)));const timeout=setTimeout(()=>finish("Browser timeout"),70000);
try{assert.equal(await done,"ok");console.log("PASS · node authoring, new parameter, live preview, internal tests, publication, two contours, Workspace 2 input and reload");}
finally{clearTimeout(timeout);browser.kill();server.closeAllConnections();server.close();await closed;store.close();if(dirname(resolve(dir))===resolve(tmpdir())&&basename(dir).startsWith("pumpstation-tools-ui-"))await rm(dir,{recursive:true,force:true,maxRetries:8,retryDelay:300});}
