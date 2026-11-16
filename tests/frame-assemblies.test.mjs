import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {fixture,choose,sync,resources,load,json} from './fixtures/station-specification.mjs';
import {loadTs} from './load-ts.mjs';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

const model=await load('model-editor/model');
const calc=await load('frame-calculation/project');
const {DEFAULT_FRAME_RULES:rules}=await load('frame-calculation/types');
const {layoutFrame}=await load('frame-calculation/layout');
const assets=await json('data/frame-stand-models.json');
const cabinets=await json('data/frame-cabinet-models.json');
const catalog=await json('data/frame-catalog-import.json'),hardware=await json('data/frame-fasteners-import.json');
const profiles={version:1,profiles:{}};
const mounting={verified:true,source:'reviewed test fixture',holes:[[-50,-100],[-50,100],[50,-100],[50,100]].map(([x,y],i)=>({id:String(i),owner:'pump',x,y,diameterMm:11})),bounds:{minX:-60,maxX:60,minY:-120,maxY:120},footThicknessMm:8,boltDiameterMm:10};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-4,`${a} != ${b}`);
const vec=(a,b)=>a.forEach((v,i)=>close(v,b[i]));
const stands=a=>a.components.filter(c=>c.frameMount?.role.startsWith('stand-'));
function prepare({width=600,spacing=500,count=2,reserve=0,mount=mounting,volume=0,weightKg=30,power=7.5,stationType='utility',jockeyPump=false}={}){
 let p=choose(fixture(),'318',count,reserve);
 Object.assign(p.entities['station-settings'],{stationType,jockeyPump,membraneTank:volume>0,membraneTankVolume:volume||8});
 if(jockeyPump)choose(p,'217',1,0,true);
 const pumps=resources.pumps.map(p=>{
  if(p.id==='318')return {...p,power,weightKg,mounting:{frameV1:mount}};
  if(jockeyPump&&p.id==='217')return {...p,weightKg:20,mounting:{frameV1:mounting}};
  return p;
 });
 p=sync(p,{...resources,pumps});
 for(const side of ['suction','discharge']){
  const configuration=p.entities['station-collectors'][side].configuration;
  configuration.primary.spacing=spacing;
  if(configuration.secondary)configuration.secondary.spacing=spacing;
 }
 const cabinet=p.entities['station-spec'].items.find(r=>r.option==='controlCabinet');
 const items=[...resources.components.items,...catalog.items,...hardware.items];
 if(width!==null){
  cabinet.equipmentId??='fixture-control-cabinet';
  items.push({id:cabinet.equipmentId,fields:[{column:'widthMm',headerPath:['widthMm'],value:width}],prices:[]});
 }
 const components={...resources.components,items};
 const state=calc.beginFrame({original:p,next:p,resources:{...resources,pumps,components},reasons:[]});
 calc.selectFrameConstruction(state);calc.placeFrame(state);calc.selectFrameVariant(state);calc.frameParts(state);
 p=calc.finishFrame(state).next;
 return {p,pumps,result:state.result,a:model.buildAssembly(p,pumps,profiles)};
}

test('cabinet CAD keeps the chosen electrical SKU, mounting pose and native enclosure across station types',async()=>{
 const {cadContents,cadTransform}=await load('cad-export');
 const scenarios=[
  {stationType:'utility',count:1,reserve:1,weightKg:49.9,width:800,expectedWidth:800,sku:'BP-2-5,5',thickness:4},
  {stationType:'fire',count:2,weightKg:50,width:null,expectedWidth:600,sku:'FP-2-5,5',thickness:5},
  {stationType:'fire',count:2,jockeyPump:true,weightKg:75,width:800,expectedWidth:800,sku:'FPJ-2-5,5',thickness:5},
  {stationType:'smart',count:2,reserve:1,weightKg:35,width:null,expectedWidth:600,sku:'SMART-3-4,1-5,5',thickness:4},
 ];
 for(const scenario of scenarios){
  const {p,a,result}=prepare({...scenario,power:5.5,spacing:300});
  assert.equal(result.variant.thicknessMm,scenario.thickness,scenario.sku);
  const spec=p.entities['station-spec'].items;
  const selected=spec.find(r=>r.option==='controlCabinet');
  assert.equal(selected.equipmentId,scenario.sku);
  const asset=cabinets.assets[scenario.expectedWidth];
  const cabinet=a.components.find(c=>c.frameMount?.role==='cabinet');
  assert.equal(cabinet.meshUrl,asset.meshUrl);
  const saved=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:a}))).assembly;
  const exported=cadContents(saved,spec,scenario.stationType).instances.filter(c=>c.equipmentId===scenario.sku);
  assert.equal(exported.length,1);
  assert.equal(exported[0].specPosition,selected.position);
  assert.deepEqual(exported[0].geometry,{kind:'native',hash:asset.sourceHash,source:asset.source});
  assert.deepEqual(exported[0].transform,cadTransform(cabinet));
 }
});

