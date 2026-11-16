import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, basename, join } from "node:path";
import { build } from "esbuild";
import { engineeringStore } from "./fixtures/engineering-store.mjs";
import { addPumpProductFixture } from "./fixtures/pump-product.mjs";

const item = (id, manufacturer, series, type) => ({ modelId: "model-" + id, variantId: id, curveSetId: "qh-" + id, frequencyHz: 50, issues: [], provenance: { source: "isolated fixture" }, pump: {
  id, manufacturer, series, group: series, model: id, execution: id + " 380V", type, power: 3, efficiency: null, nominalFlow: 10, minFlow: 0, maxFlow: 20, minHead: 10, maxHead: 40,
  price: 1000, priceCurrency: "RUB", priceKind: "net", priceSource: "fixture", source: "fixture", drawing: null, curve: [[0, 40], [10, 30], [20, 10]], medium: "water", selectable: true, active: true, inletDn: null, outletDn: null
} });
const snapshot = { sourceId: "pump_catalog_v2", id: "a".repeat(64), schemaVersion: "cascade-fixture-v1", sourceStatus: "isolated test", status: "ready", created: "2026-11-07T00:00:00Z", items: [
  item("av1", "A", "AV1", "vertical_multistage"), item("av2", "A", "AV2", "vertical_multistage"), item("bv1", "B", "BV1", "vertical_multistage"), item("ai1", "A", "AI1", "inline"), item("ci1", "C", "CI1", "inline")
], issues: [] };
const store = await engineeringStore({ catalogService: { fetch: async () => Response.json(snapshot) } });
const admin = await store.load("api/admin/node-tools/route"), runtime = await store.load("api/workspace2/route"), catalog = await store.load("api/node-catalog/route");
const storage = await store.load("node-tools/storage-server"), { prepareDocument } = await store.load("node-tools/authoring"), { parameterType } = await store.load("node-tools/compiler"), { migrateProduct } = await store.load("node-tools/product-state");
const state = await storage.toolState(), old = await storage.toolProgram(), base = await storage.toolDefaults(), document = addPumpProductFixture(prepareDocument(state.draft));
document.types.find(type => type.parameter?.key === "medium").parameter.source = { mode: "fixed", value: "water" };
const root = document.diagrams.find(graph => graph.id === document.product.root), settings = document.diagrams.find(graph => graph.id === "tool.settings"), pump = document.diagrams.find(graph => graph.id === "pumpFixture.graph");
const node = (id, type, values = {}) => ({ id, type, name: id, x: 0, y: 0, values });
const wire = (graph, from, out, to, input, kind = "data") => graph.edges.push({ from, out, to, input, kind });
const viewPort = (key, direction) => ({ key, name: key, kind: "object", meaning: "view", unit: "", direction });
const main = settings.nodes.find(node => node.id === "main"), contourType = document.types.find(type => type.id === main.type), contour = document.diagrams.find(graph => graph.id === contourType.instrument);
contourType.fields.push(viewPort("fieldsUi", "output")); document.types.find(type => type.id === contour.nodes.find(node => node.id === "result").type).fields.push(viewPort("fieldsUi", "input"));
wire(contour, "layout", "value", "result", "fieldsUi");
document.types.find(type => type.id === root.nodes.find(node => node.id === "settings").type).fields.push(viewPort("mainInputsUi", "output"));
document.types.find(type => type.id === settings.nodes.find(node => node.id === "result").type).fields.push(viewPort("mainInputsUi", "input"));
wire(settings, "main", "fieldsUi", "result", "mainInputsUi");
document.types.find(type => type.id === "pumpFixture").fields.push(viewPort("mainInputsUi", "input")); document.types.find(type => type.id === "pumpFixture.in").fields.push(viewPort("mainInputsUi", "output"));
wire(root, "settings", "mainInputsUi", "pumpFixture", "mainInputsUi");
pump.nodes.push(node("summary", "ui.condition", { enabled: false }), node("filters", "ui.grid", { columns: 3 }));
wire(pump, "source", "mainInputsUi", "summary", "child");
pump.edges = pump.edges.filter(edge => !(edge.to === "form" && /^child/.test(edge.input)));
wire(pump, "summary", "value", "form", "child0"); wire(pump, "filters", "value", "form", "child1"); wire(pump, "table", "value", "form", "child2"); wire(pump, "card", "value", "form", "child6");
const filterKeys = ["filterType", "filterManufacturer", "filterSeries"], attributes = ["type", "manufacturer", "series"];
for (const [index, key] of filterKeys.entries()) {
  const type = parameterType("cascade." + key, key, { key, name: key, kind: "string", meaning: "text", unit: "", direction: "input", required: false }, "input");
  document.types.push(type); pump.nodes.push(node(key, type.id), node(key + "Field", "ui.field", { visible: false }), node(key + "Options", "pump.options", { attribute: attributes[index] }), node(key + "Select", "ui.select", { label: key, showOrigin: false }));
  wire(pump, "state", "value", key, "values"); wire(pump, "state", "role", key, "role"); wire(pump, key, "binding", key + "Field", "binding", "binding"); wire(pump, key + "Field", "value", "form", "child" + (index + 3));
  wire(pump, "catalog", "value", key + "Options", "catalog"); wire(pump, key + "Options", "options", key + "Select", "options"); wire(pump, key, "binding", key + "Select", "binding", "binding");
  wire(pump, key, "value", "filter", attributes[index]); wire(pump, key + "Select", "value", "filters", "child" + index);
}
wire(pump, "filterType", "value", "filterManufacturerOptions", "type"); wire(pump, "filterType", "value", "filterSeriesOptions", "type"); wire(pump, "filterManufacturer", "value", "filterSeriesOptions", "manufacturer");
wire(pump, "filterManufacturer", "binding", "filterTypeSelect", "clear0", "binding"); wire(pump, "filterSeries", "binding", "filterTypeSelect", "clear1", "binding"); wire(pump, "filterSeries", "binding", "filterManufacturerSelect", "clear0", "binding");
const settingsValues = { stationType: "utility", "main.flowRate": 10, "main.head": 30, "main.workingPumpCount": 1, "main.reservePumpCount": 1 };
await storage.toolCommand({ action: "publish", revision: state.revision, document, contexts: { settings: settingsValues, pumpFixture: {} } }, "Изолированный тест каскадных фильтров");
const program = await storage.toolProgram(), resources = await storage.toolResources(program), previous = { schema: 1, tools: { settings: { version: old.version, baseVersions: base.baseVersions, values: settingsValues } } };
const initial = migrateProduct(program, previous, base.defaults, base.baseVersions, "admin", resources.resources, resources.sourceVersions).data;
await storage.verifyWorkspace(initial, previous, "admin");
let persisted = initial, saves = 0;

