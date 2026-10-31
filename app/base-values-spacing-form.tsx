"use client";
import { useMemo, useState } from "react";
import type { SpacingRule } from "./base-values";
import { availableSpacingSeries, createSpacingRule, spacingNominal } from "./base-values-spacing";

const typeNames = {vertical_multistage:"Вертикальный многоступенчатый",inline:"Одноступенчатый inline"};
export function SpacingRuleForm({rules,onAdd,onCancel}:{rules:SpacingRule[];onAdd:(rule:SpacingRule)=>void;onCancel:()=>void}) {
  const available=useMemo(()=>availableSpacingSeries(rules),[rules]);
  const [type,setType]=useState<string>(available[0]?.type??"vertical_multistage"),[manufacturer,setManufacturer]=useState(""),[series,setSeries]=useState(""),[key,setKey]=useState("");
  const [spacing,setSpacing]=useState(""),[radius,setRadius]=useState(""),[source,setSource]=useState(""),[error,setError]=useState("");
  const manufacturers=[...new Set(available.filter(g=>g.type===type).map(g=>g.manufacturer))];
  const seriesNames=[...new Set(available.filter(g=>g.type===type&&g.manufacturer===manufacturer).map(g=>g.series))];
  const sizes=available.filter(g=>g.type===type&&g.manufacturer===manufacturer&&g.series===series);
  const selected=sizes.find(g=>g.key===key);
  return <form className="base-spacing-form" aria-label="Новое правило межосевого расстояния" onSubmit={event=>{
    event.preventDefault();
    try {onAdd(createSpacingRule(key,rules,{spacing:Number(spacing),radius:radius===""?null:Number(radius),source}));}
    catch(reason){setError(reason instanceof Error?reason.message:"Не удалось добавить правило.");}
  }}>
    <h3>Новое правило</h3>
    {!available.length?<p>Для всех серий с заполненным расходом или DN правила уже добавлены. Новые серии появятся после обновления каталога насосов.</p>:<>
      <div className="base-spacing-form__fields">
        <label>Тип насоса<select value={type} onChange={e=>{setType(e.target.value);setManufacturer("");setSeries("");setKey("");setRadius("");setSource("");setError("");}}>{Object.entries(typeNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Производитель<select required value={manufacturer} onChange={e=>{setManufacturer(e.target.value);setSeries("");setKey("");setRadius("");setSource("");setError("");}}><option value="">Выберите производителя</option>{manufacturers.map(value=><option key={value}>{value}</option>)}</select></label>
        <label>Серия<select required disabled={!manufacturer} value={series} onChange={e=>{setSeries(e.target.value);setKey("");setRadius("");setSource("");setError("");}}><option value="">Выберите серию</option>{seriesNames.map(value=><option key={value}>{value}</option>)}</select></label>
        <label>{type==="inline"?"Диаметр патрубков":"Номинальный расход"}<select required disabled={!series} value={key} onChange={e=>{setKey(e.target.value);setRadius("");setSource("");setError("");}}><option value="">Выберите размер</option>{sizes.map(g=><option key={g.key} value={g.key}>{spacingNominal(g)}</option>)}</select></label>
        <label>Межосевое расстояние, мм<input required type="number" min={400} step={50} value={spacing} onChange={e=>{setSpacing(e.target.value);setError("");}} placeholder="Например, 600"/></label>
      </div>
      {!manufacturers.length&&<p>Для этого типа насосов нет новых серий без правил.</p>}
      <details><summary>Подтверждение размеров</summary><p>Укажите максимальный вылет корпуса, двигателя и клеммной коробки от оси в сторону соседнего насоса для всех выбранных моделей. Зазор между насосами — не менее 150 мм.</p><div className="base-spacing-form__fields">
        <label>Максимальный вылет от оси, мм<input type="number" min={0.01} step="any" value={radius} onChange={e=>{setRadius(e.target.value);setError("");}}/></label>
        <label>Источник размеров<input type="text" value={source} onChange={e=>{setSource(e.target.value);setError("");}} placeholder="Каталог, чертёж, страница"/></label>
      </div></details>
      <p>{selected?`Будет привязано моделей: ${selected.modelIds.length}. `:""}Без подтверждения габаритов правило сохраняется как требующее проверки.</p>
    </>}
    {error&&<p role="alert" className="base-error">{error}</p>}
    <div className="base-toolbar">{available.length>0&&<button className="button button--primary" disabled={!selected} type="submit">Добавить в черновик</button>}<button className="button" type="button" onClick={onCancel}>Отмена</button></div>
  </form>;
}