test('selected cabinet span, stand pair and profile lengths agree from calculation through specification to native 3D',()=>{
 for(const args of [{width:600,spacing:500},{width:800,spacing:700},{width:600,count:1,spacing:300},{width:800,count:1,spacing:300}]){
  const {p,a,result}=prepare(args),l=result.layout,rows=p.entities['station-spec'].items;
  assert.equal(l.stands.length,2);assert.equal(stands(a).length,2);
  assert.equal(l.profiles,args.count===1&&args.width===800);
  const pair=args.width===800?[assets.assets.left1800,assets.assets.right1800]:[assets.assets.left,assets.assets.right];
  assert.equal(rows.find(r=>r.assemblyRole==='frame/stand-left').equipmentId,pair[0].componentId);
  assert.equal(rows.find(r=>r.assemblyRole==='frame/stand-right').equipmentId,pair[1].componentId);
  for(const [i,c] of stands(a).entries()){
   assert.equal(rows.find(r=>r.equipmentId===c.equipmentId).quantity,1);
   assert.equal(a.components.filter(n=>n.equipmentId===c.equipmentId).length,1);
   assert.deepEqual(c.rotation,[90,0,0]);assert.equal(c.meshUrl,pair[i].meshUrl);
   const actual=c.ports.filter(p=>p.id.startsWith('base-')).map(port=>model.portPoint(a,{componentId:c.id,portId:port.id})).sort((a,b)=>a[0]-b[0]);
   const holes=l.holes.filter(h=>h.owner===l.stands[i].id).sort((a,b)=>a.y-b.y);
   actual.forEach((v,j)=>vec(v,[holes[j].y,holes[j].x,51.5]));
   const b=model.componentBounds(a,c);close(b[2],51.5);close(b[4]-b[1],40);
   assert(b[0]>=-205-1e-4&&b[3]<=205+1e-4);assert(b[1]>=-1e-4&&b[4]<=l.lengthMm+1e-4);
  }
  const profile=rows.find(r=>r.assemblyRole==='frame/profile');
  if(l.profiles){assert.equal(profile.quantity,2);assert.match(profile.name,new RegExp(`L=${args.width}`));assert.equal(profile.equipmentId,`frame-hardware-profile-${args.width}`);}
  else assert.equal(profile,undefined);
  assert.equal(rows.find(r=>r.assemblyRole==='frame/washer-m8').quantity,l.profiles?12:8);
  for(const [i,c] of a.components.filter(c=>c.kind==='pump').entries())close(c.position[1],l.pumps[i].x);
 }
});

test('stand native STL hashes, millimetre bounds and mounting ports retain CAD geometry without rescaling',async()=>{
 for(const asset of Object.values(assets.assets)){
  const bytes=await readFile(new URL('../public'+asset.meshUrl,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.meshHash);
  const geometry=new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));geometry.computeBoundingBox();
  vec([...geometry.boundingBox.min.toArray(),...geometry.boundingBox.max.toArray()],asset.bounds);
  assert(geometry.attributes.position.count>300);assert.equal(asset.mountingPoints[1][0]-asset.mountingPoints[0][0],350);
  if(process.env.PSC_CAD_ROOT_URL){const cad=await readFile(new URL(asset.source,process.env.PSC_CAD_ROOT_URL));assert.equal(createHash('sha256').update(cad).digest('hex'),asset.sourceHash);}
  geometry.dispose();
 }
});

