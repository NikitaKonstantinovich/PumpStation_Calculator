import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3,Euler} from 'three';
import {fixture,choose,sync,resources,load,json} from './fixtures/station-specification.mjs';
import {mount,inputs} from './fixtures/channel-frame.mjs';
const model=await load('model-editor/model');
const {executeFrameOperation,frameNodeTypes,FRAME_STAGES}=await load('node-tools/frame-nodes');
const {cadContents}=await load('cad-export');
const {upgradeChannelFrame}=await load('node-tools/frame-upgrade');
const {applyBaseTariffs,baseSnapshot,initialBaseValues}=await load('base-values');

function prepare({withoutChannelPrices=false,cabinetWidth,cabinetSeparate=false}={}){
 let p=choose(fixture(),'318',3,0);Object.assign(p.entities['station-settings'],{stationType:'utility',membraneTank:false,cabinetSeparate});
 const pumps=resources.pumps.map(p=>p.id==='318'?{...p,type:'end_suction',weightKg:500,mounting:{frameChannelV1:mount}}:p);
 const components={...resources.components,items:withoutChannelPrices?resources.components.items.filter(i=>i.catalogId!=="металл"):resources.components.items,collectorCatalog:applyBaseTariffs(resources.components.collectorCatalog,baseSnapshot('test',initialBaseValues()))};
 p=sync(p,{...resources,pumps,components});
 for(const side of ['suction','discharge'])Object.assign(p.entities['station-collectors'][side].configuration.primary,{spacing:530,spacingStatus:'confirmed'});
 let work={original:p,next:p,resources:{...resources,pumps,components},reasons:[]};
 const channelInputs={...inputs,cabinetSeparate,cabinetEnclosureWidthMm:cabinetWidth,cabinet:{...inputs.cabinet,equipmentId:p.entities['station-spec'].items.find(r=>r.option==='controlCabinet').equipmentId}};
 for(const [operation] of FRAME_STAGES){const step={id:operation,operation,fields:[],values:{},links:[],expressions:{}};work=executeFrameOperation(step,{work,...(operation==='frame.inputs'?{channelInputs}:{})}).value;}
 return {work,p:work.next,pumps,assembly:model.buildAssembly(work.next,pumps,{version:1,profiles:{}})};
}

test('hidden stage chain produces one BOM and matching procedural assembly without affecting original project',()=>{
 const {work,p,assembly}=prepare(),r=work.frameResult,g=r.channel.geometry;
 assert(g);assert.equal(r.variant,null);assert.equal(r.status,'incomplete');assert.equal(r.channel.geometryStatus,'ready');
 assert.equal(p.entities['station-spec'].items.filter(i=>i.option==='frame').length,1);
 assert.equal(p.entities['station-spec'].items.filter(i=>i.assemblyRole?.startsWith('frame/channel/')).length,0);
 const bom=p.entities['station-spec'].items.find(i=>i.option==='frame').frameAssembly.parts;
 assert.equal(bom.filter(p=>p.lengthMm).reduce((sum,p)=>sum+p.quantity,0),g.members.length);
 assert.equal(bom.filter(p=>p.unit==='м').length,2);
 const frame=assembly.components.find(c=>c.id==='frame');assert.deepEqual(frame.channelFrame,g);assert.equal(frame.parameters.height,120);
 const pumps=assembly.components.filter(c=>c.kind==='pump');assert.equal(pumps[1].position[1]-pumps[0].position[1],530);
 const exported=cadContents(assembly,p.entities['station-spec'].items);assert.equal(exported.instances.filter(i=>i.geometry.kind==='channel-member').length,g.members.length);
 assert.equal(r.mass.rows.filter(i=>i.id==='frame/body').length,1);assert(!r.mass.rows.some(i=>i.id.startsWith('frame/channel/')));
 assert.equal(r.mass.dryKg,null);assert(r.mass.missing.length>0);
 const saved=model.normalizeEditor({version:1,assembly});assert.deepEqual(saved.assembly.components.find(c=>c.id==='frame').channelFrame,g);
});
test('manual frame pose and locks survive recalculation',()=>{
 const {p,pumps,assembly}=prepare(),frame=assembly.components.find(c=>c.id==='frame');frame.position[0]+=77;frame.locked=true;
 const updated=model.mergeAssembly(assembly,model.buildAssembly(p,pumps,{version:1,profiles:{}}));
 assert.equal(updated.components.find(c=>c.id==='frame').position[0],77);assert.equal(updated.components.find(c=>c.id==='frame').locked,true);
});

