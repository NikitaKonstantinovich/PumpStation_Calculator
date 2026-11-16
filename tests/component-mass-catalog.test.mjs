import test from 'node:test';import assert from 'node:assert/strict';import {load} from './fixtures/station-specification.mjs';
const {readComponentMass}=await load('component-mass'),{withComponentMasses}=await load('component-mass-catalog'),{channelManufacturingMass}=await load('frame-calculation/channel-mass');
const item=(id,catalogId,values)=>({id,catalogId,family:id,prices:[],fields:Object.entries(values).map(([column,value])=>({column,headerPath:[column],value}))});
test('mass selects execution and PN, and never substitutes a different pressure or actuator',()=>{
 const v=item('v','затворы',{'Вес с рукояткой, кг':3,'Вес с редуктором, кг':5});
 assert.equal(readComponentMass(v),null);assert.equal(readComponentMass(v,'шт.',{description:'рукоятка'}).kg,3);assert.equal(readComponentMass(v,'шт.',{description:'редуктор'}).kg,5);
 const p=item('p','компенсаторы',{PN:'PN16'});p.fields.push({column:'a',headerPath:['PN10','Вес, кг'],value:2},{column:'b',headerPath:['PN16','Вес, кг'],value:4});
 assert.equal(readComponentMass(p).kg,4);assert.equal(readComponentMass(p,'шт.',{pn:25}),null);
});
test('units and invalid masses cannot silently create complete totals',()=>{
 const p=item('p','трубы',{'Масса, кг':50,'Масса 1 м, кг':2});assert.equal(readComponentMass(p,'м').kg,2);assert.equal(readComponentMass(p).kg,50);
 for(const value of [null,'',false,-1,Infinity,'неизвестно'])assert.equal(readComponentMass(item('p','test',{'Масса, кг':value})),null);
});
test('enrichment is idempotent, recalculates dimensions, and preserves explicit user mass',()=>{
 const tube=item('tube','трубы',{'Материал':'Ст20','Диаметр, мм':50,'Толщина, мм':3});
 const a=withComponentMasses([tube],false),b=withComponentMasses(a,false);assert.deepEqual(a,b);assert.equal(tube.fields.length,3);
 const changed=structuredClone(a);changed[0].fields.find(f=>f.column==='Толщина, мм').value=4;const c=withComponentMasses(changed,false);assert(readComponentMass(c[0],'м').kg>readComponentMass(a[0],'м').kg);
 const manual=item('tube','трубы',{'Материал':'Ст20','Диаметр, мм':50,'Толщина, мм':3,'Масса 1 м, кг':.75,'Тип массы':'расчётная'});assert.equal(readComponentMass(withComponentMasses([manual],false)[0],'м').kg,.75);
});
test('saved insertion sums lengths, quantities and deposited metal exactly once; unknown component remains unknown',()=>{
 const pipe=item('pipe','трубы',{'Масса 1 м, кг':2}),flange=item('flange','фланцы',{'Масса, кг':3});
 const insertion={...item('assembly','ответные-части',{}),calculatedInsertion:{calculation:{bom:[{componentId:'pipe',quantity:1.5,unit:'м',kind:'pipe'},{componentId:'flange',quantity:2,unit:'шт.',kind:'flange'},{componentId:null,quantity:1,unit:'м',kind:'welding'}]}}};
 const rows=withComponentMasses([pipe,flange,insertion],false);assert(Math.abs(readComponentMass(rows[2]).kg-(9+.035325))<1e-10);assert.deepEqual(withComponentMasses(rows,false),rows);
 insertion.calculatedInsertion.calculation.bom[0].componentId='missing';assert.equal(readComponentMass(withComponentMasses([pipe,flange,insertion],false)[2]),null);
});
test('frame manufacturing mass scales with seam length basis, profile area, coating thickness and weld leg',()=>{
 const g={members:[{start:0,end:1000}],profile:{kgM:10}},w={perJointMm:300};
 const a=channelManufacturingMass(g,w),b=channelManufacturingMass(g,w,{weldLegMm:6,coatingThicknessMm:.16});
 assert.equal(b.weldingKgM,a.weldingKgM*4);assert.equal(b.paintingKgM,a.paintingKgM*2);assert.equal(channelManufacturingMass(g,w,{weldLegMm:0,coatingThicknessMm:0}).paintingKgM,0);
});
