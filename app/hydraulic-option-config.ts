import type { SettingsEntity } from "./project-config";

export type HydraulicOptionsConfig = {
  products: Record<string, string>;
  hoseLengthMm?: 600 | 800 | 1000;
  sensorSupplyVoltage?: number;
};
export const instrumentCount = (settings: Pick<SettingsEntity, "stationType">) => settings.stationType === "fire" || settings.stationType === "combined" ? 2 : 1;
export const separationEnabled = (settings: Pick<SettingsEntity, "stationType" | "isolatingValves">) => settings.isolatingValves && (settings.stationType === "fire" || settings.stationType === "combined");
export function normalizeHydraulicOptions(raw: unknown): HydraulicOptionsConfig {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Partial<HydraulicOptionsConfig> : {};
  const products = Object.fromEntries(Object.entries(value.products ?? {}).filter(([key, id]) => /^(suction|discharge):(tank|transducer|plug|separator)$/.test(key) && typeof id === "string" && id.length > 0 && id.length < 200));
  return { products,
    ...([600, 800, 1000].includes(value.hoseLengthMm ?? 0) ? { hoseLengthMm: value.hoseLengthMm } : {}),
    ...(typeof value.sensorSupplyVoltage === "number" && value.sensorSupplyVoltage > 0 && value.sensorSupplyVoltage <= 60 ? { sensorSupplyVoltage: value.sensorSupplyVoltage } : {}),
  };
}