test('frame assembly display preferences survive model and composition refresh without changing calculated geometry',()=>{
 const {p,pumps,assembly}=prepare(),frame=assembly.components.find(c=>c.id==='frame');
 frame.channelFrameAssembly={version:1,hiddenPieceIds:['front'],pieceOpacities:{rear:.4}};
 for(const next of [model.mergeAssembly(assembly,model.buildAssembly(p,pumps,{version:1,profiles:{}})),model.refreshModelAssets(assembly,p,pumps,{version:1,profiles:{}})]){
  const result=next.components.find(c=>c.id==='frame');
  assert.deepEqual(result.channelFrameAssembly,frame.channelFrameAssembly);assert.deepEqual(result.channelFrame,frame.channelFrame);
 }
});

test('swapped cabinet stands, pump and cabinet bolts coincide with native holes, survive saving and export every part once',async()=>{
 const nativeStands=await json('data/frame-stand-models.json'),nativeCabinets=await json('data/frame-cabinet-models.json');
 const world=(c,p)=>new Vector3(...p).applyEuler(new Euler(...c.rotation.map(a=>a*Math.PI/180))).add(new Vector3(...c.position));
 for(const width of [600,800]){
  const {assembly,p,work}=prepare({cabinetWidth:width}),groups=assembly.components.filter(c=>c.frameHardware),frame=assembly.components.find(c=>c.id==='frame');
  assert.equal(groups.length,6);assert.equal(groups.reduce((sum,c)=>sum+c.frameHardware.centers.length,0),20);
  for(const side of ['left','right']){
   const stand=assembly.components.find(c=>c.id===`frame-stand-${side}`),asset=nativeStands.assets[(side==='left'?'right':'left')+(width===800?'1800':'')];
   assert.equal(stand.cadSource.hash,asset.sourceHash);
   const fastener=groups.find(c=>c.id===`frame-hardware-cabinet-stand-${side}`),centers=fastener.frameHardware.centers.map(p=>world(fastener,p));
   for(const p of asset.cabinetPoints)assert(centers.some(q=>q.distanceTo(world(stand,p))<1e-5));
   const bases=groups.find(c=>c.id==='frame-hardware-stand-bases'),feet=bases.frameHardware.centers.map(p=>world(bases,p));
   for(const p of asset.mountingPoints)assert(feet.some(q=>q.distanceTo(world(stand,p))<1e-5));
  }
  const cabinet=assembly.components.find(c=>c.id==='frame-cabinet'),cabinetCenters=groups.filter(c=>c.id.startsWith('frame-hardware-cabinet-')).flatMap(c=>c.frameHardware.centers.map(p=>world(c,p)));
  for(const p of nativeCabinets.assets[width].mountingPoints)assert(cabinetCenters.some(q=>q.distanceTo(world(cabinet,p))<1e-5));
  for(const hole of frame.channelFrame.holes.filter(h=>h.owner.startsWith('pump'))){
   const group=groups.find(c=>c.id===`frame-hardware-${hole.owner}`);
   assert(group.frameMount.parentId.startsWith('pump-'));
   assert(group.frameHardware.centers.some(p=>world(group,p).distanceTo(world(frame,[hole.y,frame.channelFrame.heightMm,-hole.x]))<1e-5));
  }
  const saved=model.normalizeEditor({version:1,assembly});
  assert.deepEqual(saved.assembly.components.filter(c=>c.frameHardware).map(c=>c.frameHardware),groups.map(c=>c.frameHardware));
  const parts=cadContents(assembly,p.entities['station-spec'].items).instances.filter(i=>groups.some(c=>c.id===i.componentId));
  assert.equal(parts.length,80);assert.equal(new Set(parts.map(p=>p.id)).size,80);
  for(const [hardware,count] of [['bolt',20],['nut',20],['washer',40]])assert.equal(parts.filter(p=>p.geometry.hardware===hardware).length,count);
  assert(!parts.some(p=>p.geometry.kind==='unavailable'));
  const hardware=work.frameResult.parts.filter(p=>p.role==='frame-fastener');
  assert(!work.frameResult.parts.find(p=>p.role==='frame').children.some(p=>p.role==='frame-fastener'));
  for(const part of hardware){
   const rows=p.entities['station-spec'].items.filter(r=>r.assemblyRole===part.id);
   assert.equal(rows.length,1);assert.equal(rows[0].quantity,part.quantity);assert.equal(rows[0].price,part.unitPriceRub);assert(!rows[0].frameAssembly);
  }
  assert.equal(hardware.reduce((sum,p)=>sum+p.quantity,0),80);
  assert(!work.frameResult.parts.some(p=>p.id.includes('pump-kit')));
  assert(work.frameResult.channel.hardwareCostRub>0);
 }
 const separate=prepare({cabinetWidth:800,cabinetSeparate:true}).assembly;
 assert.equal(separate.components.filter(c=>c.frameHardware).length,3);
 assert(!separate.components.some(c=>c.id.startsWith('frame-stand-')));
});

