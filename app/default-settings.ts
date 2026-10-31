import type { SettingsEntity } from "./project-config";
import type { AppliedBaseValues } from "./base-values";

export const defaultProjectSettings = (baseValues?: AppliedBaseValues): SettingsEntity => ({
  kind: "settings", inletHead: null, pressureChecksEnabled: true, stationType: "utility", combinedCircuitsSimultaneous: false,
  membraneTank: false, membraneTankVolume: 8, vibrationCompensators: false, collectorPlugs: false,
  isolatingValves: false, jockeyPump: false, usdRate: 85, cnyRate: 13,
  manufacturerDiscounts: { cnp: 45, aquastrong: 55, onis: 0, vandjord: 25, wellmix: 35 },
  ...(baseValues ? { baseValues, usdRate: baseValues.values.financial.usdRate, cnyRate: baseValues.values.financial.cnyRate, manufacturerDiscounts: { ...baseValues.values.financial.discounts } as SettingsEntity["manufacturerDiscounts"] } : {}),
});
