import test from 'node:test';import assert from 'node:assert/strict';
import {Vector3,Euler} from 'three';
import {load,json,fixture,choose,sync,resources} from './fixtures/station-specification.mjs';
const {calculateChannelFrame:calc}=await load('frame-calculation/channel');
const {channelCabinetForWidth}=await load('frame-calculation/channel-cabinet');
const {verticalChannelMount}=await load('frame-calculation/channel-mountings');
const {channelWelding}=await load('frame-calculation/channel-welding');
const {executeFrameOperation,FRAME_STAGES}=await load('node-tools/frame-nodes');
const model=await load('model-editor/model');
const {calculateCollector}=await load('collector-calculations');
const {floorTankAnchor}=await load('model-editor/tank-assemblies');
const {channelFrameSvg}=await load('frame-calculation/channel-drawing');
const imported=await json('data/frame-fasteners-import.json');
const tanks=await json('data/tank-frame-mountings.json'),assets=await json('data/tank-channel-models.json');
const m={verified:true,source:'test verified mounting',bounds:{minX:-150,maxX:150,minY:-200,maxY:200},holes:[-100,100].flatMap(x=>[-120,120].map(y=>({id:`${x}/${y}`,owner:'pump',x,y,diameterMm:10}))),boltDiameterMm:8,footThicknessMm:15};
const mount={verified:true,source:m.source,target:'feet',mounting:m,axisX:0,flowOffsetMm:0,bodyBounds:m.bounds,flangeFaceToFaceMm:362,flangeSource:'test flange planes'};
const pump={id:'318',name:'vertical fixture',type:'vertical_multistage',count:3,circuit:1,massKg:500,mounting:mount,spacing:{mm:530,status:'confirmed',source:'fixed interaxial'}};
const options={cabinet:channelCabinetForWidth('cabinet',800),foundationHoleMm:14,foundationSource:'test'};
const world=(c,p)=>new Vector3(...p).applyEuler(new Euler(...c.rotation.map(a=>a*Math.PI/180))).add(new Vector3(...c.position));

test('vertical mass thresholds, doubled flange span and pump-centered beams preserve spacing and a 10 mm clear gap',()=>{
 for(const [massKg,code]of [[100,'8П'],[300,'10П'],[500,'12П'],[1000,'14П']]){
 const r=calc([{...pump,massKg}],options),g=r.geometry;assert.equal(r.geometryStatus,'ready',JSON.stringify(r.issues));assert.equal(g.profile.name,code);assert.equal(g.widthMm,730);assert.equal(g.lengthMm%10,0);
 assert.equal(g.members.filter(m=>m.id==='front'||m.id==='rear').length,2);
 assert(g.members.every(m=>m.profileCode===g.profile.code));const first=g.members.find(m=>m.id==='cabinet-first'),support=g.members.find(m=>m.id==='pump-1-0-support-0');assert.equal(support.cross-first.cross-g.profile.width,10);
 for(const h of g.holes.filter(h=>h.owner.startsWith('pump-'))){const beam=g.members.find(m=>m.id===h.memberId);assert.equal(h.x,beam.cross+g.profile.width/2);}
 assert.deepEqual(g.pumps.slice(1).map((p,i)=>p.axisXMm-g.pumps[i].axisXMm),[530,530]);
 const second=g.members.find(m=>m.id==='cabinet-second');assert.equal(second.axis,'x');const secondStand=g.holes.filter(h=>h.owner==='cabinet').map(h=>h.x).sort((a,b)=>a-b).at(-1);assert(secondStand>g.pumps[0].bounds.maxX);assert(secondStand<g.pumps[1].bounds.minX);assert(second.start<secondStand&&second.end>secondStand);
 assert(g.cabinetAdapter);assert.equal(channelWelding(g,2400,'test').joints.length,(g.members.length-2)*2);
 assert.match(channelFrameSvg(r),/730/);
 }
});

