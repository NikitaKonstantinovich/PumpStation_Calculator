import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTs} from './load-ts.mjs';
import {pump,mount,inputs} from './fixtures/channel-frame.mjs';
const {calculateChannelFrame:calc,channelAnchorPositions,memberBounds}=await loadTs(new URL('../app/frame-calculation/channel.ts',import.meta.url));
const {channelFrameSvg}=await loadTs(new URL('../app/frame-calculation/channel-drawing.ts',import.meta.url));
const {channelCabinetForWidth}=await loadTs(new URL('../app/frame-calculation/channel-cabinet.ts',import.meta.url));
const {channelWelding}=await loadTs(new URL('../app/frame-calculation/channel-welding.ts',import.meta.url));

test('pump fixing axes stay at least 50 mm from both welded beam ends, including saved rules and ten-millimetre rounding',()=>{
 for(const massKg of [100,300,500,1000])for(const separate of [true,false]){
  const mounting={...mount,mounting:{...mount.mounting,holes:mount.mounting.holes.map(h=>({...h,clearanceMm:9}))}};
  const r=calc([{...pump,massKg,mounting}],{...inputs,cabinetSeparate:separate},{version:'horizontal-channel-frame-2026-11-15-v4'}),g=r.geometry;
  for(const beam of g.members.filter(m=>m.id.startsWith('pump-row-'))){
   const holes=g.holes.filter(h=>h.owner.startsWith('pump-')&&h.memberId===beam.id);
   assert(holes.length>0);
   for(const h of holes){assert(h.x-beam.start>=50-1e-6);assert(beam.end-h.x>=50-1e-6);}
  }
  assert.equal(g.lengthMm%10,0);
  for(let i=1;i<g.pumps.length;i++)assert.equal(g.pumps[i].axisXMm-g.pumps[i-1].axisXMm,530);
 }
 const mounting={...mount,mounting:{...mount.mounting,bounds:{...mount.mounting.bounds,minX:-182.5,maxX:182.5},holes:mount.mounting.holes.map(h=>({...h,x:Math.sign(h.x)*167.5,diameterMm:14,clearanceMm:12}))}};
 const r=calc([{...pump,massKg:100,spacing:{...pump.spacing,mm:550},mounting}],{...inputs,cabinetSeparate:true});
 const g=r.geometry,x=g.holes.filter(h=>h.owner.startsWith('pump-')).map(h=>h.x);
 assert.equal(Math.min(...x)-g.profile.width,50);
 assert.equal(g.lengthMm-g.profile.width-Math.max(...x),55);
 assert.equal(g.lengthMm,1620);
 assert.match(channelFrameSvg(r),/слева 50 мм, справа 55 мм/);
});

test('separate cabinet retains pump-only layout; shared cabinet adds a separator and centred stand supports with 300 mm upright clearance',()=>{
 for(const massKg of [100,300,500,1000])for(const width of [600,800]){
  const testPump={...pump,massKg,mounting:{...mount,mounting:{...mount.mounting,holes:mount.mounting.holes.map(h=>({...h,clearanceMm:9}))}}};
  const cabinet=channelCabinetForWidth('selected',width),common=calc([testPump],{...inputs,cabinet});
  const separate=calc([testPump],{...inputs,cabinet:null,cabinetSeparate:true});
  const g=common.geometry,s=separate.geometry;
  assert.equal(common.geometryStatus,'ready',JSON.stringify(common.issues));
  assert.equal(s.cabinet,null);assert(!s.members.some(m=>m.id.startsWith('cabinet-')));
  assert(!separate.issues.some(i=>/cabinet|door|upright/.test(i.code)));
  assert(g.widthMm>s.widthMm);assert(g.members.some(m=>m.id==='cabinet-front'));
  assert(g.cabinet.uprightClearanceMm>=300);assert.equal(g.cabinet.data.doorDirection,'rear');
  const feet=g.cabinet.data.mounting.bounds,rear=g.members.find(m=>m.id==='rear');
  const rearRow=Math.max(...g.holes.filter(h=>h.owner==='cabinet').map(h=>h.y));
  assert(Math.abs(rearRow-rear.cross-g.profile.width/2)<1e-6,'rear stand fixing row is centred on the rear transverse flange');
  assert(g.cabinet.y+feet.maxY>rear.cross,'rear foot rests above the rear member');
  assert(g.cabinet.y+feet.minY>=g.members.find(m=>m.id==='cabinet-front').cross+g.profile.width);
  assert.equal(g.lengthMm%10,0);assert.equal(g.widthMm%10,0);
  for(const h of g.holes.filter(h=>h.owner==='cabinet')){
   assert(h.valid);const m=g.members.find(m=>m.id===h.memberId);
   if(Math.abs(h.y-rearRow)<1e-6){assert.equal(m.id,'rear');assert.equal(m.axis,'x');}
   else {assert.equal(m.axis,'y');assert(Math.abs(h.x-m.cross-g.profile.width/2)<1e-6);}
  }
  const columns=[...new Set(g.holes.filter(h=>h.owner==='cabinet').map(h=>h.x))].sort((a,b)=>a-b);
  assert.equal(columns[1]-columns[0],width===800?766:560);
  assert.deepEqual(g.pumps.map(p=>p.axisXMm),s.pumps.map(p=>p.axisXMm));
  for(const h of g.holes.filter(h=>h.owner==='cabinet')){
   const source=cabinet.mounting.holes.find(p=>Math.abs(p.x+g.cabinet.x-h.x)<1e-6&&Math.abs(p.y+g.cabinet.y-h.y)<1e-6);
   assert(source,'stand CAD and frame drilling move together');
  }
 }
});

