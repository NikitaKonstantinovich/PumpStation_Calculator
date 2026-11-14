import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTs} from './load-ts.mjs';
const base=new URL('../app/frame-calculation/',import.meta.url);
const {framePrice,frameAnchors,frameVariants,supportCount}=await loadTs(new URL('catalog.ts',base));
const {layoutFrame,eyeletHoles,holesOverlap}=await loadTs(new URL('layout.ts',base));
const {stationMass}=await loadTs(new URL('mass.ts',base));
const {standHardware,chooseLoadHardware}=await loadTs(new URL('hardware.ts',base));
const {componentPrice,pumpFasteners,bindFramePart}=await loadTs(new URL('components.ts',base));
const {DEFAULT_FRAME_RULES:r}=await loadTs(new URL('types.ts',base));
const {coreFrameConstructionForPumpMass:construction}=await loadTs(new URL('../frame-selection.ts',base));
const mounting={verified:true,source:'confirmed fixture',holes:[[-50,-100],[-50,100],[50,-100],[50,100]].map(([x,y],i)=>({id:String(i),owner:'pump',x,y,diameterMm:11})),bounds:{minX:-60,maxX:60,minY:-120,maxY:120},footThicknessMm:8,boltDiameterMm:10};
const pump={id:'p',name:'P',count:2,massKg:30,spacingMm:300,mounting,circuit:1};
const part=(id,mass,quantity=1)=>({id,name:id,role:id,quantity,unitMassKg:mass,unitPriceRub:1});

test('frame thickness uses single heaviest pump and exact 50/100 kg boundaries',()=>{
 assert.equal(construction(49.99).sheetThicknessMm,4);assert.equal(construction(50).sheetThicknessMm,5);
 assert.equal(construction(99.99).sheetThicknessMm,5);assert.equal(construction(100).sheetThicknessMm,undefined);
 assert.equal(construction(null),null);assert.equal(construction(0),null);
 for(const mass of [1,20,49,50,70,99])assert.notEqual(construction(mass).sheetThicknessMm,3);
});
test('all frame sizes preserve source prices, use length and thickness interpolation and bounded standard lengths',async()=>{
 const binding=JSON.parse(await readFile(new URL('../public/binding-components.json',import.meta.url),'utf8'));
 const anchors=frameAnchors(binding.items),before=JSON.stringify(anchors);assert.equal(anchors.length,8);
 const variants=frameVariants(anchors,true);assert.equal(variants.length,90);assert.equal(new Set(variants.map(v=>v.id)).size,90);
 assert.equal(framePrice(600,3,anchors,true).value,2900);assert.equal(framePrice(900,5,anchors,true).value,5696.38);
 assert.equal(framePrice(2000,5,anchors,true).value,9000);assert.equal(framePrice(2000,3,anchors,true).value,6566.67);
 assert.equal(framePrice(2000,4,anchors,true).value,7783.33);assert.match(framePrice(1900,5,anchors,true).method,/extrapolation/);
 assert.equal(framePrice(600,4,anchors,false).transferApproved,false);assert.equal(JSON.stringify(anchors),before);
 assert.throws(()=>framePrice(2100,5,anchors,true));assert.deepEqual([600,800,900,1300,1400,2000,2100].map(supportCount),[4,4,6,6,8,8,0]);
});
test('layout retains the minimum frame and shifts the whole station to fit the direct cabinet mounting span',()=>{
 const l=layoutFrame([pump],600,null,r);assert.deepEqual(l.issues,[]);assert.equal(l.lengthMm,600);assert.equal(l.standDistanceMm,560);assert.equal(l.profiles,false);
 assert(l.pumps.every(p=>p.y===0));assert.equal(Math.min(...l.holes.filter(h=>h.owner==='pump-1-0').map(h=>h.x))-20,55);
 assert.equal(l.holes.filter(h=>h.owner==='stand-1').reduce((s,h)=>s+Math.abs(h.y),0),350);
 const m=layoutFrame([{...pump,count:2,spacingMm:500}],600,null,r);
 assert.equal(m.lengthMm,800);assert.equal(m.profiles,false);assert.equal(m.standDistanceMm,560);assert.equal(m.stationAlignment,'cabinet');
 assert.equal(m.stationOffsetMm,35);assert.equal(m.pumps[1].x-m.pumps[0].x,500);
 for(const p of m.pumps)for(const h of m.holes.filter(h=>h.owner===p.id))assert.equal(Math.abs(h.x-p.x),50);
 assert.equal(layoutFrame([{...pump,count:10,spacingMm:500}],800,null,r).lengthMm,null);
 assert(layoutFrame([{...pump,mounting:null}],600,null,r).issues.some(i=>i.code==='mounting'));
});

