"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createProject, DEFAULT_PANELS, parseProjectConfig, projectFilename, withUpdatedTimestamp, type InputEntity, type PanelKind, type PanelState, type ProjectConfig, type ProjectEntity, type SettingsEntity, type SpecEntity, type SpecItem, type SpecSection, type WorkspaceGrid, type WorkspaceMode } from "./project-config";
import { AccountScreen } from "./account-ui";

const PANEL_INFO: Record<PanelKind, { title: string; eyebrow: string }> = {
  settings: { title: "Настройки проекта", eyebrow: "КОНФИГУРАЦИЯ" },
  input: { title: "Подбор насосов", eyebrow: "ИНСТРУМЕНТ" },
  chart: { title: "Гидравлическая кривая", eyebrow: "ИНСТРУМЕНТ" },
  sketch: { title: "Эскиз насоса 1", eyebrow: "ГАБАРИТНЫЙ ЧЕРТЕЖ" },
  input2: { title: "Подбор насосов 2", eyebrow: "ВТОРОЙ КОНТУР" },
  chart2: { title: "Гидравлическая кривая 2", eyebrow: "ВТОРОЙ КОНТУР" },
  sketch2: { title: "Эскиз насоса 2", eyebrow: "ВТОРОЙ КОНТУР" },
  spec: { title: "Спецификация", eyebrow: "СОСТАВ СТАНЦИИ" },
  components: { title: "База комплектующих", eyebrow: "ОБОРУДОВАНИЕ" },
  model: { title: "3D-модель", eyebrow: "КОМПОНОВКА" },
};
const ENTITY_BY_TOOL:Record<PanelKind,string>={input:"system-input",chart:"working-point",sketch:"pump-sketch",input2:"system-input-2",chart2:"working-point-2",sketch2:"pump-sketch-2",settings:"station-settings",spec:"station-spec",components:"station-components",model:"station-model"};
const isSecondaryEnabled = (settings: SettingsEntity) => settings.stationType === "combined" || (settings.stationType === "fire" && settings.jockeyPump);
const SPEC_GROUPS: Array<{ title: string; sections: Array<{ id: SpecSection; title?: string }> }> = [
  { title: "Насосы", sections: [{ id: "pump" }] },
  { title: "Шкаф управления", sections: [{ id: "control" }] },
  { title: "Рама", sections: [{ id: "frame" }] },
  { title: "Сборочный комплект гидравлики", sections: [{ id: "suction", title: "Всасывающая линия" }, { id: "discharge", title: "Напорная линия" }] },
  { title: "Сборочный комплект электрики", sections: [{ id: "electrical" }] },
];

