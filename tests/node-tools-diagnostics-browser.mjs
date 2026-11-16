import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, basename, join } from "node:path";
import { build } from "esbuild";
import { engineeringStore } from "./fixtures/engineering-store.mjs";
import { addPumpProductFixture } from "./fixtures/pump-product.mjs";

const item = id => ({ modelId: "model-" + id, variantId: id, curveSetId: "qh-" + id, frequencyHz: 50, issues: [], provenance: { source: "isolated fixture" }, pump: {
  id, manufacturer: "Fixture", series: "F", group: "F", model: "F " + id, execution: "F " + id + " 380V", type: "vertical_multistage", power: 3, efficiency: null,
  nominalFlow: 10, minFlow: 0, maxFlow: 20, minHead: 10, maxHead: 40, price: 1000, priceCurrency: "RUB", priceKind: "net", priceSource: "fixture", source: "fixture", drawing: null,
  curve: [[0, 40], [10, 30], [20, 10]], medium: "water", selectable: true, active: id !== "inactive", inletDn: null, outletDn: null
} });
const sourceWarnings = ["Каталог fixture: происхождение требует проверки", "Каталог fixture: точный PN пока не подтверждён"];
const snapshot = { sourceId: "pump_catalog_v2", id: "a".repeat(64), schemaVersion: "diagnostics-fixture-v1", sourceStatus: "isolated fixture", status: "ready", created: "2026-11-07T00:00:00Z", items: [item("a"), item("inactive")], issues: sourceWarnings.map((message, index) => ({ code: "fixture-" + index, message })) };
const store = await engineeringStore({ catalogService: { fetch: async () => Response.json(snapshot) } });
const admin = await store.load("api/admin/node-tools/route"), runtime = await store.load("api/workspace2/route"), catalog = await store.load("api/node-catalog/route");
const { toolState, toolCommand } = await store.load("node-tools/storage-server"), { prepareDocument } = await store.load("node-tools/authoring");
const state = await toolState(), document = addPumpProductFixture(prepareDocument(state.draft));
document.types.find(type => type.parameter?.key === "medium").parameter.source = { mode: "fixed", value: "water" };
// Match the user's first checkpoint: request/catalog/filter feed the data output; the form is still empty.
for (const type of document.types.filter(type => ["pumpFixture", "pumpFixture.out"].includes(type.id))) type.fields.find(field => field.key === "value").meaning = "pumpDataset";
const graph = document.diagrams.find(graph => graph.id === "pumpFixture.graph"), keep = new Set(["source", "catalog", "request", "filter", "form", "save", "result"]);
graph.nodes = graph.nodes.filter(node => keep.has(node.id));
graph.edges = graph.edges.filter(edge => keep.has(edge.from) && keep.has(edge.to));
graph.edges.push({ from: "filter", out: "value", to: "result", input: "value" });
await toolCommand({ action: "save", revision: state.revision, document }, "Изолированный тест обновления диагностик");