const app = `
import React,{useState} from "react";import {createRoot} from "react-dom/client";import {ToolEditor} from "./app/node-tools/editor";import {NodeWorkspace} from "./app/node-tools/workspace";import {createProject,parseProjectConfig} from "./app/project-config";
const seed=${JSON.stringify(initial)},sleep=()=>new Promise(resolve=>setTimeout(resolve,40));
const until=async fn=>{for(let i=0;i<400;i++){const result=fn();if(result)return result;await sleep();}throw Error("Ожидание · "+document.body.innerText.slice(-2600));};
const check=(value,message)=>{if(!value)throw Error(message);};
const button=(name,root=document)=>[...root.querySelectorAll("button")].find(button=>button.textContent.trim()===name),click=async(name,root=document)=>{(await until(()=>button(name,root))).click();await sleep();};
const formRoot=()=>document.querySelector(".nt-preview")??document.querySelector(".nt-workspace");
const field=key=>formRoot()?.querySelector('[data-parameter="'+key+'"] select');
const options=key=>[...(field(key)?.options??[])].map(option=>option.value).filter(Boolean).sort();
const expectOptions=(key,expected)=>check(JSON.stringify(options(key))===JSON.stringify([...expected].sort()),key+" варианты · "+JSON.stringify(options(key))+" вместо "+JSON.stringify(expected));
const choose=async(key,value)=>{const select=await until(()=>field(key));check(!select.disabled,"Фильтр заблокирован · "+key);Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(select,value);select.dispatchEvent(new Event("change",{bubbles:true}));await sleep();};
async function fill(key,value){const input=await until(()=>document.querySelector('.nt-preview [data-parameter="'+key+'"] input'));input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));await sleep();input.dispatchEvent(new FocusEvent("focusout",{bubbles:true}));await sleep();}
async function editorTool(id){const select=document.querySelector('select[aria-label="Инструмент"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(select,id);select.dispatchEvent(new Event("change",{bubbles:true}));await sleep();}
const radios=()=>[...formRoot().querySelectorAll('.nt-candidates input[type="radio"]')];
const noAuto=(retained="")=>check(radios().filter(radio=>radio.checked).every(radio=>retained&&radio.getAttribute("aria-label")?.endsWith(" · "+retained)&&formRoot().querySelector(".nt-selection-stale")),"Фильтр автоматически подтвердил насос · "+JSON.stringify(radios().filter(radio=>radio.checked).map(radio=>radio.getAttribute("aria-label"))));
const clearCheck=()=>check(field("filterManufacturer").value===""&&field("filterSeries").value==="","Изменение типа не сбросило производителя и серию");
const nav=()=>document.querySelector('nav[aria-label="Инструменты Workspace 2"]');
const data=()=>JSON.parse(localStorage.getItem("cascadeProject")).workspace2;
function App(){const [project,setProject]=useState(()=>{const cached=localStorage.getItem("cascadeProject");return cached?parseProjectConfig(JSON.parse(cached)):{...createProject("Каскадные фильтры"),workspace2:seed};}),[view,setView]=useState(sessionStorage.getItem("cascadeView")??"editor"),[status,setStatus]=useState("Изолированный проект");return <><button onClick={()=>{sessionStorage.setItem("cascadeView","runtime");setView("runtime");}}>Открыть Workspace теста</button>{view==="editor"?<ToolEditor project={project} back={()=>{}} openMain={()=>{}} navigation={null}/>:<NodeWorkspace project={project} update={async workspace2=>{const response=await fetch("/fixture-save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(workspace2)}),result=await response.json();if(!response.ok){setStatus(result.error);return;}const next={...project,workspace2};localStorage.setItem("cascadeProject",JSON.stringify(next));setProject(next);setStatus("Сохранено сервером теста");}} back={()=>{}} openMain={()=>{}} navigation={null} status={status}/>}</>;}
createRoot(document.getElementById("root")).render(<App/>);
async function run(){
 window.confirm=()=>true;
 if(sessionStorage.getItem("cascadeSaved")){
  await until(nav);await click("Учебный подбор насосов",nav());await until(()=>field("filterSeries")?.value==="CI1");check(field("filterType").value==="inline"&&field("filterManufacturer").value==="C","Каскадные значения не восстановились");await until(()=>radios()[0]?.checked);check(!formRoot().querySelector(".nt-selection-stale"),"Сохранённый ручной выбор стал устаревшим");check(data().tools.settings.values["main.head"]===30,"Состояние Settings потеряно");return;
 }
 await until(()=>document.querySelector(".gn-canvas"));for(const [key,value]of [["main.flowRate","10"],["main.head","30"],["main.workingPumpCount","1"],["main.reservePumpCount","1"]])await fill(key,value);
 await editorTool("pumpFixture");await until(()=>field("filterType"));await until(()=>options("filterType").length===2);
 const summary=[...document.querySelectorAll('.nt-preview [data-parameter^="main."] input')];check(summary.length===4&&summary.every(input=>input.disabled),"Четыре исходных значения над фильтрами доступны для ввода");
 const transient=[];const observer=new MutationObserver(()=>{const text=formRoot()?.innerText??"";if(text.includes("Выбранный вариант отсутствует в текущем источнике"))transient.push(text.slice(-1500));});observer.observe(formRoot(),{subtree:true,childList:true,characterData:true});
 expectOptions("filterManufacturer",["A","B","C"]);await choose("filterType","vertical_multistage");expectOptions("filterManufacturer",["A","B"]);expectOptions("filterSeries",["AV1","AV2","BV1"]);
 await choose("filterManufacturer","A");expectOptions("filterSeries",["AV1","AV2"]);await choose("filterSeries","AV1");noAuto();await choose("filterType","vertical_multistage");check(field("filterManufacturer").value==="A"&&field("filterSeries").value==="AV1","Повторный выбор того же типа сбросил зависимые значения");await choose("filterManufacturer","B");check(field("filterSeries").value==="","Изменение производителя не сбросило серию");expectOptions("filterSeries",["BV1"]);
 await choose("filterSeries","BV1");await choose("filterType","inline");clearCheck();expectOptions("filterManufacturer",["A","C"]);expectOptions("filterSeries",["AI1","CI1"]);await choose("filterManufacturer","A");await choose("filterSeries","AI1");
 await choose("filterType","");clearCheck();expectOptions("filterManufacturer",["A","B","C"]);expectOptions("filterSeries",["AI1","AV1","AV2","BV1","CI1"]);noAuto();
 await choose("filterType","vertical_multistage");await choose("filterManufacturer","A");await choose("filterSeries","AV2");await editorTool("settings");const json=JSON.parse(document.querySelector('textarea[aria-label="Тестовые значения JSON"]').value);check(!Object.keys(json).some(key=>key.startsWith("filter")),"Фильтры попали в пространство Settings");await editorTool("pumpFixture");check(field("filterSeries").value==="AV2","Editor потерял собственное состояние Pump");observer.disconnect();check(!transient.length,"Зависимое значение очищено неатомарно · "+transient.join(" | "));
 await click("Открыть Workspace теста");await until(nav);await click("Учебный подбор насосов",nav());await until(()=>radios().length===5);noAuto();
 await choose("filterType","vertical_multistage");expectOptions("filterManufacturer",["A","B"]);await choose("filterManufacturer","A");expectOptions("filterSeries",["AV1","AV2"]);await choose("filterSeries","AV1");await until(()=>radios().length===1);noAuto();radios()[0].click();await until(()=>radios()[0]?.checked&&!formRoot().querySelector(".nt-selection-stale"));
 await click("Сохранить значения");await until(()=>localStorage.getItem("cascadeProject"));const firstProof=data().tools.pumpFixture.values.selectedPump;check(firstProof.variantId==="av1","Ручной выбор сохранил другое исполнение");await choose("filterManufacturer","A");check(field("filterSeries").value==="AV1"&&radios()[0]?.checked&&!formRoot().querySelector(".nt-selection-stale"),"Неизменившийся производитель сбросил серию или подтверждение насоса");
 await choose("filterManufacturer","B");check(field("filterSeries").value==="","Workspace не сбросил зависимую серию");expectOptions("filterSeries",["BV1"]);await until(()=>formRoot().querySelector(".nt-selection-stale"));noAuto();await click("Сохранить значения");await until(()=>data().tools.pumpFixture.values.filterManufacturer==="B");check(data().tools.pumpFixture.values.selectedPump.requestKey===firstProof.requestKey,"Сброс фильтра неявно подтвердил насос заново");
 await choose("filterSeries","BV1");await choose("filterManufacturer","");check(field("filterSeries").value==="","Все производители не очистили серию");expectOptions("filterSeries",["AV1","AV2","BV1"]);
 await choose("filterManufacturer","A");await choose("filterSeries","AV2");await choose("filterType","");clearCheck();expectOptions("filterManufacturer",["A","B","C"]);expectOptions("filterSeries",["AI1","AV1","AV2","BV1","CI1"]);noAuto("av1");
 await choose("filterType","inline");await choose("filterManufacturer","C");await choose("filterSeries","CI1");await click("Сбросить выбор");await until(()=>radios().length===1);noAuto();radios()[0].click();await until(()=>radios()[0]?.checked&&!formRoot().querySelector(".nt-selection-stale"));await click("Сохранить значения");await until(()=>data().tools.pumpFixture.values.selectedPump.variantId==="ci1");
 const saved=data();check(saved.tools.pumpFixture.values.filterType==="inline"&&saved.tools.pumpFixture.values.filterManufacturer==="C"&&saved.tools.pumpFixture.values.filterSeries==="CI1","Сохранены не все фильтры");check(!Object.keys(saved.tools.settings.values).some(key=>key.startsWith("filter")),"Серверное сохранение смешало пространства инструментов");
 await click("Настройки проекта",nav());check(document.querySelector('[data-parameter="main.head"] input')?.value==="30","Settings изменились при фильтрации");await click("Учебный подбор насосов",nav());check(field("filterSeries").value==="CI1","Workspace потерял фильтры после переключения инструмента");sessionStorage.setItem("cascadeSaved","1");location.reload();await new Promise(()=>{});
}
run().then(()=>fetch("/done",{method:"POST",body:"ok"}),error=>fetch("/done",{method:"POST",body:String(error.stack??error)}));
`;
const built = await build({ stdin: { contents: app, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, outfile: "cascade.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
let finish;
const done = new Promise(resolve => finish = resolve);
const server = createServer(async (request, response) => {
  try {
    request.setEncoding("utf8");
    if (request.url === "/done") { let body = ""; for await (const chunk of request) body += chunk; response.end("ok"); finish(body); return; }
    if (request.url === "/fixture-save") {
      let body = ""; for await (const chunk of request) body += chunk;
      const next = JSON.parse(body);
      try { await storage.verifyWorkspace(next, persisted, "admin"); persisted = next; saves++; response.setHeader("Content-Type", "application/json"); response.end("{}"); }
      catch (error) { response.writeHead(error.status ?? 400, { "Content-Type": "application/json" }); response.end(JSON.stringify({ error: error.message })); }
      return;
    }
    if (request.url.startsWith("/api/")) {
      let body = ""; for await (const chunk of request) body += chunk;
      const route = request.url.startsWith("/api/node-catalog") ? catalog : request.url.startsWith("/api/admin/") ? admin : runtime;
      const result = await route[body ? "POST" : "GET"](new Request("http://fixture" + request.url, { method: body ? "POST" : "GET", headers: { "x-test-role": "admin", "Content-Type": "application/json" }, ...(body ? { body } : {}) }));
      response.writeHead(result.status, { "Content-Type": "application/json" }); response.end(await result.text()); return;
    }
    const file = built.outputFiles.find(file => request.url === "/" + basename(file.path));
    if (file) { response.setHeader("Content-Type", file.path.endsWith(".js") ? "application/javascript" : "text/css"); response.end(file.contents); return; }
    response.end('<!doctype html><meta charset="utf-8"><style>:root{--paper:#fff;--surface:#f4f6f8;--ink:#223;--line:#ccd;--muted:#667;--blue:#2674b9}body{margin:0}</style><link rel="stylesheet" href="/cascade.css"><div id="root"></div><script src="/cascade.js"></script>');
  } catch (error) { response.writeHead(500); response.end(String(error)); finish(String(error)); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const profile = await mkdtemp(join(tmpdir(), "pumpstation-cascade-ui-"));
const browser = spawn(process.env.CHROME_BIN ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless", "--disable-gpu", "--no-first-run", "--disable-extensions", "--window-size=1800,1100", "--user-data-dir=" + profile, "http://127.0.0.1:" + server.address().port], { windowsHide: true, stdio: "ignore" });
const closed = new Promise(resolve => browser.once("close", resolve));
browser.on("error", error => finish(String(error)));
const timeout = setTimeout(() => finish("Cascade browser timeout"), 90000);
try {
  assert.equal(await done, "ok"); assert.ok(saves >= 3, "Manual choices and the retained stale proof were not verified by the server"); assert.equal(persisted.tools.pumpFixture.values.selectedPump.variantId, "ci1");
  console.log("PASS · Editor and Workspace cascade narrowing, atomic dependent clears/All, read-only summary, manual proof/staleness, isolated state, server verification and reload");
} finally {
  clearTimeout(timeout); browser.kill(); server.closeAllConnections(); server.close(); await closed; store.close();
  if (dirname(resolve(profile)) === resolve(tmpdir()) && basename(profile).startsWith("pumpstation-cascade-ui-")) await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 300 });
}
