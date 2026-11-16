import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,choose,sync,resources,load,json} from './fixtures/station-specification.mjs';
import {mount,inputs} from './fixtures/channel-frame.mjs';
const {selectChannelRivet}=await load('frame-calculation/channel-rivets');
const {parseFrameHardware}=await load('model-editor/frame-hardware');
const {executeFrameOperation,FRAME_STAGES}=await load('node-tools/frame-nodes');
const model=await load('model-editor/model');
const {cadContents}=await load('cad-export');
const imported=await json('data/frame-fasteners-import.json');
const items=[...new Map([...resources.components.items,...imported.items,await json('data/channel-profile-bolt.json')].map(i=>[i.id,i])).values()];

test('rivet selection uses receiving thickness, catalog grip and installed projection',()=>{
 for(const [d,clamp,sheet,code,hole,lift] of [[8,6,7.4,'23301080080',11,1.5],[8,6,8.1,'23301080105',11,1.5],[8,1,3,'23301080030',11,1.5],[8,19,2,'23301080030',11,1.5],[12,15,7.4,'23301120100',16,2]]){
  const selected=selectChannelRivet(items,d,clamp,sheet);assert(selected,`${d}/${sheet}`);
  const h={...selected.hardware,centers:[[0,0,0]]};
  assert.equal(h.parts.rivet.id,'frame-hardware-rivkle-'+code);assert.equal(h.hole,hole);assert.equal(h.supportLift,lift);
  assert.equal(h.parts.nut,undefined);assert.equal(h.joint,undefined);
  assert(h.length>=clamp+h.washer+lift+sheet+h.tail);
  assert.deepEqual(parseFrameHardware(h),h);
 }
 assert.equal(selectChannelRivet(items,16,15,7.4),null);
 assert.equal(selectChannelRivet(items,12,15,10.1),null);
 assert.equal(selectChannelRivet(items,12,1000,7.4),null);
 assert.equal(selectChannelRivet(items,12,15,7.4,undefined,()=>false),null);
 const pocket=selectChannelRivet(items,12,15,7.4,{diameterMm:24,depthMm:2});
 assert.equal(pocket.hardware.supportLift,0);
 const missing=items.filter(i=>!i.fields.some(f=>f.column==='FRAME_RIVET'));
 assert.equal(selectChannelRivet(missing,12,15,7.4),null);
});

function prepare(rivets=true,diameter=12){
 let p=choose(fixture(),'318',3,0);Object.assign(p.entities['station-settings'],{stationType:'utility',membraneTank:false});
 const mounting=structuredClone(mount);mounting.mounting.boltDiameterMm=diameter;
 const pumps=resources.pumps.map(p=>p.id==='318'?{...p,type:'end_suction',weightKg:500,mounting:{frameChannelV1:mounting}}:p);
 const components={...resources.components,items:rivets?items:items.filter(i=>!i.fields.some(f=>f.column==='FRAME_RIVET'))};
 p=sync(p,{...resources,pumps,components});
 for(const side of ['suction','discharge'])Object.assign(p.entities['station-collectors'][side].configuration.primary,{spacing:530,spacingStatus:'confirmed'});
 let work={original:p,next:p,resources:{...resources,pumps,components},reasons:[]};
 const channelInputs={...inputs,cabinetEnclosureWidthMm:800,cabinet:{...inputs.cabinet,equipmentId:p.entities['station-spec'].items.find(r=>r.option==='controlCabinet').equipmentId}};
 for(const [operation] of FRAME_STAGES)work=executeFrameOperation({id:operation,operation,fields:[],values:{},links:[],expressions:{}},{work,...(operation==='frame.inputs'?{channelInputs}:{})}).value;
 return {work,p:work.next,assembly:model.buildAssembly(work.next,pumps,{version:1,profiles:{}})};
}
test('channel BOM, bores, mount lifts and CAD share the selected rivet kits; missing M16 falls back',()=>{
 const a=prepare(),b=prepare(false),channel=a.work.frameResult.channel,g=channel.geometry;
 const groups=channel.hardwareGroups;assert(groups.length>=4);
 const pumps=groups.filter(g=>g.owner.startsWith('pump-'));assert.equal(pumps.length,3);
 for(const group of groups){
  assert(group.hardware.parts.rivet,group.owner);assert.equal(group.hardware.parts.nut,undefined);
  for(const h of g.holes.filter(h=>h.owner===group.owner))assert.equal(h.diameterMm,group.hardware.hole);
 }
 const parts=a.work.frameResult.parts.filter(p=>p.role==='frame-fastener');
 const count=groups.reduce((n,g)=>n+g.hardware.centers.length,0);
 assert.equal(parts.reduce((n,p)=>n+p.quantity,0),count*3);
 assert.equal(parts.filter(p=>/Гайка М/.test(p.name)).length,0);
 for(const pump of a.assembly.components.filter(c=>c.kind==='pump')){
  const previous=b.assembly.components.find(c=>c.id===pump.id);assert.equal(pump.position[2]-previous.position[2],2);
 }
 for(const c of a.assembly.components.filter(c=>c.frameMount?.role?.startsWith('stand'))){
  assert(Math.abs(c.position[2]-b.assembly.components.find(n=>n.id===c.id).position[2]-1.5)<1e-8);
 }
 const issues=model.connectionIssues(a.assembly).filter(i=>/крепления насоса и рамы/.test(i.message));assert.deepEqual(issues,[]);
 const cad=cadContents(a.assembly);assert.equal(cad.instances.filter(i=>i.geometry.kind==='rivet-nut').length,count);
 const fallback=prepare(true,16).work.frameResult.channel.hardwareGroups.filter(g=>g.owner.startsWith('pump-'));
 assert.equal(fallback.length,3);assert(fallback.every(g=>g.hardware.joint==='through'&&g.hardware.parts.nut&&!g.hardware.parts.rivet));
});
