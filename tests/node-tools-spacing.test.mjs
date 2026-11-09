import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
import { spacingEvidenceReader } from "../services/local-storage/node-spacing.mjs";

const base=await loadTs(new URL("../app/base-values.ts",import.meta.url));
const core=await loadTs(new URL("../app/pump-spacing.ts",import.meta.url));
const nodes=await loadTs(new URL("../app/node-tools/spacing-nodes.ts",import.meta.url));
const collector=await loadTs(new URL("../app/collector-spacing.ts",import.meta.url));
const calculation=await loadTs(new URL("../app/collector-calculations.ts",import.meta.url));
const applied=()=>base.baseSnapshot("pinned-1",base.initialBaseValues());
const layout=(changes={})=>({pumpId:"CNP:variant",modelId:"422",snapshotId:"a".repeat(64),contour:"primary",powerKw:5.5,motorKey:"motor-IE3",orientation:"transverse_to_flow",installed:3,links:[{legacyId:"422",scope:"execution",relation:"exact_model_and_factory_article",source:"reviewed"}],issues:[],...changes});
const geometry=(l,changes={})=>({status:"confirmed",variantId:l.pumpId,motorKey:l.motorKey,orientation:l.orientation,leftMm:260,rightMm:280,covers:["body","motor","terminal_box","protrusions"],source:"Test confirmed envelope",version:"geometry-1",...changes});