test('separate cabinet, missing flange evidence and insufficient spacing stay explicit',()=>{
 const r=calc([pump],{...options,cabinetSeparate:true});assert.equal(r.geometry.cabinet,null);assert(!r.geometry.members.some(m=>m.id.startsWith('cabinet')));
 const absent=calc([{...pump,mounting:{...mount,flangeFaceToFaceMm:undefined}}],options);assert.equal(absent.geometry,null);assert(absent.issues.some(i=>i.code==='channel-flange-span'));
 const tight=calc([{...pump,spacing:{...pump.spacing,mm:300}}],options);assert(tight.issues.some(i=>i.code==='channel-stand-placement'));
 const inherited=verticalChannelMount({manufacturer:'test',model:'test',dimensions:{baseGeometry:{flange_face_to_face:362,dimensionSetId:'base'}}},m);assert.equal(inherited.flangeFaceToFaceMm,362);
 assert.equal(verticalChannelMount({dimensions:{overall_width:362}},m).flangeFaceToFaceMm,undefined);
});

test('50/80/100 litre tanks have one foot toward pumps, two at end, with bent-frame clearances and two support beams',()=>{
 for(const row of tanks.rows){const r=calc([pump],{...options,tank:{id:row.equipmentId,volumeL:row.volumeL,mounting:row.mounting}}),g=r.geometry;assert.equal(r.geometryStatus,'ready',JSON.stringify(r.issues));
 const h=g.holes.filter(h=>h.owner==='tank'),last=g.holes.filter(h=>h.owner.startsWith('pump-'));assert.equal(h.length,3);const xs=[...new Set(h.map(h=>h.x))].sort((a,b)=>a-b);assert.equal(h.filter(h=>h.x===xs[0]).length,1);assert.equal(h.filter(h=>h.x===xs[1]).length,2);assert(xs[0]-Math.max(...last.map(h=>h.x))>=110-.001);assert(g.tank.bounds.minX-g.pumps.at(-1).bounds.maxX>=40-.001);
 assert.equal(g.members.filter(m=>m.id.startsWith('tank-support')).length,2);for(const hole of h){assert(hole.valid);assert(Math.abs(hole.x-g.members.find(m=>m.id===hole.memberId).cross-g.profile.width/2)<.001);}
 }
});

function integration(){
 let p=choose(fixture(),'318',2,1);Object.assign(p.entities['station-settings'],{stationType:'utility',membraneTank:true,membraneTankVolume:100});
 const pumps=resources.pumps.map(p=>p.id==='318'?{...p,type:'vertical_multistage',weightKg:500,mounting:{frameV1:m},dimensions:{...p.dimensions,flange_face_to_face:362}}:p);
 const components={...resources.components,items:[...new Map([...resources.components.items,...imported.items].map(i=>[i.id,i])).values()]};
 p=sync(p,{...resources,pumps,components});
 for(const side of ['suction','discharge'])Object.assign(p.entities['station-collectors'][side].configuration.primary,{spacing:530,spacingStatus:'confirmed'});
 for(const side of ['suction','discharge']){const card=p.entities['station-collectors'][side];card.calculation=calculateCollector(card.configuration,components.collectorCatalog);}
 let work={original:p,next:p,resources:{...resources,pumps,components},reasons:[]};
 for(const [operation]of FRAME_STAGES)work=executeFrameOperation({id:operation,operation,fields:[],values:{},links:[],expressions:{}},{work,...(operation==='frame.inputs'?{mountings:{318:m},channelInputs:{...options,cabinetEnclosureWidthMm:800}}:{})}).value;
 return {work,p:work.next,pumps,assembly:model.buildAssembly(work.next,pumps,{version:1,profiles:{}},{version:1,revision:'vertical-test',items:{},issues:[]})};
}

