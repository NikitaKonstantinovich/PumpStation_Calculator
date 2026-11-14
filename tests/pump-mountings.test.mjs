import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {catalogMounting} from '../services/local-storage/node-mountings.mjs';
import {loadTs} from './load-ts.mjs';
const manifest=JSON.parse(await readFile(new URL('../data/pump-mountings-reviewed.json',import.meta.url),'utf8'));
const fasteners=JSON.parse(await readFile(new URL('../data/pump-fasteners-reviewed.json',import.meta.url),'utf8'));
const tanks=JSON.parse(await readFile(new URL('../data/tank-frame-mountings.json',import.meta.url),'utf8'));
const args=r=>({variant:{id:r.variantId,designation:r.designation,manufacturer_article:r.article},model:{id:r.modelId},motor:r.motor,manufacturer:r.manufacturer,series:r.series});
const {tankFrameMounting}=await loadTs(new URL('../app/frame-calculation/tank-mountings.ts',import.meta.url));
const {layoutFrame}=await loadTs(new URL('../app/frame-calculation/layout.ts',import.meta.url));
const {DEFAULT_FRAME_RULES}=await loadTs(new URL('../app/frame-calculation/types.ts',import.meta.url));
const {readMounting,beginFrame,finishFrame}=await loadTs(new URL('../app/frame-calculation/project.ts',import.meta.url));
const {standHardware}=await loadTs(new URL('../app/frame-calculation/hardware.ts',import.meta.url));
const {executeFrameOperation}=await loadTs(new URL('../app/node-tools/frame-nodes.ts',import.meta.url));
const {createProject}=await loadTs(new URL('../app/project-config.ts',import.meta.url));
const {bindFramePart,componentMass,pumpFasteners}=await loadTs(new URL('../app/frame-calculation/components.ts',import.meta.url));
const frameHardware=JSON.parse(await readFile(new URL('../data/frame-fasteners-import.json',import.meta.url),'utf8')).items;

test('catalogue mass headers preserve units and do not approve reference CAD or actuator masses',()=>{
 const item=fields=>({fields:Object.entries(fields).map(([key,value])=>({column:key,headerPath:[key],value}))});
 const pipe=item({'Вес 1 кг/метр':4.602});
 assert.equal(componentMass(pipe,'м'),4.602);assert.equal(componentMass(pipe,'м.п.'),4.602);
 assert.equal(componentMass(pipe,'шт.'),null);
 const fitting=item({'Вес, кг':0.14});assert.equal(componentMass(fitting),0.14);assert.equal(componentMass(fitting,'м'),null);
 assert.equal(componentMass(item({'Справочная масса CAD, кг':12,'Вес с рукояткой, кг':2,'Вес с редуктором, кг':5})),null);
});

test('frame washers bind by nominal catalogue thread, rejecting ambiguity and contradictory names',()=>{
 const part={id:'washer',name:'Шайба М8',quantity:12};
 const item={id:'din125-8',family:'Метизы',fields:[{column:'C',headerPath:['Наименование'],value:'Шайба плоская 8 DIN125 Ц 8,8'},{column:'E',headerPath:['Диаметр резьбы, мм'],value:8},{column:'F',headerPath:['Масса, кг'],value:0.002}],prices:[{currency:'RUB',amount:4,label:'Цена, ₽/шт'}]};
 assert.equal(bindFramePart(part,[item]).componentId,'din125-8');
 assert.equal(bindFramePart(part,[item]).unitMassKg,0.002);
 assert.equal(bindFramePart(part,[item,{...item,id:'second'}]).componentId,undefined);
 assert.equal(bindFramePart({...part,name:'Шайба М10'},[item]).componentId,undefined);
 assert.equal(bindFramePart(part,[{...item,fields:[{...item.fields[0],value:'Шайба М10'},...item.fields.slice(1)]}]).componentId,undefined);
});