type Pump = { id:string; manufacturer:string; series:string; group:string; model:string; type:"vertical"|"horizontal"|"unknown"; power:number|null; efficiency:number|null; nominalFlow:number|null; minFlow:number|null; maxFlow:number|null; minHead:number|null; maxHead:number|null; price:number|null; priceCurrency:"USD"|"CNY"|null; priceSource:string|null; source:string|null; curve:Array<[number,number]> };
type PumpSketchInfo = { src:string; caption:string; source:string };
type PumpDrawing = { partCode:string; file:string };
const CNP_DIMENSION_DRAWINGS:Record<string,PumpDrawing>={
  "CDM 1-2":{partCode:"CDM1-2YSWPC",file:"cdm-1-2.png"},
  "CDM 1-4":{partCode:"CDM1-4YSWPC",file:"cdm-1-4.png"},
  "CDM 1-10":{partCode:"CDM1-10YSWPC",file:"cdm-1-10.png"},
  "CDM 1-13":{partCode:"CDM1-13YSWPC",file:"cdm-1-13.png"},
  "CDM 1-14":{partCode:"CDMF1-14KSWSC",file:"cdm-1-14.png"},
  "CDM 1-15":{partCode:"CDM1-15YSWPC",file:"cdm-1-15.png"},
  "CDM 1-19":{partCode:"CDM1-19YSWPC",file:"cdm-1-19.png"},
  "CDM 1-27":{partCode:"CDM1-27FSWPC",file:"cdm-1-27.png"},
  "CDM 10-12":{partCode:"CDMF10-12FSWSC",file:"cdm-10-12.png"},
  "CDM 32-3":{partCode:"CDMF32-3FSWSC",file:"cdm-32-3.png"},
  "CDM 42-2-2":{partCode:"CDMF42-2-2FSWSC",file:"cdm-42-2-2.png"},
  "CDM 120-2-1":{partCode:"CDMF120-2-1FSWSC",file:"cdm-120-2-1.png"},
  "CHLF(T)2-40":{partCode:"CHLF2-40LSWSC",file:"chlft2-40.png"},
  "CHLF(T)2-60":{partCode:"CHLF2-60LSWSC",file:"chlft2-60.png"}
};
const CNP_CATALOG_DIMENSION_DRAWINGS:Record<string,{page:number;file:string}>={
  "1":{page:56,file:"cnp-cdm1-dimensions.png"},
  "3":{page:57,file:"cnp-cdm3-dimensions.png"},
  "5":{page:58,file:"cnp-cdm5-dimensions.png"},
  "10":{page:59,file:"cnp-cdm10-dimensions.png"},
  "15":{page:60,file:"cnp-cdm15-dimensions.png"},
  "20":{page:61,file:"cnp-cdm20-dimensions.png"},
  "32":{page:62,file:"cnp-cdm32-dimensions.png"},
  "42":{page:63,file:"cnp-cdm42-dimensions.png"},
  "65":{page:64,file:"cnp-cdm65-dimensions.png"},
  "85":{page:65,file:"cnp-cdm85-dimensions.png"},
  "95":{page:66,file:"cnp-cdm95-dimensions.png"},
  "120":{page:67,file:"cnp-cdm120-dimensions.png"},
  "125":{page:68,file:"cnp-cdm125-dimensions.png"},
  "150":{page:69,file:"cnp-cdm150-dimensions.png"},
  "155":{page:70,file:"cnp-cdm155-dimensions.png"},
  "185":{page:71,file:"cnp-cdm185-dimensions.png"},
  "200":{page:72,file:"cnp-cdm200-dimensions.png"},
  "215":{page:73,file:"cnp-cdm215-dimensions.png"}
};
const CNP_CHLFT_CATALOG_DIMENSION_DRAWINGS:Record<string,{page:number;file:string}>={
  "2":{page:27,file:"cnp-chlft2-4-dimensions.png"},
  "4":{page:27,file:"cnp-chlft2-4-dimensions.png"},
  "8":{page:28,file:"cnp-chlft8-12-dimensions.png"},
  "12":{page:28,file:"cnp-chlft8-12-dimensions.png"},
  "15":{page:29,file:"cnp-chlft15-20-dimensions.png"},
  "20":{page:29,file:"cnp-chlft15-20-dimensions.png"}
};
const AQUASTRONG_DIMENSION_DRAWINGS:Record<string,{page:number;file:string}>={
  "EVR1":{page:11,file:"aquastrong-evr1.png"},"EVR2":{page:13,file:"aquastrong-evr2.png"},"EVR3":{page:15,file:"aquastrong-evr3.png"},
  "EVR4":{page:17,file:"aquastrong-evr4.png"},"EVR5":{page:19,file:"aquastrong-evr5.png"},"EVR10":{page:21,file:"aquastrong-evr10.png"},
  "EVR15":{page:23,file:"aquastrong-evr15.png"},"EVR20":{page:25,file:"aquastrong-evr20.png"},"EVR32":{page:27,file:"aquastrong-evr32.png"},
  "EVR45":{page:29,file:"aquastrong-evr45.png"},"EVR64":{page:31,file:"aquastrong-evr64.png"},"EVR90":{page:33,file:"aquastrong-evr90.png"},
  "EVR120":{page:35,file:"aquastrong-evr120.png"},"EVR150":{page:37,file:"aquastrong-evr150.png"},"EVR200":{page:39,file:"aquastrong-evr200.png"},
  "ECH2":{page:48,file:"aquastrong-ech2.png"},"ECH4":{page:49,file:"aquastrong-ech4.png"},"ECH10":{page:50,file:"aquastrong-ech10.png"},
  "ECH15":{page:51,file:"aquastrong-ech15.png"},"ECH20":{page:52,file:"aquastrong-ech20.png"},
  "EDH2":{page:55,file:"aquastrong-edh2.png"},"EDH4":{page:56,file:"aquastrong-edh4.png"},"EDH10":{page:57,file:"aquastrong-edh10.png"},
  "EDH15":{page:58,file:"aquastrong-edh15.png"},"EDH20":{page:59,file:"aquastrong-edh20.png"}
};
const pumpSketchFor=(pump:Pump):PumpSketchInfo|undefined=>{
  const manufacturer=pump.manufacturer.toUpperCase(),normalized=pump.model.toUpperCase().replace(/\s+/g," ").trim(),compact=normalized.replace(/\s+/g,"");
  if(manufacturer==="CNP"){
    const drawing=CNP_DIMENSION_DRAWINGS[normalized];
    if(drawing)return {src:`/cnp-model-drawings/${drawing.file}`,caption:`Габаритный чертёж ${pump.model} · ${drawing.partCode}`,source:"Локальная программа подбора CNP · точная связь SPump.mdb"};
    const cdmFamily=compact.match(/^CDM(1|3|5|10|15|20|32|42|65|85|95|120|125|150|155|185|200|215)-/)?.[1],cdmDrawing=cdmFamily?CNP_CATALOG_DIMENSION_DRAWINGS[cdmFamily]:undefined;
    if(cdmDrawing)return {src:`/cnp-drawings-archive/${cdmDrawing.file}`,caption:`Габаритный лист CNP · модель ${pump.model}`,source:`Официальный каталог CNP CDM/CDMF 220626 · стр. ${cdmDrawing.page}`};
    const chlftFamily=compact.match(/^CHLF\(T\)(2|4|8|12|15|20)-/)?.[1],chlftDrawing=chlftFamily?CNP_CHLFT_CATALOG_DIMENSION_DRAWINGS[chlftFamily]:undefined;
    return chlftDrawing?{src:`/cnp-drawings-archive/${chlftDrawing.file}`,caption:`Габаритный лист CNP · модель ${pump.model}`,source:`Официальный каталог CNP CHL/CHLF(T) 27082025 · стр. ${chlftDrawing.page}`}:undefined;
  }
  if(manufacturer==="AQUASTRONG"){
    const match=compact.match(/^(EVR)(1|2|3|4|5|10|15|20|32|45|64|90|120|150|200)-/)??compact.match(/^(ECH|EDH)(?:\(M\))?(2|4|10|15|20)-/),family=match?`${match[1]}${match[2]}`:undefined,drawing=family?AQUASTRONG_DIMENSION_DRAWINGS[family]:undefined;
    return drawing?{src:`/aquastrong-drawings/${drawing.file}`,caption:`Габаритный лист Aquastrong · модель ${pump.model}`,source:`Каталог Aquastrong «Многоступенчатые насосы» · стр. ${drawing.page}`}:undefined;
  }
  return undefined;
};
type ControlCabinet = { id:string; type:"bp"|"fp"|"fpj"; application:"utility"|"fire"; brand:string; name:string; pumpCount:number; powerKw:number; startType:string; code:string; weightKg:number; price:number };
const isAutomaticCabinetSelectionEnabled = (settings:SettingsEntity) => settings.stationType === "utility" || settings.stationType === "fire";
const cabinetTypeFor = (settings:SettingsEntity):ControlCabinet["type"] => settings.stationType === "fire" && settings.jockeyPump ? "fpj" : settings.stationType === "fire" ? "fp" : "bp";
const selectControlCabinet = (cabinets:ControlCabinet[],settings:SettingsEntity,pump:Pump,totalPumpCount:number) => {
  if (pump.power === null) return undefined;
  const type=cabinetTypeFor(settings),epsilon=1e-6;
  return cabinets.filter(cabinet=>cabinet.type===type&&cabinet.pumpCount===totalPumpCount&&cabinet.powerKw+epsilon>=pump.power!).sort((a,b)=>a.powerKw-b.powerKw)[0];
};
const controlCabinetItem = (cabinet:ControlCabinet|undefined,settings:SettingsEntity,pump:Pump,totalPumpCount:number):SpecItem => {
  if(cabinet){
    const oversized=pump.power!==null&&cabinet.powerKw-pump.power>1e-6,pumpPower=pump.power?.toLocaleString("ru-RU"),cabinetPower=cabinet.powerKw.toLocaleString("ru-RU");
    return {position:"03",name:cabinet.name,details:`${cabinet.startType} · ${cabinet.pumpCount} нас. × ${cabinetPower} кВт · ${cabinet.weightKg} кг`,quantity:1,unit:"шт.",price:cabinet.price,description:oversized?`Предупреждение: точного ШУ на ${pumpPower} кВт нет; выбран ближайший больший номинал ${cabinetPower} кВт.`:`Шкаф ${cabinet.type.toUpperCase()} · цена со скидкой`,section:"control",status:oversized?"clarify":"selected"};
  }
  return {
  position:"03",name:"Шкаф управления",details:`${cabinetTypeFor(settings).toUpperCase()} · ${totalPumpCount} нас. × ${pump.power===null?"мощность не указана":`${pump.power.toLocaleString("ru-RU")} кВт`}`,quantity:1,unit:"шт.",price:null,description:"Шкаф управления не найден в базе",section:"control",status:"clarify"
  };
};
const manualControlCabinetItem = (stationType:SettingsEntity["stationType"]):SpecItem => ({
  position:"03",name:"Шкаф управления",details:stationType==="combined"?"Совмещённая насосная установка":"SMART",quantity:1,unit:"шт.",price:null,description:"Автоматический подбор шкафа для данного типа установки не выполняется",section:"control",status:"clarify"
});
type CalculatedInput = InputEntity & { flowRate:number; head:number; staticHead:number; workingPumpCount:number; reservePumpCount:number; calculated:true };
const isCalculated = (input:InputEntity): input is CalculatedInput => input.calculated && input.flowRate !== null && input.head !== null && input.staticHead !== null && input.workingPumpCount !== null && input.reservePumpCount !== null;
const typeLabel = (type:Pump["type"]) => type === "vertical" ? "Вертикальный" : type === "horizontal" ? "Горизонтальный" : "Не указан";
const pumpPriceRub = (pump:Pump,settings:SettingsEntity) => {
  if (pump.price === null || pump.priceCurrency === null) return null;
  const rate=pump.priceCurrency === "USD" ? settings.usdRate : settings.cnyRate;
  const discount=pump.manufacturer.toLocaleLowerCase("ru-RU").includes("cnp") ? settings.manufacturerDiscounts.cnp : settings.manufacturerDiscounts.aquastrong;
  return Math.round(pump.price*rate*(1-discount/100)*100)/100;
};
const headAtFlow = (pump:Pump, flow:number) => {
  const points=pump.curve;
  if (!points.length || flow<points[0][0] || flow>points[points.length-1][0]) return null;
  const exact=points.find(point=>point[0]===flow); if(exact)return exact[1];
  for(let i=1;i<points.length;i++) if(points[i][0]>=flow){const [q1,h1]=points[i-1],[q2,h2]=points[i]; return h1+(h2-h1)*(flow-q1)/(q2-q1);}
  return null;
};
const pumpHead = (pump:Pump,input:CalculatedInput) => headAtFlow(pump,input.flowRate/Math.max(1,input.workingPumpCount));
const pumpReserve = (pump: Pump, input: CalculatedInput) => { const head=pumpHead(pump,input); return head===null ? Number.NEGATIVE_INFINITY : ((head-input.head)/input.head)*100; };
const reserveClass = (reserve: number) => reserve < 0 || reserve > 10 ? "danger" : reserve > 5 ? "warning" : "good";
const reserveZoneRank = (reserve:number) => reserve >= 0 && reserve <= 5 ? 0 : reserve > 5 && reserve <= 10 ? 1 : 2;
const solveLinearSystem=(matrix:number[][],values:number[])=>{for(let i=0;i<matrix.length;i++){let pivot=i;for(let row=i+1;row<matrix.length;row++)if(Math.abs(matrix[row][i])>Math.abs(matrix[pivot][i]))pivot=row;[matrix[i],matrix[pivot]]=[matrix[pivot],matrix[i]];[values[i],values[pivot]]=[values[pivot],values[i]];const divisor=matrix[i][i];if(Math.abs(divisor)<1e-12)return null;for(let column=i;column<matrix.length;column++)matrix[i][column]/=divisor;values[i]/=divisor;for(let row=0;row<matrix.length;row++){if(row===i)continue;const factor=matrix[row][i];for(let column=i;column<matrix.length;column++)matrix[row][column]-=factor*matrix[i][column];values[row]-=factor*values[i];}}return values;};
const polynomialFit=(points:Array<[number,number]>)=>{const degree=Math.min(3,points.length-1),scale=Math.max(...points.map(point=>point[0]),1),matrix=Array.from({length:degree+1},()=>new Array<number>(degree+1).fill(0)),values=new Array<number>(degree+1).fill(0);for(const [q,h] of points){const x=q/scale,powers=Array.from({length:degree*2+1},(_,i)=>x**i);for(let row=0;row<=degree;row++){values[row]+=h*powers[row];for(let column=0;column<=degree;column++)matrix[row][column]+=powers[row+column];}}const coefficients=solveLinearSystem(matrix,values);return coefficients?{scale,coefficients}:null;};
const curvePath=(pump:Pump,count:number,maxQ:number,maxH:number)=>{const points=pump.curve;if(!points.length)return "";const sx=(q:number)=>45+(q*count/maxQ)*435,sy=(h:number)=>210-(h/maxH)*190,fit=polynomialFit(points);if(!fit)return `M${sx(points[0][0])} ${sy(points[0][1])}`;const firstQ=points[0][0],lastQ=points.at(-1)![0],samples=160;let path="";for(let index=0;index<=samples;index++){const q=firstQ+(lastQ-firstQ)*index/samples,x=q/fit.scale,h=fit.coefficients.reduce((sum,coefficient,power)=>sum+coefficient*x**power,0);path+=`${index?"L":"M"}${sx(q)} ${sy(h)}`;}return path;};
const systemCurveSegments=(pump:Pump,count:number,input:CalculatedInput,maxQ:number,maxH:number)=>{const k=(input.head-input.staticHead)/(input.flowRate**2),samples=Array.from({length:121},(_,index)=>{const q=maxQ*index/120,h=input.staticHead+k*q*q,pumpH=headAtFlow(pump,q/count);return {q,h,above:pumpH===null||h>pumpH};}),xy=(point:{q:number;h:number})=>`${45+(point.q/maxQ)*435} ${210-(point.h/maxH)*190}`;let solid="",dashed="",previousAbove=samples[0].above;for(let i=0;i<samples.length;i++){const point=samples[i],target=point.above?"dashed":"solid",command=i===0||point.above!==previousAbove?"M":"L",piece=`${command}${xy(point)}`;if(target==="solid")solid+=piece;else dashed+=piece;if(i>0&&point.above!==previousAbove){const previous=samples[i-1],bridge=`M${xy(previous)} L${xy(point)}`;if(point.above)dashed=bridge+dashed;else solid=bridge+solid;}previousAbove=point.above;}return {solid,dashed};};
type ChartExportFormat = "png" | "jpeg" | "pdf";
const downloadBlob=(blob:Blob,filename:string)=>{const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=filename;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);};
const canvasToBlob=(canvas:HTMLCanvasElement,type:string,quality?:number)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Не удалось подготовить изображение")),type,quality));
const jpegCanvasToPdf=async(canvas:HTMLCanvasElement)=>{const jpeg=new Uint8Array(await (await canvasToBlob(canvas,"image/jpeg",.95)).arrayBuffer()),encoder=new TextEncoder(),parts:Uint8Array[]=[],offsets:number[]=[0];let length=0;const push=(value:string|Uint8Array)=>{const bytes=typeof value==="string"?encoder.encode(value):value;parts.push(bytes);length+=bytes.length;};const object=(id:number,body:string|Uint8Array)=>{offsets[id]=length;push(`${id} 0 obj\n`);push(body);push("\nendobj\n");};push("%PDF-1.4\n");object(1,"<< /Type /Catalog /Pages 2 0 R >>");object(2,"<< /Type /Pages /Kids [3 0 R] /Count 1 >>");object(3,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 900 600] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");offsets[4]=length;push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);push(jpeg);push("\nendstream\nendobj\n");const content="q 900 0 0 600 0 0 cm /Im0 Do Q";object(5,`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);const xref=length;push("xref\n0 6\n0000000000 65535 f \n");for(let id=1;id<=5;id++)push(`${String(offsets[id]).padStart(10,"0")} 00000 n \n`);push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);return new Blob(parts,{type:"application/pdf"});};
const exportChart=async(button:HTMLButtonElement,format:ChartExportFormat,filename:string)=>{const chart=button.closest(".pump-chart"),source=chart?.querySelector("svg");if(!(source instanceof SVGSVGElement))return;const canvas=document.createElement("canvas");canvas.width=1500;canvas.height=1000;const context=canvas.getContext("2d");if(!context)return;context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);context.fillStyle="#203744";context.font="600 36px Segoe UI, Arial";context.fillText("Гидравлическая характеристика",75,72);context.fillStyle="#637582";context.font="24px Segoe UI, Arial";context.fillText(chart?.querySelector(".pump-chart__legend")?.textContent?.replace(/\s+/g," ").trim()??"",75,115);const clone=source.cloneNode(true) as SVGSVGElement;clone.setAttribute("xmlns","http://www.w3.org/2000/svg");clone.setAttribute("width","1350");clone.setAttribute("height","648");clone.querySelectorAll("circle").forEach(circle=>circle.setAttribute("r",circle.classList.contains("pump-chart__pulse")?"5.2":"2.8"));const style=document.createElementNS("http://www.w3.org/2000/svg","style");style.textContent=".pump-chart__grid{fill:none;stroke:#e4e9ec;stroke-width:1}.pump-chart__line{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.pump-chart__line--blue{stroke:#1976bd}.pump-chart__line--orange{stroke:#e78732}.pump-chart__line--muted{opacity:.24;stroke-width:2}.pump-chart__line--unavailable{opacity:.35;stroke-dasharray:7 6;stroke-width:2}.pump-chart__ticks text{fill:#71808b;font-size:9px;font-family:Segoe UI,Arial}.pump-chart__pulse{fill:rgba(25,118,189,.08);stroke:#1976bd;stroke-width:.4}circle{fill:#fff;stroke:#173b59;stroke-width:1.2}";clone.prepend(style);const svgBlob=new Blob([new XMLSerializer().serializeToString(clone)],{type:"image/svg+xml;charset=utf-8"}),url=URL.createObjectURL(svgBlob),image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("Не удалось отрисовать график"));image.src=url;});context.drawImage(image,75,155,1350,648);URL.revokeObjectURL(url);context.fillStyle="#6d7e8a";context.font="22px Segoe UI, Arial";context.fillText("H, м",75,150);context.fillText("Q, м³/ч",1325,840);const metrics=[...chart!.querySelectorAll(".pump-chart__metrics span")].map(item=>item.textContent?.trim()).filter(Boolean).join("   ·   ");context.fillStyle="#344b5a";context.font="600 24px Segoe UI, Arial";context.fillText(metrics,75,915);if(format==="pdf")downloadBlob(await jpegCanvasToPdf(canvas),`${filename}.pdf`);else downloadBlob(await canvasToBlob(canvas,format==="png"?"image/png":"image/jpeg",.95),`${filename}.${format==="jpeg"?"jpg":"png"}`);};

function Icon({ name }: { name: string }) {
  const icons: Record<string, string> = { menu: "☰", close: "×", undo: "↶", redo: "↷", external: "↗", more: "•••", cube: "◇" };
  return <span aria-hidden="true">{icons[name] ?? name}</span>;
}