test("new variant retains the conservative 750 mm group result and skips geometry calculation",()=>{
 const l=layout();l.geometry=geometry(l,{leftMm:100,rightMm:100});
 const r=core.resolvePumpSpacing(l,applied());assert.equal(r.spacing,750);assert.equal(r.status,"confirmed");assert.equal(r.source,"rule");assert.equal(r.geometryCalculated,false);assert.equal(r.layout.pumpId,"CNP:variant");assert.equal(r.ruleIds[0],"research-9");
 assert.equal(core.resolvePumpSpacing(l,applied(),r),r,"unchanged saved result is reused");
});
test("model identity alone does not confirm all motors; applicability is versioned and exact",()=>{
 const l=layout({links:[{legacyId:"422",scope:"model",relation:"imported_CDM_380v",source:"map"}]}),a=applied();
 assert.equal(core.resolvePumpSpacing(l,a).status,"conditional");assert.equal(core.resolvePumpSpacing(l,a).spacing,750);
 a.values.spacing.rules.find(r=>r.id==="research-9").applicability={motorKeys:[l.motorKey],orientations:[l.orientation]};
 assert.equal(core.resolvePumpSpacing(l,a).status,"confirmed");assert.equal(core.resolvePumpSpacing({...l,motorKey:"IE4"},a).status,"conditional");
 assert.equal(core.resolvePumpSpacing({...l,powerKw:55},a).spacing,null,"actual motor power, never legacy metadata");
 assert.equal(core.resolvePumpSpacing({...l,orientation:"along_flow"},a).status,"conditional");
});
test("missing, ambiguous mappings and overlapping rules are explicit; exact execution rule takes priority",()=>{
 assert.equal(core.resolvePumpSpacing(layout({links:[]}),applied()).status,"missing");
 assert.equal(core.resolvePumpSpacing(layout({links:[...layout().links,{legacyId:"421",scope:"execution",source:"other",relation:"exact"}]}),applied()).status,"conflict");
 const a=applied(),rule=a.values.spacing.rules.find(r=>r.id==="research-9");a.values.spacing.rules.push({...rule,id:"duplicate"});
 assert.equal(core.resolvePumpSpacing(layout(),a).status,"conflict");
 a.values.spacing.rules.push({...rule,id:"exact",modelIds:[],variantIds:["CNP:variant"],spacing:800});assert.equal(core.resolvePumpSpacing(layout(),a).spacing,800);
});
test("uncertain historical dimensions and missing rules cannot become confirmed geometry",()=>{
 const a=applied(),l=layout(),rule=a.values.spacing.rules.find(r=>r.id==="research-9");
 rule.status="conditional";rule.note="Dimension meaning unconfirmed";
 const uncertain=core.resolvePumpSpacing(l,a);
 assert.equal(uncertain.status,"conditional");assert.equal(uncertain.geometryCalculated,false);assert.equal(uncertain.dimensions,null);assert.equal(uncertain.gap,null);
 rule.status="missing";
 for(const scope of ["execution","model"]){const missing=core.resolvePumpSpacing({...l,links:l.links.map(link=>({...link,scope}))},a);assert.equal(missing.status,"missing");assert.equal(missing.spacing,null);}
 l.geometry=geometry(l);
 assert.equal(core.resolvePumpSpacing(l,a).source,"calculation","independently confirmed full geometry can resolve a missing historical result");
});
test("fallback uses facing extents, complete envelope, orientation and pinned policy; D1 and base width do not qualify",()=>{
 const l=layout({links:[]}),a=applied();
 assert.equal(core.resolvePumpSpacing({...l,dimensions:{D1:100,base_width:200}},a).spacing,null);
 l.geometry=geometry(l);a.values.spacing={...a.values.spacing,minimum:450,increment:25,gap:180};
 const r=core.resolvePumpSpacing(l,a);assert.equal(r.spacing,725);assert.equal(r.gap,185);assert.equal(r.source,"calculation");assert.equal(r.geometryCalculated,true);
 for(const g of [{orientation:"along_flow"},{variantId:"other"},{motorKey:"IE4"},{covers:["body"]},{status:"reference"}])assert.equal(core.resolvePumpSpacing({...l,geometry:{...l.geometry,...g}},a).spacing,null);
 assert.equal(core.resolvePumpSpacing(l,base.legacyBaseSnapshot()).spacing,null,"legacy pins are not replaced by seed");
 assert.equal(core.resolvePumpSpacing(l,undefined).spacing,null);
});
test("manual decisions keep unknown geometry unknown and cannot override known clearance violation",()=>{
 const l=layout({links:[]}),r=core.resolvePumpSpacing(l,applied());
 assert.equal(core.manualSpacing(r,650,true).source,"manual");assert.equal(core.manualSpacing(r,650,true).dimensions,null);
 l.geometry=geometry(l);const known=core.resolvePumpSpacing(l,applied());
 assert.equal(core.manualSpacing(known,600,true).clearanceViolation,true);assert.equal(core.manualSpacing(known,600,true).status,"conflict");
 const c={type:"suction",primary:{pumpId:l.pumpId,spacing:750,spacingBase:750,spacingManual:true,radius:null,spacingStatus:r.status,spacingResult:r},secondary:null,baseVersions:applied().versions};
 c.primary.spacingConfirmation=collector.collectorSpacingConfirmation(c,0);assert(collector.collectorSpacingConfirmed(JSON.parse(JSON.stringify(c)),0));
 for(const changes of [{motorKey:"IE4"},{orientation:"along_flow"},{installed:4},{snapshotId:"b".repeat(64)}]){
  const changed=structuredClone(c);changed.primary.spacingResult=core.resolvePumpSpacing({...l,...changes},applied());assert(!collector.collectorSpacingConfirmed(changed,0));
 }
 const other=structuredClone(c);other.baseVersions.spacing="new";assert(!collector.collectorSpacingConfirmed(other,0));
});
test("node phases are executable independently and retain separate primary/secondary layouts",()=>{
 const p={id:"v",power:5.5,spacingSnapshotId:"a".repeat(64),spacingEvidence:{modelId:"422",motorKey:"motor",links:layout().links,issues:[]}};
 const context={settings:{stationType:"combined",baseValues:applied()},input:{selectedPumpId:"v",workingPumpCount:2,reservePumpCount:1},secondaryInput:{selectedPumpId:"v",workingPumpCount:1,reservePumpCount:1},pumps:[p]};
 const result=secondary=>{let v=nodes.executeSpacingOperation({operation:"spacing.layout"},{context,secondary,orientation:"transverse_to_flow"}).value;for(const operation of ["spacing.rule","spacing.geometry","spacing.clearance","spacing.result"])v=nodes.executeSpacingOperation({operation},{work:v}).value;return v;};
 const a=result(false),b=result(true);assert.equal(a.layout.installed,3);assert.equal(b.layout.installed,2);assert.equal(a.spacing,750);assert.equal(b.spacing,750);assert.notEqual(a.fingerprint,b.fingerprint);
});
test("source tables preserve their proof scope; unknown mapping statuses are never promoted",()=>{
 const tables={legacy_model_map:[{legacy_id:"422",model_id:"new",status:"imported_CDM_380v"},{legacy_id:"bad",model_id:"new",status:"unresolved"}],legacy_variant_links:[{legacy_id:"422",variant_id:"exact",relation:"exact_model_and_factory_article",source_id:"proof"}]};
 const read=spacingEvidenceReader(n=>tables[n]??[]);
 assert.equal(read({id:"model-only"},{id:"new"},{efficiency_class:"IE3"},[]).links[0].scope,"model");assert.equal(read({id:"exact"},{id:"new"},{},[]).links[0].scope,"execution");
 assert.notEqual(read({id:"v"},{id:"new"},{efficiency_class:"IE3"},[]).motorKey,read({id:"v"},{id:"new"},{efficiency_class:"IE4"},[]).motorKey);
});
test("server rebuild equals client, ignores forged evidence and refuses stale pins",async()=>{
 const a=applied(),l=layout(),pump={id:l.pumpId,power:l.powerKw,spacingEvidence:{modelId:l.modelId,motorKey:l.motorKey,links:l.links,issues:[]}};
 globalThis.__spacingSnapshot={id:l.snapshotId,items:[{variantId:l.pumpId,pump}]};
 const server=await loadTs(new URL("../app/node-tools/spacing-server.ts",import.meta.url),{[new URL("../app/node-tools/catalog-server.ts",import.meta.url).href]:'export class CatalogError extends Error{};export async function catalogSnapshot(id){if(id!==globalThis.__spacingSnapshot.id)throw Error("Pinned snapshot unavailable");return globalThis.__spacingSnapshot;}'});
 const r=core.resolvePumpSpacing(l,a),c={type:"suction",baseVersions:a.versions,primary:{pumpId:l.pumpId,working:2,reserve:1,spacing:750,spacingResult:r},secondary:null};
 await server.applyVerifiedCollectorSpacing(c,a);assert.deepEqual(c.primary.spacingResult,r);
 c.primary.spacingResult.dimensions={leftMm:1,rightMm:1,source:"forged"};c.primary.spacingResult.spacing=1;
 await server.applyVerifiedCollectorSpacing(c,a);assert.deepEqual(c.primary.spacingResult,r);
 c.primary.spacingResult.layout.snapshotId="b".repeat(64);await assert.rejects(()=>server.applyVerifiedCollectorSpacing(c,a),/Pinned/);
 delete globalThis.__spacingSnapshot;
});
test("known asymmetric clearance blocks collector even after manual confirmation",()=>{
 const l=layout({links:[]});l.geometry=geometry(l);const r=core.resolvePumpSpacing(l,applied());
 const c={type:"discharge",dn:100,pn:16,material:"aisi304",connection:"flanged",eccentric:false,stationType:"utility",simultaneous:false,jockey:false,primary:{flow:20,working:1,reserve:1,dn:50,pn:16,connection:"flanged",pumpId:l.pumpId,spacing:600,spacingBase:r.spacing,spacingStatus:r.status,spacingResult:r,spacingManual:true},secondary:null};
 c.primary.spacingConfirmation=collector.collectorSpacingConfirmation(c,0);assert(calculation.configurationWarnings(c).some(s=>s.includes("зазор")));assert.equal(calculation.collectorCode(c),null);
});
