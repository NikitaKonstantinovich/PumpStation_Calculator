import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { build } from "esbuild";

const app = `
import React,{useState} from "react";import {createRoot} from "react-dom/client";import {Canvas} from "./app/engineering/canvas";import "./app/engineering/editor.css";
const f=(key,direction,kind="float")=>({key,name:key,kind,meaning:"flow",unit:"м³/ч",direction});
const t=(id,fields)=>({id,name:id,category:"test",description:"",fields,formulas:{}});
const initial={schema:1,types:[t("source",[f("value","output")]),t("receiver",[f("value","input")]),t("bad",[f("value","input","int")])],diagrams:[{id:"station",name:"Station",groups:{},nodes:[["source","source",0,0],["secondSource","source",0,190],["first","receiver",400,0],["second","receiver",400,190],["bad","bad",400,380],["spare","receiver",400,570]].map(([id,type,x,y])=>({id,type,name:id,x,y,values:{}})),edges:[{from:"source",out:"value",to:"first",input:"value"},{from:"secondSource",out:"value",to:"spare",input:"value"}]}]};
window.confirm=()=>true;
function App(){const[doc,setDoc]=useState(initial),[history,setHistory]=useState([]),[active,setActive]=useState({graph:"station",path:[],node:"source"});function change(next){setHistory(h=>[...h,doc]);setDoc({...doc,diagrams:[next]});}return <div className="gn-editor"><button id="undo" onClick={()=>{if(history.length){setDoc(history.at(-1));setHistory(history.slice(0,-1));}}}>Undo</button><pre id="result">{JSON.stringify(doc.diagrams[0].edges)}</pre><Canvas doc={doc} active={active} focus={null} storageKey="canvas-browser" eligible={null} select={setActive} context={()=>{}} move={(g,id,x,y)=>change({...g,nodes:g.nodes.map(n=>n.id===id?{...n,x,y}:n)})} overview={()=>{}} unlink={(g,e)=>change({...g,edges:g.edges.filter(x=>x!==e)})} connect={(g,e)=>{const old=g.edges.find(x=>x.to===e.to&&x.input===e.input);if(old&&!window.confirm("Заменить источник?"))return;change({...g,edges:[...g.edges.filter(x=>x.to!==e.to||x.input!==e.input),e]});}} inspect={(at,f)=>at.node+" · "+f.kind+" · "+f.unit+" · 10"}/></div>;}
createRoot(document.getElementById("root")).render(<App/>);
`;
const built = await build({ stdin: { contents: app, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, outfile: "canvas.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
const server = createServer((req, res) => {
  const file = built.outputFiles.find(f => req.url === "/" + basename(f.path));
  if (file) { res.setHeader("Content-Type", file.path.endsWith(".js") ? "application/javascript" : "text/css"); res.end(file.contents); return; }
  res.end('<!doctype html><meta charset="utf-8"><style>:root{--paper:#fff;--surface:#f4f6f8;--ink:#223;--line:#ccd;--muted:#667;--blue:#2674b9}body{margin:0}.gn-editor>#result{font-size:9px;max-height:30px}.gn-canvas{min-height:650px}</style><link rel="stylesheet" href="/canvas.css"><div id="root"></div><script src="/canvas.js"></script>');
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const dir = await mkdtemp(join(tmpdir(), "pumpstation-canvas-ui-"));
const browser = spawn(process.env.CHROME_BIN ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless", "--disable-gpu", "--no-first-run", "--disable-extensions", "--remote-debugging-port=0", "--window-size=1400,1100", "--user-data-dir=" + dir, "http://127.0.0.1:" + server.address().port], { windowsHide: true, stdio: "ignore" });
const closed = new Promise(r => browser.once("close", r));
const pause = () => new Promise(r => setTimeout(r, 65));
async function until(fn) { for (let i=0;i<180;i++) { const value=await fn(); if(value)return value; await pause(); } throw Error("Browser wait timed out"); }
let ws;
try {
  const port = await until(async () => { try { return Number((await readFile(join(dir, "DevToolsActivePort"), "utf8")).split("\n")[0]); } catch { return null; } });
  const page = await until(async () => (await (await fetch("http://127.0.0.1:"+port+"/json/list")).json()).find(p => p.type === "page"));
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r,j) => { ws.addEventListener("open",r,{once:true});ws.addEventListener("error",j,{once:true}); });
  let serial=0;const pending=new Map();
  ws.addEventListener("message",event=>{const data=JSON.parse(event.data);if(data.id){const item=pending.get(data.id);pending.delete(data.id);if(data.error)item.reject(Error(data.error.message));else item.resolve(data.result);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+" · "+r.exceptionDetails.exception?.description);return r.result.value;};
  const point=async selector=>{const value=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);assert.ok(value,"Missing "+selector);return value;};
  const mouse=async(type,p,extra={})=>{await call("Input.dispatchMouseEvent",{type,...p,...extra});await pause();};
  const start=async node=>{const p=await point(`[data-node="${node}"] [data-port-direction="output"] i`);await mouse("mouseMoved",p);await mouse("mousePressed",p,{button:"left",buttons:1,clickCount:1});};
  const hover=async node=>{const p=await point(`[data-node="${node}"] [data-port-direction="input"] i`);await mouse("mouseMoved",p,{buttons:1});return p;};
  const drop=async node=>{const p=await hover(node);await mouse("mouseReleased",p,{button:"left",buttons:0,clickCount:1});};
  const edges=()=>evaluate('JSON.parse(document.querySelector("#result").textContent)');
  await until(()=>evaluate('!!document.querySelector(".gn-node")'));
  assert.equal(await evaluate('!!document.querySelector(\'[data-node="second"] .gn-in\')'),false,"Unused input starts hidden");
  await start("source");
  assert.equal(await evaluate('!!document.querySelector(".gn-wire-preview")'),true);
  assert.equal(await evaluate('!!document.querySelector(\'[data-node="second"] .gn-port-compatible\')'),true);
  await drop("second");assert.equal((await edges()).length,3,"Output can fan out to a hidden input");
  await start("source");await hover("bad");
  assert.match(await evaluate('document.querySelector(".gn-connection-hint").textContent'),/ожидается int, передаётся float/);
  await drop("bad");assert.equal((await edges()).length,3,"Incompatible drop must not mutate the graph");
  await start("source");await hover("second");
  await call("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});await pause();
  const p=await point('[data-node="second"] [data-port-direction="input"] i');await mouse("mouseReleased",p,{button:"left",buttons:0,clickCount:1});
  assert.equal(await evaluate('!!document.querySelector(".gn-wire-preview")'),false);assert.equal((await edges()).length,3);
  await start("secondSource");await drop("first");assert.equal((await edges()).find(e=>e.to==="first").from,"secondSource","Occupied input replaces exactly one edge");
  await evaluate('document.querySelector("#undo").click()');await pause();assert.equal((await edges()).find(e=>e.to==="first").from,"source");
  const wire=await evaluate('(()=>{const e=[...document.querySelectorAll(".gn-hit")].find(e=>e.textContent.includes("source → second"));const p=e.getPointAtLength(e.getTotalLength()/2),m=e.getScreenCTM();return {x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f};})()');
  await mouse("mouseMoved",wire);await mouse("mousePressed",wire,{button:"right",buttons:2,clickCount:1});await mouse("mouseReleased",wire,{button:"right",buttons:0,clickCount:1});
  assert.equal((await edges()).length,2,"Right click unlinks a wire");assert.equal(await evaluate('!!document.querySelector(\'[data-node="second"] .gn-in\')'),false,"Last unused input hides again");
  await evaluate('document.querySelector("#undo").click()');await pause();assert.equal((await edges()).length,3,"Undo restores the removed wire");
  console.log("PASS · native pointer drag, hidden inputs, fan-out, type mismatch, replacement, Escape, unlink and undo");
} finally {
  ws?.close();browser.kill();server.closeAllConnections();server.close();await closed;
  if(dirname(resolve(dir))===resolve(tmpdir())&&basename(dir).startsWith("pumpstation-canvas-ui-"))await rm(dir,{recursive:true,force:true,maxRetries:8,retryDelay:300});
}