function PumpSelector({ input, settings, draftPoint, catalogue, onDraftPointChange, onInputChange, onAddToSpec }: { input: InputEntity; settings:SettingsEntity; draftPoint:{flowRate:string;head:string}; catalogue:Pump[]; onDraftPointChange:(point:{flowRate:string;head:string})=>void; onInputChange?: (patch: Partial<InputEntity>) => void; onAddToSpec?:()=>void }) {
  const [draft,setDraft]=useState({staticHead:input.staticHead?.toString()??"",workingPumpCount:input.workingPumpCount?.toString()??"",reservePumpCount:input.reservePumpCount?.toString()??""});
  const [type,setType]=useState("Все типы"),[manufacturer,setManufacturer]=useState("Все производители"),[series,setSeries]=useState("Все серии"),[sort,setSort]=useState<"distance"|"price">("distance");
  const calculated=isCalculated(input)?input:null;
  const pumps=useMemo(()=>calculated?catalogue.filter(p=>{const reserve=pumpReserve(p,calculated);return (type==="Все типы"||p.type===type)&&(manufacturer==="Все производители"||p.manufacturer===manufacturer)&&(series==="Все серии"||p.series===series)&&Number.isFinite(reserve)&&reserve>=-5;}).sort((a,b)=>{const reserveA=pumpReserve(a,calculated),reserveB=pumpReserve(b,calculated);if(sort!=="price")return Math.abs(reserveA)-Math.abs(reserveB);const zoneDifference=reserveZoneRank(reserveA)-reserveZoneRank(reserveB);return zoneDifference||(pumpPriceRub(a,settings)??Infinity)-(pumpPriceRub(b,settings)??Infinity);}).slice(0,100):[],[catalogue,type,manufacturer,series,sort,calculated,settings]);
  const calculate=()=>{const flow=Number(draftPoint.flowRate),head=Number(draftPoint.head),staticHead=Number(draft.staticHead),working=Number(draft.workingPumpCount),reserve=Number(draft.reservePumpCount);if(!(flow>0&&head>0&&staticHead>=0&&staticHead<=head&&Number.isInteger(working)&&working>0&&Number.isInteger(reserve)&&reserve>=0)){window.alert("Заполните поля корректно. Статический напор должен быть от 0 до общего напора.");return;}const next:CalculatedInput={...input,flowRate:flow,head,staticHead,workingPumpCount:working,reservePumpCount:reserve,calculated:true};const best=catalogue.filter(p=>pumpReserve(p,next)>=-5).sort((a,b)=>Math.abs(pumpReserve(a,next))-Math.abs(pumpReserve(b,next)))[0];onInputChange?.({...next,selectedPumpId:best?.id});};
  return <div className="pump-selector"><div className="pump-selector__inputs">
    <label className="data-form__field"><span>Расход станции</span><span className="data-form__control"><input type="number" min="0" value={draftPoint.flowRate} onChange={e=>onDraftPointChange({...draftPoint,flowRate:e.target.value})}/><b>м³/ч</b></span></label>
    <label className="data-form__field"><span>Напор</span><span className="data-form__control"><input type="number" min="0" value={draftPoint.head} onChange={e=>onDraftPointChange({...draftPoint,head:e.target.value})}/><b>м</b></span></label>
    <label className="data-form__field"><span>Статический напор</span><span className="data-form__control"><input type="number" min="0" value={draft.staticHead} onChange={e=>setDraft(v=>({...v,staticHead:e.target.value}))}/><b>м</b></span></label>
    <label className="data-form__field"><span>Рабочих насосов</span><span className="data-form__control"><input type="number" min="1" max="6" value={draft.workingPumpCount} onChange={e=>setDraft(v=>({...v,workingPumpCount:e.target.value}))}/><b>шт.</b></span></label>
    <label className="data-form__field"><span>Резервных насосов</span><span className="data-form__control"><input type="number" min="0" max="3" value={draft.reservePumpCount} onChange={e=>setDraft(v=>({...v,reservePumpCount:e.target.value}))}/><b>шт.</b></span></label>
  </div><div className="pump-selector__actions"><button className="button button--primary" onClick={calculate}>Подобрать оборудование</button><button className="button button--spec" disabled={!input.selectedPumpId} onClick={onAddToSpec}>Записать в спецификацию</button></div>
  {calculated&&<><div className="pump-selector__toolbar"><select value={type} onChange={e=>setType(e.target.value)}><option value="Все типы">Все типы</option><option value="vertical">Вертикальный</option><option value="horizontal">Горизонтальный</option><option value="unknown">Не указан</option></select><select value={manufacturer} onChange={e=>setManufacturer(e.target.value)}><option>Все производители</option>{[...new Set(catalogue.map(p=>p.manufacturer))].map(v=><option key={v}>{v}</option>)}</select><select value={series} onChange={e=>setSeries(e.target.value)}><option>Все серии</option>{[...new Set(catalogue.map(p=>p.series))].map(v=><option key={v}>{v}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value as "distance"|"price")}><option value="distance">По рабочей точке</option><option value="price">По цене</option></select></div><div className="pump-results"><div className="pump-results__head"><span>Насос</span><span>Q / H</span><span>Запас</span><span>Цена</span></div>{pumps.map(pump=>{const head=pumpHead(pump,calculated)!,reserve=pumpReserve(pump,calculated),price=pumpPriceRub(pump,settings);return <button key={pump.id} className={`pump-results__row pump-results__row--${reserveClass(reserve)} ${input.selectedPumpId===pump.id?"pump-results__row--selected":""}`} onClick={()=>onInputChange?.({selectedPumpId:pump.id})}><span><b>{pump.manufacturer} {pump.model}</b><small>{typeLabel(pump.type)} · {pump.series}</small></span><span>{(calculated.flowRate/calculated.workingPumpCount).toFixed(1)} м³/ч<br/>{head.toFixed(1)} м</span><span>{reserve>0?"+":""}{reserve.toFixed(1)}%</span><span>{price===null?"":`${price.toLocaleString("ru-RU",{maximumFractionDigits:2})} ₽`}</span></button>})}{!pumps.length&&<div className="pump-results__empty">Подходящие насосы в рабочем диапазоне не найдены</div>}</div></>}
  </div>;
}

function InstallationSettings({ settings, onChange }: { settings: SettingsEntity; onChange: (patch: Partial<SettingsEntity>) => void }) {
  const isFireRelated = settings.stationType === "fire" || settings.stationType === "combined";
  const changeType = (stationType: SettingsEntity["stationType"]) => onChange({ stationType, isolatingValves: stationType === "fire" || stationType === "combined" ? settings.isolatingValves : false, jockeyPump: stationType === "fire" ? settings.jockeyPump : false });
  const numberValue = (value:string,fallback:number,min:number,max:number) => { const parsed=Number(value.replace(",",".")); return Number.isFinite(parsed)?Math.min(max,Math.max(min,parsed)):fallback; };
  const toggle = (key: keyof Pick<SettingsEntity, "membraneTank" | "vibrationCompensators" | "collectorPlugs" | "isolatingValves" | "jockeyPump">, label: string, disabled = false) => <label className={`settings-form__option ${disabled ? "settings-form__option--disabled" : ""}`}><span><b>{label}</b>{disabled && <small>Недоступно для выбранного типа</small>}</span><input type="checkbox" checked={Boolean(settings[key])} disabled={disabled} onChange={event=>onChange({ [key]: event.target.checked })}/><i aria-hidden="true"/></label>;
  return <div className="settings-form">
    <label className="settings-form__field"><span>Тип насосной установки</span><select value={settings.stationType} onChange={event=>changeType(event.target.value as SettingsEntity["stationType"])}><option value="utility">Хоз-пит</option><option value="fire">Пожаротушение</option><option value="combined">Совмещённая</option><option value="smart">SMART</option></select></label>
    <div className="settings-form__heading"><b>Курсы валют</b><small>Рублей за единицу валюты</small></div>
    <div className="settings-form__numbers"><label><span><b>Доллар США</b><small>USD</small></span><span className="settings-form__number"><input type="number" min="0.01" max="10000" step="0.01" value={settings.usdRate} onChange={event=>onChange({usdRate:numberValue(event.target.value,settings.usdRate,.01,10000)})}/><i>₽</i></span></label><label><span><b>Китайский юань</b><small>CNY</small></span><span className="settings-form__number"><input type="number" min="0.01" max="10000" step="0.01" value={settings.cnyRate} onChange={event=>onChange({cnyRate:numberValue(event.target.value,settings.cnyRate,.01,10000)})}/><i>₽</i></span></label></div>
    <div className="settings-form__heading"><b>Скидки производителей</b><small>Применяются к оборудованию</small></div>
    <div className="settings-form__numbers"><label><span><b>CNP</b><small>Скидка производителя</small></span><span className="settings-form__number"><input type="number" min="0" max="100" step="0.1" value={settings.manufacturerDiscounts.cnp} onChange={event=>onChange({manufacturerDiscounts:{...settings.manufacturerDiscounts,cnp:numberValue(event.target.value,settings.manufacturerDiscounts.cnp,0,100)}})}/><i>%</i></span></label><label><span><b>Aquastrong</b><small>Скидка производителя</small></span><span className="settings-form__number"><input type="number" min="0" max="100" step="0.1" value={settings.manufacturerDiscounts.aquastrong} onChange={event=>onChange({manufacturerDiscounts:{...settings.manufacturerDiscounts,aquastrong:numberValue(event.target.value,settings.manufacturerDiscounts.aquastrong,0,100)}})}/><i>%</i></span></label></div>
    <div className="settings-form__heading"><b>Опции</b><small>Состав автоматически переносится в спецификацию</small></div>
    {toggle("membraneTank", "Мембранный бак")}
    {settings.membraneTank && <label className="settings-form__nested"><span>Объём бака</span><select value={settings.membraneTankVolume} onChange={event=>onChange({ membraneTankVolume: Number(event.target.value) as 8|50|100 })}><option value={8}>8 л</option><option value={50}>50 л</option><option value={100}>100 л</option></select></label>}
    {toggle("vibrationCompensators", "Виброкомпенсаторы")}
    {toggle("collectorPlugs", "Заглушки на коллектора")}
    {toggle("isolatingValves", "Разделительные затворы на коллекторах", !isFireRelated)}
    {toggle("jockeyPump", "Жокей-насос", settings.stationType !== "fire")}
    <div className={`settings-form__secondary ${isSecondaryEnabled(settings) ? "settings-form__secondary--active" : ""}`}><span aria-hidden="true">{isSecondaryEnabled(settings) ? "✓" : "×"}</span><div><b>Второй контур подбора</b><small>{isSecondaryEnabled(settings) ? "Подбор, гидравлическая кривая и эскиз насоса 2 доступны" : "Доступен для совмещённой установки или пожаротушения с жокей-насосом"}</small></div></div>
  </div>;
}

