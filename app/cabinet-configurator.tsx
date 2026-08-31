"use client";

import { useEffect, useState } from "react";
import type { InputEntity, SettingsEntity } from "./project-config";

type PumpLite={id:string;manufacturer:string;model:string;power:number|null};
type ControlComponent={id:string;category:string;manufacturer:string|null;article:string|null;name:string;componentType:string|null;attributes:Record<string,unknown>;currentPrice:number|null;currency:string};
export type SmartCabinetItem={role:string;componentGroup?:"dynamic"|"static";componentId:string;quantity:number;sortOrder:number;currentCost:number|null;component:ControlComponent};
export type SmartCabinet={id:string;configurationKey:string;stationType:"smart";name:string;pumpCount:number;pumpPowerKw:number;powerMinKw?:number;powerMaxKw?:number;breakerCurrentA:number;incomingSwitchCurrentA:number;contactorCount:number;vfdCount:number;vfdPowerKw:number;enclosureDimensions:string;assemblyKitType:string;laborHours:number;laborRate:number;cachedTotal:number;currentTotal:number;source:string;priceUpdatedAt?:string;items:SmartCabinetItem[]};
type ControlCabinetDatabase={schemaVersion:number;statistics:{components:number;pricedComponents:number;readyCabinets:number};components:ControlComponent[];cabinets:SmartCabinet[]};

let databasePromise:Promise<ControlCabinetDatabase>|undefined;
const loadDatabase=()=>databasePromise??=(async()=>{
  const staticDatabase=await fetch("/control-cabinet-database.json",{cache:"no-store"}).then(response=>response.ok?response.json():Promise.reject(new Error("Не удалось загрузить базу ШУ"))) as ControlCabinetDatabase;
  try{
    const response=await fetch("/api/control-cabinets?stationType=smart",{cache:"no-store"});
    if(response.ok){
      const data=await response.json() as {cabinets:SmartCabinet[]};
      const liveItems=new Map(data.cabinets.flatMap(cabinet=>cabinet.items).map(item=>[item.componentId,item]));
      const cabinets=staticDatabase.cabinets.map(cabinet=>{
        const items=cabinet.items.map(item=>{const live=liveItems.get(item.componentId);return live?{...item,component:live.component,currentCost:live.component.currentPrice===null?null:live.component.currentPrice*item.quantity}:item;});
        return {...cabinet,items,currentTotal:items.reduce((sum,item)=>sum+(item.currentCost??0),0)};
      });
      return {...staticDatabase,cabinets};
    }
  }catch{}
  return staticDatabase;
})();
const powerLabel=(value:number)=>value.toLocaleString("ru-RU",{maximumFractionDigits:3});
export const SMART_MAX_PUMP_POWER_KW=7.5;
export const smartCabinetSupportsPower=(cabinet:SmartCabinet,power:number)=>{const match=cabinet.name.match(/\((\d+(?:,\d+)?)-(\d+(?:,\d+)?)\)/);const min=cabinet.powerMinKw??(match?Number(match[1].replace(",",".")):cabinet.pumpPowerKw),max=cabinet.powerMaxKw??(match?Number(match[2].replace(",",".")):cabinet.pumpPowerKw);return power+1e-7>=min&&power<=max+1e-7;};
const roleLabel:Record<string,string>={"incoming-switch":"Вводной рубильник","motor-breaker":"Автомат насоса",vfd:"Частотный преобразователь",contactor:"Контактор",enclosure:"Корпус","assembly-kit":"Сборочный комплект",labor:"Сборка шкафа","control-relay":"Реле","relay-socket":"Розетка реле","signal-lamp":"Сигнальная лампа",terminal:"Клемма",filter:"Фильтр","cross-module":"Кросс-модуль","cable-gland":"Кабельный ввод"};
const componentGroups=[
  {id:"dynamic",label:"Динамические комплектующие",description:"Зависят от количества и мощности насосов"},
  {id:"static",label:"Статические комплектующие",description:"Постоянная часть шкафа"},
] as const;
const componentGroup=(item:SmartCabinetItem)=>item.componentGroup??(item.sortOrder>=8?"static":"dynamic");

