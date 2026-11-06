"use client";
import { MAX_WORKING_PUMPS } from "./pump-counts";

import { paintingItemForBase } from "./base-values";
import { pressureTransducerCatalog } from "./pressure-transducers";
import { useEffect, useMemo, useRef, useState } from "react";
import type { InputEntity, SettingsEntity } from "./project-config";
import { CircuitInputFields } from "./circuit-input-fields";
import { jpegToPdf } from "./pdf-export";
import { IssueNotice, IssueMessages, useRuntimeDiagnostic, useStoredDiagnostic } from "./diagnostics-ui";
import { type Pump, usablePump, interpolateCurve, operatingPoint, cataloguePriceRub, catalogueDiscount, cataloguePurchasePriceRub } from "./pump-catalog";
import { buildPumpSelection, headReserveClass, type PumpSortMode } from "./pump-selection";
import { EMPTY_PUMP_FILTERS, pumpTypeLabel as typeLabel, type PumpFilterValues } from "./pump-filters";
import { PumpFilterFields } from "./pump-filter-fields";
import { chartAxisScale, defaultChartGridSettings } from "./pump-chart-grid";
import { PumpChartGridSettings } from "./pump-chart-grid-settings";
import { PumpChartPlot } from "./pump-chart-plot";
import { PumpFrequencyControl } from "./pump-frequency-control";
import { defaultPumpFrequencySettings, frequencyAdjustedPump, frequencyLabel, pumpFrequencyState, type PumpFrequencySettings } from "./pump-frequency";
import { CURVE_METHODS, curveSegments, curveMaxHead, type CurveMethod } from "./curve-methods";
import { pumpSketchFor, type PumpSketchInfo } from "./pump-sketches";
import { PumpCard } from "./pump-card";
import { suctionCatalogItems } from "./suction-catalog";
import { isLegacyNomenclature, LEGACY_NOMENCLATURE_CATALOG_ID, LEGACY_NOMENCLATURE_LABEL, routeNomenclature } from "./component-nomenclature";
import { makeCollectorCatalog, type BindingCatalog } from "./collector-catalog";
import {isCalculated,type CalculatedInput} from "./calculated-input";
export {isCalculated,type CalculatedInput} from "./calculated-input";
const pumpListPriceRub = cataloguePriceRub;
const pumpDiscountPercent = catalogueDiscount;
export const pumpPriceRub = cataloguePurchasePriceRub;
const signedPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;



