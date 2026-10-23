import type { SettingsEntity } from "./project-config";

export const defaultProjectSettings = (): SettingsEntity => ({
  kind: "settings", inletHead: null, stationType: "utility", combinedCircuitsSimultaneous: false,
  membraneTank: false, membraneTankVolume: 8, vibrationCompensators: false, collectorPlugs: false,
  isolatingValves: false, jockeyPump: false, usdRate: 85, cnyRate: 13,
  manufacturerDiscounts: { cnp: 45, aquastrong: 55, onis: 0, vandjord: 25, wellmix: 35 },
});
