"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { AccountUser } from "./user-types";
import { CAD_EXTENSIONS, equipmentColumns, equipmentFileUrl, equipmentLabel, equipmentValue, filterEquipment, type EquipmentCatalog, type EquipmentFiles, type EquipmentKind, type EquipmentRow } from "./equipment-admin";
import { PUMP_FILE_SETTINGS } from "./pump-files";

function FileIcon({name}:{name:"check"|"close"|"plus"|"folder"|"copy"}) {
  const paths={check:"m5 12 4 4L19 6",close:"m6 6 12 12M6 18 18 6",plus:"M12 5v14M5 12h14",folder:"M3 7V5h6l2 2h10v13H3V7Z",copy:"M8 8h12v13H8V8ZM16 8V3H3v13h5"};
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
function ValuesTable({value,label}:{value:unknown;label:string}) {
  if(value===null||typeof value!=="object")return <span>{equipmentValue(value)}</span>;
  if(Array.isArray(value)){
    if(!value.length)return <span>Нет значений</span>;
    const tuples=value.every(item=>Array.isArray(item)&&item.length===2);
    return <table className="equipment-detail-table"><caption>{label}</caption>{tuples&&<thead><tr><th>Расход, м³/ч</th><th>{label.split(" / ").at(-1)}</th></tr></thead>}<tbody>{value.map((item,index)=>tuples?<tr key={index}><td>{equipmentValue(item[0])}</td><td>{equipmentValue(item[1])}</td></tr>:<tr key={index}><th scope="row">{index+1}</th><td><ValuesTable value={item} label={`${label} · ${index+1}`}/></td></tr>)}</tbody></table>;
  }
  return <table className="equipment-detail-table"><caption>{label}</caption><tbody>{Object.entries(value).map(([key,item])=><tr key={key}><th scope="row">{equipmentLabel(key)}</th><td>{item!==null&&typeof item==="object"?<details><summary>{equipmentLabel(key)} · {equipmentValue(item)}</summary><ValuesTable value={item} label={equipmentLabel(key)}/></details>:equipmentValue(item)}</td></tr>)}</tbody></table>;
}
async function jsonResponse<T>(response:Response):Promise<T>{
  const data=await response.json();if(!response.ok)throw new Error(data.error??"Не удалось выполнить действие.");return data as T;
}
const localBrowser=()=>typeof window!=="undefined"&&["localhost","127.0.0.1","[::1]"].includes(window.location.hostname);
const defaultColumns=["manufacturer","series","article","power","nominalFlow","maxHead","price","priceCurrency","family","currentPrice","currency","pumpCount","powerKw"];
const pageSize=40;

export function EquipmentAdminPanel({actor,onBack}:{actor:AccountUser;onBack:()=>void}){
  const [catalog,setCatalog]=useState<EquipmentCatalog|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [category,setCategory]=useState("pumps"),[search,setSearch]=useState(""),[field,setField]=useState(""),[value,setValue]=useState("");
  const [status,setStatus]=useState("all"),[fileFilter,setFileFilter]=useState("all"),[sort,setSort]=useState("name"),[descending,setDescending]=useState(false),[page,setPage]=useState(0);
  const [hidden,setHidden]=useState<Record<string,string[]>>({}),[expanded,setExpanded]=useState<string|null>(null);
  const [files,setFiles]=useState<Record<string,EquipmentFiles>>({}),[refresh,setRefresh]=useState(0),[checking,setChecking]=useState(false),[checked,setChecked]=useState(0);
  const [busy,setBusy]=useState<string|null>(null),[progress,setProgress]=useState(0),[uploading,setUploading]=useState(false),[uploadTarget,setUploadTarget]=useState<{row:EquipmentRow;kind:EquipmentKind}|null>(null);
  const picker=useRef<HTMLInputElement>(null),upload=useRef<XMLHttpRequest|null>(null);
  useEffect(()=>()=>upload.current?.abort(),[]);
  useEffect(()=>{
    if(actor.role!=="admin")return;
    const controller=new AbortController();
    fetch("/api/admin/equipment",{cache:"no-store",signal:controller.signal}).then(jsonResponse<EquipmentCatalog>).then(setCatalog).catch(error=>{if(error.name!=="AbortError")setError(error.message);});
    return ()=>controller.abort();
  },[actor.role,refresh]);
  const categories=useMemo(()=>{
    const entries=new Map<string,{id:string;name:string;count:number}>();
    for(const row of catalog?.rows??[]){const entry=entries.get(row.category)??{id:row.category,name:row.categoryName,count:0};entry.count++;entries.set(row.category,entry);}
    return [...entries.values()];
  },[catalog]);
  const categoryRows=useMemo(()=>catalog?.rows.filter(row=>row.category===category)??[],[catalog,category]);
  const columns=useMemo(()=>equipmentColumns(categoryRows),[categoryRows]);
  const initialHidden=columns.filter(key=>![...columns.filter(key=>defaultColumns.includes(key)),...columns.filter(key=>/DN|PN|Наименование|Артикул|Материал|Цена|Вес|Длина|Диаметр/i.test(key)).slice(0,8)].includes(key));
  const visibleColumns=columns.filter(key=>!(hidden[category]??initialHidden).includes(key));
  const filtered=useMemo(()=>filterEquipment(categoryRows,{search,field,value,status,sort,descending}),[categoryRows,search,field,value,status,sort,descending]);
  const matching=useMemo(()=>filtered.filter(row=>{
    if(fileFilter==="all")return true;
    const [kind,presence]=fileFilter.split(":") as [EquipmentKind,string],file=files[row.key]?.[kind];
    return file&&!file.error&&(presence==="yes"?file.available:!file.available);
  }),[filtered,fileFilter,files]);
  const pageCount=Math.max(1,Math.ceil(matching.length/pageSize)),currentPage=Math.min(page,pageCount-1);
  const visibleRows=matching.slice(currentPage*pageSize,(currentPage+1)*pageSize);
  const probeKeys=useMemo(()=>fileFilter!=="all"?filtered.map(row=>row.key):filtered.slice(page*pageSize,(page+1)*pageSize).map(row=>row.key),[filtered,fileFilter,page]);
  useEffect(()=>{
    if(!probeKeys.length)return;
    const controller=new AbortController();
    async function inspect(){
      setChecking(true);setChecked(0);
      try{
        for(let i=0;i<probeKeys.length;i+=pageSize){
          const data=await fetch("/api/admin/equipment/files",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"inspect",keys:probeKeys.slice(i,i+pageSize)}),signal:controller.signal}).then(jsonResponse<{files:Record<string,EquipmentFiles>}>);
          setFiles(old=>({...old,...data.files}));setChecked(Math.min(i+pageSize,probeKeys.length));
        }
      }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:String(error));}
      finally{if(!controller.signal.aborted)setChecking(false);}
    }
    void inspect();return ()=>controller.abort();
  },[probeKeys,refresh]);
  function changeCategory(id:string){setCategory(id);setPage(0);setField("");setValue("");setExpanded(null);setFileFilter("all");setSort("name");}
  async function inspectRow(row:EquipmentRow){
    const data=await fetch("/api/admin/equipment/files",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"inspect",keys:[row.key]})}).then(jsonResponse<{files:Record<string,EquipmentFiles>}>);
    setFiles(old=>({...old,...data.files}));
  }
  async function download(row:EquipmentRow,kind:EquipmentKind){
    setBusy(`${row.key}:${kind}`);setError("");
    try{
      const response=await fetch(equipmentFileUrl(row.key,kind),{cache:"no-store"});
      if(!response.ok){await jsonResponse(response);return;}
      const url=URL.createObjectURL(await response.blob()),a=document.createElement("a");a.href=url;a.download=files[row.key]?.[kind]?.name??"file";a.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);
      setNotice(`Файл «${a.download}» скачан.`);
    }catch(error){setError(error instanceof Error?error.message:String(error));await inspectRow(row).catch(()=>{});}finally{setBusy(null);}
  }
  function startUpload(file:File,target:{row:EquipmentRow;kind:EquipmentKind}){
    setError("");setNotice("");setBusy(`${target.row.key}:${target.kind}`);setProgress(0);setUploading(true);
    const xhr=new XMLHttpRequest();upload.current=xhr;
    xhr.open("PUT",equipmentFileUrl(target.row.key,target.kind));xhr.setRequestHeader("X-File-Name",encodeURIComponent(file.name));xhr.setRequestHeader("X-File-Size",String(file.size));
    xhr.upload.onprogress=event=>{if(event.lengthComputable)setProgress(Math.round(event.loaded/event.total*100));};
    xhr.onerror=()=>{setError("Не удалось загрузить файл. Проверьте соединение.");setBusy(null);setUploading(false);};
    xhr.onabort=()=>{setBusy(null);setUploading(false);};
    xhr.onload=()=>{
      void(async()=>{
        try{const data=JSON.parse(xhr.responseText);if(xhr.status<200||xhr.status>=300)throw new Error(data.error??"Ошибка загрузки.");await inspectRow(target.row);setNotice(`Файл «${file.name}» сохранён для «${target.row.name}».`);}
        catch(error){setError(error instanceof Error?error.message:String(error));}finally{setBusy(null);setUploading(false);upload.current=null;}
      })();
    };
    xhr.send(file);
  }
  async function reveal(row:EquipmentRow){
    setError("");setBusy(row.key);
    try{await fetch("/api/admin/equipment/files",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"reveal",key:row.key})}).then(jsonResponse);setNotice("Запрос на открытие расположения модели передан Проводнику.");}
    catch(error){setError(error instanceof Error?error.message:String(error));await inspectRow(row).catch(()=>{});}finally{setBusy(null);}
  }
  function fileCell(row:EquipmentRow,kind:EquipmentKind){
    const file=files[row.key]?.[kind],label=kind==="drawing"?"чертёж":"CAD-модель";
    if(!file)return <span className="equipment-muted" title="Файл ещё не проверен">…</span>;
    if(file.error)return <button className="equipment-icon" title={file.error} aria-label={`Повторить проверку: ${row.name}`} onClick={()=>void inspectRow(row).catch(error=>setError(error.message))}>↻</button>;
    if(file.available)return <button className="equipment-icon equipment-icon--ready" disabled={busy!==null} aria-label={`Скачать ${label}: ${row.name}`} title={`${file.name}\n${file.name?.split(".").at(-1)?.toUpperCase()} · ${equipmentValue(file.size)} байт${file.note?`\n${file.note}`:""}\nСкачать`} onClick={()=>void download(row,kind)}><FileIcon name="check"/></button>;
    return <span className="equipment-file-actions"><span className="equipment-muted" title={`Нет доступного файла «${label}», связанного с этой позицией`} aria-label={`Нет доступного файла: ${label}`}><FileIcon name="close"/></span><button className="equipment-icon equipment-muted" disabled={busy!==null} title={`Загрузить ${label}`} aria-label={`Загрузить ${label}: ${row.name}`} onClick={()=>{setUploadTarget({row,kind});setTimeout(()=>picker.current?.click(),0);}}><FileIcon name="plus"/></button></span>;
  }
  if(actor.role!=="admin")return <main className="equipment-admin"><h1>Доступ ограничен</h1><p>База комплектующих доступна только admin.</p><button className="button" onClick={onBack}>В рабочее пространство</button></main>;
  return <main className="equipment-admin">
    <header className="equipment-admin__header"><div><p className="users-eyebrow">АДМИНИСТРИРОВАНИЕ</p><h1>База комплектующих</h1><p>Характеристики оборудования, чертежи и исходные CAD-модели</p></div><div><button className="button" disabled={busy!==null||checking} onClick={()=>{setError("");setFiles({});setRefresh(v=>v+1);}}>Обновить</button><button className="button" disabled={busy!==null} onClick={onBack}>В рабочее пространство</button></div></header>
    {error&&<div role="alert" className="equipment-alert">{error}</div>}{notice&&<div role="status" className="equipment-notice">{notice}</div>}
    {catalog?.warnings.map(warning=><p key={warning} className="equipment-alert">{warning}</p>)}
    {!catalog?<p role="status">{error?"Загрузка базы не завершена. Нажмите «Обновить».":"Загрузка базы оборудования…"}</p>:<>
      <div className="equipment-admin__category"><label>Категория <select value={category} onChange={event=>changeCategory(event.target.value)}>{categories.map(tab=><option key={tab.id} value={tab.id}>{tab.name} ({tab.count})</option>)}</select></label><span>{catalog.rows.length.toLocaleString("ru")} позиций · {categories.length} категорий</span></div>
      <nav className="equipment-tabs" aria-label="Категории оборудования">{categories.map(tab=><button key={tab.id} aria-current={category===tab.id?"page":undefined} onClick={()=>changeCategory(tab.id)}>{tab.name}<span>{tab.count}</span></button>)}</nav>
      <section className="equipment-toolbar" aria-label="Фильтры каталога">
        <label className="equipment-search">Поиск<input type="search" value={search} placeholder="Название, производитель, модель, артикул…" onChange={event=>{setSearch(event.target.value);setPage(0);}}/></label>
        <label>Состояние<select value={status} onChange={event=>{setStatus(event.target.value);setPage(0);}}><option value="all">Все позиции</option><option value="inactive">Неактивные</option><option value="incomplete">Неполные данные</option></select></label>
        <label>Файлы<select value={fileFilter} onChange={event=>{setFileFilter(event.target.value);setPage(0);}}><option value="all">Все</option><option value="model:yes">Есть CAD-модель</option><option value="model:no">Нет CAD-модели</option>{category==="pumps"&&<><option value="drawing:yes">Есть чертёж</option><option value="drawing:no">Нет чертежа</option></>}</select></label>
        <label>Характеристика<select value={field} onChange={event=>{setField(event.target.value);setPage(0);}}><option value="">Любая</option>{columns.map(key=><option key={key} value={key}>{equipmentLabel(key)}</option>)}</select></label>
        <label>Значение<input value={value} disabled={!field} placeholder="Содержит…" onChange={event=>{setValue(event.target.value);setPage(0);}}/></label>
        <details className="equipment-columns"><summary>Столбцы ({visibleColumns.length})</summary><div><button className="button" onClick={()=>setHidden(old=>({...old,[category]:[]}))}>Показать все</button>{columns.map(key=><label key={key}><input type="checkbox" checked={visibleColumns.includes(key)} onChange={event=>setHidden(old=>({...old,[category]:event.target.checked?(old[category]??initialHidden).filter(k=>k!==key):[...(old[category]??initialHidden),key]}))}/>{equipmentLabel(key)}</label>)}</div></details>
      </section>
      <div className="equipment-summary"><span>Найдено {matching.length.toLocaleString("ru")} из {categoryRows.length.toLocaleString("ru")}{checking&&fileFilter!=="all"?" · список уточняется":""}</span><span role="status">{checking?`Проверка файлов: ${checked} / ${probeKeys.length}`:"✓ — скачать · × — отсутствует · + — загрузить"}</span></div>
      <div className="equipment-table-scroll"><table className="equipment-table"><thead><tr><th className="equipment-name" aria-sort={sort==="name"?(descending?"descending":"ascending"):"none"}><button onClick={()=>{setDescending(sort==="name"?!descending:false);setSort("name");setPage(0);}}>Оборудование {sort==="name"?(descending?"↓":"↑"):"↕"}</button></th>{visibleColumns.map(key=><th key={key} aria-sort={sort===key?(descending?"descending":"ascending"):"none"}><button onClick={()=>{setDescending(sort===key?!descending:false);setSort(key);setPage(0);}}>{equipmentLabel(key)} {sort===key?(descending?"↓":"↑"):"↕"}</button></th>)}{category==="pumps"&&<th className="equipment-drawing">Чертёж</th>}<th className="equipment-model">3D для SolidWorks</th><th className="equipment-folder">Расположение</th></tr></thead><tbody>
        {visibleRows.map(row=><Fragment key={row.key}><tr><th scope="row" className="equipment-name"><button className="equipment-name-button" aria-expanded={expanded===row.key} onClick={()=>setExpanded(expanded===row.key?null:row.key)}><span>{expanded===row.key?"▾":"▸"}</span>{row.name}</button><small>{row.key}</small>{!row.active&&<span className="equipment-badge">Неактивна</span>}{row.incomplete&&<span className="equipment-badge equipment-badge--warning">Неполные данные</span>}</th>{visibleColumns.map(key=><td key={key} title={equipmentValue(row.values[key])}>{equipmentValue(row.values[key])}</td>)}{row.pump&&<td className="equipment-drawing">{fileCell(row,"drawing")}</td>}<td className="equipment-model">{fileCell(row,"model")}</td><td className="equipment-folder"><button className="equipment-icon" disabled={busy!==null||!files[row.key]?.model?.available||!files[row.key]?.model?.canReveal||!localBrowser()} title={files[row.key]?.model?.available?files[row.key]?.model?.canReveal&&localBrowser()?"Открыть расположение модели":"Проводник доступен при локальном запуске на Windows. Можно скопировать путь.":"Модель отсутствует или ещё не проверена"} aria-label={`Открыть расположение модели: ${row.name}`} onClick={()=>void reveal(row)}><FileIcon name="folder"/></button>{files[row.key]?.model?.path&&<button className="equipment-icon equipment-muted" title={files[row.key]?.model?.path} aria-label={`Скопировать путь модели: ${row.name}`} onClick={()=>void navigator.clipboard.writeText(files[row.key]!.model!.path!).then(()=>setNotice("Путь модели скопирован.")).catch(()=>setError(`Не удалось скопировать. Путь: ${files[row.key]?.model?.path}`))}><FileIcon name="copy"/></button>}</td></tr>
          {expanded===row.key&&<tr><td colSpan={visibleColumns.length+(row.pump?4:3)}><div className="equipment-details"><h2>{row.name} · все характеристики</h2><ValuesTable value={row.values} label="Характеристики оборудования"/></div></td></tr>}
        </Fragment>)}
        {!visibleRows.length&&<tr><td colSpan={visibleColumns.length+(category==="pumps"?4:3)} className="equipment-empty">{checking?"Проверка наличия файлов…":"По заданным условиям позиции не найдены."}</td></tr>}
      </tbody></table></div>
      <footer className="equipment-pagination"><span>По {pageSize} позиций на странице</span><button className="button" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Назад</button><span>Страница {currentPage+1} из {pageCount}</span><button className="button" disabled={currentPage>=pageCount-1} onClick={()=>setPage(currentPage+1)}>Далее</button></footer>
      <p className="equipment-hint">Нажмите название, чтобы раскрыть все характеристики. Сборку SLDASM с зависимостями загрузите ZIP-пакетом Pack and Go. Исходные CAD-файлы — до 100 МБ, чертежи — до 30 МБ.</p>
    </>}
    <input ref={picker} type="file" hidden aria-label="Выберите файл оборудования" accept={(uploadTarget?.kind==="drawing"?PUMP_FILE_SETTINGS.drawing.extensions:CAD_EXTENSIONS).map(extension=>`.${extension}`).join(",")} onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(file&&uploadTarget)startUpload(file,uploadTarget);}}/>
    {busy&&<div className="equipment-upload" role="status">{uploading?<><span>{progress<100?`Загрузка: ${progress}%`:"Проверка и сохранение файла…"}</span><progress value={progress} max={100}/><button className="button" onClick={()=>upload.current?.abort()}>Отменить</button></>:"Выполнение действия…"}</div>}
  </main>;
}