const actualOperatingPoint = operatingPoint;
const systemCurveSegments=(pump:Pump,count:number,input:CalculatedInput,maxQ:number,maxH:number,method:CurveMethod="pchip",minQ=0,minH=0)=>{const k=(input.head-input.staticHead)/(input.flowRate**2),samples=Array.from({length:121},(_,index)=>{const q=minQ+(maxQ-minQ)*index/120,h=input.staticHead+k*q*q,pumpH=interpolateCurve(pump.curve,q/count,method);return {q,h,above:pumpH===null||h>pumpH};}),xy=(point:{q:number;h:number})=>`${45+(point.q-minQ)/(maxQ-minQ)*435} ${210-(point.h-minH)/(maxH-minH)*190}`;let solid="",dashed="",previousAbove=samples[0].above;for(let i=0;i<samples.length;i++){const point=samples[i],target=point.above?"dashed":"solid",command=i===0||point.above!==previousAbove?"M":"L",piece=`${command}${xy(point)}`;if(target==="solid")solid+=piece;else dashed+=piece;if(i>0&&point.above!==previousAbove){const previous=samples[i-1],bridge=`M${xy(previous)} L${xy(point)}`;if(point.above)dashed=bridge+dashed;else solid=bridge+solid;}previousAbove=point.above;}return {solid,dashed};};
type ChartExportFormat = "png" | "jpeg" | "pdf";
export const downloadBlob=(blob:Blob,filename:string)=>{const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=filename;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);};
const canvasToBlob=(canvas:HTMLCanvasElement,type:string,quality?:number)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Не удалось подготовить изображение")),type,quality));
const jpegCanvasToPdf=async(canvas:HTMLCanvasElement)=>jpegToPdf(new Uint8Array(await (await canvasToBlob(canvas,"image/jpeg",.95)).arrayBuffer()),canvas.width,canvas.height);
const exportChart=async(button:HTMLButtonElement,format:ChartExportFormat,filename:string)=>{const chart=button.closest(".pump-chart"),source=chart?.querySelector("svg");if(!(source instanceof SVGSVGElement))return;const points=[...chart!.querySelectorAll(".pump-chart__points span")].map(item=>[...item.childNodes].map(node=>node.textContent?.trim()).filter(Boolean).join(" ")).filter(Boolean).join("   ·   "),metrics=[...chart!.querySelectorAll(".pump-chart__metrics span")].map(item=>[...item.childNodes].map(node=>node.textContent?.trim()).filter(Boolean).join(" ")).filter(Boolean).join("   ·   ");const methodLabel=chart?.getAttribute("data-curve-label")??"PCHIP — через точки";const canvas=document.createElement("canvas");canvas.width=1500;canvas.height=1000;const context=canvas.getContext("2d");if(!context)return;context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);context.fillStyle="#203744";context.font="600 36px Segoe UI, Arial";context.fillText("Гидравлическая характеристика",75,72);context.fillStyle="#637582";context.font="24px Segoe UI, Arial";context.fillText([...chart!.querySelectorAll(".pump-chart__legend span")].map(item=>item.textContent?.trim()).filter(Boolean).join(" · "),75,115);const clone=source.cloneNode(true) as SVGSVGElement;clone.setAttribute("xmlns","http://www.w3.org/2000/svg");clone.setAttribute("width","1350");clone.setAttribute("height","648");clone.querySelectorAll("circle").forEach(circle=>circle.setAttribute("r",circle.classList.contains("pump-chart__actual-halo")?"5.2":"2.8"));const style=document.createElementNS("http://www.w3.org/2000/svg","style");style.textContent=".pump-chart__grid{fill:none;stroke:#e4e9ec;stroke-width:1}.pump-chart__line{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.pump-chart__line--blue{stroke:#1976bd}.pump-chart__line--orange{stroke:#e78732}.pump-chart__line--nominal{stroke:#8b98a4;stroke-width:2;stroke-dasharray:6 5}.pump-chart__line--muted{opacity:.24;stroke-width:2}.pump-chart__line--unavailable{opacity:.35;stroke-dasharray:7 6;stroke-width:2}.pump-chart__ticks text{fill:#71808b;font-size:9px;font-family:Segoe UI,Arial}.pump-chart__marker--requested{fill:#fff;stroke:#e78732;stroke-width:1.2}.pump-chart__marker--actual{fill:#1976bd;stroke:#fff;stroke-width:1.2}.pump-chart__actual-halo{fill:rgba(25,118,189,.14);stroke:#1976bd;stroke-width:.5}";clone.prepend(style);const svgBlob=new Blob([new XMLSerializer().serializeToString(clone)],{type:"image/svg+xml;charset=utf-8"}),url=URL.createObjectURL(svgBlob),image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("Не удалось отрисовать график"));image.src=url;});context.drawImage(image,75,155,1350,648);URL.revokeObjectURL(url);context.fillStyle="#6d7e8a";context.font="22px Segoe UI, Arial";context.fillText("H, м",75,150);context.fillText("Q, м³/ч",1325,840);context.fillStyle="#344b5a";context.font="600 22px Segoe UI, Arial";context.fillText(points,75,875);context.font="600 24px Segoe UI, Arial";context.fillText(metrics,75,930);context.fillStyle="#637582";context.font="20px Segoe UI, Arial";context.fillText(`Способ построения: ${methodLabel}`,75,975);if(format==="pdf")downloadBlob(await jpegCanvasToPdf(canvas),`${filename}.pdf`);else downloadBlob(await canvasToBlob(canvas,format==="png"?"image/png":"image/jpeg",.95),`${filename}.${format==="jpeg"?"jpg":"png"}`);};

