import assert from "node:assert/strict";
import {createServer} from "node:http";
import {spawn} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve,dirname,basename,join} from "node:path";
import {build} from "esbuild";
import {engineeringStore} from "./fixtures/engineering-store.mjs";

const store=await engineeringStore(),admin=await store.load("api/admin/node-tools/route");
const {toolState,toolCommand}=await store.load("node-tools/storage-server"),{addProductTool}=await store.load("node-tools/authoring");
const state=await toolState(),added=addProductTool(state.draft,"Второй инструмент");
await toolCommand({action:"save",revision:state.revision,document:added.document},"Тест восстановления редактора");
const app=`
import React from "react";import {createRoot} from "react-dom/client";import {ToolEditor} from "./app/node-tools/editor";import {createProject} from "./app/project-config";
const second=${JSON.stringify(added.id)},sleep=()=>new Promise(r=>setTimeout(r,35));
const until=async f=>{for(let i=0;i<300;i++){const v=f();if(v)return v;await sleep();}throw Error("Ожидание · "+document.body.innerText.slice(-1600));};
const button=text=>[...document.querySelectorAll("button")].find(b=>b.textContent.trim()===text),click=async text=>{(await until(()=>button(text))).click();await sleep();};
const check=(value,message)=>{if(!value)throw Error(message);};
const owner=()=>document.querySelector('select[aria-label="Инструмент"]').value;
async function fill(el,value){const p=HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,"value").set.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));await sleep();el.dispatchEvent(new FocusEvent("focusout",{bubbles:true}));await sleep();}
function selectRoot(id,context=false){const n=document.querySelector('.gn-node[data-address="'+id+'"]');check(n,"Корневая нода не найдена");if(context)n.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:200,clientY:200}));else n.dispatchEvent(new KeyboardEvent("keydown",{bubbles:true,key:"Enter"}));}
createRoot(document.getElementById("root")).render(<ToolEditor project={createProject("Восстановление редактора")} back={()=>{}} openMain={()=>{}} navigation={null}/>);
async function run(){
 window.confirm=()=>true;
 await until(()=>document.querySelector(".gn-canvas"));
 check(document.querySelector(".gn-error")?.textContent.includes("Источник каталога временно недоступен"),"Ошибка предварительных ресурсов не показана");
 await click("Раскрыть Instrument");await click("Новый параметр");await click("Создать параметр");
 await until(()=>document.querySelector('.nt-preview [data-parameter="designation"] input'));await fill(document.querySelector('.nt-preview [data-parameter="designation"] input'),"SETTINGS");
 const camera=document.querySelector(".gn-world").style.transform;selectRoot(second);await until(()=>owner()===second);
 check(document.querySelector(".gn-world").style.transform===camera,"Выбор корневого инструмента неожиданно переместил камеру");
 check(document.querySelector('.nt-preview .nt-form h2')?.textContent==="Второй инструмент","Предпросмотр остался у предыдущего инструмента");
 await click("Раскрыть Instrument");await click("Новый параметр");await click("Создать параметр");
 await until(()=>document.querySelector('.nt-preview [data-parameter="designation"] input'));await fill(document.querySelector('.nt-preview [data-parameter="designation"] input'),"SECOND");
 selectRoot("settings");await until(()=>owner()==="settings");check(document.querySelector('.nt-preview [data-parameter="designation"] input')?.value==="SETTINGS","Изолированное значение первого инструмента потеряно");
 const beforeContext=document.querySelector(".gn-world").style.transform;selectRoot(second,true);await until(()=>owner()===second);
 check(document.querySelector('.nt-preview [data-parameter="designation"] input')?.value==="SECOND","Контекстное меню не сменило пространство значений");
 check(document.querySelector(".gn-world").style.transform===beforeContext,"Контекстное меню неожиданно переместило камеру");
 await click("Закрыть");
 selectRoot("settings");await until(()=>owner()==="settings");
 const internal=document.querySelector('.gn-node[data-address="'+second+'/project"]');check(internal,"Внутренняя нода второго инструмента не раскрыта");internal.dispatchEvent(new KeyboardEvent("keydown",{bubbles:true,key:"Enter"}));await until(()=>owner()===second);
 check(document.querySelector('.nt-preview [data-parameter="designation"] input')?.value==="SECOND","Выбор внутреннего узла не выбрал его корневой инструмент");
}
run().then(()=>fetch("/done",{method:"POST",body:"ok"}),e=>fetch("/done",{method:"POST",body:String(e.stack??e)}));
`;
const built=await build({stdin:{contents:app,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,outfile:"recovery.js",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'}});
let finish;const done=new Promise(r=>finish=r);
const server=createServer(async(req,res)=>{try{
 req.setEncoding("utf8");if(req.url==="/done"){let text="";for await(const chunk of req)text+=chunk;res.end("ok");finish(text);return;}
 if(req.url.startsWith("/api/workspace2")){res.writeHead(503,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"Источник каталога временно недоступен"}));return;}
 if(req.url.startsWith("/api/admin/node-tools")){let text="";for await(const chunk of req)text+=chunk;const response=await admin[text?"POST":"GET"](new Request("http://fixture"+req.url,{method:text?"POST":"GET",headers:{"x-test-role":"admin","Content-Type":"application/json"},...(text?{body:text}:{})}));res.writeHead(response.status,{"Content-Type":"application/json"});res.end(await response.text());return;}
 const file=built.outputFiles.find(f=>req.url==="/"+basename(f.path));if(file){res.setHeader("Content-Type",file.path.endsWith(".js")?"application/javascript":"text/css");res.end(file.contents);return;}
 res.end('<!doctype html><meta charset="utf-8"><style>:root{--paper:#fff;--surface:#f4f6f8;--ink:#223;--line:#ccd;--muted:#667;--blue:#2674b9}body{margin:0}</style><link rel="stylesheet" href="/recovery.css"><div id="root"></div><script src="/recovery.js"></script>');
}catch(e){res.writeHead(500);res.end(String(e));finish(String(e));}});
await new Promise(r=>server.listen(0,"127.0.0.1",r));const profile=await mkdtemp(join(tmpdir(),"pumpstation-editor-recovery-"));
const browser=spawn(process.env.CHROME_BIN??"C:/Program Files/Google/Chrome/Application/chrome.exe",["--headless","--disable-gpu","--no-first-run","--disable-extensions","--window-size=1800,1100","--user-data-dir="+profile,"http://127.0.0.1:"+server.address().port],{windowsHide:true,stdio:"ignore"});
const closed=new Promise(r=>browser.once("close",r));browser.on("error",e=>finish(String(e)));const timeout=setTimeout(()=>finish("Editor recovery browser timeout"),70000);
try{assert.equal(await done,"ok");console.log("PASS · editor remains editable after resource failure, direct root/internal selection and context menu preserve isolated values without camera jumps");}
finally{clearTimeout(timeout);browser.kill();server.closeAllConnections();server.close();await closed;store.close();if(dirname(resolve(profile))===resolve(tmpdir())&&basename(profile).startsWith("pumpstation-editor-recovery-"))await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300});}
