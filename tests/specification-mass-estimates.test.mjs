import test from 'node:test';
import assert from 'node:assert/strict';
import {load,resources,fixture} from './fixtures/station-specification.mjs';
const {unselectedConnectionMass}=await load('frame-calculation/specification-mass-estimates');
const {withComponentMasses}=await load('component-mass-catalog');
const {componentMassData}=await load('node-tools/component-masses');
const items=withComponentMasses(resources.components.items,false);
const adapter=()=>({position:'03.03',name:'Ответная часть РФ DN40 — резьба DN40',quantity:3,unit:'шт.',price:null,details:'',section:'suction',generatedBy:'suction-line',assemblyRole:'primary-adapter',technicalStatus:'unverified',insertionRequirement:{purpose:'pump-transition',location:'suction:primary-adapter',material:'aisi304',pn:16,from:{dn:40,connection:'collar'},to:{dn:40,connection:'threaded'},geometry:'straight',withSensorNipple:false}});
const bolts=()=>({position:'03.06',name:'Болт М16 для фланцев DN40',quantity:12,unit:'шт.',price:null,details:'',section:'suction',generatedBy:'suction-line',assemblyRole:'primary-pump-fasteners-bolts'});

test('approved estimates fill mass only, with sources, correct quantities and unchanged physical selection',()=>{
 const rows=[adapter(),bolts()],copy=structuredClone(rows),p=fixture();p.entities['station-spec'].items=rows;
 const data=componentMassData({project:p,resources:{components:{items}}});
 assert.equal(data.missingCount,0);assert.equal(data.rows[0].unitMassKg,2.12);assert.equal(data.rows[0].totalMassKg,6.36);
 assert(data.rows[1].unitMassKg>0);assert.equal(data.rows[1].totalMassKg,data.rows[1].unitMassKg*12);
 assert(data.rows.every(r=>r.source.includes('Предварительная масса')&&r.source.includes('Расчётная масса')));
 assert.match(data.rows[1].source,/фактического болта/);assert.deepEqual(rows,copy);
 assert.equal(data.totalMassKg,data.rows.reduce((n,r)=>n+r.totalMassKg,0));
});

test('estimation cannot hide missing selected items or cross sections, circuits, PN, geometry and unit boundaries',()=>{
 const a=adapter(),b=bolts();
 for(const row of [{...a,equipmentId:'actual-missing'}, {...a,insertionAssembly:{}}, {...a,unit:'м'}, {...a,generatedBy:'station'}, {...a,insertionRequirement:{...a.insertionRequirement,pn:25}}, {...a,insertionRequirement:{...a.insertionRequirement,pn:NaN}}, {...a,insertionRequirement:{...a.insertionRequirement,withSensorNipple:true}}, {...a,insertionRequirement:{...a.insertionRequirement,to:{dn:32,connection:'threaded'}}}, {...a,insertionRequirement:{...a.insertionRequirement,from:{dn:40,connection:'threaded'}}}])assert.equal(unselectedConnectionMass(row,[row],items),null);
 assert.equal(unselectedConnectionMass(b,[{...a,section:'discharge'}],items),null);
 assert.equal(unselectedConnectionMass(b,[{...a,assemblyRole:'secondary-adapter'}],items),null);
 assert.equal(unselectedConnectionMass(b,[{...a,equipmentId:'selected-adapter'}],items),null);
 assert.equal(unselectedConnectionMass(a,[a],[]),null);
});
