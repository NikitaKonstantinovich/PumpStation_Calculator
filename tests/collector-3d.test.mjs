import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";
import * as THREE from "three";
const root=new URL("../",import.meta.url),replacements={};
for(const path of ["collector-mesh","collector-renderer","insertion-renderer"]){const u=new URL(`app/model-editor/${path}.ts`,root);replacements[u.href]=(await readFile(u,"utf8")).replace('from "three"',`from ${JSON.stringify(new URL("node_modules/three/build/three.module.js",root).href)}`);}
const {collectorMetal}=await loadTs(new URL("app/model-editor/collector-mesh.ts",root),replacements);
const {saddleRings}=await loadTs(new URL("app/model-editor/collector-intersection.ts",root));
const {buildCollectorTemplate,applyCollectorTemplate}=await loadTs(new URL("app/model-editor/collector-template.ts",root));
const {defaultCollectorMount,resolveCollectorMount,parseCollectorBinding}=await loadTs(new URL("app/model-editor/collector-types.ts",root));
const {collectorObject,CollectorRenderCache,metalGeometry}=await loadTs(new URL("app/model-editor/collector-renderer.ts",root),replacements);
const model=await loadTs(new URL("app/model-editor/model.ts",root));
const {calculateCollector}=await loadTs(new URL("app/collector-calculations.ts",root));
const close=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const main={componentId:"main-test",lengthMm:1500,outerMm:114.3,innerMm:108.3,source:"GEOMETRY FIXTURE ONLY"};
const branch=(patch={})=>({id:"b1",componentId:"branch-test",name:"Патрубок",role:"branch",portId:"pump-1-test-0",circuit:1,origin:[0,0,0],axis:[0,1,0],outerMm:60.3,innerMm:56.3,endMm:112.15,calculatedLengthMm:112.15,source:"GEOMETRY FIXTURE ONLY",joint:"saddle-on-surface",...patch});
function manifold(m){
  const p=m.positions,edges=new Map();
  const key=i=>p.slice(i*3,i*3+3).map(v=>Math.round(v*1e5)).join(",");
  for(let i=0;i<m.indices.length;i+=3){const t=m.indices.slice(i,i+3);assert.equal(new Set(t.map(key)).size,3,"degenerate face");for(let j=0;j<3;j++){const a=key(t[j]),b=key(t[(j+1)%3]),k=a<b?a+"/"+b:b+"/"+a;const e=edges.get(k)??[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(k,e);}}
  const bad=[...edges].filter(([,v])=>v[0]!==2||v[1]!==0);assert.equal(bad.length,0,JSON.stringify(bad.slice(0,8)));
}
function rayHits(m,point,direction){const g=metalGeometry(m),o=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));o.updateMatrixWorld();const hits=new THREE.Raycaster(new THREE.Vector3(...point),new THREE.Vector3(...direction)).intersectObject(o);g.dispose();o.material.dispose();return hits;}
test("analytic saddle follows both outer/inner branch rims on main OD, with distinct cut length",()=>{
  const r=saddleRings(main,branch());
  for(const ring of [r.outer,r.inner])for(const p of ring)close(p[1]**2+p[2]**2,(main.outerMm/2)**2);
  for(const p of r.bore)close(p[1]**2+p[2]**2,(main.innerMm/2)**2);
  assert.ok(Math.max(...r.outer.map(p=>p[1]))-Math.min(...r.outer.map(p=>p[1]))>5);
  assert.ok(r.cutLengthMm<112.15);close(r.outerEnd[0][1],112.15);
});
test("hollow metal is closed, consistently oriented and the near-wall opening leaves the opposite wall intact",()=>{
  const m=collectorMetal({main,branches:[branch()]});assert.deepEqual(m.issues,[]);assert.ok(m.main);manifold(m.main);manifold(m.branches.b1);
  const near=rayHits(m.main,[0,150,0],[0,-1,0]);assert.ok(near.length);close(near[0].point.y,-main.innerMm/2,1e-4);
  assert.equal(rayHits(m.branches.b1,[0,140,0],[0,-1,0]).length,0,"branch bore is open");
  for(const p of m.rings.b1.outer)assert.ok(Math.hypot(p[1],p[2])>=main.outerMm/2-1e-6);
});
test("multiple pump/ instrument holes, thin walls, negative side, shifted and inclined axes",()=>{
  const tilted=[.2,.97,.1],n=Math.hypot(...tilted);
  for(const tube of [main,{...main,outerMm:219.1,innerMm:217.1}]){
    const branches=[branch({id:"a",origin:[-450,0,0],axis:[0,-1,0]}),branch({id:"b",origin:[0,0,8],axis:tilted.map(v=>v/n),endMm:180}),branch({id:"sensor",origin:[450,0,0],axis:[0,0,1],outerMm:21.3,innerMm:17.3,endMm:160,role:"instrument"})];
    const result=collectorMetal({main:tube,branches});assert.deepEqual(result.issues,[]);manifold(result.main);for(const m of Object.values(result.branches))manifold(m);
  }
});
test("invalid depth, finite-end crossing, unsupported joints, overlap and impossible bore are diagnosed",()=>{
  for(const b of [branch({endMm:20}),branch({origin:[749,0,0]}),branch({joint:"inserted"}),branch({innerMm:120,outerMm:125}),branch({axis:[1,0,0]})]){
    const m=collectorMetal({main,branches:[b]});assert.ok(m.issues.length);assert.equal(Object.keys(m.branches).length,0);assert.ok(m.main);manifold(m.main);
  }
  const m=collectorMetal({main,branches:[branch(),branch({id:"b2",origin:[15,0,0]})]});assert.ok(m.issues.some(i=>i.includes("Пересекаются")));assert.equal(Object.keys(m.branches).length,0);manifold(m.main);
});
test("equal diameters retain the tangent saddle limits without opening the opposite half",()=>{
  const b=branch({outerMm:main.outerMm,innerMm:main.innerMm,endMm:180}),m=collectorMetal({main,branches:[b]});
  assert.deepEqual(m.issues,[]);manifold(m.main);manifold(m.branches.b1);
  const hits=rayHits(m.main,[0,200,0],[0,-1,0]);close(hits[0].point.y,-main.innerMm/2,1e-4);
});
function fixture(two=false){
  const c={type:"discharge",dn:100,pn:16,material:"aisi304",connection:"flanged",eccentric:false,stationType:two?"combined":"utility",simultaneous:false,jockey:false,primary:{flow:60,working:2,reserve:1,dn:50,connection:"flanged",spacing:500,pn:16},secondary:two?{flow:10,working:1,reserve:0,dn:50,connection:"flanged",spacing:400,pn:16}:null};
  const components=[],items={};for(const [dn,od,wall]of [[100,114.3,3],[50,60.3,2],[15,21.3,2],[20,26.9,2]])for(const kind of ["pipe","collar","looseFlange","nipple","plug"]){
    const id=`${kind}-${dn}`,outer=kind==="looseFlange"?od+80:od,length=kind==="collar"?30:null;
    components.push({id,kind,dn,pn:16,material:"aisi304",threadGender:kind==="plug"?"female":undefined,name:id,outerDiameter:od,innerDiameter:od-2*wall,price:10,source:"GEOMETRY FIXTURE ONLY"});
    items[id]={equipmentId:id,kind,source:"GEOMETRY FIXTURE ONLY",revision:"test",length,outerDiameter:od,wall,ports:[],fidelity:"parametric",issues:[],lipThickness:kind==="collar"?5:undefined,
      shape:kind==="collar"?{kind:"collar",outerMm:od,innerMm:od-2*wall,lengthMm:30,lipOuterMm:od+30,lipThicknessMm:5}:kind==="looseFlange"?{kind:"flange",lengthMm:15,outerMm:outer,innerMm:od+2,boltHoles:4,boltCircleMm:od+45,boltHoleMm:10}:undefined};
  }
  const catalog={version:"test",components,valveBolts:[{dn:50,pn:16,material:"aisi304",model:"017W",length:50,minimumLengthMm:49,componentId:"test-bolt",diameter:16,source:"GEOMETRY FIXTURE ONLY",warnings:[]}],bolts:[{dn:50,pn:16,length:50,source:"GEOMETRY FIXTURE ONLY"}]};
  const calculation=calculateCollector(c,catalog),card={configuration:c,calculation,status:"complete"};return {c,calculation,card,catalog,data:{version:1,revision:"test",items,issues:[]}};
}
test("template consumes calculated lengths, includes reserves/second circuit, and has no price/BOM side effects",()=>{
  const f=fixture(true),snapshot=JSON.stringify(f),t=buildCollectorTemplate(f.card,f.data,[],"discharge");
  close(t.main.lengthMm,1900);assert.equal(t.branches.filter(b=>b.role==="branch").length,4);close(t.branches[0].calculatedLengthMm,112.15);assert.equal(t.pieces.filter(p=>p.id.startsWith("end-")&&p.id.endsWith("collar")).length,2);
  assert.ok(t.ports.filter(p=>!p.id.startsWith("network")).every(p=>p.point[1]>112.15));assert.equal(JSON.stringify(f),snapshot);
  const repriced=structuredClone(f);repriced.card.calculation.price=123456;repriced.data.items["pipe-100"].revision="new-price";
  assert.equal(buildCollectorTemplate(repriced.card,repriced.data,[],"discharge").geometryKey,t.geometryKey);
  assert.equal(t.branches.filter(b=>b.role==="instrument").length,3);for(const b of t.branches.filter(b=>b.role==="instrument")){assert.equal(b.blankLengthMm,60);close(saddleRings(t.main,b).cutLengthMm,60);}
});
test("ports, poses, visibility, manual geometry and command history survive JSON reload and merge",()=>{
  const f=fixture(),t=buildCollectorTemplate(f.card,f.data,[],"discharge");
  const c=applyCollectorTemplate({id:"collector-discharge",name:"Тест",kind:"collector",position:[30,40,50],rotation:[10,20,30],hidden:false,opacity:.6,locked:false,ports:[],parameters:{length:1500,diameter:114.3,width:1,height:1,routeOffset:0},sourceNote:"test"},t);
  c.collector.hiddenPieceIds=[t.branches[0].id];assert.ok(parseCollectorBinding(c.collector));
  const a={version:1,sourceFingerprint:"test",components:[c],lineJoints:[]},restored=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:a}))).assembly;
  assert.deepEqual(restored.components[0].position,c.position);assert.deepEqual(restored.components[0].ports,c.ports);assert.deepEqual(restored.components[0].collector.hiddenPieceIds,c.collector.hiddenPieceIds);
  const edited=model.editComponent(restored,{id:c.id,patch:{parameters:{...c.parameters,length:1600}}});assert.equal(edited.components[0].collector.template.main.lengthMm,1600);
  const merged=model.mergeAssembly(edited,a);assert.equal(merged.components[0].parameters.length,1600);assert.deepEqual(merged.components[0].position,c.position);
  const h=model.execute(model.createHistory(restored),edited);assert.deepEqual(model.undo(h).present,restored);assert.deepEqual(model.redo(model.undo(h)).present,edited);
  const locked=model.editComponent(restored,{id:c.id,patch:{locked:true}});assert.deepEqual(model.editComponent(locked,{id:c.id,patch:{position:[0,0,0],parameters:{...c.parameters,length:1800}}}),locked);
});
test("render cache uses physical descriptors, each scene owns disposable geometry and material",()=>{
  const f=fixture(),t=buildCollectorTemplate(f.card,f.data,[],"discharge"),c={collector:{template:t,hiddenPieceIds:[]},opacity:1};
  const cache=new CollectorRenderCache(),a=collectorObject(c,cache),b=collectorObject(c,cache);assert.equal(cache.builds,1);
  const meshes=g=>{const a=[];g.traverse(o=>{if(o instanceof THREE.Mesh)a.push(o);});return a;};
  assert.notEqual(meshes(a)[0].geometry,meshes(b)[0].geometry);meshes(a).forEach(o=>{o.geometry.dispose();o.material.dispose();});assert.ok(meshes(b)[0].geometry.attributes.position.count>100);
  const altered=structuredClone(c);altered.collector.template.main.lengthMm+=10;collectorObject(altered,cache);assert.equal(cache.builds,2);cache.dispose();
});
test("all physical branch ends close against both pump circuits, and saved mounting conventions survive regeneration",async()=>{
  const {createProject}=await loadTs(new URL("app/project-config.ts",root));
  const f=fixture(true),p=createProject("Коллектор: изолированный тест",{id:"collector-geometry-test",timestamp:"2026-10-26T00:00:00Z"});
  const realPumps=JSON.parse(await readFile(new URL("public/pumps.json",root),"utf8")),pump=realPumps.find(p=>p.id==="9");assert.ok(pump);
  Object.assign(p.entities["station-settings"],{stationType:"combined"});
  for(const [key,working,reserve]of [["system-input",2,1],["system-input-2",1,0]])Object.assign(p.entities[key],{selectedPumpId:pump.id,workingPumpCount:working,reservePumpCount:reserve,flowRate:30,head:30});
  p.entities["station-collectors"].discharge=f.card;
  p.entities["station-spec"].items=[{section:"discharge",position:"04.test",option:"primaryDischargeValve",name:"FIXTURE VALVE",equipmentId:"valve-test",quantity:3,unit:"шт.",details:"PN16"},{section:"discharge",position:"04.test2",option:"secondaryDischargeValve",name:"FIXTURE VALVE",equipmentId:"valve-test",quantity:1,unit:"шт.",details:"PN16"}];
  f.data.items["valve-test"]={equipmentId:"valve-test",revision:"test",source:"GEOMETRY FIXTURE ONLY",kind:"valve",length:100,fidelity:"parametric",issues:[],shape:{kind:"tube",lengthMm:100,outerMm:65,innerMm:50},ports:[{id:"left",point:[0,0,0],axis:[-1,0,0],connection:"flanged",dn:50,pn:16,provisional:false},{id:"right",point:[100,0,0],axis:[1,0,0],connection:"flanged",dn:50,pn:16,provisional:false}]};
  const profile={version:1,profiles:{[pump.id]:{bounds:[0,-20,-20,100,20,100],ports:[{id:"inlet",point:[0,0,0],axis:[-1,0,0],provisional:false},{id:"outlet",point:[100,0,0],axis:[1,0,0],provisional:false}],source:"GEOMETRY FIXTURE ONLY",sourceHash:"a".repeat(64),warnings:[]}}};
  const a=model.buildAssembly(p,[pump],profile,f.data),c=a.components.find(c=>c.id==="collector-discharge"),joints=a.lineJoints.filter(j=>j.b.componentId===c.id);
  assert.equal(c.collector.template.branches.filter(b=>b.role==="branch").length,4);assert.equal(joints.length,4);
  for(const j of joints){const from=model.portPoint(a,j.a),to=model.portPoint(a,j.b);from.forEach((v,i)=>close(v,to[i]));const port=c.ports.find(p=>p.id===j.b.portId);assert.ok(Math.abs(port.point[1])>c.parameters.diameter/2+50);}
  const mount={...defaultCollectorMount(),branchLengthReference:"surface-to-pipe-end",flangeFaceToPipeEndMm:4};
  c.collector.template.mount=mount;p.entities["station-model"].editor={...model.emptyEditor(),assembly:a};
  const fresh=model.buildAssembly(p,[pump],profile,f.data).components.find(c=>c.id==="collector-discharge");assert.deepEqual(fresh.collector.template.mount,mount);
  assert.ok(!model.connectionIssues(a).some(i=>i.id.startsWith("line-")&&i.message.includes("соединение нарушено")));
  // The eccentric suction collector must move as a whole to the same line ends;
  // its branch bodies, flanges and ports share the automatically raised axes.
  f.c.type="suction";f.c.eccentric=true;f.card.calculation=calculateCollector(f.c,f.catalog);
  p.entities["station-collectors"].suction=f.card;
  p.entities["station-spec"].items.push(...p.entities["station-spec"].items.map(row=>({...row,section:"suction",position:row.position.replace("04.","03."),option:row.option.replace("Discharge","Suction")})));
  const suction=model.buildAssembly(p,[pump],profile,f.data),sc=suction.components.find(c=>c.id==="collector-suction"),sj=suction.lineJoints.filter(j=>j.b.componentId===sc.id);
  assert.equal(sc.collector.template.branches.filter(b=>b.role==="branch").length,4);assert.equal(sj.length,4);
  for(const j of sj){const from=model.portPoint(suction,j.a),to=model.portPoint(suction,j.b);from.forEach((v,i)=>close(v,to[i]));}
  const sm=collectorMetal(sc.collector.template);assert.deepEqual(sm.issues,[]);manifold(sm.main);
});
test("surface reference, explicit instrument length, eccentric offset and unsupported saved data are explicit",()=>{
  const f=fixture(),mount={...defaultCollectorMount(),branchLengthReference:"surface-to-pipe-end",instrumentLengthsMm:{"instrument15-0":70,"instrument15-1":70,"instrument20-0":70}},t=buildCollectorTemplate(f.card,f.data,[],"discharge",mount);
  close(t.branches[0].endMm,112.15+57.15);assert.equal(t.branches.filter(b=>b.role==="instrument").length,2);
  const ecc=fixture();ecc.c.type="suction";ecc.c.eccentric=true;ecc.card.configuration=ecc.c;ecc.card.calculation=calculateCollector(ecc.c,{version:"test",components:[],bolts:[]});
  // Preserve a valid dimensional snapshot while changing only the explicitly encoded eccentric variant.
  ecc.card.calculation={...f.calculation,fingerprint:JSON.stringify(ecc.c)};
  const automatic=buildCollectorTemplate(ecc.card,ecc.data,[],"suction");assert.equal(automatic.branches.filter(b=>b.role==="branch").length,3);for(const b of automatic.branches.filter(b=>b.role==="branch"))close(b.origin[2]+b.outerMm/2,automatic.main.outerMm/2);assert.deepEqual(collectorMetal(automatic).issues,[]);assert.equal(automatic.ruleVersion,3);
  const shifted=buildCollectorTemplate(ecc.card,ecc.data,[],"suction",{...defaultCollectorMount(),eccentricOffsetMm:5});assert.equal(shifted.branches.filter(b=>b.role==="branch").length,3);assert.equal(shifted.branches[0].origin[2],5);
  const binding={template:t,hiddenPieceIds:[]};for(const change of [x=>x.template.mount.instrumentLengthsMm=null,x=>x.template.branches[0].axis=[0,2,0],x=>x.template.branches[0].joint="inserted",x=>x.template.ports.push(x.template.ports[0])]){const b=structuredClone(binding);change(b);assert.equal(parseCollectorBinding(b),undefined);}
});

