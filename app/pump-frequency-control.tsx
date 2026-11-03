"use client";
import { useState } from "react";
import type { Pump } from "./pump-catalog";
import { defaultPumpFrequencySettings, frequencyLabel, pumpFrequencyState, type PumpFrequencySettings } from "./pump-frequency";

export function PumpFrequencyControl({ pump, value, onChange }: { pump: Pump; value: PumpFrequencySettings; onChange: (settings: PumpFrequencySettings) => void }) {
  const frequency = pumpFrequencyState(pump,value);
  const [editing,setEditing]=useState<{kind:"nominal"|"frequency";text:string}|null>(null),[error,setError]=useState("");
  const numberField=(kind:"nominal"|"frequency",label:string,current:number)=> <label><span>{label}, Гц</span><input type="number" step="any" min={kind==="nominal"?0.1:frequency.minimumHz} max={kind==="frequency"?frequency.nominalHz:undefined}
    aria-label={kind==="nominal"?"Номинальная частота насоса":"Рабочая частота насоса"} disabled={!value.enabled} value={editing?.kind===kind?editing.text:Number(current.toPrecision(8))}
    onFocus={()=>setEditing({kind,text:String(Number(current.toPrecision(8)))})} onChange={event=>setEditing({kind,text:event.target.value})}
    onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();event.currentTarget.blur();}}}
    onBlur={event=>{
      const hz=event.target.valueAsNumber;
      if(!Number.isFinite(hz)||(kind==="nominal"?hz<0.1:hz<frequency.minimumHz||hz>frequency.nominalHz))setError(kind==="nominal"?"Укажите положительную номинальную частоту. Сохранено прежнее значение.":`Укажите рабочую частоту от ${frequencyLabel(frequency.minimumHz)} до ${frequencyLabel(frequency.nominalHz)} Гц. Сохранено прежнее значение.`);
      else {setError("");onChange({...value,[kind==="nominal"?"nominalHz":"frequencyHz"]:hz});}
      setEditing(null);
    }}/></label>;
  return <details className="pump-chart__settings pump-chart__frequency" data-chart-settings="true"><summary>Частотное регулирование <span>{value.enabled ? `${frequencyLabel(frequency.frequencyHz)} Гц` : "Выключено"}</span></summary>
    <div className="pump-chart__settings-body"><label className="pump-chart__grid-theme"><input type="checkbox" checked={value.enabled} onChange={event=>onChange({...value,enabled:event.target.checked})}/>Учитывать частотное регулирование</label>
      <p>Одинаковая частота для всех рабочих насосов контура. Характеристика системы остаётся прежней.</p>
      <div className="pump-chart__frequency-fields">{numberField("nominal","Номинальная частота",frequency.nominalHz)}{numberField("frequency","Рабочая частота",frequency.frequencyHz)}</div>
      <label className="pump-chart__frequency-range"><span>Частота: {frequencyLabel(frequency.ratio*100)}% от номинальной</span><input type="range" min={1} max={100} step={0.1} value={frequency.ratio*100} aria-label="Частота в процентах от номинальной" disabled={!value.enabled} onChange={event=>onChange({...value,frequencyHz:frequency.nominalHz*event.target.valueAsNumber/100})}/></label>
      <label className="pump-chart__grid-theme"><input type="checkbox" checked={value.showNominal} disabled={!value.enabled} onChange={event=>onChange({...value,showNominal:event.target.checked})}/>Показывать номинальную кривую для сравнения</label>
      {frequency.assumedNominal&&<p>Частота в каталоге не указана: принято 50 Гц. При необходимости измените номинальную частоту.</p>}
      {value.enabled&&<p>Приближённый пересчёт: Q ∝ f, H ∝ f², P ∝ f³; КПД принят по каталогу. Мощность оценена от номинальной, потери двигателя и ПЧ не учтены. Допустимый диапазон работы уточняется по данным производителя.</p>}
      <p>Настройка относится к графику и экспорту. Подбор и спецификация используют номинальные данные.</p>
      {error&&<p role="alert" className="pump-chart__grid-error">{error}</p>}
      <button type="button" className="button" onClick={()=>{setError("");setEditing(null);onChange(defaultPumpFrequencySettings());}}>Сбросить частотное регулирование</button>
    </div>
  </details>;
}
