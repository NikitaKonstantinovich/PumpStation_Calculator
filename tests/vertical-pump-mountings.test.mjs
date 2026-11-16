import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {catalogMounting} from '../services/local-storage/node-mountings.mjs';
import {loadTs} from './load-ts.mjs';
const read=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
const reviewed=await read('../data/vertical-pump-mountings-reviewed.json');
const base=await read('../data/pump-mountings-reviewed.json');
const args=r=>({variant:{id:r.variantId,designation:r.designation,manufacturer_article:r.article},model:{id:r.modelId},motor:r.motor,manufacturer:r.manufacturer,series:r.series});
const {readMounting}=await loadTs(new URL('../app/frame-calculation/project.ts',import.meta.url));
const {pumpMountingSection}=await loadTs(new URL('../app/node-tools/pump-mounting-card.ts',import.meta.url));
const {verticalChannelMount}=await loadTs(new URL('../app/frame-calculation/channel-mountings.ts',import.meta.url));
const pitch=m=>['x','y'].map(k=>Math.max(...m.holes.map(h=>h[k]))-Math.min(...m.holes.map(h=>h[k])));
test('all 2214 vertical executions have four distinct base holes; 893 additions reach the frame reader',()=>{
 assert.equal(reviewed.rows.length,975);assert.equal(new Set(reviewed.rows.map(r=>r.variantId)).size,975);
 const vertical=base.rows.filter(r=>['EVR','CDM','MV','MVS','PV','CRV'].includes(r.series));
 assert.equal(vertical.length,2214);
 for(const r of vertical){const data=catalogMounting(args(r)),m=readMounting(data.frameV1);assert(m,r.variantId);assert.equal(m.holes.length,4,r.variantId);assert.equal(new Set(m.holes.map(h=>`${h.x}/${h.y}`)).size,4);}
});
test('all additions reject changed article, model, designation and each motor identity field',()=>{
 for(const r of reviewed.rows){
  const a=args(r);
  for(const bad of [{...a,variant:{...a.variant,manufacturer_article:'wrong'}},{...a,model:{id:'wrong'}},{...a,variant:{...a.variant,designation:'wrong'}},...Object.keys(r.motor).map(k=>({...a,motor:{...a.motor,[k]:'changed'}}))])assert.equal(catalogMounting(bad),undefined,r.variantId);
  const corrupt=new Map([[r.variantId,{...r,motor:{...r.motor,power_kw:-1}}]]);
  const fallback=catalogMounting(a,undefined,undefined,corrupt).frameV1;
  if(r.mode==='fill_missing_fastener_dimensions')assert(fallback.holes.every(h=>h.diameterMm===null));
  else assert.equal(fallback,undefined,r.variantId);
 }
});
test('82 existing CDM grids retain their coordinates while receiving verified STEP bore and clamp facts',()=>{
 const rows=reviewed.rows.filter(r=>r.mode==='fill_missing_fastener_dimensions');assert.equal(rows.length,82);
 for(const r of rows){
  const before=catalogMounting(args(r),undefined,undefined,new Map()).frameV1,after=catalogMounting(args(r)).frameV1;
  assert.deepEqual(after.bounds,before.bounds);assert.deepEqual(after.holes.map(({x,y})=>({x,y})),before.holes.map(({x,y})=>({x,y})));
  assert(after.holes.every(h=>h.diameterMm===r.fasteners.holeDiameterMm));assert.equal(after.clampHeightMm,r.fasteners.clampHeightMm);
 }
});
test('PV12 uses model-specific grids; PV8/12 unknown bore and clamp stay unknown',()=>{
 for(const stage of [3,4,5,6,7,8]){
  const r=reviewed.rows.find(r=>r.designation===`PV 12-${stage}`),data=catalogMounting(args(r));
  assert.deepEqual(pitch(data.frameV1),stage<5?[140,140]:[164,164]);
  assert(data.frameV1.holes.every(h=>h.diameterMm===null));assert.equal(data.fastenersV1.clampHeightMm,null);
  const m=readMounting(data.frameV1);assert.equal(verticalChannelMount({dimensions:{}},m).flangeFaceToFaceMm,undefined);
 }
 const cdm=reviewed.rows.find(r=>r.variantId==='CNP:CDM:1100119319');
 assert.deepEqual(pitch(cdm.mounting),[215,130]);assert(cdm.mounting.holes.every(h=>h.diameterMm===null));
});
test('CAD grid and anchor preserve every measured hole in both coordinate systems',()=>{
 for(const r of reviewed.rows.filter(r=>r.mounting.cad)){
  const m=readMounting(r.mounting);assert(m,r.variantId);const cad=m.cad;
  for(let i=0;i<m.holes.length;i++){
   assert(Math.abs(m.holes[i].x+cad.anchorMm[1]-cad.pointsMm[i][1])<.001);
   assert(Math.abs(m.holes[i].y+cad.anchorMm[0]-cad.pointsMm[i][0])<.001);
   assert(Math.abs(cad.pointsMm[i][2]-cad.boundsMm[2])<.001);
  }
 }
});
test('CRV200 approval is visible without changing PN; exact CRV32 drawing wins over generic base height',()=>{
 const rows=reviewed.rows.filter(r=>r.series==='CRV'&&r.designation.startsWith('CRV 200'));
 assert.equal(rows.length,4);
 for(const r of rows){
  const data=catalogMounting(args(r));assert.deepEqual(pitch(data.frameV1),[500,385]);
  assert.equal(data.frameV1.application,'owner_accepted_unconfirmed_execution');assert.match(data.frameAssessment.note,/PN16.*PN25–40/);
  assert.match(pumpMountingSection({mounting:data}).note,/PN16.*PN25–40/);
  assert.equal(verticalChannelMount({dimensions:{}},readMounting(data.frameV1)).flangeFaceToFaceMm,490);
 }
 const crv=reviewed.rows.find(r=>r.variantId==='VANDJORD:CRV:74121730');assert.equal(catalogMounting(args(crv)).frameV1.clampHeightMm,53);
});