test("horizontal pump outlets rise into a header with downward branches and upward instrument nipples in both circuits",async()=>{
  const {createProject}=await loadTs(new URL("app/project-config.ts",root));
  const pumps=JSON.parse(await readFile(new URL("public/pumps.json",root),"utf8"));
  const profiles=JSON.parse(await readFile(new URL("public/model-assets/manifest.json",root),"utf8"));
  for(const pumpId of ["nu-b1879e1e3807d907","979"]){
    const pump=pumps.find(p=>p.id===pumpId),profile=profiles.profiles[pumpId],original=JSON.stringify(profile);
    assert.ok(pump&&profile);assert.equal(profile.ports.find(p=>p.id==="outlet").axis,undefined);
    const f=fixture(true);f.c.secondary.reserve=1;f.card.calculation=calculateCollector(f.c,f.catalog);
    const p=createProject("Horizontal geometry fixture",{id:"horizontal-test",timestamp:"2026-10-30T00:00:00Z"});
    p.entities["station-settings"].stationType="combined";
    for(const [key,working,reserve]of [["system-input",2,1],["system-input-2",1,1]])Object.assign(p.entities[key],{selectedPumpId:pumpId,workingPumpCount:working,reservePumpCount:reserve});
    p.entities["station-collectors"].discharge=f.card;
    p.entities["station-spec"].items=[...[['primary',3],['secondary',2]].map(([prefix,quantity])=>({section:"discharge",position:`04.${prefix}`,option:`${prefix}DischargeValve`,name:"FIXTURE VALVE",equipmentId:"fixture-valve",quantity,unit:"шт.",details:"PN16",status:"selected"}))];
    f.data.items["fixture-valve"]={equipmentId:"fixture-valve",revision:"fixture",source:"GEOMETRY FIXTURE ONLY",length:100,fidelity:"parametric",issues:[],shape:{kind:"tube",lengthMm:100,outerMm:60.3,innerMm:50},ports:[{id:"left",point:[0,0,0],axis:[-1,0,0]},{id:"right",point:[100,0,0],axis:[1,0,0]}]};
    const snapshot=JSON.stringify([f.card,p.entities["station-spec"]]);
    const a=model.buildAssembly(p,[pump],profiles,f.data),c=a.components.find(c=>c.id==="collector-discharge");
    assert.equal(c.collector.template.pumpBranchOrientation,"bottom");
    const ps=a.components.filter(c=>c.kind==="pump");assert.equal(ps.length,5);
    for(const instance of ps){
      const outlet=instance.ports.find(p=>p.id==="outlet"),source=profile.ports.find(p=>p.id==="outlet");
      assert.deepEqual(outlet.point,source.point);assert.deepEqual(outlet.axis,[0,0,1]);assert.equal(outlet.provisional,source.provisional);
      const start=model.worldPoint(instance,outlet.point),port=c.ports.find(p=>p.id===instance.id),end=model.worldPoint(c,port.point);
      close(end[0],start[0]);close(end[1],start[1]);close(end[2]-start[2],100);
      close(c.position[2]-end[2],c.collector.template.branches.find(b=>b.portId===instance.id).endMm+30);
      model.rotate(port.axis,c.rotation).forEach((v,i)=>close(v,[0,0,-1][i]));
    }
    model.rotate([1,0,0],c.rotation).forEach((v,i)=>close(v,[0,1,0][i]));
    for(const b of c.collector.template.branches.filter(b=>b.role==="instrument"))model.rotate(b.axis,c.rotation).forEach((v,i)=>close(v,[0,0,1][i]));
    for(const j of a.lineJoints){const from=model.portPoint(a,j.a),to=model.portPoint(a,j.b);from.forEach((v,i)=>close(v,to[i]));}
    const metal=collectorMetal(c.collector.template);assert.deepEqual(metal.issues,[]);manifold(metal.main);for(const mesh of Object.values(metal.branches))manifold(mesh);
    const restored=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:a}))).assembly;
    assert.equal(restored.components.find(v=>v.id===c.id).collector.template.pumpBranchOrientation,"bottom");
    const rebuilt=buildCollectorTemplate(f.card,f.data,ps.map(v=>({id:v.id,circuit:v.id.startsWith("pump-2-")?2:1,x:c.ports.find(port=>port.id===v.id).point[0]})),"discharge",{...c.collector.template.mount,branchLengthReference:"surface-to-pipe-end"},c.collector.template.pumpBranchOrientation);
    assert.ok(rebuilt.branches.filter(b=>b.role==="branch").every(b=>b.axis[2]===-1));
    const resizedComponent=applyCollectorTemplate(c,rebuilt),resizedAssembly={...a,components:a.components.map(v=>v.id===c.id?resizedComponent:v)};
    const resized=model.editComponent(resizedAssembly,{id:c.id,patch:{parameters:{...resizedComponent.parameters,diameter:124.3}}}).components.find(v=>v.id===c.id);
    for(const part of rebuilt.pieces.filter(p=>p.id.startsWith("branch-"))){const next=resized.collector.template.pieces.find(p=>p.id===part.id);close(next.position[2],part.position[2]-5);close(next.position[1],part.position[1]);}
    f.data.items["fixture-valve"].length=140;f.data.items["fixture-valve"].ports[1].point[0]=140;
    const taller=model.buildAssembly(p,[pump],profiles,f.data),merged=model.mergeAssembly(restored,taller),header=merged.components.find(v=>v.id===c.id);
    close(header.position[2]-c.position[2],40);close(header.position[0],c.position[0]);
    assert.equal(JSON.stringify(profile),original);assert.equal(JSON.stringify([f.card,p.entities["station-spec"]]),snapshot);
  }
});
test("old individual sgon dimensions keep their surface reference; new empty mounts receive 60 mm stock lengths",()=>{
  const f=fixture(),legacy={...defaultCollectorMount(),instrumentLengthsMm:{'instrument15-0':70}};delete legacy.instrumentDefaultLengthMm;delete legacy.instrumentLengthReference;
  const t=buildCollectorTemplate(f.card,f.data,[],'discharge',legacy),b=t.branches.find(b=>b.id==='instrument15-0');
  close(b.endMm,t.main.outerMm/2+70);assert.equal(b.blankLengthMm,undefined);assert.equal(t.mount.instrumentLengthReference,'surface-to-pipe-end');
  const automatic=t.branches.find(b=>b.id==='instrument20-0');assert.equal(automatic.blankLengthMm,60);close(saddleRings(t.main,automatic).cutLengthMm,60);
});
test("60 mm instrument branches occupy gaps between equal-diameter pump branches instead of their saddle footprints",()=>{
  const f=fixture();f.c.dn=50;f.c.primary.working=1;f.card.calculation=calculateCollector(f.c,f.catalog);
  const t=buildCollectorTemplate(f.card,f.data,[],'discharge');assert.equal(t.branches.filter(b=>b.role==='branch').length,2);assert.equal(t.branches.filter(b=>b.role==='instrument').length,2);
  const bodies=collectorMetal(t);assert.deepEqual(bodies.issues,[]);manifold(bodies.main);for(const b of t.branches.filter(b=>b.role==='instrument')){assert.equal(b.blankLengthMm,60);assert.ok(t.branches.filter(p=>p.role==='branch').every(p=>Math.abs(p.origin[0]-b.origin[0])>60));}
});