test('selected cabinet width overrides saved node values; missing or unsupported sizes use the agreed 600 mm fallback',()=>{
 for(const id of ['BP-2-2,2','BP-2-3,7','SMART-other',undefined]){
  const project=createProject('Cabinet width fixture');
  project.entities['station-settings'].membraneTank=false;
  project.entities['station-spec'].items=id?[{position:'03',option:'controlCabinet',name:id,equipmentId:id,quantity:1,unit:'шт.',details:'',status:'selected',price:null}]:[];
  const work={original:project,next:project,resources:{components:{items:id?[{id,fields:[{column:'widthMm',headerPath:['widthMm'],value:800}],prices:[]}]:[]}},reasons:[]};
  const before=JSON.stringify(work);
  assert.equal(beginFrame(work).cabinetWidth,id?800:600);
  for(const cabinetWidthMm of [undefined,600,800,1000]){
   const state=executeFrameOperation({operation:'frame.inputs'},{work,cabinetWidthMm}).value;
   assert.equal(state.cabinetWidth,id?800:cabinetWidthMm===800?800:600);
   assert.equal(JSON.stringify(work),before);
  }
 }
 const project=createProject('Smart cabinet width fixture');project.entities['station-settings'].membraneTank=false;
 project.entities['station-spec'].items=[{position:'03',option:'controlCabinet',equipmentId:'smart',name:'Smart',quantity:1,unit:'шт.',details:'',price:null}];
 for(const [dimensions,width] of [['600х800х250',600],['800×1000×300',800],['400х400х200',600],['',600],[undefined,600]]){
  const work={original:project,next:project,resources:{smartCabinets:[{id:'smart',enclosureDimensions:dimensions}]},reasons:[]};
  assert.equal(beginFrame(work).cabinetWidth,width);
 }
});

test('saved v1 frame nodes adopt the 20 mm second-stand gap without changing the archived input',()=>{
 const project=createProject('Saved frame rules');project.entities['station-settings'].membraneTank=false;
 const work={original:project,next:project,resources:{},reasons:[]};
 const rules={...DEFAULT_FRAME_RULES,version:'bent-frame-2026-11-10-v1',minStandGap:50,tankBodyGapMm:60};
 const before=JSON.stringify({work,rules});
 const state=executeFrameOperation({operation:'frame.inputs'},{work,rules}).value;
 assert.equal(state.result.rules.minStandGap,20);
 assert.equal(state.result.rules.firstPumpGap,55);
 assert.equal(state.result.rules.tankBodyGapMm,60);
 assert.equal(state.result.rules.version,DEFAULT_FRAME_RULES.version);
 assert.equal(JSON.stringify({work,rules}),before);
 assert.equal(executeFrameOperation({operation:'frame.inputs'},{work,rules:{...rules,minStandGap:30}}).value.result.rules.minStandGap,30);
});

test('specified stand hardware stays selected when pump fasteners are unknown; prices and overall incompleteness remain honest',()=>{
 const project=createProject('Hardware status');project.entities['station-settings'].membraneTank=false;
 const state=beginFrame({original:project,next:project,resources:{},reasons:[]});
 state.result.parts=[...standHardware(true,600),{id:'frame/pump-1-bolts',role:'pump-bolts',name:'Крепление насоса: болты — уточнить',quantity:8,unitMassKg:null,unitPriceRub:null}];
 state.result.issues=[{code:'pump-fasteners',message:'Насос: неизвестна толщина лапы',blocking:true}];
 const result=finishFrame(state),rows=result.next.entities['station-spec'].items.filter(r=>r.assemblyRole?.startsWith('frame/'));
 for(const row of rows.filter(r=>r.assemblyRole!=='frame/pump-1-bolts')){
  assert.equal(row.status,'selected');assert.equal(row.technicalStatus,'ready');assert.deepEqual(row.technicalNotes,[]);assert.equal(row.price,null);assert(!row.details.includes('Подтвердите'));
 }
 assert.equal(rows.find(r=>r.assemblyRole==='frame/pump-1-bolts').status,'clarify');
 assert.equal(result.frameResult.status,'incomplete');
});