function PumpSelector({ tool, input, settings, catalogue, onInputChange, onAddToSpec, automaticSpecification = false }: { automaticSpecification?: boolean; tool:"input"|"input2"; input: InputEntity; settings:SettingsEntity; catalogue:Pump[]; onInputChange?: (patch: Partial<InputEntity>) => void; onAddToSpec?:()=>void }) {
  const [filters,setFilters]=useState<PumpFilterValues>(EMPTY_PUMP_FILTERS),[sort,setSort]=useState<PumpSortMode>("distance");
  const calculated=isCalculated(input)?input:null;
  const filterRows=useMemo(()=>catalogue.filter(p=>usablePump(p,input.medium)),[catalogue,input.medium]);
  const pumps=useMemo(()=>calculated?buildPumpSelection(catalogue,calculated,settings,filters,sort).candidates:[],[catalogue,calculated,settings,filters,sort]);
  const resultsRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const results=resultsRef.current;
    if(!results)return;
    const head=results.querySelector<HTMLElement>(".pump-results__head");
    const rows=Array.from(results.querySelectorAll<HTMLElement>(".pump-results__row")).slice(0,3);
    const measure=()=>{
      // Rows can wrap or contain warnings. Reserve room for three actual rows,
      // including the sticky heading, borders and horizontal scrollbar.
      const height=Math.max(264,(head?.offsetHeight??0)+rows.reduce((sum,row)=>sum+row.offsetHeight,0)+results.offsetHeight-results.clientHeight);
      const value=`${height}px`;
      if(results.style.getPropertyValue("--pump-results-min-height")!==value)results.style.setProperty("--pump-results-min-height",value);
    };
    const observer=new ResizeObserver(measure);
    observer.observe(results);
    if(head)observer.observe(head);
    rows.forEach(row=>observer.observe(row));
    measure();
    return ()=>observer.disconnect();
  },[pumps]);
  useRuntimeDiagnostic(tool,"results",calculated&&!pumps.length?"Подходящие насосы в рабочем диапазоне не найдены":"", "warning");
  const calculate=()=>{
    const {flowRate:flow,head,workingPumpCount:working,reservePumpCount:reserve}=input,staticHead=input.staticHead??0;
    if(!(flow!==null&&flow>0&&head!==null&&head>0&&staticHead!==null&&staticHead>=0&&staticHead<=head&&working!==null&&Number.isInteger(working)&&working>0&&working<=MAX_WORKING_PUMPS&&reserve!==null&&Number.isInteger(reserve)&&reserve>=0&&reserve<=3)){
      window.alert("Заполните поля корректно. Статический напор должен быть от 0 до общего напора.");return;
    }
    const next:CalculatedInput={...input,flowRate:flow,head,staticHead,workingPumpCount:working,reservePumpCount:reserve,calculated:true};
    const {selectedPumpId}=buildPumpSelection(catalogue,next,settings,filters,sort);
    onInputChange?.({...next,selectedPumpId,selectedPumpModel:undefined});
  };
  return <div className="pump-selector"><CircuitInputFields issueTool={tool} input={input} onChange={patch=>{if(patch.medium)setFilters(EMPTY_PUMP_FILTERS);onInputChange?.(patch);}}/>
  <div className="pump-selector__actions"><button className="button button--primary" onClick={calculate}>Подобрать оборудование</button><button className="button button--spec" disabled={!onAddToSpec||!input.selectedPumpId} title={!onAddToSpec?"Недоступно в beta 0.1":undefined} onClick={onAddToSpec}>{automaticSpecification ? "Обновить спецификацию" : "Записать в спецификацию"}</button></div>
  {automaticSpecification && <p className="collector-note">Выбранный насос и количество автоматически обновляют спецификацию.</p>}
  <IssueNotice id={`${tool}/database`}/><IssueMessages tool={tool} prefix={`${tool}/selection/`}/>
  {calculated&&<>
    <div className="pump-selector__toolbar">
      <PumpFilterFields rows={filterRows} value={filters} onChange={setFilters}/>
      <select aria-label="Сортировка насосов" value={sort} onChange={e=>setSort(e.target.value as PumpSortMode)}><option value="distance">По рабочей точке</option><option value="price">По цене</option></select>
    </div>
    <p className="pump-selector__sort-note">{sort==="price"?"Сначала ΔQ и ΔH от −2% до +15%, затем цена":"Ближе к заданной точке по относительным отклонениям расхода и напора"}. Фактическая точка — PCHIP, расход станции.</p>
    <div ref={resultsRef} className="pump-results">
      <div className="pump-results__head"><span>Насос</span><span>Фактические Q / H<br/>расход станции</span><span>ΔQ / ΔH</span><span>Запас напора при заданном расходе</span><span>Прайсовая цена</span><span>Цена со скидкой</span></div>
      {pumps.map(candidate=>{
        const {pump,point,pointIssue,headReservePercent:reserve,purchasePriceRub:discountedPrice}=candidate;
        const listPrice=pumpListPriceRub(pump,settings),discount=pumpDiscountPercent(pump,settings);
        return <button key={pump.id} className={`pump-results__row pump-results__row--${headReserveClass(reserve)} ${input.selectedPumpId===pump.id?"pump-results__row--selected":""}`} onClick={()=>onInputChange?.({selectedPumpId:pump.id})}>
          <span><b>{pump.manufacturer} {pump.model}</b><small>{typeLabel(pump.type)} · {pump.series}</small>{candidate.preferredByOperatingPoint&&<small className="pump-results__priority">ΔQ и ΔH в диапазоне −2…+15%</small>}{pointIssue&&<small className="pump-data-warning">{pointIssue}</small>}{pump.dataWarnings?.map(warning=><small key={warning} className="pump-data-warning">{warning}</small>)}</span>
          <span>{point?<>{point.flow.toFixed(1)} м³/ч<br/>{point.head.toFixed(1)} м</>:"Оценка недоступна"}</span>
          <span>{point?<>ΔQ {signedPercent(point.deltaQPercent)}<br/>ΔH {signedPercent(point.deltaHPercent)}</>:"—"}</span>
          <span>{signedPercent(reserve)}<small>H при Qзад/нас.: {candidate.headAtRequestedFlow.toFixed(1)} м</small></span>
          <span>{listPrice===null||!Number.isFinite(listPrice)||pump.priceKind==="net"?"—":`${listPrice.toLocaleString("ru-RU",{maximumFractionDigits:2})} ₽`}</span>
          <span className="pump-results__discount-price">{discountedPrice===null?"—":<><b>{discountedPrice.toLocaleString("ru-RU",{maximumFractionDigits:2})} ₽</b><small>{pump.priceKind==="net"?"Готовая цена источника":`−${discount.toLocaleString("ru-RU",{maximumFractionDigits:2})}%`}</small></>}</span>
        </button>;
      })}
      {!pumps.length&&<div data-issue-id={`${tool}/results`} className="pump-results__empty">Подходящие насосы в рабочем диапазоне не найдены</div>}
    </div>
  </>}
  </div>;
}

