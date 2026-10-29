"use client";
import { useState } from "react";
import type { Component } from "./model";
import type { CollectorCardState } from "../collector-project";
import type { LineCatalog } from "./line-types";
import { DEFAULT_INSTRUMENT_LENGTH_MM, type CollectorMount } from "./collector-types";
import { applyCollectorTemplate, buildCollectorTemplate } from "./collector-template";
import { saddleRings } from "./collector-intersection";

function OptionalDimension({label,value,disabled,min,onCommit}:{label:string;value:number|null;disabled:boolean;min?:number;onCommit:(v:number|null)=>void}){
  const [draft,setDraft]=useState<string|null>(null);
  const commit=()=>{if(draft===null)return;const v=draft.trim()?Number(draft.replace(",",".")):null;if(v===null||Number.isFinite(v)&&Math.abs(v)<=1e5&&(min===undefined||v>=min))onCommit(v);setDraft(null);};
  return <label className="model-editor__number"><span>{label}</span><input aria-label={label} disabled={disabled} value={draft??(value===null?"":String(value))} placeholder="Не задано" inputMode="decimal" onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();if(e.key==="Escape")setDraft(null);}}/></label>;
}
export function CollectorDetails({component:c,card,data,selectedPieceId,onSelect,onReplace}:{component:Component;card:CollectorCardState;data?:LineCatalog;selectedPieceId?:string;onSelect:(id:string)=>void;onReplace:(c:Component)=>void}){
  const binding=c.collector!,t=binding.template,disabled=c.locked||!data||binding.manualGeometry===true;
  const rebuild=(mount:CollectorMount)=>{
    if(!data||c.locked)return;
    const pumps=t.ports.filter(p=>!p.id.startsWith("network-")).map(p=>({id:p.id,circuit:t.branches.find(b=>b.portId===p.id)?.circuit??(/^(pump-2-|collector-branch-2-)/.test(p.id)?2:1),x:p.point[0]}));
    const next=applyCollectorTemplate(c,buildCollectorTemplate(card,data,pumps,t.side,mount));next.collector!.manualGeometry=false;onReplace(next);
  };
  const parts=[...(t.main?[{id:"main",name:"Основная труба",source:t.main.source}]:[]),...t.branches,...t.pieces];
  const selected=parts.find(p=>p.id===selectedPieceId),branch=t.branches.find(b=>b.id===selectedPieceId);
  let cut:number|null=null;if(branch&&t.main)try{cut=saddleRings(t.main,branch).cutLengthMm;}catch{/* diagnostic shown with the model */}
  const instruments=[...new Set([...t.branches,...t.pieces].filter(p=>/^instrument\d+-\d+$/.test(p.id)).map(p=>p.id))];
  return <div className="model-editor__collector-details">
    <p><b>Седловые врезки · шаблон v1</b><br/>Компоновочная геометрия. Исполнение сварного узла требует подтверждения.</p>
    {t.main&&<p>Труба по расчёту: {t.main.lengthMm} мм · OD {t.main.outerMm} · ID {t.main.innerMm} мм</p>}
    <details><summary>Монтажные базы и посадки</summary>
      <label>База расчётной длины патрубка<select aria-label="База длины патрубка" disabled={disabled} value={t.mount.branchLengthReference} onChange={e=>rebuild({...t.mount,branchLengthReference:e.target.value as CollectorMount["branchLengthReference"]})}><option value="axis-to-pipe-end">От оси магистрали до торца трубы</option><option value="surface-to-pipe-end">От наружной касательной до торца трубы</option></select></label>
      <p>Выбранная база — явно сохранённое допущение компоновки. Она не меняет метраж и стоимость расчёта.</p>
      <OptionalDimension label="От поверхности фланца до торца трубы, мм" value={t.mount.flangeFaceToPipeEndMm} min={0} disabled={disabled} onCommit={v=>rebuild({...t.mount,flangeFaceToPipeEndMm:v})}/>
      <OptionalDimension label="Полная длина сгонов по умолчанию, мм" value={t.mount.instrumentDefaultLengthMm??DEFAULT_INSTRUMENT_LENGTH_MM} min={.1} disabled={disabled} onCommit={v=>rebuild({...t.mount,instrumentDefaultLengthMm:v??DEFAULT_INSTRUMENT_LENGTH_MM,instrumentRulesRevision:2})}/>
      <label>База индивидуальных длин сгонов<select aria-label="База длины сгонов" disabled={disabled} value={t.mount.instrumentLengthReference??"surface-to-pipe-end"} onChange={e=>rebuild({...t.mount,instrumentLengthReference:e.target.value as CollectorMount["instrumentLengthReference"]})}><option value="blank-length">Полная длина заготовки</option><option value="surface-to-pipe-end">Выступ от поверхности коллектора</option></select></label>
      {card.configuration?.eccentric&&<OptionalDimension label="Смещение оси врезки по локальной Z, мм" value={t.mount.eccentricOffsetMm} disabled={disabled} onCommit={v=>rebuild({...t.mount,eccentricOffsetMm:v})}/>}
      {instruments.map(id=><OptionalDimension key={id} label={`${parts.find(p=>p.id===id)?.name??id}: индивидуальная длина, мм`} value={t.mount.instrumentLengthsMm[id]??null} min={.1} disabled={disabled} onCommit={v=>{const lengths={...t.mount.instrumentLengthsMm};if(v===null)delete lengths[id];else lengths[id]=v;rebuild({...t.mount,instrumentLengthsMm:lengths});}}/>)}
      <p>Посадки и введённые длины относятся к монтажному шаблону; не означают подтверждения изготовления.</p>
      {binding.manualGeometry&&<button disabled={c.locked||!data} onClick={()=>rebuild(t.mount)}>Вернуть размеры расчёта</button>}
    </details>
    <details open><summary>Детали коллектора ({parts.length})</summary>{parts.map(p=><div key={p.id} className="model-editor__tree-row"><button className="model-editor__tree-name" aria-pressed={selectedPieceId===p.id} title={p.source} onClick={()=>onSelect(p.id)}>{p.name}</button><input type="checkbox" aria-label={`Показывать деталь ${p.name}`} checked={!binding.hiddenPieceIds.includes(p.id)} onChange={e=>onReplace({...c,collector:{...binding,hiddenPieceIds:e.target.checked?binding.hiddenPieceIds.filter(id=>id!==p.id):[...binding.hiddenPieceIds,p.id]}})}/></div>)}</details>
    {selected&&<p className="model-editor__source"><b>{selected.name}</b><br/>{selected.source}</p>}
    {selected&&<label className="model-editor__opacity">Непрозрачность детали<input aria-label="Непрозрачность выбранной детали" type="range" min="0.1" max="1" step="0.1" value={binding.pieceOpacities?.[selected.id]??1} onChange={e=>onReplace({...c,collector:{...binding,pieceOpacities:{...binding.pieceOpacities,[selected.id]:Number(e.target.value)}}})}/></label>}
    {branch&&<p>{branch.blankLengthMm!==undefined?<>Полная длина заготовки: {branch.blankLengthMm} мм<br/></>:null}Расчётная длина: {branch.calculatedLengthMm??"Не применяется"}{branch.calculatedLengthMm===null?"":" мм"}<br/>От базы оси до торца: {branch.endMm.toFixed(2)} мм<br/>После обрезки, осевой габарит: {cut===null?"Не определён":`${cut.toFixed(2)} мм`}<br/>OD {branch.outerMm} · ID {branch.innerMm} мм</p>}
  </div>;
}
