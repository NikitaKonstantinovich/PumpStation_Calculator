import { readFile } from "node:fs/promises";
import { loadTs } from "../load-ts.mjs";

const root = new URL("../../", import.meta.url);
export const load = name => loadTs(new URL(`app/${name}.ts`, root));
export const read = name => readFile(new URL(name, root), "utf8");
export const json = async name => JSON.parse(await read(name));
const pageUrl = new URL("app/full-workspace.tsx", root), page = await read("app/full-workspace.tsx"), shared = await read("app/allowed-pump-tools.tsx");
// Exercise the actual hydraulic transaction retained in the UI, not a substitute implementation.
const source = [
  'import {recommendedDn,defaultCollectorMaterial,resolveDnConnection,suctionHydraulics,dischargeHydraulics} from "./dn-defaults";',
  'import {buildSuctionSpec,replaceSuctionSpec,checkSuctionSpecPressure} from "./suction-spec";',
  'import {buildDischargeSpec,replaceDischargeSpec,checkDischargeSpecPressure} from "./discharge-spec";',
  'import {normalizeSpecificationItems,specificationOption} from "./specification-items";',
  'import {synchronizeCollectors} from "./collector-project";',
  shared.match(/^export const isCalculated =.*$/m)[0], page.match(/^const isSecondaryEnabled =.*$/m)[0],
  shared.match(/^export const componentFieldLabel=.*$/m)[0],
  page.slice(page.indexOf("const isJockeyCircuit="), page.indexOf("function DnCalculator(")),
  page.slice(page.indexOf("const HYDRAULIC_SPEC_OPTIONS:"), page.indexOf("function PanelContent(")),
  "let loadedComponentsDatabase; export {refreshSuctionSpecification};",
].join("\n");
export const { refreshSuctionSpecification } = await loadTs(pageUrl, { [pageUrl.href]: source });
export const { createProject, parseProjectConfig } = await load("project-config");
export const { synchronizeStationSpecification, specificationSourceFingerprint, cabinetSourceFingerprint } = await load("station-specification");
export const { assessSpecification, specificationTechnicalStatus } = await load("specification-readiness");
const { makeCollectorCatalog } = await load("collector-catalog");
const { suctionCatalogItems } = await load("suction-catalog");
const binding = await json("public/binding-components.json");
export const resources = {
  pumps: await json("public/pumps.json"), cabinets: await json("public/control-cabinets.json"),
  smartCabinets: (await json("public/control-cabinet-database.json")).cabinets,
  components: { ...binding, items: [...binding.items, ...suctionCatalogItems], collectorCatalog: makeCollectorCatalog(binding) },
};
export const rows = p => p.entities["station-spec"].items;
export const role = (p, option) => rows(p).find(item => item.option === option);
export const sync = (p, data = resources) => synchronizeStationSpecification(p, data, refreshSuctionSpecification);
export function choose(p, id = "318", working = 2, reserve = 1, secondary = false) {
  const pump = resources.pumps.find(p => p.id === id);
  Object.assign(p.entities[secondary ? "system-input-2" : "system-input"], {
    selectedPumpId: id, selectedPumpModel: `${pump.manufacturer} ${pump.model}`, flowRate: pump.nominalFlow * working,
    head: 30, staticHead: 0, workingPumpCount: working, reservePumpCount: reserve, calculated: true,
  });
  return p;
}
export function fixture() {
  const p = choose(createProject("Stage 1 regression", { id: "stage-1-fixture", timestamp: "2026-10-28T00:00:00Z" }));
  p.entities["station-settings"].inletHead = 10;
  return p;
}