function PumpSketchView({ pump, sketch, tool }: { pump:Pump; sketch:PumpSketchInfo; tool:"sketch"|"sketch2" }) {
  const [zoom,setZoom]=useState(100),[imageError,setImageError]=useState(false),zoomRef=useRef(100),canvasRef=useRef<HTMLDivElement>(null);
  useRuntimeDiagnostic(tool,"drawing-load",imageError?"Не удалось загрузить чертёж. Попробуйте открыть изображение по ссылке выше.":"");
  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    const onWheel=(event:WheelEvent)=>{
      if(!event.ctrlKey)return;
      event.preventDefault();
      const previous=zoomRef.current,next=Math.max(50,Math.min(400,previous+(event.deltaY<0?10:-10)));
      if(next===previous)return;
      const bounds=canvas.getBoundingClientRect(),pointerX=event.clientX-bounds.left,pointerY=event.clientY-bounds.top,previousExtent=Math.max(100,previous)/100,nextExtent=Math.max(100,next)/100;
      zoomRef.current=next;setZoom(next);
      requestAnimationFrame(()=>{const ratio=nextExtent/previousExtent;canvas.scrollLeft=(canvas.scrollLeft+pointerX)*ratio-pointerX;canvas.scrollTop=(canvas.scrollTop+pointerY)*ratio-pointerY;});
    };
    canvas.addEventListener("wheel",onWheel,{passive:false});
    return ()=>canvas.removeEventListener("wheel",onWheel);
  },[]);
  const extent=Math.max(100,zoom),imageSize=zoom/extent*100;
  // Original engineering drawings retain their intrinsic dimensions and pixels during zoom.
  // eslint-disable-next-line @next/next/no-img-element
  return <figure className="pump-sketch"><div className="pump-sketch__meta"><span><small>ВЫБРАННЫЙ АГРЕГАТ</small><b>{pump.manufacturer} {pump.model}</b></span><div className="pump-sketch__actions"><span>Ctrl + колесо · {zoom}%</span><a href={sketch.src} download={`${pump.manufacturer}-${pump.model.replace(/[^a-zа-я0-9]+/gi,"-")}.${sketch.src.match(/\.(png|jpe?g|webp)(?:\?|$)/i)?.[1]??"png"}`}>Скачать изображение</a></div></div><div ref={canvasRef} className="pump-sketch__canvas" aria-label="Габаритный чертёж. Для изменения масштаба удерживайте Ctrl и вращайте колесо мыши">{imageError&&<p data-issue-id={`${tool}/drawing-load`} role="alert" className="pump-sketch__error">Не удалось загрузить чертёж. Попробуйте открыть изображение по ссылке выше.</p>}<div className="pump-sketch__zoom-surface" style={{width:`${extent}%`,height:`${extent}%`,display:imageError?"none":undefined}}><img src={sketch.src} onError={()=>setImageError(true)} hidden={imageError} style={{width:`${imageSize}%`,height:`${imageSize}%`}} alt={`Габаритный чертёж насосного агрегата ${pump.manufacturer} ${pump.model}`}/></div></div><figcaption><span>{sketch.caption}</span><span>Источник: {sketch.source}</span></figcaption></figure>;
}

