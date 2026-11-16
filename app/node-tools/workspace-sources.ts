import type { Plan } from "../engineering/engine";
import type { ToolProgram } from "./schema";

const catalogs = [
  { source: "pump_catalog_v2", registration: "pump.catalog", operations: ["pump.catalog", "pump.chartModel", "pump.detailData", "station.dnContext"] },
  { source: "station_catalog", registration: "engineering.catalog", operations: ["engineering.catalog"] }
] as const;

export type CatalogSource = typeof catalogs[number]["source"];

const registeredCatalogs = new WeakMap<ToolProgram, readonly (typeof catalogs[number])[]>();

export function planSourceDependencies(program: ToolProgram, plan: Plan): CatalogSource[] {
  let registered = registeredCatalogs.get(program);
  if (!registered) {
    registered = catalogs.filter(catalog =>
      Object.values(program.plans).some(plan => plan.steps.some(step => step.operation === catalog.registration))
    );
    registeredCatalogs.set(program, registered);
  }
  return registered
    .filter(catalog => plan.steps.some(step => catalog.operations.some(operation => operation === step.operation)))
    .map(catalog => catalog.source);
}

export function toolSourceDependencies(program: ToolProgram, toolId: string): CatalogSource[] {
  const plan = program.plans[toolId];
  return plan ? planSourceDependencies(program, plan) : [];
}
