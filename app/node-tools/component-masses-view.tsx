"use client";
import { useState } from "react";
import type { View } from "./schema";
import { SPECIFICATION_GROUPS } from "./specification-nodes";
import { componentMassExportRows,type ComponentMassRow } from "./component-masses";
import { specificationExportBlob,type SpecificationExportFormat } from "../specification-export";

const number=(value:number)=>value.toLocaleString("ru-RU",{maximumFractionDigits:3});
const mass=(value:number|null)=>value===null?"—":number(value);
function Children({rows}:{rows:ComponentMassRow[]}){
 return <table><thead><tr><th>Наименование</th><th>Количество</th><th>Ед.</th><th>Масса ед., кг</th><th>Масса всего, кг</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.name}<small>{r.source}</small>{r.children.length>0&&<details><summary>Состав</summary><Children rows={r.children}/></details>}</td><td>{number(r.quantity)}</td><td>{r.unit}</td><td>{mass(r.unitMassKg)}</td><td>{mass(r.totalMassKg)}{r.totalMassKg===null&&r.knownMassKg>0&&<small>Учтено {number(r.knownMassKg)} кг</small>}</td></tr>)}</tbody></table>;
}
export function ComponentMassesView({view}:{view:View}){
 const [exporting,setExporting]=useState(false),[error,setError]=useState("");
 const data=view.componentMasses;
 if(!data||data.status!=="ready")return <div className="dn-calculator__empty"><b>Массы комплектующих</b><p>{data?.message??"Подключите результат спецификации."}</p></div>;
 async function download(format:SpecificationExportFormat){
  if(exporting||!data)return;setExporting(true);setError("");
  try{const blob=await specificationExportBlob(componentMassExportRows(data),format),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`Массы комплектующих.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  catch{setError("Не удалось выгрузить таблицу масс.");}finally{setExporting(false);}
 }
 const summary=(rows:ComponentMassRow[])=>{
  const partial=rows.some(r=>r.totalMassKg===null),known=rows.reduce((n,r)=>n+r.knownMassKg,0);
  return <span className="spec-table__section-summary"><i>{rows.length} поз.</i><strong>{partial?"Учтено ":""}{number(known)} кг</strong></span>;
 };
 return <div className="spec-sheet nt-component-masses">
  <div className="spec-sheet__summary"><span><b>Массы комплектующих</b> · {data.rows.length} позиций</span><div className="spec-sheet__actions"><span className="spec-sheet__total"><small>{data.totalMassKg===null?"Известная часть массы":"Итоговая масса"}</small><strong>{number(data.knownMassKg)} кг</strong></span><button type="button" className="button" disabled={exporting} onClick={()=>void download("csv")}>CSV</button><button type="button" className="button" disabled={exporting} onClick={()=>void download("xlsx")}>XLSX</button></div></div>
  <p className="spec-sheet__note">{data.message}{data.missingCount>0&&` Неполная масса у ${data.missingCount} позиций.`}</p>{error&&<p role="alert">{error}</p>}
  <div className="spec-table" role="table" aria-label="Массы комплектующих"><div className="spec-table__row spec-table__row--head" role="row">{["№","Наименование","Кол-во","Ед.","Масса ед., кг","Масса всего, кг","Источник массы"].map(v=><span key={v} role="columnheader">{v}</span>)}</div>
  {SPECIFICATION_GROUPS.map(group=><div key={group.title}><div className="spec-table__section spec-table__section--main"><b>{group.title}</b>{summary(data.rows.filter(r=>group.sections.some(s=>s.id===r.section)))}</div>{group.sections.map(section=>{const rows=data.rows.filter(r=>r.section===section.id);return <div key={section.id}>{section.title&&<div className="spec-table__section spec-table__section--sub"><b>{section.title}</b>{summary(rows)}</div>}{rows.map(r=><div className="spec-table__row spec-table__row--item" role="row" key={r.id} data-mass-position={r.position}>
   <span className="spec-table__cell spec-table__cell--position">{r.position}</span><span className="spec-table__cell spec-table__cell--name"><b>{r.name}</b><small>{r.details}</small></span><span className="spec-table__cell spec-table__cell--quantity">{number(r.quantity)}</span><span className="spec-table__cell spec-table__cell--unit">{r.unit}</span><span className="spec-table__cell spec-table__cell--price">{mass(r.unitMassKg)}</span><span className="spec-table__cell spec-table__cell--sum">{mass(r.totalMassKg)}{r.totalMassKg===null&&r.knownMassKg>0&&<small>Учтено {number(r.knownMassKg)} кг</small>}</span><span className="spec-table__cell spec-table__cell--description">{r.source}</span>
   {r.children.length>0&&<details className="spec-frame-assembly"><summary>Состав ({r.children.length})</summary><Children rows={r.children}/><p>Количество деталей указано на одну сборку. Массы входят в родительскую позицию и повторно не суммируются.</p></details>}
  </div>)}</div>;})}</div>)}
  </div>
 </div>;
}
