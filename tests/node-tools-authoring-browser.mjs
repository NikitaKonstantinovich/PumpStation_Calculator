import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, basename, join } from "node:path";
import { build } from "esbuild";
import { engineeringStore } from "./fixtures/engineering-store.mjs";

const store = await engineeringStore();
const admin = await store.load("api/admin/node-tools/route"), runtime = await store.load("api/workspace2/route");
const { toolState, toolCommand, toolProgram, toolDefaults, verifyWorkspace } = await store.load("node-tools/storage-server");
const { parameterType } = await store.load("node-tools/compiler");
const state = await toolState(), doc = state.draft, settings = doc.diagrams.find(g => g.id === "tool.settings");
// Old published field/form contracts have no origin-visibility attribute and must keep their labels.
for (const type of doc.types.filter(type => ["field", "form"].includes(type.operation))) type.fields = type.fields.filter(field => field.key !== "showOrigin");
// An isolated, ordinary input provides a declared compatible source for the flow-mode checks.
doc.types.push(parameterType("fixture.designFlow", "Проектный расход", { key: "designFlow", name: "Проектный расход", kind: "float", meaning: "flow", unit: "м³/ч", direction: "input", initial: 15 }));
settings.nodes.push({ id: "designFlow", type: "fixture.designFlow", name: "Проектный расход", x: 350, y: 4400, values: {} }, { id: "field_designFlow", type: "ui.field", name: "Поле проектного расхода", x: 1000, y: 4400, values: {} });
settings.edges.push({ from: "project", out: "value", to: "designFlow", input: "values" }, { from: "project", out: "role", to: "designFlow", input: "role" }, { from: "base", out: "value", to: "designFlow", input: "defaults" }, { from: "designFlow", out: "binding", to: "field_designFlow", input: "binding", kind: "binding" }, { from: "field_designFlow", out: "value", to: "form", input: "child6" });
await toolCommand({ action: "publish", revision: state.revision, document: doc }, "Изолированный браузерный тест");
const program = await toolProgram(), base = await toolDefaults();
const originalValues = { stationType: "combined", "main.medium": "wastewater", "secondary.medium": "wastewater", "main.flowRate": 10, "main.head": 20, "main.workingPumpCount": 1, "main.reservePumpCount": 0, "secondary.flowRate": 5, "secondary.head": 15, "secondary.workingPumpCount": 1, "secondary.reservePumpCount": 0, designFlow: 15 };
const saved = { schema: 1, tools: { settings: { version: program.version, values: originalValues, baseVersions: base.baseVersions } } };
let persisted = saved;
const screenshot = process.env.NODE_TOOLS_SCREENSHOT;