test('frame motion, manual stand correction, history and saved assembly retain attached poses and flags',()=>{
 const {a,p,pumps}=prepare();const left=stands(a)[0];
 const edited=model.editComponent(a,{id:left.id,patch:{position:model.add(left.position,[7,0,0]),hidden:true,opacity:.4}});
 const moved=model.editComponent(edited,{id:'frame',patch:{position:[80,90,100],rotation:[60,25,40]}});
 const frame=moved.components.find(c=>c.id==='frame'),child=moved.components.find(c=>c.id===left.id);
 vec(child.position,model.add(frame.position,model.rotate(child.frameMount.position,frame.rotation)));
 assert.equal(child.frameMount.manual,true);
 const history=model.execute(model.createHistory(a),moved);assert.deepEqual(model.undo(history).present,a);assert.deepEqual(model.redo(model.undo(history)).present,moved);
 const saved=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:moved}))).assembly;
 for(const next of [saved,model.mergeAssembly(saved,a),model.refreshModelAssets(saved,p,pumps,profiles)]){
  const n=next.components.find(c=>c.id===left.id);vec(n.position,child.position);assert(n.hidden);assert.equal(n.opacity,.4);assert.equal(stands(next).length,2);
 }
 const legacy=structuredClone(saved);legacy.components.find(c=>c.id===left.id).frameMount.revision='frame-stands-1500-v1';
 for(const next of [model.mergeAssembly(legacy,a),model.refreshModelAssets(legacy,p,pumps,profiles)])vec(next.components.find(c=>c.id===left.id).position,child.position);
});

test('composition update changes automatic stand rows, removes old stand copies and preserves unrelated manual equipment',()=>{
 const before=prepare(),after=prepare({width:800,spacing:700}),legacy=structuredClone(before.a),old=stands(legacy)[0];
 legacy.components.push({...old,id:'spec-old-equipment:'+old.equipmentId,frameMount:undefined});
 legacy.components.push({...old,id:'manual-custom',sourceKey:'manual',frameMount:undefined});
 for(const a of [model.mergeAssembly(legacy,after.a),model.refreshModelAssets(legacy,after.p,after.pumps,profiles)]){
  assert.equal(a.components.filter(c=>c.id.startsWith('spec-')&&c.equipmentId===old.equipmentId).length,0);
  assert(a.components.some(c=>c.id==='manual-custom'));assert.equal(stands(a).length,2);
 }
 const updated=model.mergeAssembly(before.a,after.a);
 vec(stands(updated)[1].position,stands(after.a)[1].position);
 const noStands=structuredClone(after.p);noStands.entities['station-spec'].frameCalculation.layout.stands=[];
 assert.equal(stands(model.mergeAssembly(updated,model.buildAssembly(noStands,after.pumps,profiles))).length,0);
});

test('40 mm foot conflict stays visible in specification and prevents overlapping stand models; custom/manual frames are preserved',()=>{
 const wide={...mounting,holes:mounting.holes.map(h=>({...h,x:Math.sign(h.x)*200})),bounds:{...mounting.bounds,minX:-210,maxX:210}};
 const {p,a,result,pumps}=prepare({mount:wide,spacing:459});
 assert(result.issues.some(i=>i.code==='stand-placement'));assert.equal(stands(a).length,0);
 for(const role of ['frame/body','frame/stand-left','frame/stand-right']){
  const row=p.entities['station-spec'].items.find(r=>r.assemblyRole===role);assert.equal(row.technicalStatus,'incomplete');assert.match(row.details,/лапой 40 мм/);
 }
 const other=prepare();other.p.entities['station-spec'].items.find(r=>r.assemblyRole==='frame/stand-left').equipmentId='custom-stand';
 assert.equal(stands(model.buildAssembly(other.p,other.pumps,profiles)).length,1,'custom CAD is not replaced by the standard stand');
 p.entities['station-spec'].frameCalculation.issues.push({code:'manual-frame',message:'manual',blocking:true});
 const manual=model.buildAssembly(p,pumps,profiles);assert.equal(stands(manual).length,0);assert.equal(manual.components.find(c=>c.kind==='pump').position[1],0);
});

test('moving the station shifts pumps, tank and all their mounting holes together',()=>{
 const tank={id:'tank',volumeL:50,dryMassKg:10,mounting:{...mounting,bounds:{minX:-100,maxX:100,minY:-100,maxY:100},holes:[[-60,0],[40,-60],[40,60]].map(([x,y],i)=>({id:String(i),owner:'tank',x,y,diameterMm:11}))}};
 const pump={id:'p',name:'P',count:2,massKg:30,spacingMm:500,mounting,circuit:1};
 for(const width of [600,800]){
  const l=layoutFrame([pump],width,tank,rules);assert.equal(l.issues.length,0);
  assert(l.stationOffsetMm!==0);close(l.pumps[1].x-l.pumps[0].x,500);
  for(const placement of [...l.pumps,l.tank]){
   const source=placement.kind==='tank'?tank.mounting:mounting;
   l.holes.filter(h=>h.owner===placement.id).forEach((h,i)=>{close(h.x-placement.x,source.holes[i].x);close(h.y,source.holes[i].y);});
   close(placement.bounds.minX-placement.x,source.bounds.minX);
  }
 }
});

