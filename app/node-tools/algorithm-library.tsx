"use client";
import { useEffect, useState } from "react";
import { algorithmRequest, getAlgorithmHistory, versionDate, versionReason } from "./algorithm-client";
import type { Algorithm, AlgorithmVersion } from "./algorithm-schema";
import "./algorithm-library.css";

export function CreateAlgorithmDialog({algorithms,close,created}:{algorithms:Algorithm[];close:()=>void;created:(id:string)=>void}) {
  const [name,setName]=useState(""),[mode,setMode]=useState("new"),[source,setSource]=useState<{algorithmId:string;version:string}|null>(null);
  const [history,setHistory]=useState<Record<string,AlgorithmVersion[]>>({}),[expanded,setExpanded]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  return <div className="gn-shade"><section className="gn-dialog al-dialog" role="dialog" aria-modal="true" aria-labelledby="algorithm-create-title">
    <header><h2 id="algorithm-create-title">Создать алгоритм</h2><button disabled={busy} onClick={close}>Отмена</button></header>
    <label>Название продукта / алгоритма<input maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label>
    <fieldset><legend>Способ создания</legend><label><input type="radio" name="algorithm-mode" checked={mode==="new"} onChange={()=>setMode("new")}/>Новый</label><label><input type="radio" name="algorithm-mode" checked={mode==="copy"} onChange={()=>setMode("copy")}/>На основе существующего</label></fieldset>
    {mode==="copy" && <div className="al-sources">{algorithms.map(a=><section key={a.id}><label><input type="radio" name="algorithm-source" checked={source?.version===a.active} onChange={()=>setSource({algorithmId:a.id,version:a.active})}/><b>{a.name}</b> · версия {a.number} · {versionDate(a.saved)}</label><button aria-expanded={expanded===a.id} onClick={async()=>{setExpanded(expanded===a.id?"":a.id);try{setHistory(h=>({...h,[a.id]:[]}));const versions=await getAlgorithmHistory(a.id);setHistory(h=>({...h,[a.id]:versions}));}catch(e){setError((e as Error).message);}}}>Резервные версии</button>{expanded===a.id && (history[a.id]?.filter(v=>v.id!==a.active).length ? history[a.id].filter(v=>v.id!==a.active).map(v=><label key={v.id}><input type="radio" name="algorithm-source" checked={source?.version===v.id} onChange={()=>setSource({algorithmId:a.id,version:v.id})}/>Версия {v.number} · {versionDate(v.created)} · {versionReason(v.reason)}</label>) : <p>Предыдущих версий пока нет</p>)}</section>)}</div>}
    {error && <p role="alert">{error}</p>}<footer><button disabled={busy||!name.trim()||mode==="copy"&&!source} onClick={async()=>{setBusy(true);setError("");try{const result=await algorithmRequest({action:"create",name,source:mode==="copy"?source:undefined});created(result.id!);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?"Создание…":"Создать"}</button><button disabled={busy} onClick={close}>Отмена</button></footer>
  </section></div>;
}

export function AlgorithmLibrary({openEditor}:{openEditor:(id:string)=>void}) {
  const [algorithms,setAlgorithms]=useState<Algorithm[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[create,setCreate]=useState(false);
  const [history,setHistory]=useState<Record<string,AlgorithmVersion[]>>({}),[expanded,setExpanded]=useState<Record<string,boolean>>({});
  const [restore,setRestore]=useState<{algorithm:Algorithm;version:AlgorithmVersion}|null>(null);
  const refresh=async()=>{const data=await algorithmRequest();setAlgorithms(data.algorithms);return data.algorithms;};
  useEffect(()=>{let live=true;algorithmRequest().then(data=>{if(live)setAlgorithms(data.algorithms);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[]);
  async function restoreVersion(saveDraft:boolean) {
    if(!restore)return;setBusy(true);setError("");
    try {
      const data=await algorithmRequest({action:"restore",algorithmId:restore.algorithm.id,version:restore.version.id,revision:restore.algorithm.revision,saveDraft,discardDraft:!saveDraft});setAlgorithms(data.algorithms);
      const versions=await getAlgorithmHistory(restore.algorithm.id);setHistory(h=>({...h,[restore.algorithm.id]:versions}));setRestore(null);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <main className="al-library"><header><div><h1>Библиотека алгоритмов</h1><p>Независимые продукты и последние пять сохранённых версий каждого алгоритма.</p></div><button onClick={()=>setCreate(true)}>Создать алгоритм</button></header>
    {error && <p role="alert">{error} <button disabled={busy} onClick={()=>void refresh().then(()=>{setError("");setRestore(null);}).catch(e=>setError(e.message))}>Обновить список</button></p>}{loading && <p>Загрузка библиотеки…</p>}
    <div className="al-table-wrap"><table className="al-table"><thead><tr><th>История</th><th>Продукт / алгоритм</th><th>Версия</th><th>Последнее сохранение</th><th>Статус</th><th>Действия</th></tr></thead><tbody>{algorithms.map(a=><AlgorithmRows key={a.id} algorithm={a} expanded={!!expanded[a.id]} versions={history[a.id]} busy={busy} expand={async()=>{setExpanded(s=>({...s,[a.id]:!s[a.id]}));try{const versions=await getAlgorithmHistory(a.id);setHistory(h=>({...h,[a.id]:versions}));}catch(e){setError((e as Error).message);}}} toggle={async()=>{setBusy(true);try{setAlgorithms((await algorithmRequest({action:"connect",algorithmId:a.id,revision:a.revision,connected:!a.connected})).algorithms);setError("");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}} open={()=>openEditor(a.id)} restore={v=>setRestore({algorithm:a,version:v})}/>)}</tbody></table></div>
    {create && <CreateAlgorithmDialog algorithms={algorithms} close={()=>setCreate(false)} created={openEditor}/>}
    {restore && <div className="gn-shade"><section className="gn-dialog" role="dialog" aria-modal="true" aria-label="Восстановление алгоритма"><h2>Восстановить «{restore.algorithm.name}»</h2><p>Версия {restore.version.number} будет записана как новая актуальная версия. Существующие проекты сохранят закреплённые версии.</p>{restore.algorithm.hasDraft && <p>У алгоритма есть изменённый черновик. Сохраните его отдельной версией или разрешите замену.</p>}{restore.algorithm.hasDraft && <button disabled={busy} onClick={()=>void restoreVersion(true)}>Сохранить черновик как версию и восстановить</button>}<button disabled={busy} onClick={()=>void restoreVersion(false)}>{restore.algorithm.hasDraft?"Отбросить черновик и восстановить":"Восстановить"}</button><button disabled={busy} onClick={()=>setRestore(null)}>Отмена</button></section></div>}
  </main>;
}
function AlgorithmRows({algorithm:a,expanded,versions,busy,expand,toggle,open,restore}:{algorithm:Algorithm;expanded:boolean;versions?:AlgorithmVersion[];busy:boolean;expand:()=>void;toggle:()=>void;open:()=>void;restore:(v:AlgorithmVersion)=>void}) {
  const backups=versions?.filter(v=>v.id!==a.active);
  return <><tr><td><button aria-expanded={expanded} aria-label={"История · "+a.name} onClick={expand}>{expanded?"▾":"▸"}</button></td><td><b>{a.name}</b>{a.hasDraft&&<small>Есть черновик</small>}</td><td>{a.number}</td><td>{versionDate(a.saved)}</td><td>{a.connected?"Подключён":"Отключён"}</td><td><button disabled={busy} onClick={toggle}>{a.connected?"Отключить":"Подключить"}</button><button onClick={open}>Открыть в нодовом редакторе</button></td></tr>{expanded&&<tr className="al-history"><td/><td colSpan={5}>{!versions?<p>Загрузка истории…</p>:!backups?.length?<p>Предыдущих версий пока нет</p>:backups.map(v=><div key={v.id}><strong>Версия {v.number}</strong><span>{versionDate(v.created)}</span><span>{v.author}</span><span>{versionReason(v.reason)}</span><button disabled={busy} onClick={()=>restore(v)}>Восстановить</button></div>)}</td></tr>}</>;
}