const app = `
import React,{useState} from "react";import {createRoot} from "react-dom/client";
import {ToolEditor} from "./app/node-tools/editor";import {NodeWorkspace} from "./app/node-tools/workspace";import {createProject,parseProjectConfig} from "./app/project-config";
const seed=${JSON.stringify(saved)}, originalValues=${JSON.stringify(originalValues)};
const sleep=()=>new Promise(r=>setTimeout(r,40));
const until=async(fn)=>{for(let i=0;i<400;i++){const value=fn();if(value)return value;await sleep();}throw Error("Ожидание · "+document.body.innerText.slice(-2000));};
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const button=(text,root=document)=>[...root.querySelectorAll("button")].find(b=>b.textContent.trim()===text);
const click=async(text,root=document)=>{(await until(()=>button(text,root))).click();await sleep();};
const input=label=>[...document.querySelectorAll("input,select,textarea")].find(el=>el.getAttribute("aria-label")===label);
async function fill(el,value){if(!el)throw Error("Поле отсутствует · "+value);el.focus();const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;try{Object.getOwnPropertyDescriptor(proto,"value").set.call(el,value);}catch(e){throw Error("Неверный редактор "+el.tagName+" · "+el.getAttribute("aria-label")+" · "+value+" · "+e.message);}el.dispatchEvent(new Event(el instanceof HTMLSelectElement?"change":"input",{bubbles:true}));await sleep();el.dispatchEvent(new FocusEvent("focusout",{bubbles:true}));await sleep();}
async function chooseParameter(node,path=["settings","main"]){const select=await until(()=>input("Найти параметр"));const option=[...select.options].find(o=>{try{const a=JSON.parse(o.value);return a.node===node&&JSON.stringify(a.path)===JSON.stringify(path);}catch{return false;}});assert(option,"Параметр не найден: "+node);await fill(select,option.value);await until(()=>input("Источник значения"));}
const currentRows=key=>[...document.querySelectorAll('.nt-preview .nt-data-tree[aria-label="Действующие данные инструмента"] .nt-data-leaf')].filter(row=>row.querySelector(".nt-data-key")?.textContent===key).map(row=>row.querySelector(".nt-data-value")?.textContent);
async function chooseForm(){await click("Свойства формы");await until(()=>document.querySelector('.gn-node.selected[data-address="settings/form"]'));await sleep();return await until(()=>input("Показывать источник значения"));}
const previewInputs=()=>JSON.stringify([...document.querySelectorAll('.nt-preview [data-parameter]')].map(field=>{const control=field.querySelector("input,select,textarea");return [field.dataset.parameter,control?.value,control?.checked,control?.disabled];}));
async function valuesJSON(values){const area=await until(()=>input("Тестовые значения JSON"));area.closest("details").open=true;await fill(area,JSON.stringify(values));}
function App(){const [p,setP]=useState(()=>{const cached=localStorage.getItem("authoringProject");if(cached)return parseProjectConfig(JSON.parse(cached));return {...createProject("Проверка редактора"),workspace2:seed};}),[view,setView]=useState(sessionStorage.getItem("authoringView")??"editor"),[status,setStatus]=useState("Тестовый проект");function navigate(next){sessionStorage.setItem("authoringView",next);setView(next);}const nav=<nav><button onClick={()=>navigate("editor")}>Открыть редактор теста</button><button onClick={()=>navigate("runtime")}>Открыть Workspace 2 теста</button></nav>;return <>{nav}{view==="editor"?<ToolEditor project={p} back={()=>{}} openMain={()=>{}} navigation={null}/>:<NodeWorkspace project={p} update={async workspace2=>{const response=await fetch("/fixture-project",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(workspace2)});const data=await response.json();if(!response.ok){setStatus(data.error);return;}const next={...p,workspace2};localStorage.setItem("authoringProject",JSON.stringify(next));setP(next);setStatus("Сохранено сервером теста");}} back={()=>{}} openMain={()=>{}} navigation={null} status={status}/>}</>;}
createRoot(document.getElementById("root")).render(<App/>);
async function run(){
 const confirmations=[];window.confirm=text=>{confirmations.push(text);return true;};
 if(sessionStorage.getItem("authoringSaved")){
  await until(()=>document.querySelector(".nt-tool pre")?.textContent.includes('"medium": "water"'));
  assert(!document.querySelector('[data-parameter="main.medium"]'),"Скрытое поле вернулось после перезагрузки");
  const result=JSON.parse(document.querySelector(".nt-tool pre").textContent);assert(result.main.medium==="water"&&result.secondary.medium==="water","Потеряно постоянное значение после перезагрузки");
  const inlet=document.querySelector('[data-parameter="inletHead"]');assert(inlet&&inlet.querySelector("input").value===sessionStorage.getItem("originInletValue"),"Поле или его базовое значение потеряно после перезагрузки");assert(!inlet.querySelector(".nt-origin"),"Скрытая подпись источника вернулась после перезагрузки");
  assert(!document.querySelector(".nt-tool .nt-origin"),"Общее отключение подписей не сохранилось после перезагрузки");
  const project=JSON.parse(localStorage.getItem("authoringProject"));assert(!Object.hasOwn(project.workspace2.tools.settings.values,"main.medium"),"Старое переопределение не удалено миграцией");return;
 }
 await until(()=>input("Найти параметр"));await valuesJSON(originalValues);
 await click("Раскрыть Instrument");
 const source=await until(()=>document.querySelector('.gn-node[data-address="settings/source"]'));source.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));await sleep();
 const context=await until(()=>document.querySelector('.gn-props .nt-data-tree[aria-label="Данные выбранной ноды"]'));assert(context.textContent.includes("context")&&context.textContent.includes("main.medium")&&context.textContent.includes("wastewater"),"Входная нода не показывает фактический context");
 await fill(context.querySelector('input[type="search"]'),"main.medium");assert(context.textContent.includes("wastewater"),"Поиск дерева не сохранил значение найденного атрибута");
 await chooseParameter("inletHead",["settings"]);await click("Свойства поля");
 const inletBefore=await until(()=>document.querySelector('.nt-preview [data-parameter="inletHead"]'));
 assert(inletBefore.querySelector(".nt-origin")?.textContent==="Базовые значения","Старое определение скрыло подпись происхождения по умолчанию");
 const inletValue=inletBefore.querySelector("input").value;sessionStorage.setItem("originInletValue",inletValue);
 const originToggle=await until(()=>input("Показывать источник значения"));assert(originToggle.checked,"Новый переключатель выключен для старого поля");originToggle.click();
 await until(()=>!document.querySelector('.nt-preview [data-parameter="inletHead"] .nt-origin'));
 assert(document.querySelector('.nt-preview [data-parameter="inletHead"] input')?.value===inletValue,"Скрытие происхождения изменило поле или его значение");
 const fieldInspector=document.querySelector('.gn-props .nt-data-tree[aria-label="Данные выбранной ноды"]');await fill(fieldInspector.querySelector('input[type="search"]'),"");
 assert([...fieldInspector.querySelectorAll(".nt-data-leaf")].some(row=>row.querySelector(".nt-data-key")?.textContent==="origin"&&row.querySelector(".nt-data-value")?.textContent==="Базовые значения"),"Инспектор потерял происхождение скрытой подписи");
 input("Показывать источник значения").click();await until(()=>document.querySelector('.nt-preview [data-parameter="inletHead"] .nt-origin')?.textContent==="Базовые значения");
 input("Показывать источник значения").click();await until(()=>!document.querySelector('.nt-preview [data-parameter="inletHead"] .nt-origin'));

 const originsBefore=document.querySelectorAll(".nt-preview .nt-origin").length,valuesBefore=previewInputs();
 assert(originsBefore>1&&document.querySelector('.nt-preview [data-parameter="main.flowRate"] .nt-origin')&&document.querySelector('.nt-preview [data-parameter="secondary.flowRate"] .nt-origin'),"Не подготовлены подписи обоих контуров для общей настройки");
 const formToggle=await chooseForm();assert(formToggle.checked,"Общая настройка выключена для старого определения формы");formToggle.click();await until(()=>!document.querySelector(".nt-preview .nt-origin"));
 assert(previewInputs()===valuesBefore,"Общее отключение подписей изменило поля, значения или доступность");
 const formInspector=document.querySelector('.gn-props .nt-data-tree[aria-label="Данные выбранной ноды"]');await fill(formInspector.querySelector('input[type="search"]'),"");
 assert([...formInspector.querySelectorAll(".nt-data-leaf")].some(row=>row.querySelector(".nt-data-key")?.textContent==="origin"&&row.querySelector(".nt-data-value")?.textContent==="Базовые значения"),"Общее скрытие потеряло происхождение в инспекторе");
 input("Показывать источник значения").click();await until(()=>document.querySelectorAll(".nt-preview .nt-origin").length===originsBefore);
 assert(!document.querySelector('.nt-preview [data-parameter="inletHead"] .nt-origin'),"Общее включение изменило индивидуальную настройку скрытого поля");assert(previewInputs()===valuesBefore,"Возврат подписей изменил поля инструмента");
 await chooseParameter("medium");await fill(input("Источник значения"),"fixed");await fill(input("Постоянное значение"),"water");
 (await until(()=>input("Показывать в форме"))).click();await sleep();
 await until(()=>!document.querySelector('.nt-preview [data-parameter="main.medium"]')&&!document.querySelector('.nt-preview [data-parameter="secondary.medium"]'));
 assert(currentRows("medium").filter(v=>v==="water").length===2,"Предпросмотр не использует water в обоих активных контурах");
 const tree=await until(()=>document.querySelector(".nt-form-tree"));tree.closest("details").open=true;const hidden=[...tree.querySelectorAll("button")].find(b=>b.textContent.includes("Перекачиваемая среда")&&b.textContent.includes("Скрыто"));assert(hidden,"Скрытое поле отсутствует в дереве формы");hidden.click();await sleep();await click("Свойства параметра");
 await until(()=>{const node=document.querySelector('.gn-node.selected'),canvas=document.querySelector(".gn-canvas");if(!node||!canvas)return false;const n=node.getBoundingClientRect(),c=canvas.getBoundingClientRect();return n.x+n.width/2>c.x&&n.x+n.width/2<c.right&&n.y+n.height/2>c.y&&n.y+n.height/2<c.bottom;});
 assert(confirmations.some(text=>text.includes("Основной")&&text.includes("Второй")),"Изменение общего определения не показало оба экземпляра");
 ${screenshot ? 'await fetch("/capture",{method:"POST"});' : ""}
 await fill(input("Роль тестовой симуляции"),"base");await click("▷ Проверить");await until(()=>document.querySelector(".nt-tests"));
 assert(!document.querySelector(".nt-tests").textContent.includes("Ошибка"),"Основные проверочные примеры не прошли");await click("Закрыть",document.querySelector(".nt-tests"));
 assert(input("Данные для просмотра").value==="test","Инспектор не перешёл на серверную пробу");
 assert(document.querySelector('.nt-preview [data-parameter="stationType"] select')?.disabled,"Проба base отображает права другой роли");
 await fill(input("Роль тестовой симуляции"),"admin");
 assert(document.querySelector('.nt-preview [data-parameter="stationType"] select')?.disabled,"Изменение следующей симуляции подменило завершённую пробу");
 input("Показывать в форме").click();await until(()=>document.querySelector(".nt-preview").textContent.includes("Устаревший результат"));
 assert(!document.querySelector('.nt-preview [data-parameter="main.medium"]'),"Устаревшая проба подменена живым предпросмотром");
 await fill(input("Данные для просмотра"),"preview");
 await until(()=>document.querySelector('.nt-preview [data-parameter="main.medium"] select'));
 assert(document.querySelector('.nt-preview [data-parameter="main.medium"] select').value==="water","Восстановленное поле потеряло действующее значение");
 input("Показывать в форме").click();await sleep();
 await chooseParameter("flowRate");await fill(document.querySelector('.nt-preview [data-parameter="main.flowRate"] input'),"wrong");
 assert(document.querySelector('.nt-preview [data-parameter="main.flowRate"] input').value==="wrong","Неверный числовой черновик не создан");
 await fill(input("Источник значения"),"fixed");await fill(input("Постоянное значение"),"12,5");
 await until(()=>currentRows("flowRate").filter(v=>v==="12.5").length===2);
 assert(document.querySelector('.nt-preview [data-parameter="main.flowRate"] input').value==="12.5","Постоянный режим показывает устаревший неверный ввод");
 assert(!document.querySelector('.nt-preview [data-parameter="main.flowRate"] [role="alert"]'),"Ошибка старого черновика осталась после смены режима");
 await fill(input("Источник значения"),"computed");const expression=await until(()=>input("Выражение"));expression.closest("details").open=true;await fill(expression,"25 / 2");await click("Применить выражение");
 await until(()=>currentRows("flowRate").filter(v=>v==="12.5").length===2);
 await fill(input("Источник значения"),"source");await fill(input("Зарегистрированный источник"),"workspace2");await fill(input("Атрибут источника"),"designFlow");
 await until(()=>currentRows("flowRate").filter(v=>v==="15").length===2);
 assert(document.querySelector('.nt-preview [data-parameter="main.flowRate"] input')?.disabled,"Параметр источника допускает пользовательский ввод");
 await fill(input("Источник значения"),"user");await until(()=>currentRows("flowRate").includes("10")&&currentRows("flowRate").includes("5"));
 assert(document.querySelector('.nt-preview [data-parameter="main.flowRate"] input').value==="10"&&!document.querySelector('.nt-preview [data-parameter="main.flowRate"] [role="alert"]'),"Возврат пользовательского ввода сохранил неверный черновик");
 const publishFormToggle=await chooseForm();assert(publishFormToggle.checked,"Общая настройка формы не восстановилась");publishFormToggle.click();await until(()=>!document.querySelector(".nt-preview .nt-origin"));
 await click("Сохранить");await until(()=>document.querySelector(".gn-status")?.textContent.includes("Черновик сохранён"));
 await click("Опубликовать");await until(()=>document.querySelector(".gn-status")?.textContent.includes("Публикация обновлена"));
 await click("Открыть Workspace 2 теста");
 await until(()=>document.querySelector('[data-parameter="main.medium"] select')?.value==="wastewater");
 assert(document.querySelector('[data-parameter="secondary.medium"] select')?.value==="wastewater","Историческая версия была изменена публикацией");
 assert(document.querySelector('[data-parameter="inletHead"] .nt-origin')?.textContent==="Базовые значения","Публикация изменила подпись в исторической версии");
 assert(document.querySelectorAll(".nt-tool .nt-origin").length>1,"Общая настройка изменила прежнюю опубликованную форму");
 await click("Применить актуальную версию");await until(()=>!document.querySelector('[data-parameter="main.medium"]'));
 const result=JSON.parse(document.querySelector(".nt-tool pre").textContent);assert(result.main.medium==="water"&&result.secondary.medium==="water","Миграция не применила постоянный источник");
 const inletAfter=document.querySelector('[data-parameter="inletHead"]');assert(inletAfter&&inletAfter.querySelector("input").value===sessionStorage.getItem("originInletValue"),"Применение версии изменило базовое значение поля");assert(!inletAfter.querySelector(".nt-origin"),"Workspace 2 не применил скрытие подписи источника");
 assert(!document.querySelector(".nt-tool .nt-origin"),"Workspace 2 не применил общее отключение подписей источников");
 assert(document.querySelector(".nt-workspace").textContent.includes("прежнее введённое значение"),"Нет сообщения об обработке старого переопределения");
 await click("Сохранить значения");await until(()=>localStorage.getItem("authoringProject"));
 sessionStorage.setItem("authoringSaved","1");location.reload();await new Promise(()=>{});
}
run().then(()=>fetch("/done",{method:"POST",body:"ok"}),error=>fetch("/done",{method:"POST",body:String(error.stack??error)}));
`;