test("real DN20 row builds a 60 mm hollow threaded membrane-tank nipple and an open near-wall hole",async()=>{
  const {makeInsertCatalog}=await loadTs(new URL("app/component-insert-catalog.ts",root));
  const {lineGeometry}=await loadTs(new URL("app/line-geometry-catalog.ts",root));
  const source=JSON.parse(await readFile(new URL("public/component-insert-source.json",root),"utf8")),catalog=makeInsertCatalog(source);
  const id="сгоны-резьба-002-r0018",row=source.items.find(p=>p.id===id),snapshot=JSON.stringify(row),f=fixture();
  assert.ok(row);f.card.calculation.bom.find(r=>r.role==="instrument20").componentId=id;
  f.data.items[id]=lineGeometry(row,catalog,{catalog,flanges:{},models:{}});
  const t=buildCollectorTemplate(f.card,f.data,[],"discharge"),b=t.branches.find(b=>b.id==="instrument20-0"),metal=collectorMetal(t);
  assert.ok(b);assert.equal(b.componentId,id);assert.equal(b.outerMm,26.9);close(b.innerMm,21.7);close(saddleRings(t.main,b).cutLengthMm,60);
  assert.equal(b.thread.designation,"3/4″");close(b.thread.pitchMm,25.4/14);assert.deepEqual(metal.issues,[]);
  manifold(metal.main);manifold(metal.branches[b.id]);assert.ok(metal.branches[b.id].positions.length>30000,"helical surface must be present");
  assert.equal(rayHits(metal.branches[b.id],[b.origin[0],0,b.endMm+10],[0,0,-1]).length,0);
  const hits=rayHits(metal.main,[b.origin[0],0,b.endMm+10],[0,0,-1]);close(hits[0].point.z,-t.main.innerMm/2,1e-4);
  assert.equal(JSON.stringify(row),snapshot);assert.ok(parseCollectorBinding({template:t,hiddenPieceIds:[]}));
  const unthreaded=structuredClone(t);delete unthreaded.branches.find(p=>p.id===b.id).thread;
  const cache=new CollectorRenderCache();collectorObject({collector:{template:t,hiddenPieceIds:[]},opacity:1},cache);collectorObject({collector:{template:unthreaded,hiddenPieceIds:[]},opacity:1},cache);assert.equal(cache.builds,2);
});