test('3D station offset propagates to both collectors, tank and automatic pipes while frame and stands keep their anchors',async()=>{
 const {p,pumps,result}=prepare({volume:50});const offset=result.layout.stationOffsetMm;
 assert(result.layout.tank);assert(Number.isFinite(offset)&&Math.abs(offset)>0,JSON.stringify(result.layout));
 const {calculateCollector}=await load('collector-calculations'),{makeInsertCatalog}=await load('component-insert-catalog'),{lineGeometry}=await load('line-geometry-catalog'),{lineGeometryIds}=await load('model-editor/specification-models');
 const source=await json('public/component-insert-source.json'),catalog=makeInsertCatalog(source);
 const {insertionGeometryContext}=await loadTs(new URL('../app/component-insert-3d-server.ts',import.meta.url),{[new URL('../app/auth-server.ts',import.meta.url).href]:"export const sha256=async()=> 'unused';"});
 const context=insertionGeometryContext(source,catalog),items=new Map([...resources.components.items,...source.items].map(i=>[i.id,i]));
 for(const side of ['suction','discharge']){const card=p.entities['station-collectors'][side];card.calculation=calculateCollector(card.configuration,resources.components.collectorCatalog);}
 const lines={version:1,revision:'frame-offset-test',items:Object.fromEntries(lineGeometryIds(p).filter(id=>items.has(id)).map(id=>[id,lineGeometry(items.get(id),catalog,context)])),issues:[]};
 const a=model.buildAssembly(p,pumps,profiles,lines);
 const initial=structuredClone(p),l=initial.entities['station-spec'].frameCalculation.layout;
 for(const item of [...l.pumps,l.tank]){item.x-=offset;item.bounds.minX-=offset;item.bounds.maxX-=offset;}
 const before=model.buildAssembly(initial,pumps,profiles,lines);
 const shifted=a.components.filter(c=>c.kind==='pump'||c.kind==='collector'||c.tankMount?.role==='tank'||c.line||c.instrumentMount||c.valveControl);
 assert(a.components.some(c=>c.tankMount?.role==='tank'));assert(a.components.some(c=>c.line));assert(shifted.length>5);
 for(const c of shifted){const old=before.components.find(n=>n.id===c.id);vec(model.subtract(c.position,old.position),[0,offset,0]);}
 for(const c of a.components.filter(c=>c.kind==='pipe'&&c.routing)){
  const old=before.components.find(n=>n.id===c.id);
  const nowPoints=model.pipePoints(a,c),oldPoints=model.pipePoints(before,old);
  nowPoints.forEach((point,i)=>vec(model.subtract(point,oldPoints[i]),[0,offset,0]));
 }
 for(const c of a.components.filter(c=>c.kind==='frame'||c.frameMount))vec(c.position,before.components.find(n=>n.id===c.id).position);
});

