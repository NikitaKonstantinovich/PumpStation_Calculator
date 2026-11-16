"use client";
import {useId,useRef,useState,type ReactNode} from "react";

export type WindowRibbonActions = {insert:ReactNode;view:ReactNode;history:ReactNode};
const tabs=["Проект","Вставка","Расчёт","Вид"] as const;
type Tab=typeof tabs[number];

export function ProductRibbon({storageKey,name,project,calculation,windows}: {
  storageKey:string;name:string;project:ReactNode;calculation:ReactNode;windows?:WindowRibbonActions;
}) {
  const id=useId(),tools=useRef<HTMLDivElement>(null);
  const [state,setState]=useState<{tab:Tab;collapsed:boolean}>(()=>{
    try {const saved=JSON.parse(localStorage.getItem(storageKey)??"null");return {tab:tabs.includes(saved?.tab)?saved.tab:"Проект",collapsed:saved?.collapsed===true};}
    catch{return {tab:"Проект",collapsed:false};}
  });
  const change=(next:typeof state)=>{
    tools.current?.querySelectorAll("details[open]").forEach(menu=>menu.removeAttribute("open"));
    setState(next);
    try{localStorage.setItem(storageKey,JSON.stringify(next));}catch{/* Display preferences do not affect project saving. */}
  };
  const contents={"Проект":project,"Вставка":windows?.insert,"Расчёт":calculation,"Вид":windows?.view};
  return <nav className="ribbon nt-product-ribbon" aria-label={`Инструменты продукта «${name}»`}>
    <div className="ribbon__tabs" role="tablist" aria-label="Верхнее меню">
      {tabs.map((tab,index)=><button key={tab} id={`${id}-tab-${index}`} role="tab" aria-selected={state.tab===tab} aria-controls={`${id}-tools`} tabIndex={state.tab===tab?0:-1}
        className={state.tab===tab?"ribbon__tab ribbon__tab--active":"ribbon__tab"}
        onClick={()=>change({tab,collapsed:false})}
        onKeyDown={event=>{
          const next=event.key==="ArrowRight"?(index+1)%tabs.length:event.key==="ArrowLeft"?(index+tabs.length-1)%tabs.length:event.key==="Home"?0:event.key==="End"?tabs.length-1:null;
          if(next===null)return;event.preventDefault();change({tab:tabs[next],collapsed:false});
          document.getElementById(`${id}-tab-${next}`)?.focus();
        }}>{tab}</button>)}
      <span className="nt-ribbon-product" title={name}>{name}</span>
      <button className="ribbon__toggle" onClick={()=>change({...state,collapsed:!state.collapsed})} aria-expanded={!state.collapsed} aria-controls={`${id}-tools`}
        aria-label={state.collapsed?"Развернуть верхнюю панель":"Свернуть верхнюю панель"} title={state.collapsed?"Развернуть верхнюю панель":"Свернуть верхнюю панель"}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 10 4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
    </div>
    <div ref={tools} id={`${id}-tools`} role="tabpanel" aria-labelledby={`${id}-tab-${tabs.indexOf(state.tab)}`} className="ribbon__tools" hidden={state.collapsed}>
      {windows?.history}<span className="ribbon__divider"/>{contents[state.tab]??<small className="nt-ribbon-empty">Загружаем инструменты…</small>}
    </div>
  </nav>;
}