function Specification({ entity, settings, catalogue }: { entity: SpecEntity; settings: SettingsEntity; catalogue:Pump[] }) {
  const formatMoney = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  const sectionFor = (item: SpecItem): SpecSection => item.section ?? (item.position === "01" || /^Насос\b/i.test(item.name) ? "pump" : item.position === "02" || /шкаф/i.test(item.name) ? "control" : /кабел|электр|клем|наконечн|провод|гофр|лоток/i.test(item.name) ? "electrical" : /рам|стойк|крепеж|вибро/i.test(item.name) ? "frame" : /подвод|манометр|реле|затвор/i.test(item.name) ? "suction" : "discharge");
  const secondaryEnabled = isSecondaryEnabled(settings);
  const pumpItems = entity.items.filter(item => sectionFor(item) === "pump").sort((a,b)=>a.position.localeCompare(b.position,"ru",{numeric:true})).slice(0,secondaryEnabled?2:1);
  const allowedPumpItems = new Set(pumpItems);
  const visibleItems = entity.items.filter(item => sectionFor(item) !== "pump" ? (!item.option || (item.option === "membraneTank" ? settings.membraneTank : item.option === "vibrationCompensators" ? settings.vibrationCompensators : item.option === "collectorPlugs" ? settings.collectorPlugs : settings.isolatingValves)) : allowedPumpItems.has(item)).map(item => {
    if(item.option === "membraneTank") return { ...item, details: `${settings.membraneTankVolume} л` };
    if(sectionFor(item)!=="pump") return item;
    const pump=catalogue.find(candidate=>candidate.id===item.equipmentId||item.name.toLocaleLowerCase("ru-RU")===`насос ${candidate.manufacturer} ${candidate.model}`.toLocaleLowerCase("ru-RU"));
    return pump ? {...item,price:pumpPriceRub(pump,settings)} : item;
  });
  const pricedItems = visibleItems.filter(item => typeof item.price === "number");
  const knownTotal = pricedItems.reduce((sum, item) => sum + item.price! * item.quantity, 0);
  const sectionItems=(sections:SpecSection[])=>visibleItems.filter(item=>sections.includes(sectionFor(item)));
  const subtotal=(items:SpecItem[])=>items.reduce((sum,item)=>sum+(typeof item.price==="number"?item.price*item.quantity:0),0);
  const subtotalLabel=(items:SpecItem[])=>`${formatMoney(subtotal(items))} ₽`;
  const sectionSummary=(items:SpecItem[])=><span className="spec-table__section-summary" title={items.some(item=>typeof item.price!=="number")?"Сумма рассчитана по позициям с заполненной ценой":"Полная стоимость раздела"}><i>{items.length} поз.</i><strong>{subtotalLabel(items)}</strong></span>;
  const renderItem = (item: SpecItem) => {
    const hasPrice = typeof item.price === "number";
    const cabinetNotFound=sectionFor(item)==="control"&&item.description==="Шкаф управления не найден в базе",cabinetPowerWarning=sectionFor(item)==="control"&&item.description.startsWith("Предупреждение:"),cabinetWarning=cabinetNotFound||cabinetPowerWarning;
    return <div className={`spec-table__row spec-table__row--item ${item.status === "selected" ? "spec-table__row--selected" : ""} ${cabinetNotFound?"spec-table__row--cabinet-missing":""} ${cabinetPowerWarning?"spec-table__row--cabinet-oversized":""}`} key={`${item.position}-${item.name}`}>
      <span className="spec-table__cell spec-table__cell--position">{item.position}</span>
      <span className="spec-table__cell spec-table__cell--name"><b>{item.name}{cabinetWarning&&<span className={`spec-table__warning ${cabinetPowerWarning?"spec-table__warning--power":""}`} tabIndex={0} role="img" aria-label={item.description}><i aria-hidden="true">!</i><span role="tooltip">{item.description}</span></span>}</b><small>{item.details}</small></span>
      <span className="spec-table__cell spec-table__cell--quantity">{item.quantity}</span>
      <span className="spec-table__cell spec-table__cell--unit">{item.unit ?? "шт."}</span>
      <span className={`spec-table__cell spec-table__cell--price ${hasPrice ? "" : "spec-table__cell--empty"}`}>{hasPrice ? formatMoney(item.price!) : ""}</span>
      <span className={`spec-table__cell spec-table__cell--sum ${hasPrice ? "" : "spec-table__cell--empty"}`}>{hasPrice ? formatMoney(item.price! * item.quantity) : ""}</span>
      <span className="spec-table__cell spec-table__cell--description">{item.description || <i>{item.status === "clarify" ? "Требует уточнения" : ""}</i>}</span>
    </div>;
  };

  return <div className="spec-sheet">
    <div className="spec-sheet__summary"><span><b>{visibleItems.length}</b> позиций в составе установки</span><span><small>Итоговая стоимость{pricedItems.length<visibleItems.length?" · по заполненным ценам":""}</small><b>{formatMoney(knownTotal)} ₽</b></span></div>
    <div className="spec-table" role="table" aria-label="Спецификация насосной установки">
      <div className="spec-table__row spec-table__row--head" role="row"><span>№</span><span>Наименование</span><span>Кол-во</span><span>Ед.</span><span>Цена, ₽</span><span>Сумма, ₽</span><span>Описание</span></div>
      {SPEC_GROUPS.map(group => {const groupItems=sectionItems(group.sections.map(section=>section.id));return <div className="spec-table__group" key={group.title}>
        <div className="spec-table__section spec-table__section--main"><b>{group.title}</b>{sectionSummary(groupItems)}</div>
        {group.sections.map(section => {const items=sectionItems([section.id]);return <div className="spec-table__subsection" key={section.id}>
          {section.title && <div className="spec-table__section spec-table__section--sub"><b>{section.title}</b>{sectionSummary(items)}</div>}
          {items.map(renderItem)}
        </div>;})}
      </div>;})}
    </div>
  </div>;
}

function PumpSketchView({ pump, sketch }: { pump:Pump; sketch:PumpSketchInfo }) {
  const [zoom,setZoom]=useState(100),zoomRef=useRef(100),canvasRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{zoomRef.current=100;setZoom(100);const canvas=canvasRef.current;if(canvas){canvas.scrollLeft=0;canvas.scrollTop=0;}},[sketch.src]);
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
  return <figure className="pump-sketch"><div className="pump-sketch__meta"><span><small>ВЫБРАННЫЙ АГРЕГАТ</small><b>{pump.manufacturer} {pump.model}</b></span><div className="pump-sketch__actions"><span>Ctrl + колесо · {zoom}%</span><a href={sketch.src} download={`${pump.manufacturer}-${pump.model.replace(/[^a-zа-я0-9]+/gi,"-")}.png`}>Скачать PNG</a></div></div><div ref={canvasRef} className="pump-sketch__canvas" aria-label="Габаритный чертёж. Для изменения масштаба удерживайте Ctrl и вращайте колесо мыши"><div className="pump-sketch__zoom-surface" style={{width:`${extent}%`,height:`${extent}%`}}><img src={sketch.src} style={{width:`${imageSize}%`,height:`${imageSize}%`}} alt={`Габаритный чертёж насосного агрегата ${pump.manufacturer} ${pump.model}`}/></div></div><figcaption><span>{sketch.caption}</span><span>Источник: {sketch.source}</span></figcaption></figure>;
}

type ComponentField={column:string;headerPath:string[];value:unknown};
type ComponentPrice={label:string;amount:number;currency:string};
type ComponentItem={id:string;catalogId:string;family:string;fields:ComponentField[];prices:ComponentPrice[]};
type ComponentCatalog={id:string;name:string};
type ComponentsDatabase={catalogs:ComponentCatalog[];items:ComponentItem[];statistics:{componentRows:number;pricedComponentRows:number}};
let componentsDatabasePromise:Promise<ComponentsDatabase>|undefined;
const loadComponentsDatabase=()=>componentsDatabasePromise??=fetch("/binding-components.json",{cache:"no-store"}).then(response=>response.ok?response.json():Promise.reject(new Error("Не удалось загрузить базу комплектующих")));
const componentFieldLabel=(field:ComponentField)=>field.headerPath.filter(Boolean).at(-1)?.trim()??"";
const componentValue=(value:unknown)=>typeof value==="number"?value.toLocaleString("ru-RU",{maximumFractionDigits:3}):typeof value==="string"&&value.trim()?value:"—";

