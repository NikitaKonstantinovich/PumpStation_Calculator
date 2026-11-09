import test from "node:test";
import assert from "node:assert/strict";
import { spacingReference } from "../services/local-storage/node-spacing-reference.mjs";
import { loadTs } from "./load-ts.mjs";
const {baseSnapshot,initialBaseValues}=await loadTs(new URL("../app/base-values.ts",import.meta.url));
const {resolvePumpSpacing}=await loadTs(new URL("../app/pump-spacing.ts",import.meta.url));
const {pumpLayout}=await loadTs(new URL("../app/node-tools/spacing-nodes.ts",import.meta.url));
const applied=baseSnapshot("reviewed",initialBaseValues());
const input={variant:{id:"new:variant"},model:{id:"new:model"},motor:{power_kw:11},manufacturer:"ONIS",series:"MBL",links:[],motorKey:"11kW",dimensions:{overall_width:470,sourceValues:[]},evidence:{dimensionSetId:"drawing-1",sourceId:"factory",document:"drawing.pdf",documentSha256:"hash-1"}};
const pump=reference=>({id:input.variant.id,power:11,spacingSnapshotId:"a".repeat(64),spacingEvidence:{modelId:input.model.id,motorKey:input.motorKey,links:[],reference,issues:[]}});

test("catalogue width fills a missing standard in both contours without certifying a full envelope",()=>{
 const ref=spacingReference(input);assert.equal(ref.leftMm,235);assert.equal(ref.rightMm,235);
 for(const contour of ["primary","secondary"]){const r=resolvePumpSpacing(pumpLayout(pump(ref),contour,3),applied);assert.equal(r.spacing,650);assert.equal(r.source,"calculation");assert.equal(r.status,"conditional");assert.equal(r.geometryCalculated,true);assert.equal(r.dimensions,null);assert.equal(r.gap,null);assert.match(r.message,/470|235/);}
});
test("reference requires matching variant, motor, model, orientation and source version",()=>{
 const ref=spacingReference(input),l=pumpLayout(pump(ref),"primary",2);
 for(const changes of [{variantId:"another"},{modelId:"another"},{motorKey:"larger-motor"},{orientation:"along_flow"},{version:""},{leftMm:NaN}]) assert.equal(resolvePumpSpacing({...l,reference:{...ref,...changes}},applied).spacing,null);
 assert.equal(resolvePumpSpacing({...l,orientation:"unspecified"},applied).spacing,null);
 assert.equal(resolvePumpSpacing({...l,orientation:"along_flow"},applied).spacing,null);
 assert.notEqual(l.reference.version,spacingReference({...input,evidence:{...input.evidence,documentSha256:"hash-2"}}).version);
});
test("unmapped symbols, length, height and a base alone cannot be guessed as full width",()=>{
 assert.equal(spacingReference({...input,series:"unknown",dimensions:{overall_length:900,overall_height:700,base_width:450,sourceValues:[]}}),undefined);
 const sourceValues=["B1","B2","B3","B4","D"].map(symbol=>({symbol,valueMm:200,mappingStatus:"alternative_execution"}));
 assert.equal(spacingReference({...input,manufacturer:"CNP",series:"TD",dimensions:{sourceValues}}),undefined);
});
test("previous conservative standard is retained, while changed evidence invalidates cached results",()=>{
 const l=pumpLayout(pump(spacingReference(input)),"primary",2);l.links=[{legacyId:"422",scope:"model",relation:"imported",source:"catalogue"}];l.powerKw=5.5;
 const r=resolvePumpSpacing(l,applied);assert.equal(r.spacing,750);assert.equal(r.source,"rule");
 const wider=spacingReference({...input,dimensions:{overall_width:900,sourceValues:[]}});
 const next=resolvePumpSpacing({...l,reference:wider},applied,r);assert.equal(next.spacing,1050);assert.equal(next.status,"conditional");assert.notEqual(next.fingerprint,r.fingerprint);
});
test("historical CAD is gated by unique accepted identity, manufacturer and actual motor power",()=>{
 const cad={...input,manufacturer:"CNP",series:"NIS",motor:{power_kw:18.5},links:[{legacyId:"979"}],dimensions:undefined,evidence:undefined};
 assert.equal(spacingReference(cad).leftMm,210);
 assert.equal(spacingReference({...cad,motor:{power_kw:22}}),undefined);
 assert.equal(spacingReference({...cad,manufacturer:"other"}),undefined);
 assert.equal(spacingReference({...cad,links:[{legacyId:"979"},{legacyId:"980"}]}),undefined);
});

test("conflicting values of a transverse symbol are not resolved by row order",()=>{
 const sourceValues=["B1","B2","B3","B4","D"].map(symbol=>({symbol,valueMm:200,mappingStatus:"symbol_only"}));
 const params={...input,manufacturer:"Wellmix",series:"TD",dimensions:{sourceValues}};
 assert(spacingReference(params));
 sourceValues.push({symbol:"B3",valueMm:300,mappingStatus:"symbol_only"});
 assert.equal(spacingReference(params),undefined);
 sourceValues.reverse();assert.equal(spacingReference(params),undefined);
});