test('grouped frame accounts for welding once, preserves unknown steel prices and exports the nested cut list',async()=>{
 const {p,work}=prepare({withoutChannelPrices:true}),row=p.entities['station-spec'].items.find(i=>i.option==='frame');
 const {coreSpecificationLineTotal,coreSpecificationHasPrice}=await load('specification-readiness');
 const {specificationExportRows}=await load('specification-export');
 const parts=row.frameAssembly.parts,welding=parts.find(p=>p.unit==='м');
 assert.equal(coreSpecificationHasPrice(row),false);
 const painting=parts.find(p=>p.name.startsWith('Окраска рамы'));
 const hardware=work.frameResult.channel.hardwareCostRub;
 assert(Math.abs(coreSpecificationLineTotal(row)-(welding.quantity*welding.unitPriceRub+painting.quantity*painting.unitPriceRub))<1e-8);
 assert(Math.abs(coreSpecificationLineTotal(row)-(work.frameResult.channel.welding.costRub+work.frameResult.channel.painting.costRub))<1e-8);
 const hardwareIds=new Set(work.frameResult.parts.filter(p=>p.role==='frame-fastener').map(p=>p.id));
 const hardwareRows=p.entities['station-spec'].items.filter(r=>hardwareIds.has(r.assemblyRole));
 assert(Math.abs(hardwareRows.reduce((sum,r)=>sum+coreSpecificationLineTotal(r),0)-hardware)<1e-8);
 const lengths=parts.filter(p=>p.lengthMm).map(p=>p.lengthMm);assert.equal(new Set(lengths).size,lengths.length);
 const exported=specificationExportRows([row],[{title:'Рама',sections:[{id:'frame'}]}]);
 assert.equal(exported.filter(r=>r.kind==='item').length,1);
 assert.match(exported.find(r=>r.kind==='item').cells[6],/Состав рамы/);
 assert.equal(exported.find(r=>r.kind==='total').cells[5],coreSpecificationLineTotal(row));
});
test('catalogued channel stock and welding form one priced frame row in UI and export',async()=>{
 const {p,work}=prepare(),row=p.entities['station-spec'].items.find(i=>i.option==='frame'),channel=work.frameResult.channel;
 const {coreSpecificationLineTotal,coreSpecificationHasPrice}=await load('specification-readiness');
 const {specificationExportRows}=await load('specification-export');
 assert.equal(channel.material.componentId,'металл-001-r0006');
 const item=resources.components.items.find(i=>i.id===channel.material.componentId);
 const metre=item.prices.find(p=>p.label.endsWith('Цена м, ₽')).amount;
 assert.equal(channel.material.rateRubM,metre);
 for(const cut of row.frameAssembly.parts.filter(p=>p.lengthMm))assert.equal(cut.unitPriceRub,cut.lengthMm/1000*metre);
 const expected=channel.stockLengthMm/1000*metre+channel.welding.costRub+channel.stockLengthMm/1000*1000;
 assert.equal(channel.painting.rateRubM,1000);
 assert.equal(row.frameAssembly.parts.filter(p=>p.name.startsWith('Окраска рамы')).length,1);
 assert(Math.abs(row.price-expected)<1e-8);assert(coreSpecificationHasPrice(row));
 assert.equal(coreSpecificationLineTotal(row),row.price);
 const rows=specificationExportRows([row],[{title:'Рама',sections:[{id:'frame'}]}]);
 assert.equal(rows.filter(r=>r.kind==='item').length,1);
 assert.equal(rows.find(r=>r.kind==='total').cells[5],row.price);
 const body=work.frameResult.parts.find(p=>p.role==='frame');
 const deposits=body.children.filter(p=>['frame-welding','frame-painting'].includes(p.role)).reduce((sum,p)=>sum+p.unitMassKg*p.quantity,0);
 assert(Math.abs(body.unitMassKg-(channel.drilledMassKg+deposits))<1e-8);
 const hardwareIds=new Set(work.frameResult.parts.filter(p=>p.role==='frame-fastener').map(p=>p.id));
 const hardwareRows=p.entities['station-spec'].items.filter(r=>hardwareIds.has(r.assemblyRole));
 const exported=specificationExportRows([row,...hardwareRows],[{title:'Рама',sections:[{id:'frame'}]}]);
 assert.equal(exported.filter(r=>r.kind==='item').length,1+hardwareRows.length);
 assert(Math.abs(exported.find(r=>r.kind==='total').cells[5]-(expected+channel.hardwareCostRub))<1e-8);
});
test('JSONB property order does not turn an automatic frame into manual geometry',()=>{
 const {assembly}=prepare(),prior=structuredClone(assembly),frame=prior.components.find(c=>c.id==='frame');
 frame.parameters=Object.fromEntries(Object.entries(frame.parameters).reverse());
 const fresh=structuredClone(assembly),next=fresh.components.find(c=>c.id==='frame');next.name='Updated automatic frame';
 assert.equal(model.mergeAssembly(prior,fresh).components.find(c=>c.id==='frame').name,next.name);
 frame.parameters.length+=1;
 assert.equal(model.mergeAssembly(prior,fresh).components.find(c=>c.id==='frame').parameters.length,frame.parameters.length);
});
test('explicit existing-tool upgrade is idempotent and retains custom bent rules while hiding the tool',()=>{
 const defs=frameNodeTypes(),input=structuredClone(defs[0]);input.fields=input.fields.filter(f=>f.key!=='channelInputs');
 const doc={product:{root:'root'},types:[input,{id:'tool',instrument:'frame'}],diagrams:[{id:'root',nodes:[{id:'f',type:'tool',values:{},tool:{workspaceVisible:true}}],edges:[]},{id:'frame',nodes:[{id:'inputs',type:input.id,values:{rules:{widthMm:415}}}],edges:[]}]};
 const updated=upgradeChannelFrame(doc,'f');assert.equal(updated.diagrams[0].nodes[0].tool.workspaceVisible,false);assert.equal(updated.diagrams[1].nodes[0].values.rules.widthMm,415);
 assert(updated.types[0].fields.some(f=>f.key==='channelInputs'));assert.deepEqual(upgradeChannelFrame(updated,'f'),updated);assert.equal(doc.diagrams[0].nodes[0].tool.workspaceVisible,true);
});
test('actual channel meshes contain through holes in the specified flange and retain the other flange',async()=>{
 const compiled=await build({stdin:{resolveDir:fileURLToPath(new URL('../',import.meta.url)),contents:'export {channelMemberGeometry} from "./app/model-editor/channel-frame-renderer";'},bundle:true,platform:'node',format:'esm',write:false});
 const {channelMemberGeometry}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const {work}=prepare(),g=work.frameResult.channel.geometry,mat=new MeshBasicMaterial({side:DoubleSide});
 for(const member of g.members){const geometry=channelMemberGeometry(g,member),mesh=new Mesh(geometry,mat);mesh.updateMatrixWorld();assert(geometry.getAttribute('position').count>0);
  for(const h of g.holes.filter(h=>h.memberId===member.id&&h.valid)){
   const top=h.face==='top',y=top?g.heightMm+1:-1,direction=top?-1:1;
   const ray=new Raycaster(new Vector3(h.y,y,-h.x),new Vector3(0,direction,0),0,g.profile.flange+1.5);
   assert.equal(ray.intersectObject(mesh).length,0,h.id);
   ray.far=g.heightMm+2;assert(ray.intersectObject(mesh).length>0,`opposite flange ${h.id}`);
  }geometry.dispose();
 }mat.dispose();
});
test('exact audited catalogue mountings can feed the new branch without copying dimensions from a similar model',async()=>{
 const {reviewedChannelMount}=await load('frame-calculation/channel-mountings'),reviewed=await json('data/horizontal-frame-mounts.json'),row=reviewed.rows.find(r=>r.series==='NIS');
 const pump={id:row.variantId,model:row.designation,manufacturer:row.manufacturer,series:row.series,article:row.article,power:row.motor.power_kw,type:'end_suction'};
 const data=reviewedChannelMount(pump,row.mounting);assert(data);assert.equal(data.target,'factory-base');assert.equal(data.flowOffsetMm,row.mounting.cad.anchorMm[0]);
 assert.equal(reviewedChannelMount({...pump,power:9999},row.mounting),null);
 assert(reviewedChannelMount({...pump,model:row.designation.replace(/SWH$/,''),execution:row.designation},row.mounting));
 assert.equal(reviewedChannelMount({...pump,execution:row.designation+'-other'},row.mounting),null);
});