test('hidden pipeline includes C-profiles, tank hardware, welding and paint in one frame assembly; native mount axes coincide in 3D',async()=>{
 const {work,p,assembly}=integration(),g=work.frameResult.channel.geometry;assert.equal(g.arrangement,'vertical');assert(g.cabinetAdapter);assert(g.tank);
 const frame=assembly.components.find(c=>c.id==='frame'),cabinet=assembly.components.find(c=>c.id==='frame-cabinet'),profiles=assembly.components.filter(c=>c.frameProfile);assert.equal(profiles.length,2);assert.equal(assembly.components.filter(c=>c.id.startsWith('frame-hardware-cabinet-profile-')).length,2);
 const native=await json('data/frame-cabinet-models.json'),stands=await json('data/frame-stand-models.json');
 const lift=owner=>{const h=work.frameResult.channel.hardwareGroups.find(g=>g.owner===owner).hardware;return h.supportLift??h.head;};
 for(const point of native.assets['800'].mountingPoints){const q=world(cabinet,point);assert(profiles.some((c,i)=>c.frameProfile.holes.some(z=>world(c,[20+lift(`profile-${i}`),0,z]).distanceTo(q)<.001)),'cabinet hole meets C-profile with rivet head allowance');}
 for(const side of ['left','right']){const stand=assembly.components.find(c=>c.id===`frame-stand-${side}`),asset=Object.values(stands.assets).find(a=>a.sourceHash===stand.cadSource.hash);for(const point of asset.cabinetPoints){const q=world(stand,point);assert(profiles.some(c=>c.frameProfile.holes.some(z=>world(c,[-lift(`stand-${side}`),0,z]).distanceTo(q)<.001)),'stand hole meets C-profile with rivet head allowance');}}
 const tank=assembly.components.find(c=>c.tankMount?.role==='tank'),asset=assets.rows.find(a=>a.volumeL===100);assert(tank);assert.equal(tank.cadSource.hash,asset.sourceHash);const holes=g.holes.filter(h=>h.owner==='tank').map(h=>world(frame,[h.y,g.heightMm+lift('tank'),-h.x]));for(const point of asset.mountingPoints)assert(holes.some(h=>h.distanceTo(world(tank,point))<.001));
 const hardware=assembly.components.find(c=>c.id==='frame-hardware-tank');assert(hardware,JSON.stringify(work.frameResult.channel.issues));assert.equal(hardware.frameHardware.centers.length,3);
 const saved=model.normalizeEditor({version:1,assembly}).assembly;assert.deepEqual(saved.components.find(c=>c.id==='frame').channelFrame,g);
 const parent=p.entities['station-spec'].items.filter(r=>r.option==='frame');assert.equal(parent.length,1);assert(!p.entities['station-spec'].items.flatMap(r=>r.hydraulicAssembly?.parts??[r]).some(r=>/tank-mount-/.test(r.assemblyRole??'')));assert.equal(parent[0].frameAssembly.parts.filter(p=>p.lengthMm).reduce((s,p)=>s+p.quantity,0),g.members.length);assert(work.frameResult.parts[0].children.some(p=>p.role==='profile'&&p.quantity===2));assert(work.frameResult.parts[0].children.some(p=>p.role==='frame-painting'));
 const moved={...frame,position:[20,40,70],rotation:[90,0,30]};const anchor=floorTankAnchor({...assembly,components:assembly.components.map(c=>c===frame?moved:c)},assembly.components.find(c=>c.kind==='pump'),tank);assert(world(moved,tank.tankMount.frameAnchor).distanceTo(new Vector3(...anchor.position))<.001);
});
import {readFile} from 'node:fs/promises';
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js';
import {Mesh,MeshBasicMaterial,DoubleSide,Raycaster} from 'three';
test('normalized tank STEP meshes have actual open foot holes and bearing faces at calculated axes',async()=>{
 for(const asset of assets.rows){const raw=await readFile(new URL('../public'+asset.meshUrl,import.meta.url));const mesh=new Mesh(new STLLoader().parse(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)),new MeshBasicMaterial({side:DoubleSide}));mesh.updateMatrixWorld();const cast=(x,y)=>new Raycaster(new Vector3(x,y,4),new Vector3(0,0,-1),0,6).intersectObject(mesh);
 for(const [x,y]of asset.mountingPoints){assert.equal(cast(x,y).length,0,`WAV${asset.volumeL} has through hole`);assert([[8,0],[-8,0],[0,8],[0,-8]].some(([dx,dy])=>cast(x+dx,y+dy).some(h=>Math.abs(h.point.z)<1.6)),`WAV${asset.volumeL} rests on frame`);}mesh.geometry.dispose();mesh.material.dispose();
 }
});