function ComponentsDatabaseView(){
  const [database,setDatabase]=useState<ComponentsDatabase|null>(null),[catalogId,setCatalogId]=useState(""),[query,setQuery]=useState(""),[error,setError]=useState("");
  useEffect(()=>{let active=true;loadComponentsDatabase().then(data=>{if(!active)return;setDatabase(data);setCatalogId(current=>current||data.catalogs[0]?.id||"");}).catch(reason=>active&&setError(reason instanceof Error?reason.message:"Не удалось загрузить базу комплектующих"));return()=>{active=false;};},[]);
  const selectedId=catalogId||database?.catalogs[0]?.id||"",catalog=database?.catalogs.find(item=>item.id===selectedId),items=useMemo(()=>database?.items.filter(item=>item.catalogId===selectedId)??[],[database,selectedId]);
  const columns=useMemo(()=>{const counts=new Map<string,number>();for(const item of items){const labels=new Set(item.fields.map(componentFieldLabel).filter(label=>label&&!/цен|стоимост|ссылк|url/i.test(label)));for(const label of labels)counts.set(label,(counts.get(label)??0)+1);}const priority=(label:string)=>[/^(наименование|название)$/i,/^dn$/i,/^pn$|давлен/i,/диаметр/i,/материал|марка/i,/размер|резьб/i,/толщин|длин|высот|ширин/i,/масс|вес/i].findIndex(pattern=>pattern.test(label));return [...counts].sort((a,b)=>{const pa=priority(a[0]),pb=priority(b[0]),sa=(pa<0?0:10000-pa*500)+a[1],sb=(pb<0?0:10000-pb*500)+b[1];return sb-sa||a[0].localeCompare(b[0],"ru");}).slice(0,6).map(([label])=>label);},[items]);
  const filtered=useMemo(()=>{const needle=query.trim().toLocaleLowerCase("ru-RU");if(!needle)return items;return items.filter(item=>`${item.family} ${item.fields.map(field=>componentValue(field.value)).join(" ")} ${item.prices.map(price=>price.amount).join(" ")}`.toLocaleLowerCase("ru-RU").includes(needle));},[items,query]);
  const price=(item:ComponentItem)=>item.prices.length?item.prices.map(entry=><span key={`${entry.label}-${entry.amount}`} title={entry.label}>{entry.amount.toLocaleString("ru-RU",{maximumFractionDigits:2})} ₽</span>):<i>—</i>;
  if(error)return <div className="components-db__state components-db__state--error"><b>База недоступна</b><span>{error}</span></div>;
  if(!database)return <div className="components-db__state"><span className="components-db__loader"/><b>Загрузка базы комплектующих…</b></div>;
  return <div className="components-db"><div className="components-db__filters"><label><span>Тип комплектующего</span><select value={selectedId} onChange={event=>{setCatalogId(event.target.value);setQuery("");}}>{database.catalogs.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Поиск в выбранном типе</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="DN, наименование, материал…"/></label><div className="components-db__count"><b>{filtered.length.toLocaleString("ru-RU")}</b><span>позиций</span></div></div><div className="components-db__table-wrap"><table className="components-db__table"><thead><tr><th>Исполнение</th>{columns.map(column=><th key={column}>{column}</th>)}<th className="components-db__price-head">Цена</th></tr></thead><tbody>{filtered.map(item=><tr key={item.id}><td title={item.family}><b>{item.family}</b></td>{columns.map(column=>{const field=item.fields.find(candidate=>componentFieldLabel(candidate)===column);return <td key={column}>{field?componentValue(field.value):"—"}</td>;})}<td className="components-db__price">{price(item)}</td></tr>)}</tbody></table>{!filtered.length&&<div className="components-db__empty">По выбранным условиям позиции не найдены</div>}</div><footer><span>{catalog?.name}</span><span>Всего в базе: {database.statistics.componentRows.toLocaleString("ru-RU")} · с ценами: {database.statistics.pricedComponentRows.toLocaleString("ru-RU")}</span></footer></div>;
}

function PanelContent({ id, entity, input, settings, draftPoint, catalogue, onDraftPointChange, onInputChange, onSettingsChange, onAddToSpec, locked }: { id: PanelKind; entity: ProjectEntity; input: InputEntity; settings: SettingsEntity; draftPoint:{flowRate:string;head:string}; catalogue:Pump[]; onDraftPointChange:(point:{flowRate:string;head:string})=>void; onInputChange?: (patch: Partial<InputEntity>) => void; onSettingsChange?: (patch: Partial<SettingsEntity>) => void; onAddToSpec?:()=>void; locked?:boolean }) {
  if (locked) return <div className="tool-lock"><span aria-hidden="true">🔒</span><b>Второй контур заблокирован</b><p>Выберите совмещённую установку или пожаротушение и включите жокей-насос в настройках.</p></div>;
  if (id === "input" || id === "input2") return <PumpSelector input={input} settings={settings} draftPoint={draftPoint} catalogue={catalogue} onDraftPointChange={onDraftPointChange} onInputChange={onInputChange} onAddToSpec={onAddToSpec}/>;
  if (id === "chart" || id === "chart2") { if(!isCalculated(input))return <div className="pump-chart__empty">Введите параметры и нажмите «Подобрать оборудование»</div>; const selected=catalogue.find(p=>p.id===input.selectedPumpId); if(!selected)return <div className="pump-chart__empty">Для заданной рабочей точки насос не выбран</div>; const count=input.workingPumpCount,maxQ=Math.max(input.flowRate*1.2,...selected.curve.map(p=>p[0]*count)),maxPumpHead=Math.max(...selected.curve.map(p=>p[1])),maxH=maxPumpHead*1.1,systemSegments=systemCurveSegments(selected,count,input,maxQ,maxH),clipId=`plot-${selected.id}-${count}`; return (
    <div className="pump-chart">
      <div className="pump-chart__top"><div className="pump-chart__legend"><span><i className="pump-chart__dot pump-chart__dot--blue" />{selected.manufacturer} {selected.model}</span><span><i className="pump-chart__dot pump-chart__dot--orange" />Система</span></div><details className="chart-export"><summary>Export <span>⌄</span></summary><div className="chart-export__menu">{(["png","pdf","jpeg"] as ChartExportFormat[]).map(format=><button key={format} onClick={event=>{const button=event.currentTarget;void exportChart(button,format,`hydraulic-curve-${selected.model.replace(/[^a-zа-я0-9]+/gi,"-")}`).finally(()=>button.closest("details")?.removeAttribute("open"));}}>{format.toUpperCase()}</button>)}</div></details></div>
      <div className="pump-chart__canvas" aria-label="График насосной кривой">
        <span className="pump-chart__axis pump-chart__axis--y">H, м</span><span className="pump-chart__axis pump-chart__axis--x">Q, м³/ч</span>
        <svg viewBox="0 0 500 240" role="img" className="pump-chart__svg" onDoubleClick={event=>{const svg=event.currentTarget,point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;const local=point.matrixTransform(svg.getScreenCTM()!.inverse()),q=Math.max(0,Math.min(maxQ,(local.x-45)/435*maxQ)),h=Math.max(0,Math.min(maxH,(210-local.y)/190*maxH));onDraftPointChange({flowRate:q.toFixed(1),head:h.toFixed(1)});}}><defs><clipPath id={clipId}><rect x="45" y="10" width="435" height="200"/></clipPath></defs><path className="pump-chart__grid" d="M45 10V210M45 210H480M45 172H480M45 134H480M45 96H480M45 58H480M132 10V210M219 10V210M306 10V210M393 10V210"/><g clipPath={`url(#${clipId})`}>{Array.from({length:count},(_,i)=><path key={i} className={`pump-chart__line pump-chart__line--blue ${i<count-1?"pump-chart__line--muted":""}`} d={curvePath(selected,i+1,maxQ,maxH)}/>)}<path className="pump-chart__line pump-chart__line--orange" d={systemSegments.solid}/><path className="pump-chart__line pump-chart__line--orange pump-chart__line--unavailable" d={systemSegments.dashed}/><circle cx={45+(input.flowRate/maxQ)*435} cy={210-(input.head/maxH)*190} r="7"/><circle className="pump-chart__pulse" cx={45+(input.flowRate/maxQ)*435} cy={210-(input.head/maxH)*190} r="13"/></g>{Array.from({length:6},(_,i)=><g key={`tick-${i}`} className="pump-chart__ticks"><text x={45+i*87} y="228" textAnchor="middle">{(maxQ*i/5).toFixed(0)}</text><text x="38" y={214-i*40} textAnchor="end">{(maxH*i/5).toFixed(0)}</text></g>)}</svg>
      </div>
      <div className="pump-chart__metrics"><span><small>Насосов</small><b>{count} раб.</b></span><span><small>Мощность</small><b>{selected.power===null?"—":`${selected.power*count} кВт`}</b></span><span><small>КПД</small><b>{selected.efficiency===null?"—":`${selected.efficiency}%`}</b></span></div>
    </div>
  ); }
  if(id==="sketch"||id==="sketch2"){
    const selected=catalogue.find(p=>p.id===input.selectedPumpId);
    if(!selected)return <div className="pump-sketch__empty"><span aria-hidden="true">⌁</span><b>Насос ещё не выбран</b><p>Выполните подбор и выберите модель в таблице. Эскиз обновится автоматически.</p></div>;
    const sketch=pumpSketchFor(selected);
    if(!sketch)return <div className="pump-sketch__empty"><span aria-hidden="true">⌁</span><b>Чертёж не найден</b><p>Для насоса {selected.manufacturer} {selected.model} в подключённых каталогах нет подтверждённого габаритного листа.</p></div>;
    return <PumpSketchView pump={selected} sketch={sketch}/>;
  }
  if (id === "settings") return <InstallationSettings settings={settings} onChange={patch=>onSettingsChange?.(patch)}/>;
  if (id === "spec") return <Specification entity={entity as SpecEntity} settings={settings} catalogue={catalogue}/>;
  if (id === "components") return <ComponentsDatabaseView/>;
  return (
    <div className="model-view"><div className="model-view__stage"><span className="model-view__pipe model-view__pipe--one"/><span className="model-view__pipe model-view__pipe--two"/><span className="model-view__pump model-view__pump--one"/><span className="model-view__pump model-view__pump--two"/><span className="model-view__pump model-view__pump--three"/><b>3D</b></div><div className="model-view__actions"><button>⟳</button><button>⊕</button><button>⌖</button></div></div>
  );
}

function FloatingPanel({ panel, zoom, layoutMode="free", entity, input, settings, draftPoint, catalogue, onDraftPointChange, onInputChange, onSettingsChange, onAddToSpec, onFocus, onChange, onDetach, onMinimize, onClose, secondaryEnabled }: { panel: PanelState; zoom: number; layoutMode?:WorkspaceMode; entity?: ProjectEntity; input: InputEntity; settings: SettingsEntity; draftPoint:{flowRate:string;head:string}; catalogue:Pump[]; onDraftPointChange:(point:{flowRate:string;head:string})=>void; onInputChange: (patch: Partial<InputEntity>) => void; onSettingsChange:(patch:Partial<SettingsEntity>)=>void; onAddToSpec:()=>void; onFocus: () => void; onChange: (p: PanelState) => void; onDetach: () => void; onMinimize:()=>void; onClose:()=>void; secondaryEnabled:boolean }) {
  const start = useRef<{ mode: "drag" | "resize"; px: number; py: number; panel: PanelState } | null>(null);
  const docked=layoutMode!=="free";
  const begin = (mode: "drag" | "resize", e: React.PointerEvent) => { if (docked||window.innerWidth < 760) return; e.preventDefault(); onFocus(); start.current = { mode, px: e.clientX, py: e.clientY, panel }; e.currentTarget.setPointerCapture(e.pointerId); };
  const getCanvas = (target: EventTarget & Element) => target.closest(".workspace__canvas")?.getBoundingClientRect();
  const move = (e: React.PointerEvent) => {
    const s = start.current, box = getCanvas(e.currentTarget);
    if (!s || !box) return;
    const scale = zoom / 100, dx = (e.clientX - s.px) / scale, dy = (e.clientY - s.py) / scale;
    const worldW = box.width / scale, worldH = box.height / scale;
    if (s.mode === "drag") {
      onChange({ ...panel, x: Math.min(Math.max(0, s.panel.x + dx), Math.max(0, worldW - panel.w)), y: Math.min(Math.max(0, s.panel.y + dy), Math.max(0, worldH - panel.h)) });
    } else {
      onChange({ ...panel, w: Math.min(Math.max(280, s.panel.w + dx), worldW - panel.x), h: Math.min(Math.max(220, s.panel.h + dy), worldH - panel.y) });
    }
  };
  const end = (e: React.PointerEvent) => {
    const s = start.current, box = getCanvas(e.currentTarget);
    start.current = null;
    if (!s || !box || s.mode !== "drag") return;
    const detachDistance = 56;
    if (e.clientX < box.left - detachDistance || e.clientX > box.right + detachDistance || e.clientY < box.top - detachDistance || e.clientY > box.bottom + detachDistance) { onDetach(); return; }
    const scale = zoom / 100, worldW = box.width / scale, worldH = box.height / scale;
    const rawX = s.panel.x + (e.clientX - s.px) / scale, rawY = s.panel.y + (e.clientY - s.py) / scale;
    const snap = 24 / scale;
    let x = Math.min(Math.max(0, rawX), Math.max(0, worldW - s.panel.w));
    let y = Math.min(Math.max(0, rawY), Math.max(0, worldH - s.panel.h));
    if (rawX <= snap) x = 0;
    if (worldW - (rawX + s.panel.w) <= snap) x = Math.max(0, worldW - s.panel.w);
    if (rawY <= snap) y = 0;
    if (worldH - (rawY + s.panel.h) <= snap) y = Math.max(0, worldH - s.panel.h);
    onChange({ ...panel, x, y });
  };
  const tool=panel.activeTool;
  return <article className={`floating-panel floating-panel--${tool??"empty"} ${docked?`floating-panel--docked floating-panel--${layoutMode}`:""}`} style={docked?undefined:{ left: panel.x, top: panel.y, width: panel.w, height: panel.h, zIndex: panel.z }} onPointerDown={onFocus}>
    <header className="floating-panel__header" onPointerDown={(e) => begin("drag", e)} onPointerMove={move} onPointerUp={end}>
      <div className="floating-panel__identity"><span className="floating-panel__eyebrow">{tool?PANEL_INFO[tool].eyebrow:"НОВЫЙ ИНСТРУМЕНТ"}</span><select value={tool??""} aria-label="Выбрать инструмент" onPointerDown={e=>e.stopPropagation()} onChange={e=>{const activeTool=e.target.value as PanelKind;onChange({...panel,activeTool,entityId:ENTITY_BY_TOOL[activeTool]})}}><option value="" disabled>Выберите инструмент</option>{(Object.keys(PANEL_INFO) as PanelKind[]).map(kind=>{const secondary=kind==="input2"||kind==="chart2"||kind==="sketch2";return <option key={kind} value={kind} disabled={secondary&&!secondaryEnabled}>{PANEL_INFO[kind].title}{secondary&&!secondaryEnabled?" — заблокирован":""}</option>})}</select></div>
      <div className="floating-panel__tools"><button onPointerDown={(e) => e.stopPropagation()} onClick={onMinimize} aria-label="Свернуть инструмент" title="Свернуть">―</button><button onPointerDown={(e) => e.stopPropagation()} onClick={onDetach} aria-label="Открыть в новой вкладке" title="Открыть в новой вкладке"><Icon name="external" /></button><button className="floating-panel__close" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} aria-label="Закрыть инструмент" title="Закрыть"><Icon name="close" /></button></div>
    </header>
    <div className="floating-panel__body">{tool&&entity?<PanelContent id={tool} entity={entity} input={input} settings={settings} draftPoint={draftPoint} catalogue={catalogue} onDraftPointChange={onDraftPointChange} onInputChange={onInputChange} onSettingsChange={onSettingsChange} onAddToSpec={onAddToSpec} locked={(tool==="input2"||tool==="chart2"||tool==="sketch2")&&!secondaryEnabled}/>:<div className="empty-tool"><span>＋</span><b>Пустой инструмент</b><p>Выберите нужный инструмент в списке заголовка.</p></div>}</div>
    {!docked&&<span className="floating-panel__resize" onPointerDown={(e) => begin("resize", e)} onPointerMove={move} onPointerUp={end} />}
  </article>;
}