test("old automatic 115 mm defaults migrate to 60 mm on rebuild while explicit individual dimensions survive",()=>{
  const f=fixture(),legacy={...defaultCollectorMount(),instrumentDefaultLengthMm:115,instrumentLengthsMm:{"instrument15-0":70}};
  delete legacy.instrumentRulesRevision;
  const t=buildCollectorTemplate(f.card,f.data,[],"discharge",legacy);
  assert.equal(t.mount.instrumentDefaultLengthMm,60);assert.equal(t.mount.instrumentRulesRevision,2);
  close(saddleRings(t.main,t.branches.find(b=>b.id==="instrument20-0")).cutLengthMm,60);
  close(saddleRings(t.main,t.branches.find(b=>b.id==="instrument15-0")).cutLengthMm,70);
  f.data.items["nipple-20"].length=110;
  close(saddleRings(t.main,buildCollectorTemplate(f.card,f.data,[],"discharge").branches.find(b=>b.id==="instrument20-0")).cutLengthMm,60);
  const explicit=buildCollectorTemplate(f.card,f.data,[],"discharge",{...defaultCollectorMount(),instrumentDefaultLengthMm:115});
  close(saddleRings(explicit.main,explicit.branches.find(b=>b.id==="instrument20-0")).cutLengthMm,115);
});

