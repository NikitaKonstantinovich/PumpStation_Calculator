import type { Pump } from "./pump-catalog";

export type PumpFrequencySettings = { enabled: boolean; nominalHz: number | null; frequencyHz: number | null; showNominal: boolean };
export const defaultPumpFrequencySettings = (): PumpFrequencySettings => ({ enabled: false, nominalHz: null, frequencyHz: null, showNominal: true });
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
export const nominalPumpFrequency = (pump: Pump) => positive(pump.frequencyHz) ? pump.frequencyHz : 50;
export const frequencyLabel = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

export function pumpFrequencyState(pump: Pump, settings: PumpFrequencySettings) {
  const nominalHz = positive(settings.nominalHz) ? settings.nominalHz : nominalPumpFrequency(pump);
  const minimumHz = nominalHz / 100;
  const frequencyHz = settings.enabled && positive(settings.frequencyHz) ? Math.max(minimumHz, Math.min(nominalHz, settings.frequencyHz)) : nominalHz;
  return { nominalHz, frequencyHz, minimumHz, ratio: frequencyHz / nominalHz, assumedNominal: !positive(pump.frequencyHz) && settings.nominalHz === null };
}

/** Plot-only affinity-law estimate; never writes back to the catalogue or selection. */
export function frequencyAdjustedPump(pump: Pump, frequencyHz: number, nominalHz = nominalPumpFrequency(pump)): Pump {
  if (!positive(nominalHz) || !positive(frequencyHz) || frequencyHz > nominalHz) throw new RangeError("Частота должна быть положительной и не превышать номинальную.");
  const ratio = frequencyHz / nominalHz;
  if (ratio === 1) return pump.frequencyHz === frequencyHz ? pump : { ...pump, frequencyHz };
  const scaled = (value: number | null | undefined, exponent: number) => value == null ? value : value * ratio ** exponent;
  return { ...pump, frequencyHz, curve: pump.curve.map(([q,h]) => [q*ratio,h*ratio**2]),
    nominalFlow: scaled(pump.nominalFlow,1) ?? null, minFlow: scaled(pump.minFlow,1) ?? null, maxFlow: scaled(pump.maxFlow,1) ?? null,
    minHead: scaled(pump.minHead,2) ?? null, maxHead: scaled(pump.maxHead,2) ?? null, ratedHead: scaled(pump.ratedHead,2),
    power: scaled(pump.power,3) ?? null, speedRpm: scaled(pump.speedRpm,1),
    selectionFlowRange: pump.selectionFlowRange?.map(flow => flow*ratio) as [number,number] | undefined,
    efficiencyCurve: pump.efficiencyCurve?.map(([q,eta]) => [q*ratio,eta]), powerCurve: pump.powerCurve?.map(([q,power]) => [q*ratio,power*ratio**3]),
    npshCurve: undefined,
  };
}
