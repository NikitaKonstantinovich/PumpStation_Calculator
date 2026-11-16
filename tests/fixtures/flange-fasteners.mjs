import { loadTs } from "../load-ts.mjs";
import { createHash } from "node:crypto";
import { json, resources, choose, createProject, sync } from "./station-specification.mjs";
const root=new URL("../../",import.meta.url);
export const model=await loadTs(new URL("app/model-editor/model.ts",root));
const { lineGeometryIds }=await loadTs(new URL("app/model-editor/specification-models.ts",root));
const { makeInsertCatalog }=await loadTs(new URL("app/component-insert-catalog.ts",root));
const { generateInsertCalculations }=await loadTs(new URL("app/component-insert-calculations.ts",root));
const { insertionDesign,selectAutomaticStationInsertion }=await loadTs(new URL("app/station-insertion-selection.ts",root));
const { prepareInsertionTemplate,insertionGeometrySignature }=await loadTs(new URL("app/model-editor/insertion-template.ts",root));
const { lineGeometry }=await loadTs(new URL("app/line-geometry-catalog.ts",root));
const { fastenerCatalog }=await loadTs(new URL("app/fastener-catalog.ts",root));
const { calculateCollector }=await loadTs(new URL("app/collector-calculations.ts",root));
const { insertionGeometryContext }=await loadTs(new URL("app/component-insert-3d-server.ts",root),{[new URL("app/auth-server.ts",root).href]:"export const sha256=async()=> 'unused';"});
export const profiles=await json("public/model-assets/manifest.json");
export const source=await json("public/component-insert-source.json");
const catalog=makeInsertCatalog(source),context=insertionGeometryContext(source,catalog);
const calculatedByRequest=new Map();
export const hardware=fastenerCatalog(source.items);
export async function realStation(pumpId="371",size=80,material="aisi304",count=2,vibration=false,reserve=0) {
  let p=choose(createProject("Крепёж CDM — проверка",{id:"flange-fasteners-qa",timestamp:"2026-10-29T00:00:00Z"}),pumpId,count,reserve);
  p.entities["station-settings"].inletHead=10;
  p.entities["station-settings"].vibrationCompensators=vibration;
  Object.assign(p.entities["station-dn"],{suctionValveDn:size,dischargeValveDn:size,connectionType:"flanged",suctionValveType:"butterfly",dischargeValveType:"butterfly",pn:16});
  for(const side of ["suction","discharge"])p.entities["station-collectors"][side].configuration.material=material;
  p=sync(p);
  // Exercise the published, complete insertion path used by the current station tool.
  const published=new Map();
  for(const row of p.entities["station-spec"].items.filter(row=>row.insertionRequirement)){
    const requirement=row.insertionRequirement,dn=Math.max(requirement.from.dn,requirement.to.dn);
    const request={dnFrom:dn,dnTo:dn,materials:[requirement.material],withSensorNipple:!!requirement.withSensorNipple,includeEccentric:true};
    const key=JSON.stringify(request);
    if(!calculatedByRequest.has(key))calculatedByRequest.set(key,generateInsertCalculations(request,catalog).map(c=>{
      const id=createHash("sha256").update(c.identityKey).digest("hex");
      return {id:`calculated-insertion:${id}`,catalogId:"ответные-части",family:c.name,fields:[],prices:c.price?[{label:"Цена, ₽/шт",amount:c.price,currency:"RUB"}]:[],
        calculatedInsertion:{version:1,id,identityKey:c.identityKey,revision:1,catalogVersion:c.catalogVersion,currentCatalogVersion:c.catalogVersion,pricedAt:"2026-11-14",calculation:c}};
    }));
    const chosen=selectAutomaticStationInsertion(calculatedByRequest.get(key),requirement).item;
    if(!chosen)throw new Error(`No complete insertion fixture: ${JSON.stringify(requirement)}`);
    published.set(chosen.id,chosen);
    (p.entities["station-dn"].insertionDesigns??={})[requirement.location]=insertionDesign(chosen.calculatedInsertion.calculation);
  }
  p=sync(p,{...resources,components:{...resources.components,items:[...resources.components.items,...published.values()]}});
  for(const side of ["suction","discharge"]){const c=p.entities["station-collectors"][side];c.configuration.material=material;c.configuration.eccentric=false;c.calculation=calculateCollector(c.configuration,resources.components.collectorCatalog);c.calculationSourceFingerprint=c.sourceFingerprint;}
  const items=new Map([...resources.components.items,...source.items,...published.values()].map(i=>[i.id,i]));
  const geometryFor=item=>{
    const geometry=lineGeometry(item,catalog,context),saved=item.calculatedInsertion;
    if(saved){
      const template=prepareInsertionTemplate(saved.calculation,context,{id:saved.id,revision:saved.revision},0);
      template.geometryKey=createHash("sha256").update(insertionGeometrySignature(template)).digest("base64url");
      Object.assign(geometry,{template,shape:undefined,length:template.geometry.totalLengthMm,ports:template.geometry.ports,bounds:template.geometry.bounds,issues:[...template.issues,...template.warnings],fidelity:template.status==="incomplete"?"outline":"parametric"});
    }
    return geometry;
  };
  const data={version:1,revision:"fastener-real-catalog-v2",items:Object.fromEntries(lineGeometryIds(p).filter(id=>items.has(id)).map(id=>[id,geometryFor(items.get(id))])),issues:[],fasteners:hardware};
  return {project:p,data,assembly:model.buildAssembly(p,resources.pumps,profiles,data)};
}
