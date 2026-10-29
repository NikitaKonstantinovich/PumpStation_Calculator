import type { SettingsEntity, SpecItem } from "./project-config";
import type { Pump } from "./pump-catalog";
import type { SmartCabinet } from "./cabinet-configurator";

// currentTotal can be a partial sum; do not present it as the cabinet's complete price.
export const smartCabinetSpecificationPrice = (cabinet: SmartCabinet) =>
  Number.isFinite(cabinet.currentTotal) && cabinet.currentTotal >= 0 && cabinet.items.length > 0 &&
  cabinet.items.every(item => typeof item.currentCost === "number" && Number.isFinite(item.currentCost) && item.currentCost >= 0 && Number.isFinite(item.quantity) && item.quantity > 0)
    ? cabinet.currentTotal : null;

export const smartCabinetSupportsPower=(cabinet:SmartCabinet,power:number)=>{const match=cabinet.name.match(/\((\d+(?:,\d+)?)-(\d+(?:,\d+)?)\)/);const min=cabinet.powerMinKw??(match?Number(match[1].replace(",",".")):cabinet.pumpPowerKw),max=cabinet.powerMaxKw??(match?Number(match[2].replace(",",".")):cabinet.pumpPowerKw);return power+1e-7>=min&&power<=max+1e-7;};
export type ControlCabinet = { id:string; type:"bp"|"fp"|"fpj"; application:"utility"|"fire"; brand:string; name:string; pumpCount:number; powerKw:number; startType:string; code:string; weightKg:number; price:number };
const SMART_MAX_PUMP_POWER_KW=7.5;
export const isAutomaticCabinetSelectionEnabled = (settings:SettingsEntity) => settings.stationType === "utility" || settings.stationType === "fire" || settings.stationType === "smart";
const cabinetTypeFor = (settings:SettingsEntity):ControlCabinet["type"] => settings.stationType === "fire" && settings.jockeyPump ? "fpj" : settings.stationType === "fire" ? "fp" : "bp";
const selectControlCabinet = (cabinets:ControlCabinet[],settings:SettingsEntity,pump:Pump,totalPumpCount:number) => {
  if (pump.power === null) return undefined;
  const type=cabinetTypeFor(settings),epsilon=1e-6;
  return cabinets.filter(cabinet=>cabinet.type===type&&cabinet.pumpCount===totalPumpCount&&cabinet.powerKw+epsilon>=pump.power!).sort((a,b)=>a.powerKw-b.powerKw)[0];
};
const controlCabinetItem = (cabinet:ControlCabinet|undefined,settings:SettingsEntity,pump:Pump,totalPumpCount:number):SpecItem => {
  if(cabinet){
    const oversized=pump.power!==null&&cabinet.powerKw-pump.power>1e-6,pumpPower=pump.power?.toLocaleString("ru-RU"),cabinetPower=cabinet.powerKw.toLocaleString("ru-RU");
    return {position:"03",equipmentId:cabinet.id,name:cabinet.name,details:`${cabinet.startType} · ${cabinet.pumpCount} нас. × ${cabinetPower} кВт · ${cabinet.weightKg} кг`,quantity:1,unit:"шт.",price:cabinet.price,description:oversized?`Предупреждение: точного ШУ на ${pumpPower} кВт нет; выбран ближайший больший номинал ${cabinetPower} кВт.`:`Шкаф ${cabinet.type.toUpperCase()} · цена со скидкой`,section:"control",status:oversized?"clarify":"selected"};
  }
  return {
  position:"03",name:"Шкаф управления",details:`${cabinetTypeFor(settings).toUpperCase()} · ${totalPumpCount} нас. × ${pump.power===null?"мощность не указана":`${pump.power.toLocaleString("ru-RU")} кВт`}`,quantity:1,unit:"шт.",price:null,description:"Шкаф управления не найден в базе",section:"control",status:"clarify"
  };
};
const manualControlCabinetItem = (stationType:SettingsEntity["stationType"]):SpecItem => ({
  position:"03",name:"Шкаф управления",details:stationType==="combined"?"Совмещённая насосная установка":"SMART",quantity:1,unit:"шт.",price:null,description:"Автоматический подбор шкафа для данного типа установки не выполняется",section:"control",status:"clarify"
});
const smartControlCabinetItem=(cabinets:SmartCabinet[],pump:Pump,totalPumpCount:number):SpecItem=>{
  const power=pump.power;
  if(power!==null&&power>SMART_MAX_PUMP_POWER_KW+1e-6)return {position:"03",name:"Шкаф управления NS Smart",details:`${totalPumpCount} нас. × ${power.toLocaleString("ru-RU")} кВт`,quantity:1,unit:"шт.",price:null,description:"Предупреждение: мощность одного насоса для станции NS Smart не может превышать 7,5 кВт.",section:"control",status:"clarify"};
  const cabinet=power===null?undefined:cabinets.find(item=>item.pumpCount===totalPumpCount&&smartCabinetSupportsPower(item,power));
  return cabinet?{position:"03",name:cabinet.name,details:`NS Smart · ${cabinet.pumpCount} нас. × ${cabinet.pumpPowerKw.toLocaleString("ru-RU")} кВт · ${cabinet.enclosureDimensions}`,quantity:1,unit:"шт.",price:smartCabinetSpecificationPrice(cabinet),equipmentId:cabinet.id,description:`${cabinet.items.length} позиций · автоматически подобран из базы ШУ`,section:"control",status:"selected"}:{position:"03",name:"Шкаф управления NS Smart",details:`${totalPumpCount} нас. × ${power===null?"мощность не указана":`${power.toLocaleString("ru-RU")} кВт`}`,quantity:1,unit:"шт.",price:null,description:"Шкаф управления не найден в базе",section:"control",status:"clarify"};
};
export const projectControlCabinetItem=(controlCabinets:ControlCabinet[],smartCabinets:SmartCabinet[],settings:SettingsEntity,pump:Pump,totalPumpCount:number):SpecItem=>settings.stationType==="smart"?smartControlCabinetItem(smartCabinets,pump,totalPumpCount):settings.stationType==="utility"||settings.stationType==="fire"?controlCabinetItem(selectControlCabinet(controlCabinets,settings,pump,totalPumpCount),settings,pump,totalPumpCount):manualControlCabinetItem(settings.stationType);