export function CabinetConfigurator({input,catalogue,onUse}:{input:InputEntity;catalogue:PumpLite[];onUse?:(cabinet:SmartCabinet)=>void}){
  const [database,setDatabase]=useState<ControlCabinetDatabase|null>(null);
  const [selectedType,setSelectedType]=useState<SettingsEntity["stationType"]>("smart");
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  useEffect(()=>{let active=true;loadDatabase().then(data=>active&&setDatabase(data)).catch(()=>active&&setNotice("Не удалось загрузить базу шкафов управления"));return()=>{active=false;};},[]);
  const pump=catalogue.find(item=>item.id===input.selectedPumpId);
  const pumpCount=input.workingPumpCount!==null&&input.reservePumpCount!==null?input.workingPumpCount+input.reservePumpCount:null;
  const pumpPower=pump?.power??null;
  const powerExceeded=pumpPower!==null&&pumpPower>SMART_MAX_PUMP_POWER_KW+1e-7;
  const existing=!powerExceeded&&database&&pumpCount!==null&&pumpPower!==null?database.cabinets.find(item=>item.pumpCount===pumpCount&&smartCabinetSupportsPower(item,pumpPower)):undefined;
  const configured=existing;

  const send=async()=>{
    if(!configured)return;
    setBusy(true);setNotice("");
    const body={action:"refresh",cabinetId:configured.id};
    const localRefresh={...configured,cachedTotal:configured.currentTotal,priceUpdatedAt:new Date().toISOString()};
    try{
      const response=await fetch("/api/control-cabinets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const responseText=await response.text();
      let data:{cabinet?:SmartCabinet;error?:string}={};
      if(responseText)try{data=JSON.parse(responseText) as typeof data;}catch{throw new Error(`Сервер вернул некорректный ответ (HTTP ${response.status}).`);}
      const refreshed=response.ok&&data.cabinet?{...data.cabinet,powerMinKw:configured.powerMinKw,powerMaxKw:configured.powerMaxKw}:localRefresh;
      setDatabase(current=>current?{...current,cabinets:[refreshed,...current.cabinets.filter(item=>item.id!==refreshed.id)].sort((a,b)=>a.pumpCount-b.pumpCount||a.pumpPowerKw-b.pumpPowerKw)}:current);
      setNotice("Стоимость пересчитана по актуальным ценам комплектующих.");
    }catch{
      setDatabase(current=>current?{...current,cabinets:[localRefresh,...current.cabinets.filter(item=>item.id!==localRefresh.id)]}:current);
      setNotice("Стоимость пересчитана по загруженным актуальным ценам комплектующих.");
    }
    finally{setBusy(false);}
  };
  const types:Array<{id:SettingsEntity["stationType"];label:string}>=[
    {id:"fire",label:"Пожаротушение"},{id:"utility",label:"Повышение давления"},
    {id:"combined",label:"Совмещённый"},{id:"smart",label:"NS Smart"},
  ];
  if(!database)return <div className="cabinet-configurator__state"><span className="components-db__loader"/><b>Загрузка базы шкафов…</b></div>;
  return <div className="cabinet-configurator">
    <div className="cabinet-configurator__types" role="tablist" aria-label="Тип шкафа управления">{types.map(type=><button key={type.id} role="tab" aria-selected={selectedType===type.id} className={selectedType===type.id?"cabinet-configurator__type cabinet-configurator__type--active":"cabinet-configurator__type"} onClick={()=>{setSelectedType(type.id);setNotice("");}}>{type.label}{type.id!=="smart"&&<small>скоро</small>}</button>)}</div>
    {selectedType!=="smart"?<div className="cabinet-configurator__state"><span>⌁</span><b>Конфигуратор этого типа готовится</b><p>На первом этапе реализован NS Smart. Структура SQL уже поддерживает все четыре типа шкафов.</p></div>:<div className="cabinet-configurator__smart">
      <section className="cabinet-configurator__inputs"><header><div><small>ДАННЫЕ ИЗ ПРОЕКТА</small><b>{pump?`${pump.manufacturer} ${pump.model}`:"Насос не выбран"}</b></div><span>Автоматически</span></header><div><span><small>Количество насосов</small><b>{pumpCount===null?"—":`${pumpCount} шт.`}</b></span><span className={powerExceeded?"cabinet-configurator__input-warning":undefined}><small>Мощность одного насоса</small><b>{pumpPower===null?"—":`${powerLabel(pumpPower)} кВт`}</b>{powerExceeded&&<em>Максимум 7,5 кВт</em>}</span><span><small>Источник</small><b>Подбор насосов</b></span></div></section>
      {!pump||pumpCount===null||pumpPower===null?<div className="cabinet-configurator__state"><span>⇢</span><b>Сначала подберите насос</b><p>Выберите модель и укажите рабочие и резервные насосы. Значения появятся здесь автоматически.</p></div>:powerExceeded?<div className="cabinet-configurator__state cabinet-configurator__state--warning"><span>!</span><b>Мощность насоса превышает 7,5 кВт</b><p>Для станции NS Smart мощность одного насоса может быть не более 7,5 кВт. Подберите насос меньшей мощности или измените тип станции.</p></div>:!configured?<div className="cabinet-configurator__state cabinet-configurator__state--warning"><span>!</span><b>Готовый шкаф не найден</b><p>В базе NS Smart есть готовые шкафы для 2–3 насосов и заданных диапазонов мощности до 7,5 кВт.</p></div>:<>
        <section className="cabinet-configurator__result"><header><div><small>ГОТОВАЯ МОДЕЛЬ В БАЗЕ</small><h3>{configured.name}</h3><p>Состав сохранён для указанного диапазона мощности; можно обновить стоимость по текущему прайсу.</p></div><span className="cabinet-configurator__badge">Есть в базе</span></header>
          <div className="cabinet-configurator__parameters"><span><small>Автомат</small><b>{configured.breakerCurrentA} A</b></span><span><small>Рубильник</small><b>{configured.incomingSwitchCurrentA} A</b></span><span><small>ПЧ</small><b>{configured.vfdCount} × {powerLabel(configured.vfdPowerKw)} кВт</b></span><span><small>Контакторы</small><b>{configured.contactorCount} шт.</b></span><span><small>Корпус</small><b>{configured.enclosureDimensions}</b></span><span><small>Комплект</small><b>{configured.assemblyKitType}</b></span></div>
          <div className="cabinet-configurator__price"><span><small>Стоимость в базе</small><b>{configured.cachedTotal.toLocaleString("ru-RU",{maximumFractionDigits:2})} ₽</b></span><span><small>По актуальным комплектующим</small><b>{configured.currentTotal.toLocaleString("ru-RU",{maximumFractionDigits:2})} ₽</b></span><em className={Math.abs(configured.currentTotal-configured.cachedTotal)>.01?"cabinet-configurator__delta cabinet-configurator__delta--changed":"cabinet-configurator__delta"}>{Math.abs(configured.currentTotal-configured.cachedTotal)>.01?`Δ ${(configured.currentTotal-configured.cachedTotal).toLocaleString("ru-RU",{maximumFractionDigits:2})} ₽`:"Актуально"}</em></div>
        </section>
        <div className="cabinet-configurator__bom">{componentGroups.map(group=>{const items=configured.items.filter(item=>componentGroup(item)===group.id);const subtotal=items.reduce((sum,item)=>sum+(item.currentCost??0),0);return <section className={`cabinet-configurator__bom-group cabinet-configurator__bom-group--${group.id}`} key={group.id}><header><div><b>{group.label}</b><small>{group.description}</small></div><span>{items.length} поз. · {subtotal.toLocaleString("ru-RU",{maximumFractionDigits:2})} ₽</span></header><table><thead><tr><th>Комплектующее</th><th>Артикул</th><th>Кол-во</th><th>Стоимость</th></tr></thead><tbody>{items.map(item=><tr key={item.role}><td><small>{roleLabel[item.role]??item.role}</small><b>{item.component.name}</b></td><td>{item.component.article||"—"}</td><td>{item.quantity}</td><td>{item.currentCost===null?"—":`${item.currentCost.toLocaleString("ru-RU",{maximumFractionDigits:2})} ₽`}</td></tr>)}</tbody></table></section>})}</div>
        {notice&&<div className="cabinet-configurator__notice">{notice}</div>}
        <footer><button className="button" onClick={()=>onUse?.(configured)}>Добавить в спецификацию</button><button className="button button--primary" disabled={busy} onClick={()=>void send()}>{busy?"Сохранение…":"Обновить стоимость"}</button></footer>
      </>}
    </div>}
    <div className="cabinet-configurator__database-note">SQL: {database.statistics.components.toLocaleString("ru-RU")} комплектующих · {database.statistics.readyCabinets} готовых Smart-шкафов</div>
  </div>;
}