function GridWorkspace({ grid, panels, secondaryEnabled, renderPanel, onGridChange, onCreate }: { grid:WorkspaceGrid; panels:PanelState[]; secondaryEnabled:boolean; renderPanel:(panel:PanelState,mode:WorkspaceMode)=>React.ReactNode; onGridChange:(grid:WorkspaceGrid)=>void; onCreate:(cell:number,tool:PanelKind)=>void }) {
  const containerRef=useRef<HTMLDivElement>(null),resizeRef=useRef<{axis:"column"|"row";index:number;start:number;sizes:number[]} | null>(null);
  const beginResize=(axis:"column"|"row",index:number,event:React.PointerEvent<HTMLButtonElement>)=>{event.preventDefault();const coordinate=axis==="column"?event.clientX:event.clientY;resizeRef.current={axis,index,start:coordinate,sizes:[...(axis==="column"?grid.columnSizes:grid.rowSizes)]};event.currentTarget.setPointerCapture(event.pointerId);};
  const moveResize=(event:React.PointerEvent<HTMLButtonElement>)=>{const active=resizeRef.current,box=containerRef.current?.getBoundingClientRect();if(!active||!box)return;const length=active.axis==="column"?box.width:box.height,coordinate=active.axis==="column"?event.clientX:event.clientY,total=active.sizes.reduce((sum,value)=>sum+value,0),delta=(coordinate-active.start)/Math.max(1,length)*total,min=Math.max(.1,total*.06),left=active.sizes[active.index]+delta,right=active.sizes[active.index+1]-delta;if(left<min||right<min)return;const sizes=[...active.sizes];sizes[active.index]=left;sizes[active.index+1]=right;onGridChange(active.axis==="column"?{...grid,columnSizes:sizes}:{...grid,rowSizes:sizes});};
  const endResize=(event:React.PointerEvent<HTMLButtonElement>)=>{resizeRef.current=null;event.currentTarget.releasePointerCapture(event.pointerId);};
  const positions=(sizes:number[])=>{const total=sizes.reduce((sum,value)=>sum+value,0);let sum=0;return sizes.slice(0,-1).map(value=>{sum+=value;return sum/total*100;});};
  return <div ref={containerRef} className="workspace-grid" style={{gridTemplateColumns:grid.columnSizes.map(value=>`minmax(0,${value}fr)`).join(" "),gridTemplateRows:grid.rowSizes.map(value=>`minmax(0,${value}fr)`).join(" ")}}>
    {Array.from({length:grid.rows*grid.columns},(_,cell)=>{const assigned=panels.find(candidate=>candidate.id===grid.cells[cell]),panel=assigned&&!assigned.minimized?assigned:undefined;return <section className="workspace-grid__cell" key={cell}>{panel?renderPanel(panel,"grid"):assigned?<div className="workspace-grid__reserved"><span>―</span><b>{assigned.activeTool?PANEL_INFO[assigned.activeTool].title:"Пустой инструмент"}</b><small>Инструмент свёрнут в нижнюю панель</small></div>:<div className="workspace-grid__empty"><span aria-hidden="true">＋</span><b>Пустая ячейка</b><select aria-label={`Выбрать инструмент для ячейки ${cell+1}`} defaultValue="" onChange={event=>{const tool=event.target.value as PanelKind;if(tool)onCreate(cell,tool);}}><option value="" disabled>Выберите инструмент</option>{(Object.keys(PANEL_INFO) as PanelKind[]).map(kind=>{const secondary=kind==="input2"||kind==="chart2"||kind==="sketch2";return <option key={kind} value={kind} disabled={secondary&&!secondaryEnabled}>{PANEL_INFO[kind].title}</option>})}</select></div>}</section>;})}
    {positions(grid.columnSizes).map((position,index)=><button key={`column-${index}`} className="workspace-grid__divider workspace-grid__divider--column" style={{left:`${position}%`}} aria-label={`Изменить ширину столбцов ${index+1} и ${index+2}`} onPointerDown={event=>beginResize("column",index,event)} onPointerMove={moveResize} onPointerUp={endResize}/>)}
    {positions(grid.rowSizes).map((position,index)=><button key={`row-${index}`} className="workspace-grid__divider workspace-grid__divider--row" style={{top:`${position}%`}} aria-label={`Изменить высоту строк ${index+1} и ${index+2}`} onPointerDown={event=>beginResize("row",index,event)} onPointerMove={moveResize} onPointerUp={endResize}/>)}
  </div>;
}

type AccountUser={id:string;email:string;name:string};
type StoredProject={id:string;name:string;createdAt:string;updatedAt:string;config:ProjectConfig};
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toLocaleUpperCase("ru-RU")).join("")||"ПС";

function ProjectsPage({user,projects,onOpen,onCreate,onDelete,onLogout}:{user:AccountUser;projects:StoredProject[];onOpen:(project:StoredProject)=>void;onCreate:()=>void;onDelete:(project:StoredProject)=>void;onLogout:()=>void}){
  return <div className="projects-page"><header className="projects-header"><Link className="brand" href="/"><span className="brand__mark">PS</span><span><b>Pump Station</b><small>Calculator</small></span></Link><div className="projects-header__actions"><span className="save-state">{user.email}</span><button className="avatar" title={user.name}>{initials(user.name)}</button><button className="button" onClick={onLogout}>Выйти</button></div></header><main className="projects-main"><div className="projects-main__title"><div><h1>Мои проекты</h1><p>Откройте сохранённый расчёт и продолжите работу с того же места.</p></div><button className="button button--primary" style={{width:"auto"}} onClick={onCreate}>＋ Новый проект</button></div>{projects.length?<div className="projects-grid">{projects.map(project=><article className="project-card" key={project.id}><span className="project-card__icon">▦</span><h2>{project.name}</h2><p>Изменён {new Date(project.updatedAt).toLocaleString("ru-RU",{dateStyle:"medium",timeStyle:"short"})}</p><p>{project.id}</p><div className="project-card__actions"><button onClick={()=>onOpen(project)}>Открыть проект</button><button onClick={()=>onDelete(project)} aria-label={`Удалить ${project.name}`}>Удалить</button></div></article>)}</div>:<div className="projects-empty"><span>▦</span><b>У вас пока нет сохранённых проектов</b><p>Создайте первый проект, чтобы начать расчёт насосной станции.</p></div>}</main></div>;
}

