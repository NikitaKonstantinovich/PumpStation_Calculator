import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTs} from './load-ts.mjs';
const {channelMetrePrice}=await loadTs(new URL('../app/frame-calculation/channel-pricing.ts',import.meta.url));
const {items}=JSON.parse(await readFile(new URL('../public/binding-components.json',import.meta.url),'utf8'));

test('all selected channel profiles use RUB/metre even though tonne and kilogram prices come first',()=>{
 for(const profile of ['8П','10П','12П','14П']){
  const result=channelMetrePrice(items,profile),row=items.find(i=>i.id===result.componentId);
  assert(row);assert.equal(result.rateRubM,row.prices.find(p=>p.label.endsWith('Цена м, ₽')).amount);
  assert.notEqual(result.rateRubM,row.prices[0].amount);
 }
 assert.equal(channelMetrePrice(items,'8П').rateRubM,528.68);
});
test('missing, ambiguous, invalid and foreign-currency prices cannot become a confirmed metre price',()=>{
 const item=structuredClone(items.find(i=>i.id==='металл-001-r0004'));
 assert.equal(channelMetrePrice([],'8П').rateRubM,null);
 assert.equal(channelMetrePrice([item,{...item,id:'duplicate'}],'8П').rateRubM,null);
 for(const amount of [-1,NaN,Infinity]){
  const row=structuredClone(item);row.prices.find(p=>p.label.endsWith('Цена м, ₽')).amount=amount;
  assert.equal(channelMetrePrice([row],'8П').rateRubM,null);
 }
 item.prices=item.prices.filter(p=>!p.label.endsWith('Цена м, ₽'));
 assert.equal(channelMetrePrice([item],'8П').rateRubM,null);
 item.prices.push({label:'Цена м, ₽',amount:12,currency:'USD'});
 assert.equal(channelMetrePrice([item],'8П').rateRubM,null);
 assert.equal(channelMetrePrice([item],'10П').rateRubM,null);
 item.prices.push({label:'Цена м, ₽',amount:0,currency:'RUB'});
 assert.equal(channelMetrePrice([item],'8П').rateRubM,0);
});
