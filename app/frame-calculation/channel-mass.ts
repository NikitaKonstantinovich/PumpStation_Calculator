import defaults from "../../data/mass-calculation-defaults.json";
import type { ChannelInputs,ChannelGeometry,ChannelWelding } from "./channel-types";
/** Nominal dry manufacturing additions; these do not size or approve a weld. */
export function channelManufacturingMass(g:ChannelGeometry,w:ChannelWelding,input:ChannelInputs={}){
 const nonnegative=(v:number|undefined,fallback:number)=>v!==undefined&&Number.isFinite(v)&&v>=0?v:fallback;
 const leg=nonnegative(input.weldLegMm,defaults.weldLegMm),thickness=nonnegative(input.coatingThicknessMm,defaults.coatingThicknessMm),density=nonnegative(input.coatingDensityKgM3,defaults.coatingDensityKgM3);
 const weldingKgM=leg*leg/2*1000*defaults.steelDensityKgM3/1e9;
 // All longitudinal surfaces, including the inside of the channel. End faces
 // are included as a nominal upper estimate; hidden contact faces are not deducted.
 const stockMm=g.members.reduce((s,m)=>s+m.end-m.start,0);
 const areaMm2=w.perJointMm*stockMm+2*g.members.length*g.profile.kgM/defaults.steelDensityKgM3*1e6;
 const paintingKg=areaMm2*thickness*density/1e9;
 return {weldingKgM,paintingKgM:stockMm>0?paintingKg/(stockMm/1000):0,
  weldingSource:`Расчётная масса наплавленного металла: треугольное сечение, принятый катет ${leg} мм, плотность ${defaults.steelDensityKgM3} кг/м³. Допущение для массы, не назначение сварного соединения.`,
  paintingSource:`Расчётная масса сухого покрытия: площадь ${Number((areaMm2/1e6).toFixed(4))} м², принятая толщина ${thickness} мм, плотность ${density} кг/м³; скрытые контактные поверхности не вычитаются.`};
}