test('766 mm native 1800 stand span is fitted inside the chosen blank; otherwise pumps and tank are centered with profile mounting',()=>{
 const direct=layoutFrame([{...pump,spacingMm:700}],800,null,r);
 assert.equal(direct.lengthMm,1000);assert.equal(direct.stationOffsetMm,41);assert.equal(direct.standDistanceMm,766);assert.equal(direct.profiles,false);
 const compact=layoutFrame([{...pump,count:1}],800,null,r);
 assert.equal(compact.lengthMm,600);assert.equal(compact.stationAlignment,'centered');assert.equal(compact.profiles,true);
 assert.equal(compact.pumps[0].bounds.minX,compact.lengthMm-compact.pumps[0].bounds.maxX);
 assert(compact.stands[1].x-compact.stands[0].x<760);
 const before=JSON.stringify(pump);layoutFrame([pump],600,null,r);assert.equal(JSON.stringify(pump),before);
});

test('full 40 mm stand foot fits between bodies and smaller gaps are reported after centering',()=>{
 const wide={...pump,spacingMm:460,mounting:{...mounting,holes:[[-200,-100],[-200,100],[200,-100],[200,100]].map(([x,y],i)=>({id:String(i),owner:'pump',x,y,diameterMm:11})),bounds:{minX:-210,maxX:210,minY:-120,maxY:120}}};
 assert(layoutFrame([wide],600,null,{...r,minStandGap:50}).issues.some(i=>i.code==='stand-placement'));
 const layout=layoutFrame([wide],600,null,r);
 assert.deepEqual(layout.issues,[]);
 const x=layout.stands[1].x,holes=layout.holes.filter(h=>h.owner.startsWith('pump-'));
 assert(Math.min(...holes.map(h=>Math.abs(x-h.x)))>=20);
 assert(Math.min(...holes.map(h=>h.x))-layout.stands[0].x>=r.minStandGap);
 assert(layout.standDistanceMm<=560);
 assert(layout.pumps.every(p=>x+20<=p.bounds.minX||x-20>=p.bounds.maxX));
 const blocked=layoutFrame([{...wide,spacingMm:459}],600,null,r);
 assert(blocked.issues.some(i=>i.code==='stand-placement'&&i.message.includes('≥20 мм')));
 assert.equal(blocked.stands.length,0);assert.equal(blocked.stationAlignment,'centered');
 assert.equal(blocked.pumps[0].bounds.minX,blocked.lengthMm-blocked.pumps.at(-1).bounds.maxX);
});
test('tank has three feet, 110 mm initial gap, increments by ten, forty mm body gap and fifty mm end margin',()=>{
 const tank={id:'tank',volumeL:100,dryMassKg:10,mounting:{...mounting,holes:[[-100,0],[50,-86],[50,86]].map(([x,y],i)=>({id:String(i),owner:'tank',x,y,diameterMm:10})),bounds:{minX:-200,maxX:200,minY:-200,maxY:200}}};
 const l=layoutFrame([{...pump,count:1}],800,tank,r);assert.equal(l.issues.length,0);
 const lastHole=Math.max(...l.holes.filter(h=>h.owner.startsWith('pump')).map(h=>h.x)),nearFoot=Math.min(...l.holes.filter(h=>h.owner==='tank').map(h=>h.x));
 assert(nearFoot-lastHole>=110);assert.equal((nearFoot-lastHole-110)%10,0);
 assert(l.tank.bounds.minX-l.pumps[0].bounds.maxX>=40);
 assert(l.lengthMm-Math.max(...l.holes.filter(h=>h.owner==='tank').map(h=>h.x))>=50);
});
test('eyelet positions avoid stand hole collision while retaining minimum thirty mm edge distance',()=>{
 const l=layoutFrame([pump],600,null,r);const holes=eyeletHoles(l,r,11,25);assert.equal(holes.length,4);
 assert(holes.every(h=>h.x>=30&&l.lengthMm-h.x>=30&&r.widthMm/2-Math.abs(h.y)>=30));
 assert(holes.every(h=>l.holes.every(other=>!holesOverlap(h,other))));
 assert.equal(new Set(holes.map(h=>`${h.x}/${h.y}`)).size,4);
});
test('direct and profile stand fittings have exact quantities',()=>{
 for(const profiles of [false,true]){
  const p=standHardware(profiles,600),qty=role=>p.find(x=>x.role===role)?.quantity??0;
  assert.equal(qty('stand-left'),1);assert.equal(qty('stand-right'),1);assert.equal(qty('stand'),0);
  assert(p.every(part=>part.specified===true&&part.source));
  assert.equal(qty('bolt-m8-25'),8);assert.equal(qty('washer-m8'),profiles?12:8);assert.equal(qty('rivet-m8'),profiles?12:8);assert.equal(qty('bolt-m8-35'),profiles?4:0);assert.equal(qty('profile'),profiles?2:0);
 }
});
test('mass expands exactly one assembly level and counts filled tank, reserves and unknowns',()=>{
 const p={...part('assembly',100),massAccounting:'children',children:[part('pump',20,2),part('tank',10),part('frame',10)]};
 assert.equal(stationMass([p],100).operatingKg,160);
 assert.equal(stationMass([{...p,massAccounting:'self'}],100).operatingKg,200);
 assert.equal(stationMass([part('unknown',null)],0).operatingKg,null);
 assert.throws(()=>stationMass([part('same',1),part('same',2)],0),/Повторный/);
});
test('load selection includes its own mass, capacity equality and excludes unconfirmed or incompatible supports',()=>{
 const support={id:'s',name:'S',threadMm:8,capacityKg:24,massKg:1,priceRub:5,mounting:'two-studs',verified:true,source:'fixture'};
 const eye={id:'e',name:'E',threadMm:8,capacity45Kg:80,massKg:.5,priceRub:2,verified:true,source:'fixture',baseDiameterMm:25};
 const rules={...r,liftingEffectiveLegs:3,liftingAttachmentVerified:true},fasteners=(d,q,kind)=>[part(kind+'-hardware',0,q)];
 const chosen=chooseLoadHardware([part('station',90)],0,4,[support],[eye],rules,fasteners);
 assert.equal(chosen.mass.operatingKg,96);assert.equal(chosen.support.id,'s');assert.equal(chosen.liftingApproved,true);
 assert.equal(chooseLoadHardware([part('station',90.01)],0,4,[support],[eye],rules,fasteners).support,null);
 for(const invalid of [{...support,verified:false},{...support,mounting:'other'}])assert.equal(chooseLoadHardware([part('station',80)],0,4,[invalid],[eye],rules,fasteners).support,null);
 assert.equal(chooseLoadHardware([part('station',80)],0,4,[support],[eye],r,fasteners).liftingApproved,false);
});
test('bolt length is selected from exact rivet grip and engagement; bulk prices become unit prices',()=>{
 const f=(column,value)=>({column,headerPath:[column],value}),component=(id,n,extra=[])=>({id,catalogId:'метизы',family:n,fields:[f('Наименование',n),f('Масса, кг',.01),...extra],prices:[{label:'Цена, ₽/100шт',amount:100,currency:'RUB'}]});
 const rivet=component('r','Заклепка резьбовая М10',[f('FRAME_RIVET',{verified:true,source:'fixture',threadMm:10,gripMinMm:3,gripMaxMm:5,headThicknessMm:1,minEngagementMm:12,maxEngagementMm:20})]);
 const items=[rivet,component('short','Болт М10х20 DIN933'),component('fit','Болт М10х25 DIN933'),component('long','Болт М10х35 DIN933')];
 const selected=pumpFasteners(mounting,4,8,'p',items);assert.equal(selected.issue,undefined);assert.equal(selected.parts[0].componentId,'fit');assert.equal(selected.parts[0].quantity,8);
 assert(pumpFasteners(mounting,6,8,'p',items).issue);assert.equal(componentPrice(rivet),1);
});

test('hollow pump feet use full clamp height and installed rivet projection; partial bolts cannot bind by diameter',async()=>{
 const imported=JSON.parse(await readFile(new URL('../data/frame-fasteners-import.json',import.meta.url),'utf8')).items;
 const m={...mounting,boltDiameterMm:12,footThicknessMm:7,clampHeightMm:38};
 for(const thickness of [3,4,5]){
  const selected=pumpFasteners(m,thickness,8,'mv',imported);
  assert.equal(selected.issue,undefined);assert.equal(selected.parts[0].componentId,'frame-hardware-bolt-m12-65');
  assert.equal(selected.parts[0].quantity,8);assert.equal(selected.parts[0].unitPriceRub,44);
  assert.match(selected.parts[0].source,/монтажная высота 38/);
 }
 const partial=pumpFasteners({...m,clampHeightMm:null,footThicknessMm:null},4,8,'mv',imported);
 assert(partial.issue);assert.match(partial.parts[0].name,/М12/);assert.match(partial.parts[0].name,/длина не определена/);
 assert.equal(bindFramePart(partial.parts[0],[imported.find(i=>i.id==='frame-hardware-bolt-m12-65')]).componentId,undefined);
 assert(pumpFasteners(m,8,8,'mv',imported).issue);
});
