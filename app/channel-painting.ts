export const CHANNEL_PAINTING_PROFILES=["8П","10П","12П","14П","16П","18П","20П"] as const;
export type ChannelPaintingRate={target:"channel";id:string;profile:string;pricePerMeter:number|null;source:string;date:string;note:string};
export const isChannelPaintingRate=(row:unknown):row is ChannelPaintingRate=>!!row&&typeof row==="object"&&"target" in row&&row.target==="channel";
export function channelPaintingCost(rates:ChannelPaintingRate[]|undefined,profile:string,lengthMm:number){
 const matches=rates?.filter(r=>r.profile===profile)??[],rate=matches.length===1?matches[0]:undefined;
 const price=rate?.pricePerMeter;
 const rateRubM=typeof price==="number"&&Number.isFinite(price)&&price>0&&rate?.source.trim()?price:null;
 return {profile,lengthMm,rateRubM,costRub:rateRubM===null?null:lengthMm/1000*rateRubM,
  source:rate?`Базовые значения → Окраска швеллеров → ${profile}; ${rate.source}; дата ${rate.date}`:`Не задан однозначный тариф окраски швеллера ${profile} в базовых значениях`};
}
