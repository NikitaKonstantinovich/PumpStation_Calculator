import type { CollectorMaterial, SettingsEntity } from "./project-config";

export const STANDARD_DN = [25,32,40,50,65,80,100,125,150,200,250,300,350,400,450,500,600,700,800,900,1000,1200] as const;
export const dnVelocityLimit = (dn: number) => dn <= 250 ? 2 : 3;
// Existing nominal-DN recommendation used by the DN tool. Collector velocities
// themselves are calculated from catalogue internal diameters.
export const flowVelocity = (flow: number, dn: number) => flow / 3600 / (Math.PI * (dn / 1000) ** 2 / 4);
export const recommendedDn = (flow: number) => STANDARD_DN.find(dn => flowVelocity(flow, dn) <= dnVelocityLimit(dn)) ?? STANDARD_DN.at(-1)!;
export const defaultCollectorMaterial = (settings: SettingsEntity): CollectorMaterial => settings.stationType === "fire" ? "st20" : "aisi304";
