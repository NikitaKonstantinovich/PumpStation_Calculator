import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const load=n=>loadTs(new URL('../app/'+n+'.ts',import.meta.url));
const {channelPaintingCost,isChannelPaintingRate,CHANNEL_PAINTING_PROFILES}=await load('channel-painting');
const base=await load('base-values');
test('all catalogue channel sizes start at 1000 RUB/m; editing one published row changes only its profile',()=>{
 const values=base.initialBaseValues(),rows=values.painting.filter(isChannelPaintingRate);
 assert.deepEqual(rows.map(r=>r.profile),[...CHANNEL_PAINTING_PROFILES]);
 for(const r of rows)assert.equal(r.pricePerMeter,1000);
 const old=base.baseSnapshot('old',values),latest=base.baseSnapshot('new',values);
 latest.values.painting.find(r=>isChannelPaintingRate(r)&&r.profile==='8П').pricePerMeter=1250;
 assert.deepEqual(base.validateBaseValues(latest.values),[]);
 const catalog=base.applyBaseTariffs({version:'catalog'},latest);
 assert(catalog.paintingRates.every(r=>r.dn>0&&!isChannelPaintingRate(r)));
 assert.equal(channelPaintingCost(catalog.channelPaintingRates,'8П',10160).costRub,12700);
 assert.equal(channelPaintingCost(catalog.channelPaintingRates,'10П',10160).costRub,10160);
 assert.equal(channelPaintingCost(base.applyBaseTariffs({version:'catalog'},old).channelPaintingRates,'8П',10160).costRub,10160);
});
test('invalid, duplicate and missing channel painting rates stay unknown and cannot silently become free',()=>{
 const rows=base.initialBaseValues().painting.filter(isChannelPaintingRate),r=rows[0];
 for(const value of [null,0,-1,Infinity,NaN])assert.equal(channelPaintingCost([{...r,pricePerMeter:value}],'8П',10160).costRub,null);
 assert.equal(channelPaintingCost([r,r],'8П',10160).costRub,null);
 assert.equal(channelPaintingCost(undefined,'8П',10160).costRub,null);
 for(const alter of [v=>v.painting.push({...r}),v=>v.painting.find(isChannelPaintingRate).pricePerMeter=-1,v=>v.painting.find(isChannelPaintingRate).profile='9П']){
  const v=base.initialBaseValues();alter(v);assert(base.validateBaseValues(v).length);
 }
 assert(!base.legacyBaseValues().painting.some(isChannelPaintingRate));
});
test('channel painting publication is reported in the painting section and applies without changing pipe rates',async()=>{
 const {createProject}=await load('project-config'),{projectBaseChanges,applyProjectBaseUpdate}=await load('base-values-project');
 const old=base.baseSnapshot('old',base.initialBaseValues()),latest=structuredClone(old);latest.versions.painting='new';
 latest.values.painting.find(r=>isChannelPaintingRate(r)&&r.profile==='12П').pricePerMeter=1500;
 const project=createProject('test',{baseValues:old}),changes=projectBaseChanges(project,latest);
 assert.equal(changes.length,1);assert.equal(changes[0].section,'painting');assert.match(changes[0].label,/12П/);
 const updated=applyProjectBaseUpdate(project,latest,['painting']);
 const applied=updated.entities['station-settings'].baseValues;
 assert.equal(applied.versions.painting,'new');assert.equal(applied.versions.welding,'old');
 assert.deepEqual(applied.values.painting.filter(base.isPipeBasePaintingRate),old.values.painting.filter(base.isPipeBasePaintingRate));
});