test('every audited execution is unique; supplements retain source provenance and do not fill missing geometry',()=>{
 assert.equal(manifest.rows.length,4577);assert.equal(new Set(manifest.rows.map(r=>r.variantId)).size,4577);
 assert.equal(fasteners.rows.length,4577);assert.equal(new Set(fasteners.rows.map(r=>r.variantId)).size,4577);
 const supplements=new Map(fasteners.rows.map(r=>[r.variantId,r]));
 for(const r of manifest.rows){
  const loaded=catalogMounting(args(r));assert(loaded);
  const supplement=supplements.get(r.variantId);assert(supplement);
  if(loaded.frameV1?.cad){
   assert.equal(loaded.frameAssessment.evidence.kind,'horizontal_step_mount');
   assert(readMounting(loaded.frameV1));
  }else if(r.status==='catalogue_grid'||supplement.mounting){
   assert(loaded.frameV1);assert(readMounting(loaded.frameV1));
   if(loaded.frameV1.boltDiameterMm){assert(supplement.evidence.sha256);assert(loaded.frameV1.fastenerSource);assert.equal(loaded.frameV1.boltDiameterMm,supplement.fasteners.boltDiameterMm);}
  }else assert.equal(loaded.frameV1,undefined);
  if(supplement.status==='missing')assert.equal(loaded.fastenersV1?.boltDiameterMm??null,null);
 }
});

