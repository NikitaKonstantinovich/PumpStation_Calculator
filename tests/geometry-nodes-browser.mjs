import assert from "node:assert/strict";
import {createServer} from "node:http";
import {spawn} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve,dirname,basename,join} from "node:path";
import {build} from "esbuild";
import {engineeringStore} from "./fixtures/engineering-store.mjs";

const store=await engineeringStore();
const app=`
import React from "react";
import {createRoot} from "react-dom/client";
import {EngineeringEditor} from "./app/engineering/editor";
import {createProject} from "./app/project-config";
import {PumpNozzleFields} from "./app/pump-nozzle-fields";
import {setBrowserPublication} from "./app/engineering/runtime";
import {loadProgram} from "./app/engineering/client";
const station=createProject("Проверка DN");
const circuit=station.entities["system-input"];circuit.selectedPumpId="979";
const screen=createRoot(document.getElementById("dn-screen"));
async function showDn(value){
  setBrowserPublication(await loadProgram());
  screen.render(<PumpNozzleFields entity={station.entities["station-dn"]} input={circuit} title="Основной контур"/>);
  await until(()=>document.querySelector("#dn-screen select[aria-label^='Напорный патрубок · DN']")?.value===String(value));
}
createRoot(document.getElementById("root")).render(<EngineeringEditor project={createProject("Тест")} pumps={[]} back={()=>{}}/>);
const ticks=()=>new Promise(r=>setTimeout(r,25));
const until=async(fn)=>{for(let i=0;i<260;i++){const hit=fn();if(hit)return hit;await ticks();}throw Error("Ожидание: "+document.body.innerText.slice(-850));};
const button=(text,root=document)=>Array.from(root.querySelectorAll("button")).find(b=>b.textContent.trim()===text);
const click=async(text,root=document)=>{(await until(()=>button(text,root))).click();await ticks();};
const field=(label,scope)=>Array.from(scope.querySelectorAll("label")).find(l=>l.childNodes[0].textContent.trim()===label)?.querySelector("input,select,textarea");
async function fill(el,value){
  if(!el)throw Error("Не найдено поле для "+value);
  const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,"value").set.call(el,value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement?"change":"input",{bubbles:true}));
  el.dispatchEvent(new FocusEvent("focusout",{bubbles:true}));await ticks();
}
const byName=name=>[...document.querySelectorAll(".gn-node")].find(n=>n.getAttribute("aria-label")===name);
const opts=async()=>{await fill(document.querySelector('[aria-label="Схема инструмента"]'),"lab");};
const context=async name=>{const n=await until(()=>byName(name));n.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:80,clientY:100}));await click("Передать атрибут…",await until(()=>document.querySelector(".gn-menu")));};
async function send(source,field,target,input){
  await context(source);
  let tray=document.querySelector(".gn-transfer");
  const item=await until(()=>[...tray.querySelectorAll("button")].find(b=>b.textContent.startsWith(field)));item.click();await ticks();
  await click(target,tray);
  const receiver=await until(()=>[...tray.querySelectorAll("button")].find(b=>b.textContent.startsWith(input)));receiver.click();await ticks();
}
async function newType(category,name,fields){
  await click("＋ Библиотека");await click("Создать тип "+category);
  const d=await until(()=>document.querySelector(".gn-dialog"));
  await fill(field("Название",d),name);
  for(const [key,title,meaning,unit,direction,initial,formula] of fields){
    await click("+ Атрибут",d);const f=[...d.querySelectorAll("fieldset")].at(-1);
    await fill(field("Стабильный ключ",f),key);await fill(field("Имя атрибута",f),title);await fill(field("Инженерный смысл",f),meaning);
    if(unit)await fill(field("Единица",f),unit);await fill(field("Направление",f),direction);
    if(initial)await fill(field("По умолчанию (JSON)",f),initial);
    if(formula)await fill(f.querySelector("textarea[placeholder]"),formula);
  }
  await click("Применить определение",d);await until(()=>byName(name));
}
async function run(){
  await until(()=>document.querySelector(".gn-canvas"));await opts();
  if(sessionStorage.getItem("saved")){
    if(!byName("Тестовая деталь")||!byName("Тестовый инструмент"))throw Error("Узлы потеряны после обновления");
    window.confirm=()=>true;
    await showDn(65);
    await fill(document.querySelector('[aria-label="Схема инструмента"]'),"resolvePort");
    byName("DN патрубка").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));await ticks();
    await click("Изменить определение типа");
    const form=document.querySelector(".gn-dialog");
    await fill(form.querySelector("textarea[placeholder]"),"200");await click("Применить определение",form);
    await click("▷ Запуск");await fill(document.querySelector(".gn-dialog textarea"),JSON.stringify({catalog:{dn:65,connection:"flanged"},override:null}));
    await click("Выполнить");await until(()=>document.querySelector(".gn-status"));
    await showDn(65);
    await click("Опубликовать");await click("Подтвердить публикацию");await until(()=>document.querySelector(".gn-status")?.textContent.includes("Активная версия"));
    await showDn(200);
    await click("Версии");const version=await until(()=>[...document.querySelectorAll(".gn-dialog p")].find(p=>p.textContent.includes("engineering-v1")));
    await click("Восстановить",version);await until(()=>!document.querySelector(".gn-dialog"));await showDn(65);
    return;
  }
  window.confirm=()=>true;
  await newType("комплектующего","Тестовая деталь",[["mass","Масса","mass","кг","output","2.5"],["secret","Прочее","number","","output","0"]]);
  const src=byName("Тестовая деталь");if(src.querySelector(".gn-out"))throw Error("Виден неподключённый атрибут");
  await newType("инструмента","Тестовый инструмент",[["mass","Масса","mass","кг","input"],["count","Количество","count","шт","input","4"],["total","Итого","mass","кг","output","","mass * count"]]);
  await send("Тестовая деталь","Масса","Тестовый инструмент","Масса");
  window.confirm=()=>false;
  await send("Тестовая деталь","Масса","Расчёт массы","Масса одной детали");
  if(![...document.querySelectorAll(".gn-hit")].some(path=>path.textContent==="Деталь → Расчёт массы"))throw Error("Отмена замены изменила связь");
  window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}));await ticks();window.confirm=()=>true;
  await send("Тестовая деталь","Масса","Расчёт массы","Масса одной детали");
  if(src.querySelectorAll(".gn-out").length!==1||src.textContent.includes("Прочее"))throw Error("Ошибка видимости портов при разветвлении");
  async function removeWire(to){
    const title="Тестовая деталь → "+to;
    const hit=await until(()=>[...document.querySelectorAll(".gn-hit")].find(path=>path.textContent===title));
    hit.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true}));await ticks();
  }
  await removeWire("Расчёт массы");if(src.querySelectorAll(".gn-out").length!==1)throw Error("Порт пропал при оставшейся связи");
  await removeWire("Тестовый инструмент");if(src.querySelector(".gn-out"))throw Error("Остался порт без связей");
  await send("Тестовая деталь","Масса","Тестовый инструмент","Масса");
  await send("Тестовая деталь","Масса","Расчёт массы","Масса одной детали");
  await send("Тестовый инструмент","Итого","Масса партии","Общая масса");
  await click("Сохранить");await until(()=>document.body.textContent.includes("Черновик сохранён"));
  await click("▷ Запуск");await click("Выполнить");await until(()=>document.querySelector(".gn-status")?.textContent.includes("10"));
  await context("Тестовая деталь");window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}));await ticks();
  if(document.querySelector(".gn-transfer"))throw Error("Esc не завершил команду");
  await click("Опубликовать");await click("Подтвердить публикацию");await until(()=>document.querySelector(".gn-status")?.textContent.includes("Активная версия"));
  sessionStorage.setItem("saved","1");location.reload();await new Promise(()=>{});
}
run().then(()=>fetch("/done",{method:"POST",body:"ok"}),err=>fetch("/done",{method:"POST",body:String(err.stack??err)}));
`;
const built=await build({stdin:{contents:app,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,outfile:"browser.js",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'}});
let finish;const done=new Promise(r=>finish=r);
const server=createServer(async(req,res)=>{
  try{
    if(req.url==="/done"){let body="";for await(const chunk of req)body+=chunk;finish(body);res.end();return;}
    if(req.url.startsWith("/api/engineering/runtime")){
      const response=await store.effective.GET(new Request("http://fixture"+req.url,{headers:{"x-test-role":"base"}}));
      res.writeHead(response.status,{"Content-Type":"application/json"});res.end(await response.text());return;
    }
    if(req.url.startsWith("/api/admin/geometry-nodes")){let text="";for await(const chunk of req)text+=chunk;
      const r=await store.call(text?JSON.parse(text):null);res.writeHead(r.status,{"Content-Type":"application/json"});res.end(JSON.stringify(r.body));return;}
    const file=built.outputFiles.find(f=>req.url==="/"+basename(f.path));
    if(file){res.setHeader("Content-Type",file.path.endsWith(".js")?"application/javascript":"text/css");res.end(file.contents);return;}
    res.setHeader("Content-Type","text/html; charset=utf-8");res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/browser.css"><div id="root"></div><div id="dn-screen"></div><script src="/browser.js"></script>');
  }catch(err){res.writeHead(500);res.end(String(err));finish(String(err));}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const dir=await mkdtemp(join(tmpdir(),"pumpstation-nodes-ui-"));
const browser=spawn(process.env.CHROME_BIN??"C:/Program Files/Google/Chrome/Application/chrome.exe",["--headless","--disable-gpu","--no-first-run","--disable-extensions","--user-data-dir="+dir,"http://127.0.0.1:"+server.address().port],{windowsHide:true,stdio:"ignore"});
const closed=new Promise(r=>browser.once("close",r));browser.on("error",e=>finish(String(e)));
const timeout=setTimeout(()=>finish("Browser timeout"),60000);
try{assert.equal(await done,"ok");console.log("PASS · author equipment and tool, hidden ports, fan-out, Esc, 10 kg, save/publish/reload, regular DN field 65 → 200 → 65");}
finally{clearTimeout(timeout);browser.kill();server.closeAllConnections();server.close();await closed;store.close();
  if(dirname(resolve(dir))===resolve(tmpdir())&&basename(dir).startsWith("pumpstation-nodes-ui-"))await rm(dir,{recursive:true,force:true,maxRetries:8,retryDelay:300});}