test('direct cabinet CAD holes match both native stand sizes and hardware matches BOM quantities and prices',async()=>{
 for(const args of [{width:600,spacing:500},{width:800,spacing:700},{width:800,count:1,spacing:300}]){
  const {a,p,result}=prepare(args),cab=a.components.find(c=>c.frameMount?.role==='cabinet');
  assert(cab);if(cab.equipmentId)assert.equal(a.components.filter(c=>c.equipmentId===cab.equipmentId).length,1);
  const world=(c,port)=>model.portPoint(a,{componentId:c.id,portId:port.id});
  const cabinetPorts=cab.ports.map(port=>world(cab,port));
  if(!result.layout.profiles){
   const standPorts=stands(a).flatMap(c=>c.ports.filter(p=>p.id.startsWith('cabinet-')).map(p=>world(c,p)));
   for(const point of cabinetPorts){assert(standPorts.some(p=>Math.abs(point[1]-p[1])<1e-5&&Math.abs(point[2]-p[2])<1e-5));}
   close(result.layout.standDistanceMm,args.width===800?766:560);
  }
  const hardware=a.components.filter(c=>c.frameHardware),counts=new Map();
  const {cadContents}=await load('cad-export'),manifest=cadContents(a).instances;
  for(const c of hardware){
   const f=c.frameHardware,parts=manifest.filter(p=>p.componentId===c.id);
   assert(f.parts.bolt?.name && f.parts.rivet?.name,'Catalog designations must reach the assembly');
   assert.equal(parts.filter(p=>p.geometry.kind==='rivet-nut').length,f.centers.length);
   assert.equal(parts.filter(p=>p.geometry.hardware==='bolt').length,f.centers.length);
   for(const part of parts)assert(!/левой|правой|насоса|стойки/i.test(part.name),part.name);
  }
  for(const group of [hardware.filter(c=>c.id.startsWith('frame-hardware-pump-1-')),hardware.filter(c=>/^frame-hardware-stand-/.test(c.id))]){
   assert(group.length>0);
   assert.equal(new Set(group.map(c=>JSON.stringify(c.frameHardware.parts.bolt))).size,1);
   assert.equal(new Set(group.map(c=>JSON.stringify(c.frameHardware.parts.rivet))).size,1);
  }
  for(const c of hardware){const f=c.frameHardware,n=f.centers.length;counts.set(`M${f.diameter}x${f.length}`,(counts.get(`M${f.diameter}x${f.length}`)??0)+n);}
  const rows=p.entities['station-spec'].items.filter(r=>r.section==='frame'&&r.quantity>0);
  for(const row of rows){assert(row.price>0,`Missing price: ${row.name}`);}
  const get=role=>rows.find(r=>r.assemblyRole==='frame/'+role);
  assert.equal(get('stand-left').price,args.width===800?2500:2300);
  assert.equal(counts.get('M8x25'),get('bolt-m8-25').quantity);
  assert.equal(hardware.filter(c=>c.frameHardware.diameter===8&&c.frameHardware.washer>0).reduce((sum,c)=>sum+c.frameHardware.centers.length,0),get('washer-m8').quantity);
  if(result.layout.profiles){assert.equal(counts.get('M8x35'),4);assert.equal(get('profile').price,399.33);assert.equal(a.components.filter(c=>c.frameProfile).length,2);}
  const frame=a.components.find(c=>c.kind==='frame');
  assert.equal(frame.frameDrilling.holes.length,result.layout.holes.length);
  assert(frame.frameDrilling.holes.filter(h=>h.owner.startsWith('pump-')).every(h=>h.diameter===13));
  for(const c of hardware){
   const moved=model.editComponent(a,{id:c.frameMount.parentId,patch:{position:model.add(a.components.find(n=>n.id===c.frameMount.parentId).position,[5,6,7])}});
   vec(model.subtract(moved.components.find(n=>n.id===c.id).position,c.position),[5,6,7]);
  }
  if(process.env.FRAME_PREVIEW_DIR)await writeFile(`${process.env.FRAME_PREVIEW_DIR}/frame-${args.width}-${result.layout.profiles?'profiles':'direct'}.json`,JSON.stringify(a));
 }
});

test('a recessed rivet head keeps its shape and only lowers the pump and bolt seat',async()=>{
 const {a,p,pumps}=prepare(),recessed=structuredClone(p);
 const fastening=recessed.entities['station-spec'].frameCalculation.parts.find(part=>part.id==='frame/pump-1-bolts').fastening;
 assert(fastening.head>0);
 fastening.supportLift=0;
 const b=model.buildAssembly(recessed,pumps,profiles),id='frame-hardware-pump-1-0';
 const raised=a.components.find(c=>c.id===id),flush=b.components.find(c=>c.id===id);
 assert.equal(flush.frameHardware.supportLift,0);
 assert.equal(flush.frameHardware.head,raised.frameHardware.head);
 close(raised.bounds[3]-flush.bounds[3],fastening.head);
 const pumpHeight=assembly=>assembly.components.find(c=>c.kind==='pump').position[2];
 close(pumpHeight(a)-pumpHeight(b),fastening.head);
 vec(raised.position,flush.position);

 const {cadContents}=await load('cad-export'),{parseFrameHardware}=await load('model-editor/frame-hardware');
 const part=(assembly,suffix)=>cadContents(assembly).instances.find(c=>c.id===JSON.stringify([id,'0/'+suffix]));
 close((part(a,'bolt').transform[11]-part(b,'bolt').transform[11])*1000,fastening.head);
 assert.deepEqual(part(a,'rivet').transform,part(b,'rivet').transform);
 assert.deepEqual(part(a,'rivet').geometry,part(b,'rivet').geometry);
 assert.equal(part(a,'rivet').geometry.kind,'rivet-nut');
 assert.equal(parseFrameHardware(flush.frameHardware).supportLift,0);
 assert.equal(parseFrameHardware({...flush.frameHardware,supportLift:fastening.head+.1}),undefined);
});

