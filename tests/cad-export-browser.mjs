// Run with node tests/cad-export-browser.mjs. CHROME_BIN selects a Chromium executable.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { build } from "esbuild";

const page = `
import React from "react";
import {createRoot} from "react-dom/client";
import {CadProvider} from "./app/cad-build-state";
import {CadExportMenu,CadWarnings} from "./app/cad-export-menu";
const root=createRoot(document.querySelector("main"));
const part=(id,x,missing)=>({id,name:id,kind:"equipment",position:[x,0,0],rotation:[0,0,0],parameters:{},hidden:false,
  cadSource:missing?undefined:{hash:"a".repeat(64),path:"Equipment/test.step"}});
let picked;
function render(x) {
  const project={project:{id:"browser-test",name:"test",updatedAt:"2026-11-01"},entities:{"station-model":{editor:{assembly:{
    version:1,sourceFingerprint:"geometry",components:[part("visible",x,false),part("missing",30,true)]}}}}};
  root.render(<CadProvider project={project} enabled><CadExportMenu/><CadWarnings contains={()=>true} onSelect={id=>{picked=id}}/></CadProvider>);
}
const button=name=>[...document.querySelectorAll("button")].find(b=>b.textContent.includes(name));
const wait=async test=>{const end=performance.now()+8000;while(!test()){if(performance.now()>end)throw Error(document.body.innerText);await new Promise(r=>setTimeout(r,25));}};
async function check(){
  render(0);
  await wait(()=>button("Собрать в SOLIDWORKS")&&!button("Собрать в SOLIDWORKS").disabled);
  const save=()=>button("Сохранить 3D");
  if(!sessionStorage.getItem("built")){
    if(!save().disabled)throw Error("save available before build");
    button("Собрать в SOLIDWORKS").click();
    await wait(()=>document.body.innerText.includes("Тестовая сборка выполняется"));
    if(!save().disabled||!button("Идёт сборка в SOLIDWORKS").disabled)throw Error("duplicate build allowed");
    render(100);
    await wait(()=>document.body.innerText.includes("Собрано 1 из 2"));
    if(!save().disabled)throw Error("stale assembly available");
    render(0);
    await wait(()=>!save().disabled);
    sessionStorage.setItem("built","1");
    location.reload();
    return;
  }
  await wait(()=>!save().disabled && document.body.innerText.includes("Собрано 1 из 2 элементов. Не включено 1"));
  button("missing").click();
  if(picked!=="missing")throw Error("wrong selection");
  let downloaded="";
  HTMLAnchorElement.prototype.click=function(){downloaded=this.href;};
  for(const [label,fmt] of [["Проект SOLIDWORKS","solidworks"],["Сборка eDrawings","edrawings"],["Автономный eDrawings","edrawings-exe"]]){
    save().click();await wait(()=>button(label));button(label).click();
    await wait(()=>downloaded && new URL(downloaded).searchParams.get("format")===fmt);
    if(!document.querySelector('a[href*="format=report"]'))throw Error("missing report");
  }
  save().click();
  await wait(()=>["solidworks","edrawings","edrawings-exe"].every(fmt=>document.querySelector('.cad-export__options a[download][href*="format='+fmt+'&"]')));
  await fetch("/result",{method:"POST",body:"ok"});
}
check().catch(e=>fetch("/result",{method:"POST",body:String(e)}));
`;
// Intercept downloads at the anchor boundary. The separate SOLIDWORKS smoke test verifies the actual file bytes.
const { outputFiles }=await build({stdin:{contents:page,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,outdir:"out",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'}});
let finish;
const done=new Promise(resolve=>{finish=resolve;});
let job=null, builds=0, exports=0;
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");
  if(url.pathname==="/"){res.setHeader("content-type","text/html;charset=utf-8");res.end('<main></main><script src="/test.js"></script>');return;}
  if(url.pathname==="/test.js"){res.setHeader("content-type","application/javascript;charset=utf-8");res.end(outputFiles.find(f=>f.path.endsWith(".js")).contents);return;}
  const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks).toString();
  if(url.pathname==="/result"){res.end();finish(body);return;}
  if(!url.pathname.startsWith("/api/cad-export")){res.writeHead(404).end();return;}
  if(req.method==="POST"&&url.pathname.endsWith("/export")){
    exports++; job.artifacts[url.searchParams.get("format")]="ready";
  }else if(req.method==="POST"){
    builds++;const {snapshotKey,manifest}=JSON.parse(body);
    job={id:"11111111-1111-1111-1111-111111111111",projectId:manifest.projectId,snapshotKey,status:"building",stage:"Тестовая сборка выполняется",
      artifacts:{},warnings:[],total:2,completed:0,omissions:[],createdAt:new Date().toISOString()};
    setTimeout(()=>Object.assign(job,{status:"partial",stage:"Сборка готова с предупреждениями",completed:1,
      omissions:[{id:"instance-2",componentId:"missing",name:"missing",code:"source_missing",reason:"Нет модели",remedy:"Привязать CAD"}]}),600);
  }
  res.setHeader("content-type","application/json");res.end(JSON.stringify({job}));
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const dir=await mkdtemp(join(tmpdir(),"pumpstation-cad-ui-"));
const browser=spawn(process.env.CHROME_BIN||"C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless","--disable-gpu","--no-first-run","--disable-extensions","--user-data-dir="+dir,"http://127.0.0.1:"+server.address().port],{windowsHide:true,stdio:"ignore"});
const closed=new Promise(resolve=>browser.once("close",resolve));
browser.on("error",e=>finish(String(e)));
const timer=setTimeout(()=>finish("Browser test timed out"),30000);
try { assert.equal(await done,"ok");assert.equal(builds,1);assert.equal(exports,3);console.log("PASS browser: disabled, queued, stale, restored partial, selection, three saves from one build"); }
finally {
  clearTimeout(timer);
  browser.kill();
  server.closeAllConnections();
  server.close();
  await closed;
  if (dirname(resolve(dir)) === resolve(tmpdir()) && basename(dir).startsWith("pumpstation-cad-ui-")) {
    await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:300});
  }
}
