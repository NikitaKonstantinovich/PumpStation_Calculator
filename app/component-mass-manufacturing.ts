import defaults from "../data/mass-calculation-defaults.json";
import type { ComponentMass } from "./component-mass";
import type { ComponentItem } from "./component-database-types";
/** Material remaining in a manufactured assembly, separately from labour. */
export function manufacturingMass(kind:string,unit:string,item?:ComponentItem):ComponentMass|null {
 if(kind==="welding"&&unit==="м")return {kg:defaults.weldLegMm**2/2*1000*defaults.steelDensityKgM3/1e9,estimated:true,source:`Оценка наплавленного металла: длина шва × треугольное сечение с принятым катетом ${defaults.weldLegMm} мм × ${defaults.steelDensityKgM3} кг/м³. Не является расчётом прочности шва.`};
 if(kind==="painting"&&["м²","м2"].includes(unit))return {kg:defaults.coatingThicknessMm/1000*defaults.coatingDensityKgM3,estimated:true,source:`Оценка сухого покрытия: ${defaults.coatingThicknessMm} мм × ${defaults.coatingDensityKgM3} кг/м³ на 1 м².`};
 if(kind==="painting"&&unit==="м"){
  const diameter=Number(item?.fields.find(f=>f.column==="OD")?.value);
  if(Number.isFinite(diameter)&&diameter>0)return {kg:Math.PI*diameter/1000*defaults.coatingThicknessMm/1000*defaults.coatingDensityKgM3,estimated:true,source:`Оценка сухого наружного покрытия по учтённой операции: Ø${diameter} мм × π × длина; толщина ${defaults.coatingThicknessMm} мм, плотность ${defaults.coatingDensityKgM3} кг/м³. Для перехода площадь оценена по большему диаметру.`};
 }
 if(kind==="machining")return {kg:0,estimated:false,source:"Обработка не добавляет отдельную деталь; масса заготовок номинальная."};
 return null;
}