test('native frame drilling creates true through holes and keeps original mesh immutable',async()=>{
 const compiled=await build({stdin:{resolveDir:fileURLToPath(new URL('../',import.meta.url)),contents:'export {drilledFrameGeometry} from "./app/model-editor/frame-renderer";export {frameProfileObject,frameHardwareObject} from "./app/model-editor/frame-hardware-renderer";export {STLLoader} from "three/addons/loaders/STLLoader.js";export * from "three";'},bundle:true,platform:'node',format:'esm',write:false});
 const g=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const hardware=prepare().a.components.find(c=>c.id==='frame-hardware-pump-1-0');
 const raised=g.frameHardwareObject(hardware),flush=g.frameHardwareObject({...hardware,frameHardware:{...hardware.frameHardware,supportLift:0}});
 const firstX=mesh=>{const m=new g.Matrix4();mesh.getMatrixAt(0,m);return m.elements[12];};
 close(firstX(raised.children[1])-firstX(flush.children[1]),hardware.frameHardware.head);
 close(firstX(raised.children[2]),firstX(flush.children[2]));
 for(const group of [raised,flush]){
  for(const mesh of group.children){mesh.geometry.dispose();mesh.dispose();}
  group.children[0].material.dispose();
 }
 for(const args of [{width:600,spacing:500},{width:800,count:1,spacing:300}]){
  const {a}=prepare(args),frame=a.components.find(c=>c.kind==='frame'),bytes=await readFile(new URL('../public'+frame.meshUrl,import.meta.url));
  const raw=new g.STLLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),before=raw.attributes.position.array.slice();
  const start=performance.now(),drilled=g.drilledFrameGeometry(raw,frame.frameDrilling),duration=performance.now()-start;
  assert.deepEqual(raw.attributes.position.array,before);vec([...drilled.boundingBox.min.toArray(),...drilled.boundingBox.max.toArray()],frame.bounds);
  const mesh=new g.Mesh(drilled,new g.MeshBasicMaterial({side:g.DoubleSide}));mesh.updateMatrixWorld();
  const hits=(point)=>new g.Raycaster(new g.Vector3(point[0],frame.frameDrilling.top+10,point[2]),new g.Vector3(0,-1,0),0,20).intersectObject(mesh);
  for(const h of frame.frameDrilling.holes){assert.equal(hits(h.point).length,0,h.id);assert(hits([h.point[0]+h.diameter/2+1,0,h.point[2]]).length>=2,h.id+' adjacent sheet');}
  assert(duration<500,`Drilling ${duration} ms`);
  for(const c of a.components.filter(c=>c.frameProfile)){
   const group=g.frameProfileObject(c);group.updateMatrixWorld(true);
   const box=new g.Box3().setFromObject(group);vec([...box.min.toArray(),...box.max.toArray()],c.bounds);
   for(const z of c.frameProfile.holes){const ray=new g.Raycaster(new g.Vector3(-5,0,z),new g.Vector3(1,0,0));assert.equal(ray.intersectObject(group,true).length,0,'Profile mounting slot');}
  }
  raw.dispose();drilled.dispose();mesh.material.dispose();
 }
});

test('a rivet bore on the bend is diagnosed and cannot erase the native frame mesh',()=>{
 const mount={...mounting,holes:mounting.holes.map(h=>({...h,y:Math.sign(h.y)*195}))};
 const {a,p,result}=prepare({mount});
 assert(result.issues.some(i=>i.code==='frame-drilling'&&i.blocking));
 assert.equal(p.entities['station-spec'].items.find(r=>r.assemblyRole==='frame/body').technicalStatus,'incomplete');
 assert.equal(a.components.find(c=>c.kind==='frame').frameDrilling.holes.filter(h=>h.owner.startsWith('pump')).length,0);
 assert.equal(a.components.some(c=>c.id.startsWith('frame-hardware-pump-')),false);
});
