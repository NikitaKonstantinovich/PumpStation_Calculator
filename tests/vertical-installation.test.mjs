import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {catalogInstallation,installationMounting} from '../services/local-storage/node-installation.mjs';
import {catalogMounting} from '../services/local-storage/node-mountings.mjs';
import {loadTs} from './load-ts.mjs';
const data=JSON.parse(await readFile(new URL('../data/vertical-pump-installation-reviewed.json',import.meta.url),'utf8'));
const args=r=>({variant:{id:r.variantId,designation:r.designation,manufacturer_article:r.article},model:{id:r.modelId},motor:r.motor,manufacturer:r.manufacturer,series:r.series});
const {dnSourcePort}=await loadTs(new URL('../app/node-tools/dn-runtime.ts',import.meta.url));
const {pumpConnectionRow,pumpConnectionNotes}=await loadTs(new URL('../app/node-tools/pump-connection-card.ts',import.meta.url));
test('all vertical executions have two independently addressed nozzle records and valid height geometry',()=>{
 assert.equal(data.rows.length,2214);assert.equal(new Set(data.rows.map(r=>r.variantId)).size,2214);
 for(const r of data.rows){
  const v=catalogInstallation(args(r));assert(v,r.variantId);
  for(const side of ['inlet','outlet']){assert(v.ports[side].axis_height_mm>0,r.variantId);assert(v.ports[side].installation_source);}
  if(r.series!=='PV')assert(v.dimensions.flange_face_to_face>0,r.variantId);
  const m=installationMounting(catalogMounting(args(r)),v).frameV1;
  assert(m.holes.every(h=>h.diameterMm>0),r.variantId);assert(m.boltDiameterMm>0,r.variantId);assert(m.clampHeightMm>0,r.variantId);
 }
});
test('owner-approved minimum pressure is explicit and uncertain mounting dimensions remain labelled',()=>{
 for(const r of data.rows){for(const p of Object.values(r.ports))if(p.pn_status==='owner_accepted_minimum'){
  assert.equal(p.pn_nominal_bar,Math.min(...p.pn_options_bar));assert.match(p.pn_note,/согласовано пользователем/);
 }
 if(r.mounting.assumption){const m=installationMounting(catalogMounting(args(r)),r);assert.match(m.frameV1.note,/Расчётное допущение/);assert.equal(m.frameAssessment.fastenerStatus,'owner_accepted_assumption');}}
 assert.equal(data.rows.filter(r=>r.mounting.assumption).length,25);
});
test('review cannot leak across articles, designation, model or motor',()=>{
 for(const r of data.rows){const a=args(r);
  for(const bad of [{...a,variant:{...a.variant,designation:'wrong'}},{...a,model:{id:'wrong'}},{...a,variant:{...a.variant,manufacturer_article:'wrong'}},...Object.keys(r.motor).map(k=>({...a,motor:{...a.motor,[k]:'changed'}}))])assert.equal(catalogInstallation(bad),null,r.variantId);
 }
});
test('round/oval flanges and threaded limits reach DN calculation; PN options do not invent a selected class',()=>{
 for(const connection_type of ['round_flange','oval_flange'])assert.equal(dnSourcePort({inlet:{connection_type,dn:32,pn_nominal_bar:25}},'inlet').connection,'flanged');
 assert.equal(dnSourcePort({inlet:{connection_type:'threaded',dn:32,max_working_pressure_bar:15}},'inlet').maxPressure,15);
 assert.equal(dnSourcePort({inlet:{connection_type:'round_flange',dn:65,pn_options_bar:[25,40]}},'inlet').maxPressure,null);
 assert.equal(dnSourcePort({inlet:{connection_type:'round_flange',dn:65,pn_nominal_bar:40,max_working_pressure_bar:25}},'inlet').maxPressure,25);
});
test('PV uses absolute H/H1 heights and no invented inline span or flange PN',()=>{
 const r=data.rows.find(r=>r.designation==='PV 2-6');assert.equal(r.ports.inlet.axis_height_mm,43.5);assert.equal(r.ports.outlet.axis_height_mm,224.5);
 assert.equal(r.dimensions.flange_face_to_face,undefined);assert.equal(r.ports.inlet.pn_nominal_bar,undefined);
 const p={inlet:{connection_type:'threaded',thread_designation:'G1',...r.ports.inlet},outlet:r.ports.outlet};
 const displayed=pumpConnectionRow(p,'inlet');assert.equal(displayed[1],'DN 25 · G1');assert.equal(displayed[2],'Не применяется');assert.equal(displayed[3],'15 бар');assert.match(pumpConnectionNotes(p),/разных высотах/);
});
test('CNP oval mating thread remains distinct from two fixing bolts and base holes',()=>{
 const r=data.rows.find(r=>r.variantId==='CNP:CDM:1100092399');assert.equal(r.ports.inlet.dn,25);assert.equal(r.ports.inlet.bolt_count,2);assert.equal(r.ports.inlet.fastener_thread,'M10');
 const m=installationMounting(catalogMounting(args(r)),r).frameV1;assert.equal(m.holes.length,4);assert.equal(m.boltDiameterMm,12);assert.equal(m.flangeFaceToFaceMm,214);
});
test('CN/C bearing heights are separate from B/N and exact reviewed exception is preserved',()=>{
 const find=id=>data.rows.find(r=>r.variantId==='VANDJORD:CRV:'+id);
 for(const [id,height] of [['74137017',42],['74138014',49],['74122714',63],['74121730',53]]){
  const r=find(id);assert.equal(installationMounting(catalogMounting(args(r)),r).frameV1.clampHeightMm,height);
 }
 const r=find('74127003'),before=catalogMounting(args(r));assert.deepEqual(installationMounting(before,r).frameV1.holes,before.frameV1.holes);assert.match(before.frameV1.note,/PN/);
});
