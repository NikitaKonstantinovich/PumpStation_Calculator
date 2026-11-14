import { engineeringOperation, registerOperation } from "./engineering/runtime";
import type { InputEntity, ProjectConfig, SettingsEntity } from "./project-config";
import { interpolateCurve, type Pump } from "./pump-catalog";

export const INSTRUMENT_PRESSURE_REVISION = "kip-mode-pressure-shutoff-head-v4";
export const DISCHARGE_INSTRUMENT_PRESSURE_REVISION = "kip-mode-pressure-peak-head-v5";
export type InstrumentPressure = { pressureBar: number | null; headM: number | null; source: string };
const format = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });

/** Shutoff pressure is based on source Q=0 data, never on the duty head,
 * selection-flow limits, pump count or an extrapolated curve endpoint. */
export function coreStationInstrumentPressure(project: ProjectConfig, pumps?: readonly Pump[] | null, circuit?: "primary" | "secondary"): InstrumentPressure {
  return curvePressure(project,pumps,circuit,"shutoff");
}

function curvePressure(project: ProjectConfig, pumps: readonly Pump[] | null | undefined, circuit: "primary" | "secondary" | undefined, basis: "shutoff" | "peak"): InstrumentPressure {
  const settings = project.entities["station-settings"] as SettingsEntity;
  const peak = basis === "peak";
  const secondary = settings.stationType === "combined" || settings.stationType === "fire" && settings.jockeyPump;
  const keys = circuit ? [circuit === "primary" ? "system-input" : "system-input-2"] : ["system-input", ...(secondary ? ["system-input-2"] : [])];
  const heads: number[] = [], sources: string[] = [], missing: string[] = [];
  for (const key of keys) {
    const input = project.entities[key] as InputEntity;
    const pump = pumps?.find(p => p.id === input.selectedPumpId);
    const curve = pump?.curve;
    const valid = curve && curve.length >= 2 && curve.every(([q,h],i) => Number.isFinite(q) && q >= 0 && Number.isFinite(h) && h >= 0 && (!i || q > curve[i-1][0]));
    const head = input.calculated && valid
      ? peak ? curve.reduce((maximum, [, h]) => Math.max(maximum, h), 0) : interpolateCurve(curve,0)
      : null;
    if (head === null) {
      const reason = !peak ? "нет подтверждённого H(Q=0) выбранного насоса"
        : !input.calculated || !pump ? "насос не выбран или выбор не подтверждён"
        : "нет корректной характеристики Q–H выбранного насоса";
      missing.push(`${key === "system-input" ? "Контур 1" : "Контур 2"}: ${reason}`);
    } else {
      heads.push(head);
      sources.push(`${pump!.manufacturer} ${pump!.model}: ${peak ? "Hпик" : "H(Q=0)"}=${format(head)} м`);
    }
  }
  const inlet = peak ? 0 : settings.inletHead;
  if (typeof inlet !== "number" || !Number.isFinite(inlet)) missing.push("Не задан входной подпор");
  if (missing.length) return {pressureBar:null,headM:null,source:peak
    ? `Расчёт давления выключен. Для подбора КИП нужен пиковый напор выбранных насосов. ${missing.join(". ")}.`
    : `Подбор PN КИП при Q=0: ${missing.join("; ")}. Экстраполяция и подстановка рабочего напора не применяются.`};
  const maxHead = Math.max(...heads), headM = Math.max(0,inlet! + maxHead), pressureBar = headM * .0980665;
  return {pressureBar,headM,source:peak
    ? `Расчёт давления выключен. Пиковый напор Hпик=${format(headM)} м (${format(pressureBar)} бар), без входного подпора. ${sources.join("; ")}. Параллельные насосы не суммируют напоры.`
    : `PN КИП: P₀=(Hвх + max H(Q=0)) × 0,0980665 = (${format(inlet!)} + ${format(maxHead)}) × 0,0980665 = ${format(pressureBar)} бар. ${sources.join("; ")}. Параллельные насосы не суммируют напоры.`};
}

/** Shared policy for collector transducers and each fire-pump branch relay. */
export function coreDischargeInstrumentPressure(project: ProjectConfig,pumps?:readonly Pump[]|null,circuit?:"primary"|"secondary"):InstrumentPressure {
  const settings=project.entities["station-settings"] as SettingsEntity;
  if(settings.pressureChecksEnabled===false) return curvePressure(project,pumps,circuit,"peak");
  const activeSecondary=settings.stationType==="combined"||settings.stationType==="fire"&&settings.jockeyPump;
  const inputs=(circuit?[circuit==="primary"?"system-input":"system-input-2"]:["system-input",...(activeSecondary?["system-input-2"]:[])]).map(key=>project.entities[key] as InputEntity);
  const inlet=typeof settings.inletHead==="number"&&Number.isFinite(settings.inletHead)?settings.inletHead:0;
  if(inputs.some(i=>typeof i.head!=="number"||!Number.isFinite(i.head)))
    return {pressureBar:null,headM:null,source:"Расчёт давления включён. Исполнение ONI 16 бар по умолчанию до задания расчётного напора."};
  const head=Math.max(...inputs.map(i=>i.head!)),headM=Math.max(0,inlet+head);
  return {headM,pressureBar:headM*.0980665,source:`Расчёт давления включён: H=Hвх + max Hраб = ${format(inlet)} + ${format(head)} = ${format(headM)} м (${format(headM*.0980665)} бар). До 160 м включительно — ONI 16 бар; выше 160 м — ONI 25 бар.`};
}

export const transducerSelectionPressure=dischargeInstrumentPressure;

export function stationInstrumentPressure(...args: Parameters<typeof coreStationInstrumentPressure>): ReturnType<typeof coreStationInstrumentPressure> {
  return engineeringOperation("stationInstrumentPressure", coreStationInstrumentPressure, args);
}

registerOperation("stationInstrumentPressure", ["project","pumps","circuit"], coreStationInstrumentPressure);

export function dischargeInstrumentPressure(...args: Parameters<typeof coreDischargeInstrumentPressure>): ReturnType<typeof coreDischargeInstrumentPressure> {
  return engineeringOperation("dischargeInstrumentPressure", coreDischargeInstrumentPressure, args);
}

registerOperation("dischargeInstrumentPressure", ["project","pumps","circuit"], coreDischargeInstrumentPressure);
