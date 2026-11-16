"use client";
import type { Component } from "./model";
import { channelFramePieces,setChannelFramePiece } from "./channel-frame-assembly";

type Props={component:Component;selectedPieceId?:string;onSelect:(id:string)=>void;onReplace:(c:Component)=>void};
export function ChannelFramePieces({component:c,selectedPieceId,onSelect,onReplace}:Props){
 return <>{channelFramePieces(c).map(p=><div key={p.id} className={`model-editor__tree-row ${selectedPieceId===p.id?"is-selected":""}`}>
  <button type="button" className="model-editor__tree-name" aria-pressed={selectedPieceId===p.id} title={p.name} onClick={()=>onSelect(p.id)}>{p.name}</button>
  <input type="checkbox" aria-label={`Показывать деталь ${p.name}`} checked={!c.channelFrameAssembly?.hiddenPieceIds.includes(p.id)} onChange={e=>onReplace(setChannelFramePiece(c,p.id,{hidden:!e.target.checked}))}/>
 </div>)}</>;
}
export function ChannelFrameDetails(props:Props){
 const {component:c,selectedPieceId,onReplace}=props,parts=channelFramePieces(c),selected=parts.find(p=>p.id===selectedPieceId),g=c.channelFrame!;
 return <div className="model-editor__collector-details">
  <p>Сборка рамы · {parts.length} деталей · швеллер {g.profile.name}<br/>{g.lengthMm} × {g.widthMm} × {g.heightMm} мм</p>
  <details open><summary>Детали рамы ({parts.length})</summary><ChannelFramePieces {...props}/></details>
  {selected&&<><p className="model-editor__source"><b>{selected.name}</b><br/>Длина: {Number(selected.lengthMm.toFixed(3))} мм<br/>Масса заготовки: {selected.stockMassKg.toFixed(3)} кг<br/>Монтажных отверстий: {selected.holes}</p>
   <label className="model-editor__opacity">Непрозрачность детали<input aria-label="Непрозрачность выбранной детали" type="range" min="0.1" max="1" step="0.1" value={c.channelFrameAssembly?.pieceOpacities?.[selected.id]??1} onChange={e=>onReplace(setChannelFramePiece(c,selected.id,{opacity:Number(e.target.value)}))}/></label></>}
  <p className="model-editor__source">Положение и поворот задаются для всей сборки. Размеры деталей определяются расчётом рамы.</p>
 </div>;
}