test('supplement identity, content isolation and STEP-before-catalogue provenance',()=>{
 const row=manifest.rows.find(r=>r.designation==='MV 1-3'),a=args(row);
 const result=catalogMounting(a);assert.equal(result.frameAssessment.evidence.kind,'step');
 assert.equal(result.frameV1.footThicknessMm,7);assert.equal(result.frameV1.clampHeightMm,38);
 result.frameV1.holes[0].x=999;assert.notEqual(catalogMounting(a).frameV1.holes[0].x,999);
 const bad=new Map([[row.variantId,{...fasteners.rows.find(r=>r.variantId===row.variantId),article:'WRONG'}]]);
 assert.equal(catalogMounting(a,undefined,bad).frameV1,undefined);
 assert.equal(catalogMounting(a,undefined,bad).fastenersV1,undefined);
});
test('CDM20 drawing preserves the 215×130 grid without treating flange bores as foot bores',()=>{
 const r=manifest.rows.find(r=>r.variantId==='CNP:CDM:1100092334'),a=args(r),drawing=catalogMounting(a,undefined,new Map()),m=drawing.frameV1;
 assert.deepEqual([...new Set(m.holes.map(h=>h.x))],[-107.5,107.5]);
 assert.deepEqual([...new Set(m.holes.map(h=>h.y))],[-65,65]);
 assert(m.holes.every(h=>h.diameterMm===null));assert.equal(m.footThicknessMm,null);
 assert.equal(drawing.fastenersV1,undefined);
 assert(readMounting(m));
 for(const altered of [{...a,variant:{...a.variant,manufacturer_article:'different'}},{...a,motor:{...a.motor,power_kw:3}},{...a,model:{id:'different'}},{...a,variant:{...a.variant,designation:'CDM20-2YSWPC'}}])assert.equal(catalogMounting(altered),undefined);
});
test('reviewed heights are exposed without approving unverified layouts or STEP-only fastening',()=>{
 const read=id=>catalogMounting(args(manifest.rows.find(r=>r.variantId===id)));
 const measured=read('WELLMIX:TD:12049905');
 assert.equal(measured.fastenersV1.clampHeightMm,40);
 assert.equal(measured.fastenersV1.holeDiameterMm,null);
 assert.equal(measured.frameV1,undefined);
 const reference=read('ES:variant:9e173f1474661c0fddc07ea9');
 assert.equal(reference.frameAssessment.evidence.scope,'3d_layout_only');
 assert.equal(reference.frameAssessment.evidence.referenceDimensionsMm.clampHeightMm,20);
 assert.equal(reference.fastenersV1.clampHeightMm,null);
 assert.equal(reference.frameV1,undefined);
});
test('CNP TD optional plates use the exact model and do not supply pump fastening dimensions',()=>{
 const examples=[
  ['CNP:TD:part:11203','TD32-18G/2','A',195,14],
  ['CNP:TD:part:21615','TD100-35G/2','B',290,19],
 ];
 for(const [id,designation,type,pitch,diameter] of examples){
  const input=args(manifest.rows.find(r=>r.variantId===id));
  input.model.designation=designation;
  const mounting=catalogMounting(input);
  const plate=mounting.optionalFoundationPlate;
  assert.equal(plate.type,type);
  assert.equal(plate.includedAsStandard,false);
  assert.equal(plate.thicknessMm,35);
  assert.deepEqual(plate.anchorHoles,{count:4,diameterMm:diameter,pitchXMm:pitch,pitchYMm:pitch});
  assert.equal(plate.source.page,70);
  assert.equal(mounting.frameV1,undefined);
  assert.equal(mounting.fastenersV1,undefined);
  plate.anchorHoles.pitchXMm=0;
  assert.equal(catalogMounting(input).optionalFoundationPlate.anchorHoles.pitchXMm,pitch);
  const otherModel={...input,model:{...input.model,designation:`${designation}-other`}};
  assert.equal(catalogMounting(otherModel).optionalFoundationPlate,undefined);
 }
});
test('EVR has verified foot thickness and catalogue-only CDM5 and CDM3 grids have no foot bore',()=>{
 const evr=manifest.rows.find(r=>r.variantId==='AQUASTRONG:EVR:EVR20-2');assert.equal(catalogMounting(args(evr)).frameV1.footThicknessMm,20);
 for(const prefix of ['CDM5-','CDM3-']){
  const row=manifest.rows.find(r=>r.designation.startsWith(prefix)&&r.mounting);assert(row);assert(row.mounting.holes.every(h=>h.diameterMm===null));
 }
});
test('the accepted CDM15-6 STEP resolves all eight fasteners with the heads recessed',()=>{
 const row=manifest.rows.find(r=>r.variantId==='CNP:CDM:1100092321');
 const mounting=readMounting(catalogMounting(args(row)).frameV1);
 assert(mounting.holes.every(h=>h.diameterMm===14));
 assert.deepEqual([...new Set(mounting.holes.map(h=>h.y))],[-85,45]);
 assert.equal(mounting.clampHeightMm,35);
 assert.deepEqual(mounting.rivetHeadPocket,{diameterMm:23,depthMm:2});
 const selected=pumpFasteners(mounting,5,8,'pump-1',frameHardware);
 assert.equal(selected.issue,undefined);
 assert.match(selected.parts[0].name,/^Болт М12×60\b/);
 assert.deepEqual(selected.parts.map(p=>p.quantity),[8,8]);
 assert.equal(selected.parts[0].fastening.supportLift,0);
 assert.equal(selected.parts[0].fastening.hole,16);
 const epp=fasteners.rows.find(r=>r.variantId==='AQUASTRONG:EPP:selector:15353');
 assert.equal(catalogMounting(args(epp)).fastenersV1.clampHeightMm,35);
});
test('WAV mounting requires exact equipment; explicit catalogue rejection wins; returned data is isolated',()=>{
 const row=tanks.rows.find(r=>r.volumeL===50),item={id:row.equipmentId,fields:[{column:'B',headerPath:['Наименование'],value:row.name}]};
 const m=tankFrameMounting(item,50);assert.equal(m.holes.length,3);
 assert.equal(tankFrameMounting({...item,id:'other'},50),undefined);
 assert.equal(tankFrameMounting(item,80),undefined);
 assert.equal(tankFrameMounting({...item,fields:[...item.fields,{column:'FRAME_MOUNTING',headerPath:['FRAME_MOUNTING'],value:false}]},50),false);
 m.holes[0].x=9999;assert.notEqual(tankFrameMounting(item,50).holes[0].x,9999);
});
test('real CDM20-2 with two pumps and WAV50 produces a standard frame; WAV100 cannot silently drill outside it',()=>{
 const m=manifest.rows.find(r=>r.variantId==='CNP:CDM:1100092334').mounting;
 const pumps=[{id:'cdm20',name:'CDM20-2',count:2,circuit:1,massKg:48,spacingMm:450,mounting:m}];
 const tank=volume=>({id:'wav',volumeL:volume,dryMassKg:9.2,mounting:tanks.rows.find(r=>r.volumeL===volume).mounting});
 const layout=layoutFrame(pumps,600,tank(50),DEFAULT_FRAME_RULES);
 assert.equal(layout.issues.length,0);assert(layout.lengthMm>=600&&layout.lengthMm<=2000);
 assert.equal(layout.holes.filter(h=>h.owner==='tank').length,3);
 assert(layoutFrame(pumps,600,tank(100),DEFAULT_FRAME_RULES).issues.some(i=>i.code==='tank-width'));
});