test("invalid thread cannot cut into the bore, leave an orphan main hole, or be loaded as trusted geometry",()=>{
  const f=fixture(),t=buildCollectorTemplate(f.card,f.data,[],"discharge"),id="instrument20-0";
  for(const patch of [{depthMm:3},{pitchMm:0},{lengthMm:1000}]){
    const bad=structuredClone(t),b=bad.branches.find(b=>b.id===id);Object.assign(b.thread,patch);
    const metal=collectorMetal(bad);assert.ok(metal.issues.some(i=>/резьба/.test(i)));assert.equal(metal.branches[id],undefined);manifold(metal.main);
    const hits=rayHits(metal.main,[b.origin[0],0,b.endMm+10],[0,0,-1]);close(hits[0].point.z,bad.main.outerMm/2,1e-4);
    if(!patch.lengthMm)assert.equal(parseCollectorBinding({template:bad,hiddenPieceIds:[]}),undefined);
  }
});

test("stale pricing preserves compatible collector geometry and exact ports with an explicit recalculation warning",()=>{
  const f=fixture(),current=buildCollectorTemplate(f.card,f.data,[],"discharge"),stale={...f.card,status:"stale",currentCatalogVersion:"new-price-revision"};
  const t=buildCollectorTemplate(stale,f.data,[],"discharge"),metal=collectorMetal(t);
  assert.deepEqual(t.main,current.main);assert.deepEqual(t.branches,current.branches);assert.deepEqual(t.ports,current.ports);assert.ok(t.issues.some(i=>/устарел/.test(i)));assert.ok(metal.main);assert.equal(Object.keys(metal.branches).length,t.branches.length);
  const changed=structuredClone(stale);changed.configuration.dn=150;
  const invalid=buildCollectorTemplate(changed,f.data,[],"discharge");assert.equal(invalid.main,null);assert.equal(invalid.branches.length,0,"mismatched engineering sizes must not inherit cached geometry");
});

