import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {adoptPumpMatingFlange,installedPumpFlange,pumpMatingFlangeTemplate,pumpFlangeExecutionId}=await loadTs(new URL('../app/pump-mating-flange.ts',import.meta.url));
const {installedInsertionBom}=await loadTs(new URL('../app/calculated-insertion.ts',import.meta.url));
const {upgradeStampedFlanges}=await loadTs(new URL('../app/model-editor/stamped-flanges.ts',import.meta.url));
const {selectJointFasteners}=await loadTs(new URL('../app/line-spec-parts.ts',import.meta.url));
const id='ES:variant:c4c73a42735354919429ee87';
const row=()=>({section:'discharge',insertionRequirement:{purpose:'pump-transition'},insertionAssembly:{reversed:true,snapshot:{calculation:{material:'aisi304',pn:16,dnLarge:125,dnSmall:65,configuration:{right:{connection:'collar'}},bom:[{role:'right-looseFlange',kind:'looseFlange',componentId:'фланцы-006-r0116',quantity:1,unitPrice:2388.65,cost:2388.65},{role:'right-collar',kind:'collar',componentId:'воротники-002-r0035'}]}}}});
const template=()=>({issues:[],warnings:['Italvalvole 14474 · 8 отверстий'],geometry:{pieces:[{id:'right-loose',componentId:'фланцы-006-r0116',position:[179,0,0],rotation:[0,0,180],ports:[],shape:{kind:'flange',lengthMm:20,outerMm:185,innerMm:81,boltCircleMm:145,boltHoles:8,boltHoleMm:18}},{id:'left-loose',componentId:'other',shape:{kind:'flange',boltHoles:8}}],ports:[{id:'right',point:[182,0,0],boltHoles:8}]}});
test('the confirmed NIS outlet uses four holes only in its installed end, with a visible provisional price note',()=>{
 const r=row(),saved=structuredClone(r.insertionAssembly.snapshot);adoptPumpMatingFlange(r,id);assert.equal(installedPumpFlange(r.insertionAssembly).holes,4);assert.equal(r.status,'confirmation');assert.match(r.description,/Цена предварительная/);assert.deepEqual(r.insertionAssembly.snapshot,saved);
 const bom=installedInsertionBom(r.insertionAssembly);assert.equal(bom[0].componentId,pumpFlangeExecutionId);assert.equal(bom[0].cost,2388.65);assert.match(bom[0].source,/Цена предварительная/);
 const source=template(),t=pumpMatingFlangeTemplate(source,r.insertionAssembly);assert.equal(source.geometry.pieces[0].shape.boltHoles,8);assert.equal(t.geometry.pieces[0].shape.boltHoles,4);assert.equal(t.geometry.pieces[1].shape.boltHoles,8);assert.deepEqual(t.geometry.pieces[0].position,[179,0,0]);assert.deepEqual(t.geometry.ports[0].point,[182,0,0]);
 const normalized=upgradeStampedFlanges({components:[{insertion:{template:{...t,source:{}}}}]});assert.equal(normalized.components[0].insertion.template.geometry.pieces[0].shape.boltHoles,4);
 const selection=selectJointFasteners({items:[]},'aisi304',65,16,{gaskets:1,thickness:0,flangeThickness:48,holes:4,source:'Verified pump and installed counterpart'});assert.equal(selection.reference.holes,4);
});
test('other pumps, suction, pressure ratings and collar variants retain their supplied flange execution',()=>{
 for(const [pumpId,mutate] of [['another-pump',()=>{}],[id,r=>r.section='suction'],[id,r=>r.insertionAssembly.snapshot.calculation.pn=25],[id,r=>r.insertionAssembly.snapshot.calculation.bom[1].componentId='different-collar']]){
  const r=row();mutate(r);adoptPumpMatingFlange(r,pumpId);assert.equal(r.insertionAssembly.pumpFlangeExecution,undefined);
 }
 const r=row();adoptPumpMatingFlange(r,id);adoptPumpMatingFlange(r,'another-pump');assert.equal(r.insertionAssembly.pumpFlangeExecution,undefined);
});
