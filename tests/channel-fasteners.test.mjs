import test from 'node:test';
import assert from 'node:assert/strict';
import {resources,load,json} from './fixtures/station-specification.mjs';
const {selectChannelBolting,channelFastenerRadius}=await load('frame-calculation/channel-fasteners');
const {parseFrameHardware}=await load('model-editor/frame-hardware');
const imported=await json('data/frame-fasteners-import.json');
const items=[...new Map([...resources.components.items,...imported.items].map(i=>[i.id,i])).values()];

test('real M12 pump base and M8 stand joints use catalogued bolts, two washers and a nut',()=>{
 const pump=selectChannelBolting(items,12,15,7.4),stand=selectChannelBolting(items,8,6,7.4),cabinet=selectChannelBolting(items,8,1,3);
 assert(pump);assert(stand);assert(cabinet);
 assert.equal(pump.hardware.length,45);assert.equal(pump.hardware.nut,10);assert.equal(pump.hardware.washer,2.5);
 assert.equal(stand.hardware.length,30);assert.equal(stand.hardware.nut,6.5);assert.equal(stand.hardware.washer,1.6);
 assert.equal(cabinet.hardware.length,30);
 for(const selected of [pump,stand,cabinet]){
  const h={...selected.hardware,centers:[[0,0,0]]};assert.deepEqual(parseFrameHardware(h),h);
  assert.equal(parseFrameHardware({...h,length:10}),undefined);
  assert.equal(h.joint,'through');assert(h.parts.nut);assert(!h.parts.rivet);
 }
 assert.equal(channelFastenerRadius(12),12);
 assert.equal(selectChannelBolting(items,12,0,7.4),null);
 assert.equal(selectChannelBolting(items,12,150,7.4),null);
 assert.equal(selectChannelBolting(items.filter(i=>i.id!==pump.nut.id),12,15,7.4),null);
});