test("configured nipple length, thread toggle and pitch reach the real closed 3D metal without phantom caps",()=>{
  const f=fixture();f.c.instrumentPorts=[{id:"plain",dn:20,state:"occupied",lengthMm:85,threaded:false},{id:"threaded",dn:15,state:"occupied",lengthMm:45,threaded:true,threadPitchMm:1.6,threadLengthMm:10}];f.card.calculation=calculateCollector(f.c,f.catalog);
  const t=buildCollectorTemplate(f.card,f.data,[],"discharge"),plain=t.branches.find(b=>b.id==="instrument-plain-0"),threaded=t.branches.find(b=>b.id==="instrument-threaded-0");
  close(saddleRings(t.main,plain).cutLengthMm,85);close(saddleRings(t.main,threaded).cutLengthMm,45);assert.equal(plain.thread,undefined);assert.equal(threaded.thread.pitchMm,1.6);assert.equal(threaded.thread.lengthMm,10);
  assert.ok(!t.pieces.some(p=>p.id.startsWith("instrument-")&&p.id.endsWith("-plug")));const metal=collectorMetal(t);assert.deepEqual(metal.issues,[]);manifold(metal.main);manifold(metal.branches[plain.id]);manifold(metal.branches[threaded.id]);assert.ok(parseCollectorBinding({template:t,hiddenPieceIds:[]}));
});