test('welding counts unique physical end joints, one true channel perimeter each, with the St20 rate',()=>{
 const separate=calc([pump],{...inputs,cabinetSeparate:true}),common=calc([pump],{...inputs,cabinet:channelCabinetForWidth('selected',800)});
 for(const [r,count] of [[separate,8],[common,12]]){
  const w=channelWelding(r.geometry,2400,'fixture St20');
  assert.equal(w.joints.length,count);assert.equal(new Set(w.joints.map(j=>j.members.join('/'))).size,count);
  const p=r.profile,expected=2*p.height+4*p.width-2*p.web-(4-Math.PI)*(p.rootRadius+p.toeRadius);
  assert(Math.abs(w.lengthMm-count*expected)<1e-8);assert(Math.abs(w.costRub-count*expected/1000*2400)<1e-8);
 }
 assert.equal(channelWelding(common.geometry,null,'missing').costRub,null);
});

test('single-pump mass selects every channel at exact thresholds without multiplying count',()=>{
 for(const [mass,code] of [[100,'8П'],[299.99,'8П'],[300,'10П'],[499.99,'10П'],[500,'12П'],[999.99,'12П'],[1000,'14П']])for(const count of [1,3]){
  const r=calc([{...pump,massKg:mass,count}],inputs);assert.equal(r.profile.name,code);assert(r.geometry.members.every(m=>m.profileCode===r.profile.code));
 }
 for(const mass of [null,0,-1,NaN,Infinity])assert.equal(calc([{...pump,massKg:mass}],inputs).profile,null);
 assert.equal(calc([{...pump,massKg:99.9}],inputs).profile,null);
});
test('example mounting grid preserves axis spacing, supports cabinet behind pumps and has no intersecting members',()=>{
 const r=calc([pump],inputs),g=r.geometry;
 assert.equal(r.geometryStatus,'ready',JSON.stringify(r.issues));assert.equal(r.dataStatus,'confirmed');assert(g.holes.every(h=>h.valid));
 assert.equal(g.pumps[1].axisXMm-g.pumps[0].axisXMm,530);assert.equal(g.pumps[2].axisXMm-g.pumps[0].axisXMm,1060);
 assert.equal(g.lengthMm%10,0);assert.equal(g.widthMm%10,0);
 assert(g.cabinet.y+g.cabinet.data.mounting.bounds.minY>Math.max(...g.pumps.map(p=>p.bounds.maxY)));
 for(let i=0;i<g.members.length;i++)for(let j=i+1;j<g.members.length;j++){
  const a=memberBounds(g.members[i],g.profile.width),b=memberBounds(g.members[j],g.profile.width);
  assert(!(a.minX<b.maxX-1e-6&&b.minX<a.maxX-1e-6&&a.minY<b.maxY-1e-6&&b.minY<a.maxY-1e-6));
 }
 assert.equal(r.strengthStatus,'not-checked');assert(r.drilledMassKg<r.stockMassKg);
 const before=JSON.stringify({pump,inputs});calc([pump],inputs);assert.equal(JSON.stringify({pump,inputs}),before);
});
test('rounding leaves axis deltas and each base hole grid unchanged',()=>{
 const spacings=[{mm:555,status:'confirmed',source:'manual'},{mm:725,status:'confirmed',source:'manual'}];
 for(const roundingMm of [10,100,250]){
  const g=calc([pump],{...inputs,spacings},{roundingMm}).geometry;
  assert.deepEqual(g.pumps.slice(1).map((p,i)=>p.axisXMm-g.pumps[i].axisXMm),[555,725]);
  for(const p of g.pumps){const holes=g.holes.filter(h=>h.owner===p.id);assert.equal(holes[1].x-holes[0].x,470);assert.equal(holes[2].y-holes[0].y,450);}
 }
 assert(calc([{...pump,count:1,spacing:{mm:null,status:'missing',source:''}}],inputs).geometry);
});
test('missing and conflicting data cannot silently produce a verified layout',()=>{
 for(const status of ['missing','stale','conflict'])assert.equal(calc([{...pump,spacing:{mm:530,status,source:'test'}}],inputs).geometry,null);
 assert.equal(calc([{...pump,mounting:null}],inputs).geometry,null);
 assert.equal(calc([{...pump,mounting:{...mount,target:'feet'}}],inputs).geometry,null);
 const provisional=calc([{...pump,spacing:{...pump.spacing,status:'conditional'}}],inputs);assert.equal(provisional.dataStatus,'conditional');
 assert.equal(calc([pump],{...inputs,cabinet:null}).dataStatus,'missing');
 assert.equal(calc([pump],{...inputs,foundationHoleMm:null}).drilledMassKg,null);
 assert.equal(calc([{...pump,type:'vertical_multistage'}],inputs).geometry,null);
 const mixed=calc([pump,{...pump,id:'v',type:'vertical_multistage',circuit:2}],inputs);assert(mixed.issues.some(i=>i.code==='channel-scope'));assert.equal(mixed.geometry.pumps.length,3);
});
test('different bases require their own beam rows and explicit spacing at a circuit boundary',()=>{
 const second={...pump,id:'second',circuit:2,count:1,mounting:{...mount,mounting:{...mount.mounting,holes:mount.mounting.holes.map(h=>({...h,y:h.y*2}))}}};
 assert.equal(calc([{...pump,count:1},second],inputs).geometry,null);
 const r=calc([{...pump,count:1},second],{...inputs,spacings:[{mm:750,status:'confirmed',source:'Between circuits'}]});
 assert.equal(r.geometry.members.filter(m=>m.id.startsWith('pump-row-')).length,4);
 assert.equal(r.geometry.pumps[1].axisXMm-r.geometry.pumps[0].axisXMm,750);
});
test('collisions are reported without moving pumps; oversized washers are rejected',()=>{
 const r=calc([{...pump,spacing:{...pump.spacing,mm:450}}],inputs);assert(r.issues.some(i=>i.code==='channel-collision'));
 assert.equal(r.geometry.pumps[1].axisXMm-r.geometry.pumps[0].axisXMm,450);
 const washer=calc([{...pump,mounting:{...mount,mounting:{...mount.mounting,holes:mount.mounting.holes.map(h=>({...h,clearanceMm:100}))}}}],inputs);
 assert(washer.geometry.holes.some(h=>h.owner.startsWith('pump')&&!h.valid));assert.equal(washer.geometryStatus,'incomplete');
});
test('foundation rows reproduce the known longitudinal pattern and respect pitch',()=>{
 assert.deepEqual(channelAnchorPositions(1900),[50,650,1250,1850]);
 assert.deepEqual(channelAnchorPositions(100),[]);
 for(const length of [600,1000,1700,1900,2000,5000]){const x=channelAnchorPositions(length);assert.equal(x[0],50);assert.equal(x.at(-1),length-50);assert(x.slice(1).every((v,i)=>v-x[i]<=600+.00001));}
});
test('drawing is generated from the shared layout and escapes supplied text',()=>{
 const r=calc([pump],inputs),svg=channelFrameSvg(r);assert.match(svg,/530/);assert.match(svg,/470/);assert.doesNotMatch(svg,/Прочность и соединения не проверены/);assert(!r.issues.some(i=>i.code==='channel-strength'));
 r.geometry.holes[0].id='<script>bad</script>';const safe=channelFrameSvg(r);assert(!safe.includes('<script>'));assert(safe.includes('&lt;script&gt;'));
});
test('hidden frame instrument retains its visibility policy and the channel inputs stay in the existing chain',async()=>{
 const upgrade=await readFile(new URL('../app/node-tools/frame-upgrade.ts',import.meta.url),'utf8');assert.match(upgrade,/workspaceVisible: false/);
 const source=await readFile(new URL('../app/node-tools/frame-nodes.ts',import.meta.url),'utf8');assert.match(source,/"channelInputs"/);assert.match(source,/state\.result\.rules\.channel/);
});
