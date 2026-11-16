import {useEffect,useState} from "react";
import {projectApi,type ProjectFile,type ProjectSession} from "./project-session";
import type {SpecEntity} from "./project-config";

type Version={revision:number;kind:string;createdAt:string;pinned:boolean};
export function ProjectHistory({session,onClose,onOpen}:{session:ProjectSession;onClose:()=>void;onOpen:(id:string)=>Promise<void>}) {
  const [versions,setVersions]=useState<Version[]>([]),[preview,setPreview]=useState<ProjectFile|null>(null),[error,setError]=useState("");
  const query="?id="+encodeURIComponent(session.latest.project.id);
  const refresh=async()=>setVersions((await projectApi<{revisions:Version[]}>(query+"&history=1")).revisions);
  useEffect(()=>{let active=true;void projectApi<{revisions:Version[]}>(query+"&history=1").then(x=>{if(active)setVersions(x.revisions);}).catch(e=>setError(e.message));return()=>{active=false;};},[query]);
  const run=async(action:()=>Promise<unknown>)=>{try{setError("");await action();}catch(e){setError(e instanceof Error?e.message:"Ошибка истории");}};
  return <dialog open aria-label="История проекта" style={{position:"fixed",zIndex:1000,top:"10%",maxHeight:"75vh",overflow:"auto"}}>
    <h2>История проекта</h2><button onClick={onClose}>Закрыть</button>{error&&<p role="alert">{error}</p>}
    {versions.map(v=><p key={v.revision}>Версия {v.revision} · {new Date(v.createdAt).toLocaleString("ru-RU")} {" "}
      <button onClick={()=>void run(async()=>setPreview(await projectApi<ProjectFile>(query+"&revision="+v.revision)))}>Посмотреть</button>{" "}
      <button onClick={()=>void run(async()=>{await projectApi(query,{action:"pin",revision:v.revision,pinned:!v.pinned});await refresh();})}>{v.pinned?"Открепить":"Закрепить"}</button>{" "}
      <button onClick={()=>void run(async()=>{
        if(!window.confirm("Восстановить эту версию в качестве новой?")) return;
        if(!await session.flush()) throw new Error("Сначала разрешите ошибку сохранения");
        await projectApi(query,{restore:v.revision,operation:crypto.randomUUID(),baseRevision:session.revision});
        await onOpen(session.latest.project.id);onClose();
      })}>Восстановить</button></p>)}
    {preview&&<details open><summary>{preview.name}</summary>
      <p>Спецификация сохранённой версии</p>
      <ol>{(preview.config.entities["station-spec"] as SpecEntity).items.map((item,i)=><li key={i}>{item.name} · {item.quantity} {item.unit} · {item.price==null?"Цена не указана":item.price.toLocaleString("ru-RU")+" ₽/ед."}</li>)}</ol>
      <button onClick={()=>{
        const url=URL.createObjectURL(new Blob([JSON.stringify(preview.config,null,2)],{type:"application/json"}));
        const link=document.createElement("a");link.href=url;link.download="project-version.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
      }}>Экспорт этой версии</button>
    </details>}
  </dialog>;
}