const built = await build({ stdin: { contents: app, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, outfile: "authoring.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
let finish;
const done = new Promise(resolve => finish = resolve);
const server = createServer(async (request, response) => {
  try {
    request.setEncoding("utf8");
    if (request.url === "/done") { let text = ""; for await (const chunk of request) text += chunk; response.end("ok"); finish(text); return; }
    if (request.url === "/capture" && screenshot) { await capture(); response.end("ok"); return; }
    if (request.url === "/fixture-project") {
      let text = ""; for await (const chunk of request) text += chunk;
      const next = JSON.parse(text);
      try { await verifyWorkspace(next, persisted, "admin"); persisted = next; response.setHeader("Content-Type", "application/json"); response.end("{}"); }
      catch (error) { response.writeHead(400, { "Content-Type": "application/json" }); response.end(JSON.stringify({ error: error.message })); }
      return;
    }
    if (request.url.startsWith("/api/")) {
      let text = ""; for await (const chunk of request) text += chunk;
      const req = new Request("http://fixture" + request.url, { method: text ? "POST" : "GET", headers: { "x-test-role": "admin", "Content-Type": "application/json" }, ...(text ? { body: text } : {}) });
      const route = request.url.startsWith("/api/admin/") ? admin : runtime, result = await route[text ? "POST" : "GET"](req);
      response.writeHead(result.status, { "Content-Type": "application/json" }); response.end(await result.text()); return;
    }
    const file = built.outputFiles.find(file => request.url === "/" + basename(file.path));
    if (file) { response.setHeader("Content-Type", file.path.endsWith(".js") ? "application/javascript" : "text/css"); response.end(file.contents); return; }
    response.end('<!doctype html><meta charset="utf-8"><style>:root{--paper:#fff;--surface:#f4f6f8;--ink:#223;--line:#ccd;--muted:#667;--blue:#2674b9}body{margin:0}</style><link rel="stylesheet" href="/authoring.css"><div id="root"></div><script src="/authoring.js"></script>');
  } catch (error) { response.writeHead(500); response.end(String(error)); finish(String(error)); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const profile = await mkdtemp(join(tmpdir(), "pumpstation-authoring-ui-"));
const browser = spawn(process.env.CHROME_BIN ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless", "--disable-gpu", "--no-first-run", "--disable-extensions", ...(screenshot ? ["--remote-debugging-port=0"] : []), "--window-size=1800,1100", "--user-data-dir=" + profile, "http://127.0.0.1:" + server.address().port], { windowsHide: true, stdio: "ignore" });
const closed = new Promise(resolve => browser.once("close", resolve));
browser.on("error", error => finish(String(error)));
let debugSocket;
async function capture() {
  let port;
  for (let i = 0; i < 150 && !port; i++) {
    try { port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); } catch { /* Chrome is still starting. */ }
    if (!port) await new Promise(resolve => setTimeout(resolve, 65));
  }
  assert.ok(port, "Chrome debugging port is unavailable");
  const pages = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
  debugSocket = new WebSocket(pages.find(page => page.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { debugSocket.addEventListener("open", resolve, { once: true }); debugSocket.addEventListener("error", reject, { once: true }); });
  let serial = 0;
  const pending = new Map();
  debugSocket.addEventListener("message", event => {
    const data = JSON.parse(event.data), item = pending.get(data.id);
    if (!item) return;
    pending.delete(data.id);
    if (data.error) item.reject(Error(data.error.message)); else item.resolve(data.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); debugSocket.send(JSON.stringify({ id, method, params })); });
  await call("Runtime.evaluate", { expression: 'document.activeElement?.blur()' });
  const geometry = await call("Runtime.evaluate", { expression: 'JSON.stringify({canvas:(()=>{const r=document.querySelector(".gn-canvas").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})(),world:document.querySelector(".gn-world").style.transform,nodes:[...document.querySelectorAll(".gn-node.selected,.gn-node.expanded")].map(e=>{const r=e.getBoundingClientRect(),css=getComputedStyle(e);return {id:e.dataset.address,selected:e.classList.contains("selected"),x:r.x,y:r.y,width:r.width,height:r.height,left:css.left,top:css.top,borderLeft:css.borderLeftWidth,borderTop:css.borderTopWidth,transform:e.querySelector(":scope > .station-inside")?.style.transform};})})', returnByValue: true });
  console.log("Canvas geometry · " + geometry.result.value);
  const result = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const output = resolve(screenshot);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, Buffer.from(result.data, "base64"));
  console.log("Screenshot · " + output);
  debugSocket.close();
}
const timeout = setTimeout(() => finish("Authoring browser timeout"), 110000);
try {
  assert.equal(await done, "ok");
  assert.equal(Object.hasOwn(persisted.tools.settings.values, "main.medium"), false);
  assert.equal(Object.hasOwn(persisted.tools.settings.values, "secondary.medium"), false);
  assert.equal(persisted.tools.settings.values["main.flowRate"], 10);
  assert.equal(persisted.tools.settings.values["secondary.flowRate"], 5);
  console.log("PASS · global and per-field origin-label toggles + nested contours + preserved values/inspector + legacy compatibility + publication/reload, clean water, visibility restoration, shared modes, computed expression, registered source, exact server-test snapshot, stale inspection, pinned version, explicit migration, server save and reload");
} finally {
  clearTimeout(timeout); debugSocket?.close(); browser.kill(); server.closeAllConnections(); server.close(); await closed; store.close();
  if (dirname(resolve(profile)) === resolve(tmpdir()) && basename(profile).startsWith("pumpstation-authoring-ui-")) await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 300 });
}
