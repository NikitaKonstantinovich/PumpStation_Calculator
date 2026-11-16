import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const load=p=>loadTs(new URL('../app/'+p+'.ts',import.meta.url));
const {stationProjectName,pumpNameDesignation}=await load('station-project-name');
const {validRequestNumber}=await load('request-number');
const {accepts,makeField}=await load('engineering/schema');
const {initialTools}=await load('node-tools/factory');
const {upgradeDocument}=await load('node-tools/product');
const {compileTools}=await load('node-tools/compiler');
const {evaluateProduct}=await load('node-tools/runtime');
const {addRequestNumberSetting}=await load('node-tools/request-number-upgrade');
const {workspaceStationName}=await load('node-tools/project-name');
const main={series:'CDM',model:'CDM32-2'},second={series:'CHLF(T)',model:'CHLF(T)10-30'};
const settings={stationType:'utility',main:{workingPumpCount:2,reservePumpCount:1},secondary:{workingPumpCount:1,reservePumpCount:1}};

test('all four station names, working plus reserve, jockey excluded and combined contours separated',()=>{
  for(const [type,text] of Object.entries({utility:'повышения давления WENARD PS 3 CDM 32-2',smart:'повышения давления WENARD PS SMART 3 CDM 32-2',fire:'пожаротушения WENARD FS 3 CDM 32-2',combined:'совмещенная WENARD FS 3/2 CDM 32-2/CHLF(T) 10-30'}))
    assert.equal(stationProjectName({...settings,stationType:type,jockeyPump:true},main,second),'Насосная установка '+text);
  assert.equal(pumpNameDesignation({series:'NIS',model:'NIS 80/50/250'}),'NIS 80/50/250');
  assert.equal(pumpNameDesignation({series:'CRV',model:'CRV 1-10C A-D-E-HQQE-E'}),'CRV 1-10');
});
test('five equipment options add one opt, request number stays a string and is independent of options',()=>{
  const base={...settings,stationType:'fire',requestNumber:'001-0023-0'};
  const title='Насосная установка пожаротушения WENARD FS 3 CDM 32-2';
  assert.equal(stationProjectName(base,main),title+' - 001-0023-0');
  const flags=['membraneTank','cabinetSeparate','vibrationCompensators','collectorPlugs','isolatingValves'];
  for(const flag of flags)assert.equal(stationProjectName({...base,[flag]:true},main),title+' - opt - 001-0023-0');
  assert.equal(stationProjectName({...base,...Object.fromEntries(flags.map(f=>[f,true])),requestNumber:''},main),title+' - opt');
  assert.equal(stationProjectName({...settings,main:undefined}), 'Насосная установка повышения давления WENARD PS');
});
test('request number rejects letters, whitespace, doubled and trailing hyphens without losing zeroes',()=>{
  const f=makeField('requestNumber','Номер запроса','string','requestNumber');
  for(const value of ['', '0', '0123', '123-1234-1'])assert(validRequestNumber(value)&&accepts(f,value));
  for(const value of [123,'A-123',' 123','123 ','12--3','-12','12-','12/3','12\n'])assert(!validRequestNumber(value)&&!accepts(f,value));
});
test('new settings expose request input; explicit upgrade of an old graph is idempotent and preserves its source',()=>{
  const doc=upgradeDocument(initialTools()),graph=doc.diagrams.find(g=>g.id==='tool.settings');
  assert(graph);
  graph.nodes=graph.nodes.filter(n=>n.id!=='requestNumber'&&n.id!=='field_requestNumber');
  graph.edges=graph.edges.filter(e=>e.from!=='requestNumber'&&e.from!=='field_requestNumber'&&e.to!=='requestNumber'&&e.to!=='field_requestNumber');
  doc.types=doc.types.filter(t=>t.parameter?.key!=='requestNumber');
  const record=doc.types.find(t=>t.id===graph.nodes.find(n=>n.id==='settings').type);
  record.fields=record.fields.filter(f=>f.key!=='requestNumber');
  for(const f of record.fields)if(f.shape)f.shape=f.shape.filter(v=>v.key!=='requestNumber');
  const before=structuredClone(doc),next=addRequestNumberSetting(doc,'settings');
  assert.deepEqual(doc,before);assert.deepEqual(addRequestNumberSetting(next,'settings'),next);
  const program=compileTools(next,'names');
  const result=evaluateProduct(program,'settings',{settings:{values:{requestNumber:'001-02'},defaults:{},role:'admin'}});
  assert.equal(result.value.requestNumber,'001-02');
  const binding=result.bindings.find(b=>b.key==='requestNumber');assert.equal(binding.permission,'input');assert(binding.editable);
  const all=v=>[v,...(v.children??[]).flatMap(all)];
  assert.equal(all(result.view).find(v=>v.kind==='section'&&v.label==='Исполнение установки').children[0].binding.key,'requestNumber');
});
test('name resolution respects product and source pins, waits for catalog and evaluates only settings',()=>{
  const program=compileTools(upgradeDocument(initialTools()),'names');program.algorithmId='pump-station';
  for(const [id,contour] of [['selection','main'],['secondary','secondary']]){
    program.tools.push({id});program.plans[id]={steps:[{id:id+'/request',operation:'pump.request',values:{contour}},{id:id+'/selected',parameter:{key:'selected',field:{meaning:'pumpSelectionProof'}}}]};
  }
  const data={product:{sourceVersions:{pump_catalog_v2:'pinned'}},tools:{selection:{values:{selected:{variantId:'main',snapshotId:'pinned'}}},secondary:{values:{selected:{variantId:'second',snapshotId:'pinned'}}}}};
  const evaluate=id=>{assert.equal(id,'settings');return{value:{...settings,stationType:'combined',requestNumber:'12-3'}};};
  assert.deepEqual(workspaceStationName(program,data,{},evaluate),{needsCatalog:true});
  const resources={pump_catalog_v2:{id:'pinned',items:[{variantId:'main',pump:main},{variantId:'second',pump:second}]}};
  assert.equal(workspaceStationName(program,data,resources,evaluate).name,'Насосная установка совмещенная WENARD FS 3/2 CDM 32-2/CHLF(T) 10-30 - 12-3');
  program.algorithmId='unrelated';assert.deepEqual(workspaceStationName(program,data,resources,()=>{throw Error('must not evaluate');}),{needsCatalog:false});
});
