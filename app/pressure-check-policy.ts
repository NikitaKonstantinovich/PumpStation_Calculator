import type { SettingsEntity, SpecItem } from "./project-config";

/** Missing flag keeps pressure validation enabled for existing projects. */
export const pressureChecksEnabled = (settings: Pick<SettingsEntity, "pressureChecksEnabled">) => settings.pressureChecksEnabled !== false;

/** Restore only the status that existed before pressure checks were applied. */
export function withoutPressureChecks(item: SpecItem): SpecItem {
  if (!item.inletPressureCheck && !item.dischargePressureCheck) return item;
  const status = item.inletPressureCheck?.baseStatus ?? item.dischargePressureCheck?.baseStatus ?? item.status;
  return { ...item, status, inletPressureCheck: undefined, dischargePressureCheck: undefined };
}
