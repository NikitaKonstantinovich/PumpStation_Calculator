"use client";
import { useState } from "react";
import {
  COLLECTOR_COMBINATIONS, collectorCombinationConversionIssue, collectorCombinationKey,
  collectorCombinationLabel, collectorCombinationSettings, DEFAULT_COLLECTOR_NIPPLES,
  describeNippleOutputs, newNippleOutput, SUPPORTED_NIPPLE_DNS,
  type CollectorCombination, type CollectorNippleConfiguration, type CollectorNippleSettings,
} from "./collector-nipple-rules";

export function CollectorSettingsEditor({value,onChange}:{value?:CollectorNippleConfiguration;onChange:(value:CollectorNippleSettings)=>void}) {
  const [selected,setSelected]=useState<CollectorCombination>({side:"suction",circuits:1,material:"aisi304"});
  const config=collectorCombinationSettings(value),key=collectorCombinationKey(selected);
  const combination=config.combinations.find(c=>collectorCombinationKey(c)===key)!;
  const conversionIssue=collectorCombinationConversionIssue(value);
  const edit=(change:(next:typeof combination)=>void)=>{
    const next=collectorCombinationSettings(value);
    change(next.combinations.find(c=>collectorCombinationKey(c)===key)!);
    onChange(next);
  };
  return <section className="base-nipple-editor">
    <h2>Настройки коллекторов</h2>
    <p>Выберите тип коллектора, количество контуров и материал. У каждой из восьми комбинаций свой состав сгонов. Изменения относятся только к выбранной комбинации.</p>
    {conversionIssue?<div className="base-error" role="alert"><p>{conversionIssue}</p><button className="button" onClick={()=>onChange(collectorCombinationSettings(DEFAULT_COLLECTOR_NIPPLES))}>Перейти к начальной схеме для 8 комбинаций</button></div>:<>
      <div className="base-collector-selectors">
        <label>Тип коллектора<select aria-label="Тип коллектора" value={selected.side} onChange={e=>setSelected({...selected,side:e.target.value as CollectorCombination["side"]})}><option value="suction">Всасывающий</option><option value="discharge">Напорный</option></select></label>
        <label>Количество контуров<select aria-label="Количество контуров коллектора" value={selected.circuits} onChange={e=>setSelected({...selected,circuits:Number(e.target.value) as 1|2})}><option value={1}>1 контур</option><option value={2}>2 контура</option></select></label>
        <label>Материал<select aria-label="Материал коллектора" value={selected.material} onChange={e=>setSelected({...selected,material:e.target.value as CollectorCombination["material"]})}><option value="aisi304">AISI304</option><option value="st20">Ст20</option></select></label>
      </div>
      <section className="base-collector-settings" aria-label="Параметры выбранного коллектора">
        <h3>{collectorCombinationLabel(selected)}</h3>
        <h4>Сгоны</h4>
        <p>Полная длина — длина заготовки. Можно добавить несколько типоразмеров, всего до 32 сгонов. Пустой состав означает коллектор без сгонов.</p>
        <div className="base-table-scroll"><table className="base-table"><thead><tr><th>DN сгона</th><th>Количество, шт.</th><th>Полная длина, мм</th><th>Назначение</th><th>Состояние</th><th>Наружная резьба</th><th>Действие</th></tr></thead><tbody>{combination.outputs.map((output,index)=><tr key={key+"-"+output.id}>
          <td><select aria-label={`DN сгона ${index+1}`} value={output.dn} onChange={e=>edit(c=>{c.outputs[index].dn=Number(e.target.value);})}>{SUPPORTED_NIPPLE_DNS.map(dn=><option key={dn} value={dn}>DN{dn}</option>)}</select></td>
          <td><input aria-label={`Количество сгона ${index+1}`} type="number" min={0} max={32} step={1} value={output.quantity} onChange={e=>edit(c=>{c.outputs[index].quantity=Number(e.target.value);})}/></td>
          <td><input aria-label={`Длина сгона ${index+1}`} type="number" min={.1} max={1000} step="any" value={output.lengthMm} onChange={e=>edit(c=>{c.outputs[index].lengthMm=Number(e.target.value);})}/></td>
          <td><select aria-label={`Назначение сгона ${index+1}`} value={output.purpose} onChange={e=>edit(c=>{c.outputs[index].purpose=e.target.value as typeof output.purpose;})}><option value="instrument">Приборы КИП</option><option value="tank">Мембранный бак</option><option value="reserve">Резервный отвод</option></select></td>
          <td><select aria-label={`Состояние сгона ${index+1}`} value={output.state} onChange={e=>edit(c=>{c.outputs[index].state=e.target.value as typeof output.state;})}><option value="auto">По оборудованию</option><option value="occupied">Занят оборудованием</option><option value="capped">С заглушкой</option><option value="open">Открытый</option></select></td>
          <td><label><input aria-label={`Резьба сгона ${index+1}`} type="checkbox" checked={output.threaded} onChange={e=>edit(c=>{c.outputs[index].threaded=e.target.checked;})}/>Есть резьба</label>{output.threaded&&<details><summary>Параметры резьбы</summary>{(["threadPitchMm","threadLengthMm"] as const).map((field,i)=><label key={field}>{i?"Длина участка, мм":"Шаг, мм"}<input aria-label={`${i?"Длина резьбы":"Шаг резьбы"} сгона ${index+1}`} type="number" min={.1} step="any" max={i?1000:10} placeholder="Автоматически" value={output[field]??""} onChange={e=>edit(c=>{c.outputs[index][field]=e.target.value?Number(e.target.value):null;})}/></label>)}</details>}</td>
          <td><button className="button" aria-label={`Удалить сгон ${index+1}`} onClick={()=>edit(c=>{c.outputs.splice(index,1);})}>Удалить сгон</button></td>
        </tr>)}</tbody></table></div>
        {!combination.outputs.length&&<p>Этот коллектор будет без сгонов.</p>}
        <div className="base-collector-actions"><button className="button" onClick={()=>edit(c=>{c.outputs.push(newNippleOutput("outlet-"+crypto.randomUUID()));})}>Добавить сгон</button><button className="button" onClick={()=>edit(c=>{c.outputs=collectorCombinationSettings(DEFAULT_COLLECTOR_NIPPLES).combinations.find(defaults=>collectorCombinationKey(defaults)===key)!.outputs;})}>Восстановить эту комбинацию</button></div>
      </section>
      <h3>Все комбинации</h3>
      <div className="base-table-scroll base-collector-combinations"><table className="base-table"><thead><tr><th>Тип коллектора</th><th>Контуры</th><th>Материал</th><th>Настройки сгонов</th><th>Действие</th></tr></thead><tbody>{COLLECTOR_COMBINATIONS.map(c=>{
        const entry=config.combinations.find(row=>collectorCombinationKey(row)===collectorCombinationKey(c))!;
        return <tr key={collectorCombinationKey(c)} aria-current={collectorCombinationKey(c)===key?"true":undefined}><td>{c.side==="suction"?"Всасывающий":"Напорный"}</td><td>{c.circuits}</td><td>{c.material==="aisi304"?"AISI304":"Ст20"}</td><td>{describeNippleOutputs(entry.outputs)}</td><td><button className="button" aria-label={`Настроить: ${collectorCombinationLabel(c)}`} onClick={()=>setSelected({...c})}>Настроить</button></td></tr>;
      })}</tbody></table></div>
      <p>Изменения применяются после публикации базовых значений и обновления раздела комплектующих в проекте. Один состав используется в расчёте, спецификации, стоимости и 3D. Несовместимые подключения показываются как ошибки.</p>
    </>}
  </section>;
}