export default function Home() {
  const [sidebar, setSidebar] = useState(false);
  const [config, setConfig] = useState<ProjectConfig>(() => createProject("Насосная станция № 24", { id:"PS-NEW", timestamp:"2000-01-01T00:00:00.000Z" }));
  const [activeTab, setActiveTab] = useState("Проект");
  const [detached, setDetached] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("Все изменения сохранены");
  const [account,setAccount]=useState<AccountUser|null>(null);
  const [accountLoading,setAccountLoading]=useState(true);
  const [projects,setProjects]=useState<StoredProject[]>([]);
  const [view,setView]=useState<"workspace"|"projects">(()=>typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("view")==="projects"?"projects":"workspace");
  const [catalogue,setCatalogue] = useState<Pump[]>([]);
  const [controlCabinets,setControlCabinets] = useState<ControlCabinet[]>([]);
  const [draftPoint,setDraftPoint]=useState({flowRate:"",head:""});
  const [draftPoint2,setDraftPoint2]=useState({flowRate:"",head:""});
  const fileInput = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);
  const history = useRef<ProjectConfig[]>([]);
  const historyIndex = useRef(-1);
  const [historyState, setHistoryState] = useState({ canUndo:false, canRedo:false });
  const panels = config.workspace.windows;
  const zoom = config.workspace.zoom;
  const workspaceMode=config.workspace.mode;
  const workspaceGrid=config.workspace.grid;
  const inputEntity = config.entities["system-input"] as InputEntity;
  const inputEntity2 = config.entities["system-input-2"] as InputEntity;
  const settingsEntity = config.entities["station-settings"] as SettingsEntity;
  const secondaryEnabled = isSecondaryEnabled(settingsEntity);
  const updateDraftPoint=(point:{flowRate:string;head:string})=>setDraftPoint(point);

  useEffect(() => {
    const params=new URLSearchParams(window.location.search),panel=params.get("panel"),requestedProject=params.get("project");
    void fetch("/api/auth",{cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error();const {user}=await response.json() as {user:AccountUser};setAccount(user);const projectResponse=await fetch("/api/projects",{cache:"no-store"});if(!projectResponse.ok)throw new Error();const data=await projectResponse.json() as {projects:StoredProject[]};setProjects(data.projects);const selected=data.projects.find(item=>item.id===requestedProject)??data.projects[0],loaded=selected?parseProjectConfig(selected.config):createProject("Новая насосная станция");setConfig(loaded);history.current=[loaded];historyIndex.current=0;if(panel&&loaded.workspace.windows.some(item=>item.id===panel))setDetached(panel);hydrated.current=true;}).catch(()=>setAccount(null)).finally(()=>setAccountLoading(false));
  }, []);
  useEffect(()=>{fetch("/pumps.json",{cache:"no-store"}).then(response=>response.ok?response.json():Promise.reject()).then((data:Pump[])=>setCatalogue(data)).catch(()=>setSaveMessage("Не удалось загрузить каталог насосов"));},[]);
  useEffect(()=>{fetch("/control-cabinets.json",{cache:"no-store"}).then(response=>response.ok?response.json():Promise.reject()).then((data:ControlCabinet[])=>setControlCabinets(data)).catch(()=>setSaveMessage("Не удалось загрузить каталог шкафов управления"));},[]);
  useEffect(()=>{
    if(!catalogue.length||!controlCabinets.length)return;
    setConfig(current=>{
      const settings=current.entities["station-settings"] as SettingsEntity;
      const spec=current.entities["station-spec"] as SpecEntity;
      const pump=catalogue.find(item=>item.id===current.station.selectedPumpId);
      const total=current.station.totalPumpCount;
      if(!pump||typeof total!=="number"||!isAutomaticCabinetSelectionEnabled(settings))return current;
      const nextControl=controlCabinetItem(selectControlCabinet(controlCabinets,settings,pump,total),settings,pump,total);
      const currentControl=spec.items.find(item=>item.section==="control"||/шкаф/i.test(item.name));
      if(currentControl&&JSON.stringify(currentControl)===JSON.stringify(nextControl))return current;
      const items=[...spec.items.filter(item=>item.section!=="control"&&!/шкаф/i.test(item.name)),nextControl].sort((a,b)=>a.position.localeCompare(b.position,"ru",{numeric:true}));
      return {...current,entities:{...current.entities,"station-spec":{...spec,items}}};
    });
  },[catalogue,controlCabinets]);
  useEffect(() => {
    if (!hydrated.current||!account) return;
    setSaveMessage("Сохранение…");
    const timer = window.setTimeout(() => { const saved=withUpdatedTimestamp(config);fetch("/api/projects",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({config:saved})}).then(response=>{if(!response.ok)throw new Error();setProjects(current=>{const entry:StoredProject={id:saved.project.id,name:saved.project.name,createdAt:saved.project.createdAt,updatedAt:saved.project.updatedAt,config:saved};return [entry,...current.filter(item=>item.id!==entry.id)].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));});setSaveMessage("Все изменения сохранены");}).catch(()=>setSaveMessage("Ошибка сохранения")); }, 500);
    return () => window.clearTimeout(timer);
  }, [config,account]);

  const refreshHistoryState = () => setHistoryState({ canUndo:historyIndex.current>0, canRedo:historyIndex.current<history.current.length-1 });
  const updateConfig = (change: (current: ProjectConfig) => ProjectConfig) => setConfig(current => {
    const next=withUpdatedTimestamp(change(current));
    if (hydrated.current && JSON.stringify(next)!==JSON.stringify(current)) { history.current=history.current.slice(0,historyIndex.current+1); history.current.push(next); historyIndex.current=history.current.length-1; queueMicrotask(refreshHistoryState); }
    return next;
  });
  const undo = () => { if(historyIndex.current<=0)return; historyIndex.current--; setConfig(history.current[historyIndex.current]); refreshHistoryState(); };
  const redo = () => { if(historyIndex.current>=history.current.length-1)return; historyIndex.current++; setConfig(history.current[historyIndex.current]); refreshHistoryState(); };
  const setPanels = (change: (panels: PanelState[]) => PanelState[]) => updateConfig(current => ({ ...current, workspace: { ...current.workspace, windows: change(current.workspace.windows) } }));
  const setZoom = (change: number | ((zoom: number) => number)) => updateConfig(current => ({ ...current, workspace: { ...current.workspace, zoom: typeof change === "function" ? change(current.workspace.zoom) : change } }));
  const setWorkspaceMode=(mode:WorkspaceMode)=>updateConfig(current=>{if(mode!=="grid")return {...current,workspace:{...current.workspace,mode}};const visible=current.workspace.windows.filter(panel=>!panel.minimized),cells=current.workspace.grid.cells.map(id=>visible.some(panel=>panel.id===id)?id:null),assigned=new Set(cells.filter((id):id is string=>Boolean(id))),remaining=visible.filter(panel=>!assigned.has(panel.id));for(let index=0;index<cells.length&&remaining.length;index++)if(!cells[index]){const panel=remaining.shift()!;cells[index]=panel.id;assigned.add(panel.id);}const windows=current.workspace.windows.map(panel=>!panel.minimized&&!assigned.has(panel.id)?{...panel,minimized:true}:panel);return {...current,workspace:{...current.workspace,mode,grid:{...current.workspace.grid,cells},windows}};});
  const setWorkspaceGrid=(grid:WorkspaceGrid)=>updateConfig(current=>({...current,workspace:{...current.workspace,grid}}));
  const applyGridTemplate=(columns:number,rows:number)=>updateConfig(current=>{const visible=current.workspace.windows.filter(panel=>!panel.minimized),assigned=current.workspace.grid.cells.map(id=>visible.find(panel=>panel.id===id)?.id).filter((id):id is string=>Boolean(id)),remaining=visible.map(panel=>panel.id).filter(id=>!assigned.includes(id)),ids=[...assigned,...remaining],selected=new Set(ids.slice(0,columns*rows)),windows=current.workspace.windows.map(panel=>!panel.minimized&&!selected.has(panel.id)?{...panel,minimized:true}:{...panel,minimized:selected.has(panel.id)?false:panel.minimized});return {...current,workspace:{...current.workspace,mode:"grid",grid:{columns,rows,columnSizes:Array.from({length:columns},()=>1),rowSizes:Array.from({length:rows},()=>1),cells:Array.from({length:columns*rows},(_,index)=>ids[index]??null)},windows}};});
  const addGridColumn=()=>updateConfig(current=>{const grid=current.workspace.grid;if(grid.columns>=6)return current;const columns=grid.columns+1,cells=Array.from({length:grid.rows},(_,row)=>[...grid.cells.slice(row*grid.columns,(row+1)*grid.columns),null]).flat();return {...current,workspace:{...current.workspace,grid:{...grid,columns,columnSizes:[...grid.columnSizes,1],cells}}};});
  const addGridRow=()=>updateConfig(current=>{const grid=current.workspace.grid;if(grid.rows>=6)return current;return {...current,workspace:{...current.workspace,grid:{...grid,rows:grid.rows+1,rowSizes:[...grid.rowSizes,1],cells:[...grid.cells,...Array.from({length:grid.columns},()=>null)]}}};});
  const focus = (id: string) => setPanels(p => p.map(item => item.id === id ? { ...item, z: Math.max(0,...p.map(v => v.z)) + 1 } : item));
  const change = (next: PanelState) => setPanels(p => p.map(item => item.id === next.id ? next : item));
  const openPanel = (id: string) => window.open(`${window.location.pathname}?panel=${encodeURIComponent(id)}`, "_blank", "noopener,noreferrer");
  const addPanel = () => updateConfig(current=>{const windows=current.workspace.windows,index=windows.length,maxZ=Math.max(0,...windows.map(panel=>panel.z)),panel:PanelState={id:`tool-${Date.now()}`,entityId:"station-model",x:24+(index%5)*34,y:24+(index%5)*34,w:430,h:320,z:maxZ+1};if(current.workspace.mode!=="grid")return {...current,workspace:{...current.workspace,windows:[...windows,panel]}};let grid=current.workspace.grid,cell=grid.cells.findIndex(id=>!id||!windows.some(candidate=>candidate.id===id));if(cell<0&&grid.rows<6){cell=grid.cells.length;grid={...grid,rows:grid.rows+1,rowSizes:[...grid.rowSizes,1],cells:[...grid.cells,...Array.from({length:grid.columns},()=>null)]};}if(cell>=0){const cells=[...grid.cells];cells[cell]=panel.id;grid={...grid,cells};}return {...current,workspace:{...current.workspace,grid,windows:[...windows,panel]}};});
  const createGridTool=(cell:number,activeTool:PanelKind)=>updateConfig(current=>{const windows=current.workspace.windows,maxZ=Math.max(0,...windows.map(panel=>panel.z)),panel:PanelState={id:`grid-tool-${Date.now()}-${cell}`,activeTool,entityId:ENTITY_BY_TOOL[activeTool],x:0,y:0,w:430,h:320,z:maxZ+1},cells=[...current.workspace.grid.cells];cells[cell]=panel.id;return {...current,workspace:{...current.workspace,windows:[...windows,panel],grid:{...current.workspace.grid,cells}}};});
  const minimizePanel = (id:string) => setPanels(current=>current.map(panel=>panel.id===id?{...panel,minimized:true}:panel));
  const restorePanel = (id:string) => updateConfig(current=>{const windows=current.workspace.windows,maxZ=Math.max(0,...windows.map(panel=>panel.z)),nextWindows=windows.map(panel=>panel.id===id?{...panel,minimized:false,z:maxZ+1}:panel);if(current.workspace.mode!=="grid"||current.workspace.grid.cells.includes(id))return {...current,workspace:{...current.workspace,windows:nextWindows}};let grid=current.workspace.grid,cell=grid.cells.findIndex(value=>!value||!windows.some(panel=>panel.id===value));if(cell<0&&grid.rows<6){cell=grid.cells.length;grid={...grid,rows:grid.rows+1,rowSizes:[...grid.rowSizes,1],cells:[...grid.cells,...Array.from({length:grid.columns},()=>null)]};}if(cell>=0){const cells=[...grid.cells];cells[cell]=id;grid={...grid,cells};}return {...current,workspace:{...current.workspace,windows:nextWindows,grid}};});
  const closePanel = (id:string) => updateConfig(current=>({...current,workspace:{...current.workspace,windows:current.workspace.windows.filter(panel=>panel.id!==id),grid:{...current.workspace.grid,cells:current.workspace.grid.cells.map(cell=>cell===id?null:cell)}}}));
  const updateInput = (patch: Partial<InputEntity>) => updateConfig(current => ({ ...current, entities: { ...current.entities, "system-input": { ...(current.entities["system-input"] as InputEntity), ...patch } } }));
  const updateInput2 = (patch: Partial<InputEntity>) => updateConfig(current => ({ ...current, entities: { ...current.entities, "system-input-2": { ...(current.entities["system-input-2"] as InputEntity), ...patch } } }));
  const updateSettings = (patch: Partial<SettingsEntity>) => updateConfig(current => {
    const settings={ ...(current.entities["station-settings"] as SettingsEntity), ...patch };
    const spec=current.entities["station-spec"] as SpecEntity,pump=catalogue.find(item=>item.id===current.station.selectedPumpId),total=current.station.totalPumpCount;
    const items=pump&&typeof total==="number"?[...spec.items.filter(item=>item.section!=="control"&&!/шкаф/i.test(item.name)),isAutomaticCabinetSelectionEnabled(settings)?controlCabinetItem(selectControlCabinet(controlCabinets,settings,pump,total),settings,pump,total):manualControlCabinetItem(settings.stationType)].sort((a,b)=>a.position.localeCompare(b.position,"ru",{numeric:true})):spec.items;
    return { ...current, entities: { ...current.entities, "station-settings": settings, "station-spec":{...spec,items} } };
  });
  const addSelectedPumpToSpec = (secondary = false) => {
    const activeInput=secondary?inputEntity2:inputEntity;
    if (!isCalculated(activeInput) || (secondary&&!secondaryEnabled)) return;
    const pump=catalogue.find(item=>item.id===activeInput.selectedPumpId); if(!pump)return;
    const total=activeInput.workingPumpCount+activeInput.reservePumpCount,position=secondary?"02":"01";
    updateConfig(current=>{const spec=current.entities["station-spec"] as SpecEntity;const settings=current.entities["station-settings"] as SettingsEntity;const pumpItem:SpecItem={position,name:`Насос ${pump.manufacturer} ${pump.model}`,details:`${pump.power===null?"Мощность не указана":`${pump.power} кВт`} · ${pump.series} · ${activeInput.workingPumpCount} раб. + ${activeInput.reservePumpCount} рез.`,quantity:total,unit:"шт.",price:pumpPriceRub(pump,settings),equipmentId:pump.id,listPrice:pump.price,priceCurrency:pump.priceCurrency,manufacturer:pump.manufacturer,description:secondary?"Насос второго контура":"Рабочие и резервные насосы",section:"pump",option:secondary?"secondaryPump":undefined,status:"selected"};const nonPumps=spec.items.filter(item=>item.section!=="pump"&&!/^Насос\b/i.test(item.name)),existingPumps=spec.items.filter(item=>item.section==="pump"||/^Насос\b/i.test(item.name)),otherPump=existingPumps.find(item=>secondary?item.position==="01"&&item.option!=="secondaryPump":item.position==="02"||item.option==="secondaryPump");const pumps=secondary?(otherPump?[otherPump,pumpItem]:[pumpItem]):(otherPump?[pumpItem,otherPump]:[pumpItem]);const existingCabinet=nonPumps.find(item=>item.section==="control"||/шкаф/i.test(item.name));const withoutOldCabinet=nonPumps.filter(item=>item.section!=="control"&&!/шкаф/i.test(item.name));const cabinetItem=!secondary&&isAutomaticCabinetSelectionEnabled(settings)?controlCabinetItem(selectControlCabinet(controlCabinets,settings,pump,total),settings,pump,total):existingCabinet;return {...current,station:secondary?{...current.station,secondaryPumpId:pump.id,secondaryPumpModel:`${pump.manufacturer} ${pump.model}`,secondaryWorkingPumpCount:activeInput.workingPumpCount,secondaryReservePumpCount:activeInput.reservePumpCount,secondaryTotalPumpCount:total}:{...current.station,selectedPumpId:pump.id,selectedPumpModel:`${pump.manufacturer} ${pump.model}`,workingPumpCount:activeInput.workingPumpCount,reservePumpCount:activeInput.reservePumpCount,totalPumpCount:total},entities:{...current.entities,"station-spec":{...spec,items:[...pumps.slice(0,2),...(cabinetItem?[cabinetItem]:[]),...withoutOldCabinet].sort((a,b)=>a.position.localeCompare(b.position,"ru",{numeric:true}))}}};});
    setSaveMessage(secondary?"Второй насос записан в спецификацию":"Насос записан в спецификацию");
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(withUpdatedTimestamp(config), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = projectFilename(config); link.click(); URL.revokeObjectURL(url);
  };
  const openFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try { const loaded=parseProjectConfig(JSON.parse(await file.text())); setConfig(loaded); history.current=[loaded]; historyIndex.current=0; refreshHistoryState(); setSaveMessage(`Загружен файл ${file.name}`); }
    catch (error) { window.alert(error instanceof Error ? error.message : "Не удалось открыть проект"); }
  };
  const rename = () => { const name = window.prompt("Название проекта", config.project.name)?.trim(); if (name) updateConfig(current => ({ ...current, project: { ...current.project, name } })); };
  const openStoredProject=(project:StoredProject)=>{const loaded=parseProjectConfig(project.config);setConfig(loaded);history.current=[loaded];historyIndex.current=0;refreshHistoryState();setView("workspace");window.history.replaceState({},"",`/?project=${encodeURIComponent(project.id)}`);};
  const newProject = () => { if (view==="projects"||window.confirm("Создать новый проект? Все изменения текущего проекта уже сохранены.")) { const fresh=createProject(); setConfig(fresh); history.current=[fresh]; historyIndex.current=0; refreshHistoryState();setView("workspace");window.history.replaceState({},"","/"); } };
  const deleteProject=async(project:StoredProject)=>{if(!window.confirm(`Удалить проект «${project.name}»? Это действие нельзя отменить.`))return;const response=await fetch(`/api/projects?id=${encodeURIComponent(project.id)}`,{method:"DELETE"});if(response.ok)setProjects(current=>current.filter(item=>item.id!==project.id));else window.alert("Не удалось удалить проект.");};
  const logout=async()=>{await fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"logout"})});window.location.replace("/");};

  if(accountLoading)return <main className="auth-page"><section className="auth-intro"><Link className="brand auth-brand" href="/"><span className="brand__mark">PS</span><span><b>Pump Station</b><small>Calculator</small></span></Link></section><section className="auth-panel"><div className="auth-card"><span className="auth-icon">PS</span><h2>Загрузка</h2><p>Подготавливаем рабочее пространство…</p></div></section></main>;
  if(!account){const auth=new URLSearchParams(window.location.search).get("auth"),mode=auth==="verify"?"verify":auth==="reset"?"reset":"login";return <AccountScreen initialMode={mode}/>;}
  if(view==="projects")return <ProjectsPage user={account} projects={projects} onOpen={openStoredProject} onCreate={newProject} onDelete={deleteProject} onLogout={logout}/>;

  if (detached) { const windowState = panels.find(panel => panel.id === detached),tool=windowState?.activeTool; if(!windowState)return null; const secondary=tool==="input2"||tool==="chart2"||tool==="sketch2",entity=tool?config.entities[ENTITY_BY_TOOL[tool]]:undefined,activeInput=secondary?inputEntity2:inputEntity; return <main className="detached"><header className="detached__header"><div className="brand"><span className="brand__mark">PS</span><span><b>Pump Station</b><small>Calculator</small></span></div><span>{tool?PANEL_INFO[tool].title:"Пустой инструмент"}</span></header><section className="detached__content">{tool&&entity?<PanelContent id={tool} entity={entity} input={activeInput} settings={settingsEntity} draftPoint={secondary?draftPoint2:draftPoint} catalogue={catalogue} onDraftPointChange={secondary?setDraftPoint2:updateDraftPoint} onInputChange={secondary?updateInput2:updateInput} onSettingsChange={updateSettings} onAddToSpec={()=>addSelectedPumpToSpec(secondary)} locked={secondary&&!secondaryEnabled}/>:<div className="empty-tool"><span>＋</span><b>Пустой инструмент</b></div>}</section></main>; }

  const minimizedPanels=panels.filter(panel=>panel.minimized);
  const renderWorkspacePanel=(panel:PanelState,mode:WorkspaceMode="free")=>{const tool=panel.activeTool,secondary=tool==="input2"||tool==="chart2"||tool==="sketch2";return <FloatingPanel key={panel.id} panel={panel} zoom={zoom} layoutMode={mode} entity={tool?config.entities[ENTITY_BY_TOOL[tool]]:undefined} input={secondary?inputEntity2:inputEntity} settings={settingsEntity} draftPoint={secondary?draftPoint2:draftPoint} catalogue={catalogue} onDraftPointChange={secondary?setDraftPoint2:updateDraftPoint} onInputChange={secondary?updateInput2:updateInput} onSettingsChange={updateSettings} onAddToSpec={()=>addSelectedPumpToSpec(secondary)} secondaryEnabled={secondaryEnabled} onFocus={()=>focus(panel.id)} onChange={change} onDetach={()=>openPanel(panel.id)} onMinimize={()=>minimizePanel(panel.id)} onClose={()=>closePanel(panel.id)}/>;};
  const workspaceHint=workspaceMode==="free"?"Окна можно перемещать, масштабировать и прикреплять к границам":workspaceMode==="mobile"?"Один инструмент в строке на всю ширину рабочего пространства":`Фиксированная сетка ${workspaceGrid.columns} × ${workspaceGrid.rows}`;
  return <div className={`app-shell app-shell--${workspaceMode} ${minimizedPanels.length?"app-shell--tasks":""}`}>
    <header className="app-header">
      <button className="icon-button app-header__menu" onClick={() => setSidebar(true)} aria-label="Открыть меню"><Icon name="menu" /></button>
      <Link className="brand" href="/"><span className="brand__mark">PS</span><span><b>Pump Station</b><small>Calculator</small></span></Link>
      <div className="app-header__project"><small>ТЕКУЩИЙ ПРОЕКТ</small><button onClick={rename}>{config.project.name} <span>✎</span></button></div>
      <div className="app-header__actions"><span className="save-state"><i />{saveMessage}</span><button className="avatar" onClick={()=>{setSidebar(true)}} title={account.name}>{initials(account.name)}</button></div>
    </header>

    <div className={`sidebar ${sidebar ? "sidebar--open" : ""}`}><button className="sidebar__backdrop" onClick={() => setSidebar(false)} aria-label="Закрыть меню"/><aside className="sidebar__panel"><div className="sidebar__top"><div className="brand"><span className="brand__mark">PS</span><span><b>Pump Station</b><small>Calculator</small></span></div><button className="icon-button" onClick={() => setSidebar(false)}><Icon name="close" /></button></div><div className="user-card"><span className="avatar avatar--large">{initials(account.name)}</span><div><b>{account.name}</b><small>{account.email}</small></div></div><nav className="sidebar__nav"><Link className="sidebar__link sidebar__link--active" href="/">▦ <span>Рабочее пространство</span></Link><Link className="sidebar__link" href="/?view=projects">▤ <span>Мои проекты</span><em>{projects.length}</em></Link><Link className="sidebar__link" href="/?view=equipment">⌁ <span>База оборудования</span></Link><Link className="sidebar__link" href="/?view=settings">⚙ <span>Настройки</span></Link><button className="sidebar__link" onClick={logout}>↪ <span>Выйти</span></button></nav><div className="sidebar__footer"><button>?</button><span><b>Центр помощи</b><small>Документация и поддержка</small></span></div></aside></div>

    <nav className="ribbon">
      <div className="ribbon__tabs">{["Проект", "Вставка", "Расчёт", "Вид"].map(t => <button key={t} className={activeTab === t ? "ribbon__tab ribbon__tab--active" : "ribbon__tab"} onClick={() => setActiveTab(t)}>{t}</button>)}</div>
      <div className="ribbon__tools"><div className="tool-group"><button onClick={undo} disabled={!historyState.canUndo} title="Назад"><Icon name="undo" /></button><button onClick={redo} disabled={!historyState.canRedo} title="Вперёд"><Icon name="redo" /></button></div><span className="ribbon__divider"/>{activeTab==="Вид"?<><div className="view-modes" role="group" aria-label="Режим рабочего пространства"><button className={workspaceMode==="free"?"view-modes__button view-modes__button--active":"view-modes__button"} onClick={()=>setWorkspaceMode("free")}><b>◇</b><span>Свободные окна</span></button><button className={workspaceMode==="mobile"?"view-modes__button view-modes__button--active":"view-modes__button"} onClick={()=>setWorkspaceMode("mobile")}><b>▤</b><span>Mobile</span></button><details className={`view-grid-menu ${workspaceMode==="grid"?"view-grid-menu--active":""}`}><summary className="view-modes__button"><b>▦</b><span>Сетка</span><i aria-hidden="true">⌄</i></summary><div className="view-grid-menu__list" aria-label="Выбор сетки"><strong>Выберите сетку</strong>{[[2,2],[3,2],[2,3]].map(([columns,rows])=><button key={`${columns}x${rows}`} className={workspaceMode==="grid"&&workspaceGrid.columns===columns&&workspaceGrid.rows===rows?"grid-presets__button grid-presets__button--active":"grid-presets__button"} onClick={event=>{applyGridTemplate(columns,rows);event.currentTarget.closest("details")?.removeAttribute("open");}}><b>{columns} × {rows}</b><small>{columns} столб. · {rows} стр.</small></button>)}</div></details></div>{workspaceMode==="grid"&&<><span className="ribbon__divider"/><div className="grid-actions"><button onClick={addGridColumn} disabled={workspaceGrid.columns>=6}><b>＋▥</b><small>Столбец</small></button><button onClick={addGridRow} disabled={workspaceGrid.rows>=6}><b>＋▤</b><small>Строка</small></button></div></>}</>:<><div className="tool-group tool-group--labeled"><button onClick={newProject}><b>＋</b><small>Новый</small></button><button onClick={() => fileInput.current?.click()}><b>↥</b><small>Открыть JSON</small></button><input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={openFile} /></div><span className="ribbon__divider"/><div className="tool-group tool-group--labeled"><button onClick={() => setPanels(() => DEFAULT_PANELS.map(panel => ({ ...panel }))) }><b>▦</b><small>Упорядочить</small></button><button onClick={addPanel}><b>＋</b><small>Добавить инструмент</small></button></div><span className="ribbon__divider"/><div className="tool-group tool-group--labeled"><button onClick={() => { const saved=withUpdatedTimestamp(config);setConfig(saved);setSaveMessage("Сохранение…"); }}><b>▣</b><small>Сохранить</small></button><button onClick={download}><b>↓</b><small>Экспорт JSON</small></button><button><b>▷</b><small>Запустить расчёт</small></button></div></>}<span className="ribbon__hint">{activeTab}: инструменты проекта</span></div>
    </nav>

    <main className={`workspace workspace--${workspaceMode}`}><div className="workspace__bar"><div><span className="workspace__status"/><b>Рабочее пространство</b><small>{workspaceHint}</small></div>{workspaceMode==="free"&&<div className="workspace__zoom"><button onClick={() => setZoom(value => Math.max(50, value - 10))} disabled={zoom === 50} aria-label="Уменьшить масштаб">−</button><button className="workspace__zoom-value" onClick={() => setZoom(100)} aria-label="Сбросить масштаб">{zoom}%</button><button onClick={() => setZoom(value => Math.min(150, value + 10))} disabled={zoom === 150} aria-label="Увеличить масштаб">＋</button></div>}</div>{workspaceMode==="free"?<div className="workspace__canvas"><div className="workspace__surface" style={{width:`${10000/zoom}%`,height:`${10000/zoom}%`,transform:`scale(${zoom/100})`}}>{panels.filter(panel=>!panel.minimized).map(panel=>renderWorkspacePanel(panel,"free"))}</div></div>:workspaceMode==="mobile"?<div className="workspace__canvas workspace__canvas--mobile"><div className="workspace-mobile">{panels.filter(panel=>!panel.minimized).map(panel=>renderWorkspacePanel(panel,"mobile"))}</div></div>:<div className="workspace__canvas workspace__canvas--grid"><GridWorkspace grid={workspaceGrid} panels={panels} secondaryEnabled={secondaryEnabled} renderPanel={renderWorkspacePanel} onGridChange={setWorkspaceGrid} onCreate={createGridTool}/></div>}</main>
    {minimizedPanels.length>0&&<div className="window-dock" role="toolbar" aria-label="Свернутые инструменты"><span className="window-dock__label">Свернутые</span>{minimizedPanels.map(panel=><button key={panel.id} onClick={()=>restorePanel(panel.id)}><i aria-hidden="true"/>{panel.activeTool?PANEL_INFO[panel.activeTool].title:"Пустой инструмент"}<span>Развернуть</span></button>)}</div>}
    <footer className="app-footer"><span>Проект: {config.project.id}</span><span>Формат проекта v{config.schemaVersion} · JSON</span><span>RU <i>•</i> {new Date(config.project.updatedAt).toLocaleDateString("ru-RU")}</span></footer>
  </div>;
}







