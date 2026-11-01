import type { InputEntity, ProjectConfig, SettingsEntity } from "./project-config";
import { interpolateCurve, type Pump } from "./pump-catalog";

export const INSTRUMENT_PRESSURE_REVISION = "kip-mode-pressure-maximum-head-v3";
export type InstrumentPressure = { pressureBar: number | null; headM: number | null; source: string };
const format = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });

/** Shutoff pressure is based on source Q=0 data, never on the duty head,
 * selection-flow limits, pump count or an extrapolated curve endpoint. */
export function stationInstrumentPressure(project: ProjectConfig, pumps?: readonly Pump[] | null, circuit?: "primary" | "secondary"): InstrumentPressure {
  return shutoffPressure(project,pumps,circuit,true);
}

function shutoffPressure(project: ProjectConfig, pumps: readonly Pump[] | null | undefined, circuit: "primary" | "secondary" | undefined, includeInlet: boolean): InstrumentPressure {
  const settings = project.entities["station-settings"] as SettingsEntity;
  const secondary = settings.stationType === "combined" || settings.stationType === "fire" && settings.jockeyPump;
  const keys = circuit ? [circuit === "primary" ? "system-input" : "system-input-2"] : ["system-input", ...(secondary ? ["system-input-2"] : [])];
  const heads: number[] = [], sources: string[] = [], missing: string[] = [];
  for (const key of keys) {
    const input = project.entities[key] as InputEntity;
    const pump = pumps?.find(p => p.id === input.selectedPumpId);
    const curve = pump?.curve;
    const valid = curve && curve.length >= 2 && curve.every(([q,h],i) => Number.isFinite(q) && q >= 0 && Number.isFinite(h) && h >= 0 && (!i || q > curve[i-1][0]));
    const h0 = input.calculated && valid ? interpolateCurve(curve,0) : null;
    if (h0 === null) missing.push(`${key === "system-input" ? "Контур 1" : "Контур 2"}: нет подтверждённого H(Q=0) выбранного насоса`);
    else { heads.push(h0); sources.push(`${pump!.manufacturer} ${pump!.model}: H(Q=0)=${format(h0)} м`); }
  }
  const inlet = includeInlet ? settings.inletHead : 0;
  if (typeof inlet !== "number" || !Number.isFinite(inlet)) missing.push("Не задан входной подпор");
  if (missing.length) return {pressureBar:null,headM:null,source:`Подбор PN КИП при Q=0: ${missing.join("; ")}. Экстраполяция и подстановка рабочего напора не применяются.`};
  const headM = Math.max(0,inlet! + Math.max(...heads)), pressureBar = headM * .0980665;
  return {pressureBar,headM,source:includeInlet
    ? `PN КИП: P₀=(Hвх + max H(Q=0)) × 0,0980665 = (${format(inlet!)} + ${format(Math.max(...heads))}) × 0,0980665 = ${format(pressureBar)} бар. ${sources.join("; ")}. Параллельные насосы не суммируют напоры.`
    : `Расчёт давления выключен: max H(Q=0)=${format(headM)} м (${format(pressureBar)} бар), без входного подпора. ${sources.join("; ")}. Параллельные насосы не суммируют напоры.`};
}

/** Owner's instrument policy uses the highest catalogue/curve head, including
 * interior peaks. Do not depend on Q=0 or extrapolate digitised endpoints. */
export function instrumentMaximumHead(pump: Pump | undefined): number | null {
  const values=[pump?.maxHead,...(pump?.curve??[]).filter(([q,h])=>Number.isFinite(q)&&q>=0&&Number.isFinite(h)&&h>=0).map(([,h])=>h)]
    .filter((value):value is number=>typeof value==="number"&&Number.isFinite(value)&&value>=0);
  return values.length?Math.max(...values):null;
}

/** Shared policy for collector transducers and each fire-pump branch relay. */
export function dischargeInstrumentPressure(project: ProjectConfig,pumps?:readonly Pump[]|null,circuit?:"primary"|"secondary"):InstrumentPressure {
  const settings=project.entities["station-settings"] as SettingsEntity;
  const activeSecondary=settings.stationType==="combined"||settings.stationType==="fire"&&settings.jockeyPump;
  const inputs=(circuit?[circuit==="primary"?"system-input":"system-input-2"]:["system-input",...(activeSecondary?["system-input-2"]:[])]).map(key=>project.entities[key] as InputEntity);
  if(settings.pressureChecksEnabled===false){
    const selected=inputs.map(i=>pumps?.find(p=>p.id===i.selectedPumpId)),heads=selected.map(instrumentMaximumHead);
    if(heads.some(h=>h===null))return {pressureBar:null,headM:null,source:"Расчёт давления выключен. Исполнение ONI 16 бар по умолчанию до выбора насоса с каталожным напором."};
    const headM=Math.max(...heads as number[]);
    const source=selected.map((p,i)=>`${p!.manufacturer} ${p!.model}: Hmax=${format(heads[i]!)} м`).join("; ");
    return {headM,pressureBar:headM*.0980665,source:`Расчёт давления выключен: max Hmax=${format(headM)} м (${format(headM*.0980665)} бар), без входного подпора. Максимум по каталогу и всей кривой насоса. ${source}.`};
  }
  const inlet=typeof settings.inletHead==="number"&&Number.isFinite(settings.inletHead)?settings.inletHead:0;
  if(inputs.some(i=>typeof i.head!=="number"||!Number.isFinite(i.head)))
    return {pressureBar:null,headM:null,source:"Расчёт давления включён. Исполнение ONI 16 бар по умолчанию до задания расчётного напора."};
  const head=Math.max(...inputs.map(i=>i.head!)),headM=Math.max(0,inlet+head);
  return {headM,pressureBar:headM*.0980665,source:`Расчёт давления включён: H=Hвх + max Hраб = ${format(inlet)} + ${format(head)} = ${format(headM)} м (${format(headM*.0980665)} бар). До 160 м включительно — ONI 16 бар; выше 160 м — ONI 25 бар.`};
}

export const transducerSelectionPressure=dischargeInstrumentPressure;