import type { ComponentItem, ComponentGroupId, ComponentCatalog, ComponentsDatabase } from "./component-database-types";
export type { ComponentPrice, ComponentItem, ComponentsDatabase } from "./component-database-types";
type RawBindingDatabase=BindingCatalog & {catalogs:Array<{id:string;name:string}>;items:ComponentItem[];statistics:{componentRows:number;pricedComponentRows:number}};
type RawControlDatabase={components:Array<{id:string;category:string;manufacturer:string|null;article:string|null;name:string;componentType:string|null;attributes:Record<string,unknown>;currentPrice:number|null;currency:string}>;statistics:{components:number;pricedComponents:number}};
const COMPONENT_GROUPS:Array<{id:ComponentGroupId;name:string}>=[{id:"hydraulic",name:"Сборочный комплект гидравлики"},{id:"control",name:"Комплектующие ШУ"},{id:"metal",name:"Металлоконструкция и рама"},{id:"services",name:"Работы и услуги"}];
const METAL_CATALOGS=new Set(["металл","метизы","опоры","кронштейны","рама"]);
const bindingGroupFor=(catalogId:string):ComponentGroupId=>catalogId==="работы"?"services":METAL_CATALOGS.has(catalogId)?"metal":"hydraulic";
let componentsDatabasePromise:Promise<ComponentsDatabase>|undefined;
export let loadedComponentsDatabase:ComponentsDatabase|undefined;
export const loadComponentsDatabase=(reload=false)=>{
  if(reload)componentsDatabasePromise=undefined;
  return componentsDatabasePromise??=Promise.all([
  fetch("/binding-components.json",{cache:"no-store"}).then(response=>response.ok?response.json():Promise.reject(new Error("Не удалось загрузить базу гидравлики"))) as Promise<RawBindingDatabase>,
  fetch("/control-cabinet-database.json",{cache:"no-store"}).then(response=>response.ok?response.json():Promise.reject(new Error("Не удалось загрузить комплектующие ШУ"))) as Promise<RawControlDatabase>,
  fetch("/api/components",{cache:"no-store"}).then(async response=>{const result=await response.json() as {items?:ComponentItem[];error?:string};if(!response.ok)throw new Error(result.error??"Не удалось загрузить сохранённые вставки");return result.items??[];}),
]).then(([binding,control,savedInsertions])=>{
  const categories=[...new Set(control.components.map(item=>item.category))].sort((a,b)=>a.localeCompare(b,"ru"));
  const controlCatalogs:ComponentCatalog[]=categories.map(category=>({id:`control:${category}`,name:category.replaceAll("_"," "),groupId:category==="Работы"?"services":"control"}));
  const controlItems:ComponentItem[]=control.components.map(item=>({id:item.id,catalogId:`control:${item.category}`,family:item.name,fields:[{column:"manufacturer",headerPath:["Производитель"],value:item.manufacturer},{column:"article",headerPath:["Артикул"],value:item.article},{column:"componentType",headerPath:["Тип"],value:item.componentType},...Object.entries(item.attributes).map(([key,value])=>({column:key,headerPath:[key],value}))],prices:typeof item.currentPrice==="number"&&item.currentPrice>0?[{label:"Актуальная цена",amount:item.currentPrice,currency:item.currency}]:[]}));
  const items=pressureTransducerCatalog([...binding.items,...suctionCatalogItems,...savedInsertions,...controlItems]).map(routeNomenclature);
  return loadedComponentsDatabase={collectorCatalog:makeCollectorCatalog(binding),catalogs:[...binding.catalogs.map(catalog=>({...catalog,groupId:bindingGroupFor(catalog.id)})),{id:"ответные-части",name:"Ответные части и американки",groupId:"hydraulic"},{id:LEGACY_NOMENCLATURE_CATALOG_ID,name:LEGACY_NOMENCLATURE_LABEL,groupId:"hydraulic"},...controlCatalogs],items,statistics:{componentRows:items.length,pricedComponentRows:items.filter(item=>item.prices.length).length}};
}).catch(error=>{componentsDatabasePromise=undefined;throw error;});
};
import {componentFieldLabel} from "./component-database-types";
export {componentFieldLabel} from "./component-database-types";
export const componentValue=(value:unknown)=>typeof value==="number"?value.toLocaleString("ru-RU",{maximumFractionDigits:3}):typeof value==="string"&&value.trim()?value:"—";

