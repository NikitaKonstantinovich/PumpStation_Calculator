"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BASE_LABELS, BASE_SECTIONS, type AppliedBaseValues, type BaseSection } from "./base-values";
import { applyProjectBaseUpdate, projectBaseChanges } from "./base-values-project";
import type { ProjectConfig } from "./project-config";
import "./base-values.css";

export async function fetchPublishedBaseValues():Promise<AppliedBaseValues> {
  const r=await fetch("/api/base-values/effective",{cache:"no-store"}),body=await r.json();
  if(!r.ok)throw new Error(body.error??"Не удалось загрузить базовые значения");return body.applied;
}
export function usePublishedBaseValues(enabled:boolean) {
  const [latest,setLatest]=useState<AppliedBaseValues|null>(null),[error,setError]=useState("");
  const refresh=useCallback(async()=>{try{setLatest(await fetchPublishedBaseValues());setError("");}catch(e){setError(e instanceof Error?e.message:"Не удалось проверить актуальность базовых значений");}},[]);
  useEffect(()=>{if(!enabled)return;const initial=window.setTimeout(()=>void refresh(),0),timer=window.setInterval(()=>void refresh(),60_000),focus=()=>void refresh();window.addEventListener("focus",focus);window.addEventListener("base-values-published",focus);return()=>{clearTimeout(initial);clearInterval(timer);window.removeEventListener("focus",focus);window.removeEventListener("base-values-published",focus);};},[enabled,refresh]);
  return {latest,error,refresh};
}
export function BaseValuesUpdateNotice({project,latest,error,onApply}:{project:ProjectConfig;latest:AppliedBaseValues|null;error:string;onApply:(project:ProjectConfig)=>void}) {
  const [open,setOpen]=useState(false),[kept,setKept]=useState(false),[selected,setSelected]=useState<BaseSection[]>([]),[replaceManual,setReplaceManual]=useState(false);
  const changes=useMemo(()=>latest?projectBaseChanges(project,latest):[],[project,latest]);
  if(error)return <aside className="base-update" role="status">{error} Используемая версия проекта сохранена; актуальность не проверена.</aside>;
  if(!latest||!changes.length)return null;
  const sections=BASE_SECTIONS.filter(s=>changes.some(c=>c.section===s));
  return <aside className="base-update" aria-label="Обновление базовых значений"><p><b>Базовые значения обновлены.</b> В этом проекте сохранены прежние значения. Вы можете сравнить изменения и применить обновление.</p>{kept&&<p>Оставлены значения проекта. Доступно обновление разделов: {sections.map(s=>BASE_LABELS[s]).join(", ")}.</p>}<button className="button" onClick={()=>{setOpen(!open);setSelected(sections);}}>Посмотреть изменения</button><button className="button" onClick={()=>{setKept(true);setOpen(false);}}>Оставить значения проекта</button>
    {open&&<div><div className="base-table-scroll"><table className="base-table"><thead><tr><th>Параметр</th><th>В проекте</th><th>Актуальное</th><th>Единица</th><th>Влияние</th></tr></thead><tbody>{changes.map((c,i)=><tr key={`${c.section}-${i}`}><td>{c.label}{c.manual&&<strong> · ручное значение</strong>}</td><td>{c.before}</td><td>{c.after}</td><td>{c.unit}</td><td>{c.impact}</td></tr>)}</tbody></table></div><div className="base-update__sections">{sections.map(s=><label key={s}><input type="checkbox" checked={selected.includes(s)} onChange={e=>setSelected(current=>e.target.checked?[...current,s]:current.filter(k=>k!==s))}/>{BASE_LABELS[s]}</label>)}</div>{changes.some(c=>c.manual)&&<label><input type="checkbox" checked={replaceManual} onChange={e=>setReplaceManual(e.target.checked)}/>Заменить также показанные ручные значения в выбранных разделах</label>}<p>Неотмеченные разделы и ручные значения сохранятся. Зависимые расчёты будут обновлены или отмечены как устаревшие.</p><button className="button button--primary" disabled={!selected.length} onClick={()=>{onApply(applyProjectBaseUpdate(project,latest,selected,replaceManual));setOpen(false);setKept(false);}}>Применить обновление</button></div>}
  </aside>;
}
