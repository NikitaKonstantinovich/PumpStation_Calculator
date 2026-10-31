import { loadTs } from "../load-ts.mjs";
import { json, resources, choose, createProject, sync } from "./station-specification.mjs";
const root=new URL("../../",import.meta.url);
export const model=await loadTs(new URL("app/model-editor/model.ts",root));
const { lineGeometryIds }=await loadTs(new URL("app/model-editor/specification-models.ts",root));
const { makeInsertCatalog }=await loadTs(new URL("app/component-insert-catalog.ts",root));
const { lineGeometry }=await loadTs(new URL("app/line-geometry-catalog.ts",root));
const { fastenerCatalog }=await loadTs(new URL("app/fastener-catalog.ts",root));
const { calculateCollector }=await loadTs(new URL("app/collector-calculations.ts",root));
const { insertionGeometryContext }=await loadTs(new URL("app/component-insert-3d-server.ts",root),{[new URL("app/auth-server.ts",root).href]:"export const sha256=async()=> 'unused';"});
export const profiles=await json("public/model-assets/manifest.json");
export const source=await json("public/component-insert-source.json");
const catalog=makeInsertCatalog(source),context=insertionGeometryContext(source,catalog);
export const hardware=fastenerCatalog(source.items);
export async function realStation(pumpId="371",size=80,material="aisi304",count=2,vibration=false) {
  let p=choose(createProject("Крепёж CDM — проверка",{id:"flange-fasteners-qa",timestamp:"2026-10-29T00:00:00Z"}),pumpId,count,0);
  p.entities["station-settings"].inletHead=10;
  p.entities["station-settings"].vibrationCompensators=vibration;
  Object.assign(p.entities["station-dn"],{suctionValveDn:size,dischargeValveDn:size,connectionType:"flanged",suctionValveType:"butterfly",dischargeValveType:"butterfly",pn:16});
  for(const side of ["suction","discharge"])p.entities["station-collectors"][side].configuration.material=material;
  p=sync(p);
  for(const side of ["suction","discharge"]){const c=p.entities["station-collectors"][side];c.configuration.material=material;c.configuration.eccentric=false;c.calculation=calculateCollector(c.configuration,resources.components.collectorCatalog);c.calculationSourceFingerprint=c.sourceFingerprint;}
  const items=new Map([...resources.components.items,...source.items].map(i=>[i.id,i]));
  const data={version:1,revision:"fastener-real-catalog-v1",items:Object.fromEntries(lineGeometryIds(p).filter(id=>items.has(id)).map(id=>[id,lineGeometry(items.get(id),catalog,context)])),issues:[],fasteners:hardware};
  return {project:p,data,assembly:model.buildAssembly(p,resources.pumps,profiles,data)};
}