function ComponentsDatabaseView({settings}:{settings:SettingsEntity}){
  const [sourceDatabase,setDatabase]=useState<ComponentsDatabase|null>(null),[groupId,setGroupId]=useState<ComponentGroupId>("hydraulic"),[catalogId,setCatalogId]=useState(""),[query,setQuery]=useState(""),[error,setError]=useState("");
  const database=useMemo(()=>sourceDatabase?{...sourceDatabase,items:sourceDatabase.items.map(item=>paintingItemForBase(item,settings.baseValues))}:null,[sourceDatabase,settings.baseValues]);
  useRuntimeDiagnostic("components","database",error, "error", Boolean(database||error));
  useEffect(()=>{let active=true;loadComponentsDatabase().then(data=>{if(!active)return;setDatabase(data);setCatalogId(current=>current||data.catalogs.find(item=>item.groupId==="hydraulic")?.id||data.catalogs[0]?.id||"");}).catch(reason=>active&&setError(reason instanceof Error?reason.message:"Не удалось загрузить базу комплектующих"));return()=>{active=false;};},[]);
  const catalogs=useMemo(()=>database?.catalogs.filter(item=>item.groupId===groupId)??[],[database,groupId]);
  const selectedId=catalogs.some(item=>item.id===catalogId)?catalogId:catalogs[0]?.id||"",catalog=database?.catalogs.find(item=>item.id===selectedId),items=useMemo(()=>database?.items.filter(item=>item.catalogId===selectedId)??[],[database,selectedId]);
  const columns=useMemo(()=>{const counts=new Map<string,number>();for(const item of items){const labels=new Set(item.fields.map(componentFieldLabel).filter(label=>label&&!/цен|стоимост|ссылк|url/i.test(label)));for(const label of labels)counts.set(label,(counts.get(label)??0)+1);}const priority=(label:string)=>[/^(наименование|название)$/i,/^dn$/i,/^pn$|давлен/i,/диаметр/i,/материал|марка/i,/размер|резьб/i,/толщин|длин|высот|ширин/i,/масс|вес/i].findIndex(pattern=>pattern.test(label));return [...counts].sort((a,b)=>{const pa=priority(a[0]),pb=priority(b[0]),sa=(pa<0?0:10000-pa*500)+a[1],sb=(pb<0?0:10000-pb*500)+b[1];return sb-sa||a[0].localeCompare(b[0],"ru");}).slice(0,6).map(([label])=>label);},[items]);
  const filtered=useMemo(()=>{const needle=query.trim().toLocaleLowerCase("ru-RU");if(!needle)return items;return items.filter(item=>`${item.family} ${item.fields.map(field=>componentValue(field.value)).join(" ")} ${item.prices.map(price=>price.amount).join(" ")}`.toLocaleLowerCase("ru-RU").includes(needle));},[items,query]);
  const price=(item:ComponentItem)=>item.prices.length?item.prices.map(entry=><span key={`${entry.label}-${entry.amount}`} title={entry.label}>{entry.amount.toLocaleString("ru-RU",{maximumFractionDigits:2})} ₽{item.catalogId==="работы"&&item.fields.some(field=>field.column==="PRICE_UNIT"&&field.value==="м")?"/м":""}</span>):<i>—</i>;
  if(error)return <div data-issue-id="components/database" className="components-db__state components-db__state--error"><b>База недоступна</b><span>{error}</span></div>;
  if(!database)return <div className="components-db__state"><span className="components-db__loader"/><b>Загрузка базы комплектующих…</b></div>;
  return <div className="components-db"><div className="components-db__filters"><label><span>Группа комплектующих</span><select value={groupId} onChange={event=>{const next=event.target.value as ComponentGroupId;setGroupId(next);setCatalogId(database.catalogs.find(item=>item.groupId===next)?.id||"");setQuery("");}}>{COMPONENT_GROUPS.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Тип комплектующего</span><select value={selectedId} onChange={event=>{setCatalogId(event.target.value);setQuery("");}}>{catalogs.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Поиск в выбранном типе</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="DN, артикул, наименование…"/></label><div className="components-db__count"><b>{filtered.length.toLocaleString("ru-RU")}</b><span>позиций</span></div></div><div className="components-db__table-wrap"><table className="components-db__table"><thead><tr><th>Исполнение</th>{columns.map(column=><th key={column}>{column}</th>)}<th className="components-db__price-head">Цена</th></tr></thead><tbody>{filtered.map(item=><tr key={item.id}><td title={item.family}><b>{item.family}</b>{isLegacyNomenclature(item)&&<small className="components-db__legacy">{LEGACY_NOMENCLATURE_LABEL}</small>}</td>{columns.map(column=>{const field=item.fields.find(candidate=>componentFieldLabel(candidate)===column);return <td key={column}>{field?componentValue(field.value):"—"}</td>;})}<td className="components-db__price">{price(item)}</td></tr>)}</tbody></table>{!filtered.length&&<div className="components-db__empty">По выбранным условиям позиции не найдены</div>}</div><footer><span>{COMPONENT_GROUPS.find(item=>item.id===groupId)?.name} · {catalog?.name}</span><span>Всего в базе: {database.statistics.componentRows.toLocaleString("ru-RU")} · с ценами: {database.statistics.pricedComponentRows.toLocaleString("ru-RU")}</span></footer></div>;
}

export function AllowedPumpPanel({ id, input, settings, catalogue, onInputChange, onAddToSpec, automaticSpecification = false }: {
  automaticSpecification?: boolean;
  id: "input" | "input2" | "chart" | "chart2" | "sketch" | "sketch2" | "components";
  input: InputEntity; settings: SettingsEntity; catalogue: Pump[];
  onInputChange?: (patch: Partial<InputEntity>) => void; onAddToSpec?: () => void;
}) {
  const storedExport=useStoredDiagnostic(id,"export"),storedMethod=useStoredDiagnostic(id,"method");
  const [chartMethod,setChartMethod]=useState<CurveMethod>(storedMethod?"polynomial":"pchip");
  const [chartExportError,setChartExportError]=useState(storedExport?.message??"");
  const [chartGrid,setChartGrid]=useState(defaultChartGridSettings);
  const [frequencyControl,setFrequencyControl]=useState<{pumpId:string;settings:PumpFrequencySettings}>(()=>({pumpId:"",settings:defaultPumpFrequencySettings()}));
  if(frequencyControl.pumpId!==(input.selectedPumpId??""))setFrequencyControl({pumpId:input.selectedPumpId??"",settings:defaultPumpFrequencySettings()});
  useRuntimeDiagnostic(id,"export",chartExportError);
  const chartPump=(id==="chart"||id==="chart2")&&isCalculated(input)?catalogue.find(p=>p.id===input.selectedPumpId):undefined;
  useRuntimeDiagnostic(id,"method",chartPump&&chartMethod==="polynomial"&&!curveSegments(chartPump.curve,"polynomial").length?"Сглаживание недоступно для этой модели; показан PCHIP.":"", "warning");
  if (id === "input" || id === "input2") return <PumpSelector automaticSpecification={automaticSpecification} tool={id} key={input.medium} input={input} settings={settings} catalogue={catalogue} onInputChange={onInputChange} onAddToSpec={onAddToSpec}/>;
  if (id === "chart" || id === "chart2") { if(!isCalculated(input))return <div data-issue-id={`${id}/empty`} className="pump-chart__empty">Введите параметры и нажмите «Подобрать оборудование»</div>; const selected=catalogue.find(p=>p.id===input.selectedPumpId); if(!selected)return <div data-issue-id={`${id}/empty`} className="pump-chart__empty">Для заданной рабочей точки насос не выбран</div>; if(!usablePump(selected,input.medium))return <div data-issue-id={`${id}/empty`} className="pump-chart__empty">Для этой модели нет подтверждённой рабочей кривой. Выберите другой насос.</div>; const polynomialAvailable=curveSegments(selected.curve,"polynomial").length>0,method:CurveMethod=chartMethod==="polynomial"&&!polynomialAvailable?"pchip":chartMethod,methodInfo=CURVE_METHODS.find(item=>item.value===method)!; const frequencySettings=frequencyControl.pumpId===selected.id?frequencyControl.settings:defaultPumpFrequencySettings(),frequency=pumpFrequencyState(selected,frequencySettings),effectivePump=frequencySettings.enabled?frequencyAdjustedPump(selected,frequency.frequencyHz,frequency.nominalHz):selected,referencePump=frequencySettings.enabled&&frequencySettings.showNominal&&frequency.ratio!==1?selected:undefined,frequencyCaption=frequencySettings.enabled?` · f=${frequencyLabel(frequency.frequencyHz)} Гц (ном. ${frequencyLabel(frequency.nominalHz)} Гц)`:"",count=input.workingPumpCount,xScale=chartAxisScale(Math.max(input.flowRate*1.2,...effectivePump.curve.map(p=>p[0]*count),...(referencePump?.curve.map(p=>p[0]*count)??[])),chartGrid.flow,"Q"),maxPumpHead=Math.max(curveMaxHead(effectivePump.curve,method),referencePump?curveMaxHead(referencePump.curve,method):0),yScale=chartAxisScale(Math.max(maxPumpHead,input.head,1)*1.1,chartGrid.head,"H"),maxQ=xScale.max,maxH=yScale.max,minQ=xScale.min,minH=yScale.min,gridIssues=[xScale.issue,yScale.issue].filter((issue):issue is string=>Boolean(issue)),systemSegments=systemCurveSegments(effectivePump,count,input,maxQ,maxH,method,minQ,minH),actualPoint=actualOperatingPoint(effectivePump,count,input,method),clipId=`plot-${id}-${selected.id}-${count}`; return (
    <div className="pump-chart pump-chart--with-settings" data-curve-method={method} data-curve-label={methodInfo.label+frequencyCaption}>
      <div className="pump-chart__top"><label className="pump-chart__method"><span>Кривая</span><select aria-label="Способ отображения кривой" value={method} title={methodInfo.description} onChange={event=>{setChartMethod(event.target.value as CurveMethod);setChartExportError("");}}>{CURVE_METHODS.map(item=><option key={item.value} value={item.value} disabled={item.value==="polynomial"&&!polynomialAvailable}>{item.label}</option>)}</select></label><div className="pump-chart__legend"><span><i className="pump-chart__dot pump-chart__dot--blue" />{selected.manufacturer} {selected.model}</span><span><i className="pump-chart__dot pump-chart__dot--orange" />Система</span>{referencePump&&<span><i className="pump-chart__dot pump-chart__dot--nominal"/>Номинальная: {frequencyLabel(frequency.nominalHz)} Гц</span>}<span><i className="pump-chart__point-symbol pump-chart__point-symbol--requested" />Запрашиваемая</span><span><i className="pump-chart__point-symbol pump-chart__point-symbol--actual" />Фактическая</span></div><details className="chart-export"><summary>Export <span>⌄</span></summary><div className="chart-export__menu">{(["png","pdf","jpeg"] as ChartExportFormat[]).map(format=><button key={format} disabled={gridIssues.length>0} onClick={event=>{const button=event.currentTarget;setChartExportError("");void exportChart(button,format,`hydraulic-curve-${selected.model.replace(/[^a-zа-я0-9]+/gi,"-")}-${method}${frequencySettings.enabled?`-${frequency.frequencyHz.toFixed(2)}Hz`:""}`).catch(()=>setChartExportError("Не удалось экспортировать график. Попробуйте ещё раз.")).finally(()=>button.closest("details")?.removeAttribute("open"));}}>{format.toUpperCase()}</button>)}</div></details><p data-issue-id={`${id}/method`} className="pump-chart__method-note">{methodInfo.description}{chartMethod==="polynomial"&&!polynomialAvailable&&" Сглаживание недоступно для этой модели; показан PCHIP."}</p>{chartExportError&&<p data-issue-id={`${id}/export`} className="pump-chart__export-error" role="alert">{chartExportError}</p>}</div>
      <div className="pump-chart__canvas" aria-label="График насосной кривой">
        <span className="pump-chart__axis pump-chart__axis--y">H, м</span><span className="pump-chart__axis pump-chart__axis--x">Q, м³/ч</span>
        <PumpChartPlot pump={effectivePump} referencePump={referencePump} count={count} method={method} label={methodInfo.label+frequencyCaption} input={input} xScale={xScale} yScale={yScale} grid={chartGrid} system={systemSegments} actualPoint={actualPoint} clipId={clipId} onInputChange={onInputChange}/>
      </div>
      <div className="pump-chart__points"><span><i className="pump-chart__point-symbol pump-chart__point-symbol--requested"/><small>Запрашиваемая точка</small><b>Q = {input.flowRate.toFixed(1)} м³/ч · H = {input.head.toFixed(1)} м</b></span><span><i className="pump-chart__point-symbol pump-chart__point-symbol--actual"/><small>Фактическая точка</small><b>{actualPoint?`Q = ${actualPoint.flow.toFixed(1)} м³/ч · H = ${actualPoint.head.toFixed(1)} м`:"Пересечение не найдено"}</b>{!frequencySettings.enabled&&<IssueNotice id={`${id}/operating-point`}/>}</span></div>
      <div className="pump-chart__metrics"><span><small>Насосов</small><b>{count} раб.</b></span><span title={frequencySettings.enabled?"Оценка по кубу отношения частот от номинальной мощности; потери двигателя и ПЧ не учтены":undefined}><small>{frequencySettings.enabled?"Мощность, оценка":"Мощность"}</small><b>{effectivePump.power===null?"—":`${Number((effectivePump.power*count).toPrecision(6)).toLocaleString("ru-RU")} кВт`}</b></span><span><small>{frequencySettings.enabled?"КПД, каталог":"КПД"}</small><b>{selected.efficiency===null?"—":`${selected.efficiency}%`}</b></span></div>
      <PumpFrequencyControl key={selected.id} pump={selected} value={frequencySettings} onChange={next=>{setFrequencyControl({pumpId:selected.id,settings:next});setChartExportError("");}}/>
      <PumpChartGridSettings value={chartGrid} onChange={next=>{setChartGrid(next);setChartExportError("");}} issues={gridIssues}/>
    </div>
  ); }
  if(id==="sketch"||id==="sketch2"){
    const selected=catalogue.find(p=>p.id===input.selectedPumpId);
    if(!selected)return <div data-issue-id={`${id}/empty`} className="pump-sketch__empty"><span aria-hidden="true">⌁</span><b>Насос ещё не выбран</b><p>Выполните подбор и выберите модель в таблице. Карточка насоса обновится автоматически.</p></div>;
    const sketch=pumpSketchFor(selected);
    return <PumpCard key={selected.id} pump={selected} issueTool={id}>{sketch?<PumpSketchView key={sketch.src} tool={id} pump={selected} sketch={sketch}/>:undefined}</PumpCard>;
  }
  return <ComponentsDatabaseView settings={settings}/>;
}

export const resetComponentsDatabase = () => { componentsDatabasePromise = undefined; loadedComponentsDatabase = undefined; };
