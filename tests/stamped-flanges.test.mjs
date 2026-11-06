import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {loadTs} from "./load-ts.mjs";
const data=JSON.parse(await readFile(new URL("../data/stamped-loose-flanges.json",import.meta.url)));
const {stampedShape,upgradeStampedFlanges}=await loadTs(new URL("../app/model-editor/stamped-flanges.ts",import.meta.url));
const {cadContents}=await loadTs(new URL("../app/cad-export.ts",import.meta.url));
const id="фланцы-006-r0118",stock=data.parts["100"],old={kind:"flange",...data.catalog[id].previous};

test("saved flange switches to the measured profile in place, once, even on a hidden rotated collector",()=>{
  const piece={id:"branch-2-looseFlange",componentId:id,name:"Свободный фланец",position:[9,-80,24],rotation:[10,30,42],shape:old};
  const c={id:"return",kind:"collector",name:"Коллектор",position:[105,6,80],rotation:[30,55,0],parameters:{},hidden:true,collector:{hiddenPieceIds:[],template:{pieces:[piece],issues:[],assumptions:[],branches:[],main:null}}};
  const a={components:[c]},updated=upgradeStampedFlanges(a);
  assert.equal(upgradeStampedFlanges(updated),updated);
  const p=updated.components[0].collector.template.pieces[0];
  assert.equal(p.position,piece.position);assert.equal(p.rotation,piece.rotation);assert.equal(c.collector.template.pieces[0].shape,old);
  assert.equal(p.shape.stampedHash,stock.sourceHash);assert.equal(p.shape.lengthMm,23);assert.equal(p.shape.innerMm,119);
  const ins=cadContents(updated).instances.find(r=>r.pieceId===piece.id);
  assert.ok(ins.hidden);assert.equal(ins.geometry.stampedHash,stock.sourceHash);assert.match(ins.name,/штампованный DN100/);
});
test("DN65 eight-hole PN16 has a distinct project ring and custom bores remain unbound",()=>{
  const shape=(id)=>({kind:"flange",...data.catalog[id].previous});
  const projectRing = stampedShape("фланцы-006-r0116",shape("фланцы-006-r0116"));
  assert.equal(projectRing.stampedHash,data.parts["65-PN16-8"].sourceHash);
  assert.equal(projectRing.boltHoles,8);
  assert.notEqual(projectRing.stampedHash,data.parts["65"].sourceHash);
  assert.equal(stampedShape("фланцы-005-r0093",shape("фланцы-005-r0093")).boltHoles,4);
  assert.equal(stampedShape(id,{...old,innerMm:127}).stampedHash,"missing");
  assert.equal(stampedShape("welded",old),old);
});
test("recover a previously missing DN200 only with the matching seat, lip and 12 holes",()=>{
  const id="фланцы-006-r0121",stock=data.parts["200"];
  const shape={kind:"flange",...data.catalog[id].previous,stampedHash:"missing"};
  const run=(neck,lip,holes)=>upgradeStampedFlanges({components:[{collector:{template:{pieces:[
    {id:"branch-1-collar",shape:{kind:"collar",outerMm:neck,lipOuterMm:lip}},
    {id:"branch-1-looseFlange",componentId:id,shape:{...shape,boltHoles:holes}}]}}}]}).components[0].collector.template.pieces[1].shape;
  assert.equal(run(219.1,270,12).stampedHash,stock.sourceHash);
  for(const params of [[226,270,12],[219.1,225,12],[219.1,270,8]]) assert.equal(run(...params).stampedHash,"missing");
});
test("restore six matching DN65 collars and rings in their original poses and clear obsolete source notes",async()=>{
  const {collar,flange}=JSON.parse(await readFile(new URL("../data/dn65-project-fittings.json",import.meta.url)));
  const {stampMissing}=await loadTs(new URL("../app/model-editor/stamped-flanges.ts",import.meta.url));
  const issue=flange.componentId+": "+stampMissing;
  const pieces=["left","right"].flatMap(id=>[
    {id,componentId:collar.componentId,fidelity:"outline",shape:{kind:"collar",...collar.dimensions},position:[0,0,0]},
    {id:id+"-loose",componentId:flange.componentId,shape:{kind:"flange",...flange.dimensions,stampedHash:"missing"},position:[3,0,0]},
  ]);
  const component={sourceNote:issue,line:{issues:[issue]},insertion:{hiddenPieceIds:[],template:{
    source:{recordId:"saved-dn65",revision:3},status:"incomplete",issues:[issue],warnings:[],geometry:{pieces}}}};
  const input={components:[0,1,2].map(()=>structuredClone(component))};
  const repaired=upgradeStampedFlanges(input);
  for(const c of repaired.components){
    assert.equal(c.insertion.template.status,"layout");
    assert.ok(!c.sourceNote.includes(stampMissing));
    assert.ok(c.sourceNote.includes(flange.basis));
    const rest=c.insertion.template.geometry.pieces;
    assert.equal(rest.filter(p=>p.shape.modelHash===collar.sourceHash).length,2);
    assert.equal(rest.filter(p=>p.shape.stampedHash===flange.sourceHash).length,2);
    assert.deepEqual(rest.map(p=>p.position),pieces.map(p=>p.position));
  }
  assert.equal(upgradeStampedFlanges(repaired),repaired);
  const wrong=structuredClone(input);
  wrong.components[0].insertion.template.geometry.pieces[0].shape.innerMm=72.1;
  assert.equal(upgradeStampedFlanges(wrong).components[0].insertion.template.geometry.pieces[0].shape.kind,"collar");
});
test("each named original has one browser triangulation with the same axial extent",async()=>{
  for(const v of Object.values(data.parts)){
    const bytes=await readFile(new URL("../../"+v.source,import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"),v.sourceHash);
    const stl=await readFile(new URL("../public/model-assets/stamped-"+v.sourceHash+".stl",import.meta.url));
    const n=stl.readUInt32LE(80);assert.equal(stl.length,84+50*n);
    let lo=Infinity,hi=-Infinity;
    for(let i=0;i<n;i++) for(let j=0;j<3;j++){const x=stl.readFloatLE(84+50*i+12+12*j);lo=Math.min(lo,x);hi=Math.max(hi,x);}
    assert.ok(Math.abs(lo)<.01 && Math.abs(hi-v.dimensions.lengthMm)<.01);
  }
});
