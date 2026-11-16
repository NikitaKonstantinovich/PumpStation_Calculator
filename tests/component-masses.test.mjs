import test from 'node:test';import assert from 'node:assert/strict';
import {load,fixture} from './fixtures/station-specification.mjs';
const {componentMassData,componentMassExportRows}=await load('node-tools/component-masses');
const {nodeSpecificationPresentation,applySpecificationNotices}=await load('node-tools/specification-notices');
const {executeSpecificationOperation}=await load('node-tools/specification-runtime');
const {coreVisibleSpecificationItems}=await load('specification-presentation');
const item=(id,values,catalogId='test')=>({id,catalogId,family:id,fields:Object.entries(values).map(([column,value])=>({column,headerPath:[column],value})),prices:[]});
const spec=(position,name,equipmentId,quantity=1,unit='шт.',section='discharge')=>({position,name,equipmentId,quantity,unit,section,price:900000,details:'',status:'selected',technicalStatus:'ready'});
function result(){
 const p=fixture();p.entities['station-spec'].items=[spec('01','Насос','pump',3,'шт.','pump'),spec('02','Шкаф','cabinet',1,'шт.','control'),spec('03','Труба','pipe',2.5,'м'),{...spec('04','Сборка','assembly',2),hydraulicAssembly:{accounting:'assembly',parts:[spec('04.1','Деталь','part',3),{...spec('04.2','Интерфейс','part',99),assemblyRole:'collector-interface'}]}},{...spec('05','Рама',undefined,1,'шт.','frame'),option:'frame',assemblyRole:'frame/body',generatedBy:'station'},spec('06','Нет массы','unknown'),spec('07','Работа','work')];
 p.entities['station-spec'].frameCalculation={parts:[{id:'frame/body',role:'frame',name:'Рама',quantity:1,unitMassKg:null,massAccounting:'self',children:[{id:'frame/stock',role:'frame-member',name:'Заготовка',quantity:2,unitMassKg:8},{id:'frame/bolt',role:'frame-fastener',name:'Болт',quantity:4,unitMassKg:.5},{id:'frame/weld',role:'frame-welding',name:'Сварка',quantity:1,unitMassKg:null}]}]};
 return {project:p,pumps:[],issues:[],resources:{pumps:[{id:'pump',weightKg:10}],cabinets:[{id:'cabinet',weightKg:5}],components:{items:[item('pipe',{'Масса 1 м, кг':2,'Масса, кг':100}),item('part',{'Масса, кг':4}),item('unknown',{}),item('work',{},'работы')]}}};
}
test('mass ledger preserves specification quantity/order, unit basis, assembly accounting and unknowns',()=>{
 const r=result(),before=structuredClone(r),d=componentMassData(r);assert.deepEqual(r,before);
 assert.deepEqual(Object.fromEntries(d.rows.map(r=>[r.name,r.totalMassKg])),{'Насос':30,'Шкаф':5,'Труба':5,'Сборка':24,'Рама':null,'Нет массы':null,'Работа':0});assert.equal(d.rows.find(r=>r.name==='Труба').unitMassKg,2);assert.equal(d.rows.find(r=>r.name==='Труба').unit,'м');
 assert.equal(d.rows.find(r=>r.name==='Сборка').children.length,1);assert.equal(d.rows.find(r=>r.name==='Сборка').unitMassKg,12);
 assert.equal(d.rows.find(r=>r.name==='Рама').knownMassKg,18);assert.equal(d.knownMassKg,82);assert.equal(d.totalMassKg,null);assert.equal(d.missingCount,2);
 assert.deepEqual(d.rows.map(r=>r.position),coreVisibleSpecificationItems(r.project.entities['station-spec'],r.project.entities['station-settings']).map(r=>r.position));
 const exported=componentMassExportRows(d);assert.deepEqual(exported[0].cells.slice(4,6),['Масса ед., кг','Масса всего, кг']);assert(!JSON.stringify(exported).includes('900000'));assert.equal(exported.at(-1).cells[5],82);
 r.project.entities['station-spec'].items=r.project.entities['station-spec'].items.filter(i=>i.position!=='05'&&i.position!=='06');assert.equal(componentMassData(r).totalMassKg,64);
 r.resources.components.items.push(item('assembly',{'Масса сборки, кг':20}));
 assert.equal(componentMassData(r).rows.find(r=>r.name==='Сборка').totalMassKg,40);
 const empty=componentMassData(null);assert.equal(empty.status,'empty');assert.equal(empty.totalMassKg,null);
});
test('notice node hides only requested notices and preserves original technical facts and price warnings',()=>{
 const tank={...spec('1','Кран DN20','tank-ld-pride-dn20-drain'),assemblyRole:'discharge:tank/tank-valve',technicalStatus:'unverified',technicalNotes:['Точный артикул LD Pride DN20 требует подтверждения; стоимость принята ориентировочно по аналогу.'],description:'Точный артикул требует проверки'},frame={...spec('2','Рама'),option:'frame',technicalStatus:'incomplete',technicalNotes:['Тип и диаметр крепления к основанию не подтверждены; показаны предварительные оси','anchor-front-0: диаметр отверстия не определён']};
 const policy={tankValveArticle:false,frameAnchorDiameters:false},before=structuredClone([tank,frame]);
 assert(nodeSpecificationPresentation(tank).hasWarning);assert(!nodeSpecificationPresentation(tank,policy).hasWarning);assert(!nodeSpecificationPresentation(frame,policy).hasWarning);
 assert(nodeSpecificationPresentation({...frame,technicalNotes:[...frame.technicalNotes,'pump-0: диаметр отверстия не определён']},policy).hasWarning);
 const d={status:'ready',items:[tank,frame],manualRows:[],readiness:{technicalReady:false,findings:[{id:'spec/readiness/item/0',message:'Кран',category:'technical'},{id:'spec/readiness/item/1',message:'Рама',category:'technical'},{id:'spec/readiness/price/0',message:'Нет цены',category:'price'}]}};
 const filtered=applySpecificationNotices(d,policy);assert.equal(filtered.readiness.findings.length,1);assert.equal(filtered.readiness.technicalReady,false);assert.deepEqual([tank,frame],before);
 const step={id:'mass',operation:'spec.masses'},out=executeSpecificationOperation(step,{result:result()},{});assert.equal(out.data.knownMassKg,82);
});