const app = `
import React from "react";import {createRoot} from "react-dom/client";import {ToolEditor} from "./app/node-tools/editor";import {createProject} from "./app/project-config";
const warnings=${JSON.stringify(sourceWarnings)},sleep=()=>new Promise(resolve=>setTimeout(resolve,40));
const until=async fn=>{for(let i=0;i<300;i++){const value=fn();if(value)return value;await sleep();}throw Error("Ожидание · "+document.querySelector(".nt-preview")?.innerText.slice(-2200));};
const check=(value,message)=>{if(!value)throw Error(message);};
const alerts=()=>[...document.querySelectorAll('.nt-preview > p')].filter(element=>element.querySelector("button")?.textContent==="Перейти к ошибке").map(element=>element.firstChild?.textContent??"");
const pumpError=/Расход должен|Напор должен|Число рабочих насосов|Статический напор|Укажите подтверждённую/;
async function selectTool(id){const select=await until(()=>document.querySelector('select[aria-label="Инструмент"]'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(select,id);select.dispatchEvent(new Event("change",{bubbles:true}));await until(()=>select.value===id);await sleep();}
async function fill(key,value){const input=await until(()=>document.querySelector('.nt-preview [data-parameter="'+key+'"] input'));input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));await sleep();input.dispatchEvent(new FocusEvent("focusout",{bubbles:true}));await sleep();}
createRoot(document.getElementById("root")).render(<ToolEditor project={createProject("Обновление диагностик")} back={()=>{}} openMain={()=>{}} navigation={null}/>);
async function run(){
 await until(()=>document.querySelector(".gn-canvas"));await until(()=>document.querySelector(".nt-preview").textContent.includes("Загружен снимок"));
 await selectTool("pumpFixture");await until(()=>alerts().some(message=>message.includes("Статический напор")));
 const initial=alerts();check(initial.some(message=>message.includes("Расход должен"))&&initial.some(message=>message.includes("Напор должен"))&&initial.some(message=>message.includes("Число рабочих насосов")),"Начальные ошибки Q/H/n не воспроизведены");
 const failures=[];
 await selectTool("settings");const firstSettings=alerts();if(firstSettings.some(message=>pumpError.test(message)||warnings.includes(message)))failures.push({stage:"Settings после Pump",messages:firstSettings});
 for(const [key,value] of [["main.flowRate","10"],["main.head","30"],["main.workingPumpCount","1"],["main.reservePumpCount","1"]])await fill(key,value);
 await selectTool("pumpFixture");await until(()=>alerts().some(message=>message.includes("исключённых по активности")));
 const validPump=alerts();if(validPump.some(message=>pumpError.test(message)))failures.push({stage:"Pump после заполнения Q10/H30/n1/reserve1",messages:validPump});
 for(const warning of warnings)check(validPump.filter(message=>message===warning).length===1,"Действующее предупреждение каталога исчезло или продублировано · "+warning+" · "+JSON.stringify(validPump));
 await selectTool("settings");const finalSettings=alerts();if(finalSettings.some(message=>pumpError.test(message)||warnings.includes(message)))failures.push({stage:"Settings после валидного Pump",messages:finalSettings});
 check(!failures.length,"Устаревшие диагностики остались в DOM · "+JSON.stringify(failures));
}
run().then(()=>fetch("/done",{method:"POST",body:"ok"}),error=>fetch("/done",{method:"POST",body:String(error.stack??error)}));
`;
// Optional negative control changes only the in-memory bundle, never the application source.
const plugins = process.env.NODE_TOOLS_DIAGNOSTICS_BASELINE ? [{ name: "old-diagnostic-keys", setup(build) {
  build.onLoad({ filter: /node-tools[\\/]editor\.tsx$/ }, async args => ({ contents: (await readFile(args.path, "utf8")).replaceAll("key={diagnosticKey(i)}", "key={i.node + i.key}"), loader: "tsx", resolveDir: dirname(args.path) }));
} }] : [];
const built = await build({ stdin: { contents: app, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, outfile: "diagnostics.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, plugins });
let finish;
const done = new Promise(resolve => finish = resolve);
const server = createServer(async (request, response) => {
  try {
    request.setEncoding("utf8");
    if (request.url === "/done") { let body = ""; for await (const chunk of request) body += chunk; response.end("ok"); finish(body); return; }
    if (request.url.startsWith("/api/")) {
      let body = ""; for await (const chunk of request) body += chunk;
      const route = request.url.startsWith("/api/node-catalog") ? catalog : request.url.startsWith("/api/admin/") ? admin : runtime;
      const result = await route[body ? "POST" : "GET"](new Request("http://fixture" + request.url, { method: body ? "POST" : "GET", headers: { "x-test-role": "admin", "Content-Type": "application/json" }, ...(body ? { body } : {}) }));
      response.writeHead(result.status, { "Content-Type": "application/json" }); response.end(await result.text()); return;
    }
    const file = built.outputFiles.find(file => request.url === "/" + basename(file.path));
    if (file) { response.setHeader("Content-Type", file.path.endsWith(".js") ? "application/javascript" : "text/css"); response.end(file.contents); return; }
    response.end('<!doctype html><meta charset="utf-8"><style>:root{--paper:#fff;--surface:#f4f6f8;--ink:#223;--line:#ccd;--muted:#667;--blue:#2674b9}body{margin:0}</style><link rel="stylesheet" href="/diagnostics.css"><div id="root"></div><script src="/diagnostics.js"></script>');
  } catch (error) { response.writeHead(500); response.end(String(error)); finish(String(error)); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const profile = await mkdtemp(join(tmpdir(), "pumpstation-diagnostics-ui-"));
const browser = spawn(process.env.CHROME_BIN ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless", "--disable-gpu", "--no-first-run", "--disable-extensions", "--window-size=1800,1100", "--user-data-dir=" + profile, "http://127.0.0.1:" + server.address().port], { windowsHide: true, stdio: "ignore" });
const closed = new Promise(resolve => browser.once("close", resolve));
browser.on("error", error => finish(String(error)));
const timeout = setTimeout(() => finish("Diagnostics browser timeout"), 70000);
try { assert.equal(await done, "ok"); console.log("PASS · obsolete pump diagnostics disappear after valid Settings input and tool switching; current source warnings remain"); }
finally {
  clearTimeout(timeout); browser.kill(); server.closeAllConnections(); server.close(); await closed; store.close();
  if (dirname(resolve(profile)) === resolve(tmpdir()) && basename(profile).startsWith("pumpstation-diagnostics-ui-")) await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 300 });
}
