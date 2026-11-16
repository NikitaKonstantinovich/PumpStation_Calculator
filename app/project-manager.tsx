"use client";
import {useEffect,useRef,useState} from "react";
import type {ManagedProject,ManagedProjectPage} from "./project-manager-types";
import "./project-manager.css";

export function ProjectManager({openCopy}:{openCopy:(project:ManagedProject,operation:string)=>Promise<boolean>}) {
  const [query,setQuery]=useState(""),[user,setUser]=useState(""),[algorithm,setAlgorithm]=useState(""),[offset,setOffset]=useState(0),[refresh,setRefresh]=useState(0);
  const [state,setState]=useState<{key:string;page?:ManagedProjectPage;error?:string}>(),[copying,setCopying]=useState<string|null>(null);
  const requests=useRef(new Map<string,string>()),busy=useRef(false);
  const key=JSON.stringify([query.trim(),user,algorithm,offset,refresh]);
  useEffect(()=>{
    const controller=new AbortController();
    const timer=window.setTimeout(()=>{
      const params=new URLSearchParams({q:query.trim(),user,algorithm,offset:String(offset)});
      void fetch("/api/admin/projects?"+params,{signal:controller.signal,cache:"no-store"}).then(async response=>{
        const data=await response.json();if(!response.ok)throw Error(data.error??"Не удалось загрузить проекты.");
        if(!controller.signal.aborted)setState({key,page:data});
      }).catch(error=>{if(!controller.signal.aborted)setState(previous=>({key,page:previous?.page,error:error.message}));});
    },250);
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[key,query,user,algorithm,offset]);
  const loading=state?.key!==key,page=state?.page,error=!loading&&state?.error;
  const date=(value:string)=>new Date(value).toLocaleString("ru-RU",{dateStyle:"medium",timeStyle:"short"});
  const copy=async(project:ManagedProject)=>{
    if(busy.current)return;busy.current=true;setCopying(project.id);
    const identity=project.id+"/"+project.revision,operation=requests.current.get(identity)??crypto.randomUUID();
    requests.current.set(identity,operation);
    try{if(await openCopy(project,operation))requests.current.delete(identity);}finally{busy.current=false;setCopying(null);}
  };
  return <main className="project-manager">
    <header><div><h1>Менеджер проектов</h1><p>Проекты всех пользователей. Копия сохраняется в ваших проектах.</p></div><button className="button" onClick={()=>setRefresh(n=>n+1)} disabled={loading||!!copying}>Обновить</button></header>
    <div className="project-manager__filters">
      <label><span>Поиск по названию</span><input type="search" placeholder="Название проекта" value={query} maxLength={500} onChange={e=>{setQuery(e.target.value);setOffset(0);}}/></label>
      <label><span>Пользователь</span><select value={user} onChange={e=>{setUser(e.target.value);setOffset(0);}}><option value="">Все пользователи</option>{page?.users.map(u=><option key={u.id} value={u.id}>{u.name} · {u.email||u.id}</option>)}</select></label>
      <label><span>Алгоритм</span><select value={algorithm} onChange={e=>{setAlgorithm(e.target.value);setOffset(0);}}><option value="">Все алгоритмы</option>{page?.algorithms.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <button className="button" disabled={!query&&!user&&!algorithm} onClick={()=>{setQuery("");setUser("");setAlgorithm("");setOffset(0);}}>Сбросить фильтры</button>
    </div>
    {error&&<p role="alert">{error} <button onClick={()=>setRefresh(n=>n+1)}>Повторить загрузку</button></p>}
    <p className="project-manager__status" role="status">{loading?"Загружаем проекты…":error?"Список не обновлён":`Найдено проектов: ${page?.total??0}`}</p>
    <div className="project-manager__table" aria-busy={loading}>
      <table><caption className="visually-hidden">Проекты всех пользователей</caption><thead><tr><th scope="col">Проект</th><th scope="col">Пользователь</th><th scope="col">Алгоритм</th><th scope="col">Создан</th><th scope="col">Изменён</th><th scope="col">Действия</th></tr></thead>
        <tbody>{page?.projects.map(p=><tr key={p.id}><td><strong>{p.name}</strong><small>{p.id}</small></td><td>{p.owner.name}<small>{p.owner.email||p.owner.id}</small></td><td>{p.algorithm.name}{!p.algorithm.connected&&<small>Алгоритм не подключён</small>}</td><td>{date(p.createdAt)}</td><td>{date(p.updatedAt)}</td><td><button className="button" disabled={loading||!!error||!!copying||!p.algorithm.connected} title={!p.algorithm.connected?"Подключите алгоритм в библиотеке, чтобы открыть его рабочее пространство":undefined} onClick={()=>void copy(p)}>{copying===p.id?"Открываем…":"Открыть копию"}</button></td></tr>)}</tbody>
      </table>
      {!loading&&!error&&!page?.projects.length&&<p className="project-manager__empty">Проекты не найдены. Измените поиск или фильтры.</p>}
    </div>
    <footer><button className="button" disabled={offset===0||loading||!!copying} onClick={()=>setOffset(n=>Math.max(0,n-25))}>Назад</button><span>Страница {Math.floor(offset/25)+1}</span><button className="button" disabled={page?.next==null||loading||!!error||!!copying} onClick={()=>{if(page?.next!=null)setOffset(page.next);}}>Далее</button></footer>
  </main>;
}