test("top-aligned eccentric saddles keep a closed hollow mesh when the branch wall is thinner than the main wall",()=>{
  for(const [od,wall,bod,bwall] of [[114.3,3,60.3,2],[323.9,4,219.1,3],[219.1,6,88.9,3],[114.3,3,60.3,3],[114.3,2,60.3,3],[114.3,3,114.3,3]])for(const sign of [-1,1]){
    const tube={...main,outerMm:od,innerMm:od-2*wall},e=(od-bod)/2;
    const b=branch({origin:[0,0,e],axis:[0,sign,0],outerMm:bod,innerMm:bod-2*bwall,endMm:400});
    const result=collectorMetal({main:tube,branches:[b]});assert.deepEqual(result.issues,[],JSON.stringify({od,wall,bod,bwall,sign}));
    assert.ok(result.branches.b1);manifold(result.main);manifold(result.branches.b1);
    close(Math.max(...result.branches.b1.positions.filter((_,i)=>i%3===2)),od/2);
    const hits=rayHits(result.main,[0,sign*450,e],[0,-sign,0]);assert.ok(hits.length);close(hits[0].point.y,-sign*Math.sqrt((tube.innerMm/2)**2-e**2),.1); // 128-segment main cylinder: sub-0.1 mm chord error
    assert.equal(rayHits(result.branches.b1,[0,sign*450,e],[0,-sign,0]).length,0,"branch channel is open");
    if(wall>bwall){
      assert.ok(result.rings.b1.wallBore);const z=(tube.innerMm/2+e+b.innerMm/2)/2;
      const roof=rayHits(result.main,[0,sign*450,z],[0,-sign,0]);assert.ok(roof.length);close(roof[0].point.y,0,1e-3,"the cut must stop at the midplane above the main bore");
    }
  }
});

test("eccentric template aligns each circuit independently, preserves manual offsets and survives JSON reload",()=>{
  const f=fixture(true);f.c.type="suction";f.c.eccentric=true;f.c.secondary.dn=80;
  const component={...f.catalog.components.find(p=>p.id==='pipe-50'),id:'pipe-80',dn:80,outerDiameter:88.9,innerDiameter:83.9};f.catalog.components.push(component);
  f.catalog.valveBolts.push({...f.catalog.valveBolts[0],dn:80});
  f.data.items['pipe-80']={...f.data.items['pipe-50'],equipmentId:'pipe-80',dn:80,outerDiameter:88.9,wall:2.5};
  f.card.calculation=calculateCollector(f.c,f.catalog);f.card.configuration=f.c;
  const original=JSON.stringify(f.card.calculation),t=buildCollectorTemplate(f.card,f.data,[],'suction');
  const branches=t.branches.filter(b=>b.role==='branch');assert.equal(branches.length,4);
  for(const b of branches)close(b.origin[2]+b.outerMm/2,t.main.outerMm/2);
  assert.notEqual(branches[0].origin[2],branches.at(-1).origin[2]);assert.equal(JSON.stringify(f.card.calculation),original);
  const mesh=collectorMetal(t);assert.deepEqual(mesh.issues,[]);manifold(mesh.main);for(const body of Object.values(mesh.branches))manifold(body);
  const loaded=parseCollectorBinding(JSON.parse(JSON.stringify({template:t,hiddenPieceIds:[]})));assert.ok(loaded);assert.equal(loaded.template.geometryKey,t.geometryKey);
  for(const offset of [0,5]){const manual=buildCollectorTemplate(f.card,f.data,[],'suction',{...defaultCollectorMount(),eccentricOffsetMm:offset});assert.ok(manual.branches.filter(b=>b.role==='branch').every(b=>b.origin[2]===offset));}
  const legacy=structuredClone(t);legacy.ruleVersion=1;assert.ok(parseCollectorBinding({template:legacy,hiddenPieceIds:[]}));
});


