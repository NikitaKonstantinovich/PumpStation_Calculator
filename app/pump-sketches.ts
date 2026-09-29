import type { Pump } from "./pump-catalog";

export type PumpSketchInfo = { src:string; caption:string; source:string };
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
export const pumpSketchFor=(pump:Pump):PumpSketchInfo|undefined=>{
  const manufacturer=pump.manufacturer.toUpperCase(),normalized=pump.model.toUpperCase().replace(/\s+/g," ").trim(),compact=normalized.replace(/\s+/g,"");
  if(pump.drawing&&pump.drawingSource)return {src:pump.drawing,caption:`Чертёж · ${pump.manufacturer} ${pump.model}`,source:pump.drawingSource};
  if(manufacturer==="CNP"){
    if(pump.drawing&&pump.series==="TD")return {src:pump.drawing,caption:`Габаритный чертёж CNP TD · модель ${pump.model}`,source:"Официальный архив CNP Russia «TD Габаритные чертежи PNG»"};
    if(pump.drawing)return {src:pump.drawing,caption:`Взрыв-схема CNP · модель ${pump.model}`,source:"Локальная программа подбора CNP · структурный чертёж серии SPump"};
    const drawing=CNP_DIMENSION_DRAWINGS[normalized]??Object.entries(CNP_DIMENSION_DRAWINGS).find(([model])=>model.replace(/\s/g,"").replace("CHLF(T)","CHLF")===compact)?.[1];
    if(drawing&&(!pump.execution||pump.execution===drawing.partCode))return {src:`/cnp-model-drawings/${drawing.file}`,caption:`Габаритный чертёж ${pump.model} · ${drawing.partCode}`,source:"Локальная программа подбора CNP · точная связь SPump.mdb"};
    const cdmFamily=compact.match(/^CDM(1|3|5|10|15|20|32|42|65|85|95|120|125|150|155|185|200|215)-/)?.[1],cdmDrawing=cdmFamily?CNP_CATALOG_DIMENSION_DRAWINGS[cdmFamily]:undefined;
    if(cdmDrawing)return {src:`/cnp-drawings-archive/${cdmDrawing.file}`,caption:`Габаритный лист CNP · модель ${pump.model}${pump.execution?` · исполнение ${pump.execution}: размеры сверять с актуальными данными базы`:""}`,source:`Официальный каталог CNP CDM/CDMF 220626 · стр. ${cdmDrawing.page}`};
    const chlftFamily=compact.match(/^CHLF(?:\(T\))?(2|4|8|12|15|20)-/)?.[1],chlftDrawing=chlftFamily?CNP_CHLFT_CATALOG_DIMENSION_DRAWINGS[chlftFamily]:undefined;
    return chlftDrawing?{src:`/cnp-drawings-archive/${chlftDrawing.file}`,caption:`Габаритный лист CNP · модель ${pump.model}`,source:`Официальный каталог CNP CHL/CHLF(T) 27082025 · стр. ${chlftDrawing.page}`}:undefined;
  }
  if(manufacturer==="AQUASTRONG"){
    if(pump.drawing)return {src:pump.drawing,caption:`Габаритный чертёж Aquastrong Select · модель ${pump.model}`,source:"Официальная программа подбора Aquastrong Select"};
    const match=compact.match(/^(EVR)(1|2|3|4|5|10|15|20|32|45|64|90|120|150|200)-/)??compact.match(/^(ECH|EDH)(?:\(M\)|M)?(2|4|10|15|20)-/),family=match?`${match[1]}${match[2]}`:undefined,drawing=family?AQUASTRONG_DIMENSION_DRAWINGS[family]:undefined;
    return drawing?{src:`/aquastrong-drawings/${drawing.file}`,caption:`Габаритный лист Aquastrong · модель ${pump.model}`,source:`Каталог Aquastrong «Многоступенчатые насосы» · стр. ${drawing.page}`}:undefined;
  }
  return pump.drawing?{src:pump.drawing,caption:`Чертёж · ${pump.manufacturer} ${pump.model}`,source:pump.source??"Каталог насосов"}:undefined;
};