test("vertical collector collar neck meets pipe end and loose flange stays behind the mating face",()=>{
  for(const orientation of ["side","bottom"]){
    const f=fixture(true),t=buildCollectorTemplate(f.card,f.data,[],"discharge",defaultCollectorMount(),orientation);
    for(const b of t.branches.filter(b=>b.role==="branch")){
      const tip=model.add(b.origin,b.axis.map(v=>v*b.endMm)),port=t.ports.find(p=>p.id===b.portId);
      const collar=t.pieces.find(p=>p.id===b.id+"-collar"),flange=t.pieces.find(p=>p.id===b.id+"-looseFlange");
      const point=(p,x)=>model.add(p.position,model.rotate([x,0,0],p.rotation));
      point(collar,collar.shape.lengthMm).forEach((v,i)=>close(v,tip[i]));
      point(collar,0).forEach((v,i)=>close(v,port.point[i]));
      point(flange,0).forEach((v,i)=>close(v,point(collar,collar.shape.lipThicknessMm)[i]));
      // Metal is entirely on the collector side of the mating plane, not in the valve.
      for(const p of [collar,flange])for(const x of [0,p.shape.lengthMm]){
        const d=model.subtract(point(p,x),port.point);
        assert.ok(d.reduce((sum,v,i)=>sum+v*b.axis[i],0)<=1e-6);
      }
    }
  }
});

test("welded collector end flanges and side/bottom branch faces use the accepted 5 mm seat",()=>{
  for(const material of ["st20","aisi304"])for(const orientation of ["side","bottom"]){
    const f=fixture(),pn=material==="st20"?16:25;
    f.c.material=material;f.c.pn=pn;f.c.primary.pn=pn;
    for(const c of f.catalog.components){c.material=material;c.pn=pn;}
    f.catalog.valveBolts=f.catalog.valveBolts.map(b=>({...b,material,pn}));
    for(const dn of [50,100]){
      const pipe=f.data.items[`pipe-${dn}`],id=`weld-${dn}`,od=pipe.outerDiameter;
      f.catalog.components.push({id,kind:"weldFlange",dn,pn,material,name:id,price:20,source:"GEOMETRY FIXTURE ONLY"});
      f.data.items[id]={equipmentId:id,kind:"weldFlange",length:20,source:"GEOMETRY FIXTURE ONLY",fidelity:"parametric",shape:{kind:"flange",lengthMm:20,innerMm:od+1,outerMm:od+80,boltHoles:4,boltCircleMm:od+45,boltHoleMm:10},ports:[],issues:[]};
    }
    f.card.calculation=calculateCollector(f.c,f.catalog);
    const before=JSON.stringify(f.card.calculation),t=buildCollectorTemplate(f.card,f.data,[],"discharge",defaultCollectorMount(),orientation);
    const flangePieces=t.pieces.filter(p=>p.id.endsWith("-weldFlange"));assert.equal(flangePieces.length,5);
    assert.equal(JSON.stringify(f.card.calculation),before);
    for(const p of flangePieces){
      assert.equal(p.shape.kind,"flange");
      const end=p.id.startsWith("end-"),left=p.id.startsWith("end-left");
      const b=end?null:t.branches.find(b=>p.id===b.id+"-weldFlange");
      const axis=end?[left?-1:1,0,0]:b.axis;
      const tip=end?[(left?-1:1)*t.main.lengthMm/2,0,0]:model.add(b.origin,b.axis.map(v=>v*b.endMm));
      const port=t.ports.find(port=>port.id===(end?`network-${left?"left":"right"}`:b.portId));
      const pipePoint=model.add(p.position,model.rotate([5,0,0],p.rotation));
      pipePoint.forEach((v,i)=>close(v,tip[i]));
      p.position.forEach((v,i)=>close(v,port.point[i]));
      close(model.subtract(port.point,tip).reduce((sum,v,i)=>sum+v*axis[i],0),5);
    }
    const object=collectorObject({collector:{template:t,hiddenPieceIds:[]},opacity:1});
    for(const p of flangePieces){const group=object.children.find(c=>c.userData.pieceId===p.id);assert.ok(group?.children.some(c=>c.isMesh),p.id);}
    object.traverse(o=>{if(o.isMesh||o.isLineSegments){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
    assert.ok(parseCollectorBinding(JSON.parse(JSON.stringify({template:t,hiddenPieceIds:[]}))));
    const unknown=buildCollectorTemplate(f.card,f.data,[],"discharge",{...defaultCollectorMount(),flangeFaceToPipeEndMm:null});
    assert.ok(unknown.pieces.filter(p=>p.id.endsWith("-weldFlange")).every(p=>p.shape.kind==="marker"));
    f.data.items["weld-100"].shape.innerMm=100;
    const invalid=buildCollectorTemplate(f.card,f.data,[],"discharge");
    assert.ok(invalid.pieces.filter(p=>p.id.startsWith("end-")).every(p=>p.shape.kind==="marker"),"5 mm must not bypass bore compatibility");
  }
});

test("legacy unset flange seating migrates once; explicit values and cleared current settings survive",()=>{
  const legacy={...defaultCollectorMount(),flangeFaceToPipeEndMm:null};delete legacy.flangeSeatingRevision;
  const migrated=resolveCollectorMount(legacy);assert.equal(migrated.flangeFaceToPipeEndMm,5);
  assert.deepEqual(resolveCollectorMount(migrated),migrated);
  for(const value of [0,4,8])assert.equal(resolveCollectorMount({...legacy,flangeFaceToPipeEndMm:value}).flangeFaceToPipeEndMm,value);
  assert.equal(resolveCollectorMount({...migrated,flangeFaceToPipeEndMm:null}).flangeFaceToPipeEndMm,null);
});
