import test from "node:test";
import assert from "node:assert/strict";
import {loadTs} from "./load-ts.mjs";
import {hardware,realStation,model} from "./fixtures/flange-fasteners.mjs";
const {rebuildFasteners}=await loadTs(new URL("../app/model-editor/flange-fasteners.ts",import.meta.url));
const {waferFastenerLength}=await loadTs(new URL("../app/wafer-fastener-length.ts",import.meta.url));
const hash="6f37639db64dafa2ca7bff1e788143ad6e58de128ba723612abb52c1cd803cd3";
function joint(side,holes=8,sourceHash=hash){
 const inlet=side==="inlet",origin=inlet?[0,0,0]:[100,0,180],axis=inlet?[-1,0,0]:[0,0,1];
 const pose={position:model.add(origin,axis.map(n=>n*2)),rotation:inlet?[0,0,180]:[0,-90,0]};
 const base={kind:"equipment",name:"Fixture",hidden:false,locked:false,opacity:1,sourceNote:"Test mounting dimensions",parameters:{length:19,width:200,height:200,diameter:80,routeOffset:0}};
 const pump={...base,id:"pump-1-test-0",kind:"pump",position:[0,0,0],rotation:[0,0,0],cadSource:{hash:sourceHash,path:"measured-NIS.step"},ports:[{id:side,point:origin,axis,connection:"flanged",dn:inlet?80:65,pn:16}]};
 const flange={...base,...pose,id:"counterflange",shape:{kind:"flange",lengthMm:inlet?19:23,outerMm:inlet?200:185,innerMm:inlet?94:81,boltCircleMm:inlet?160:145,boltHoles:holes,boltHoleMm:18},ports:[{id:"left",point:[0,0,0],axis:[-1,0,0],connection:"flanged",dn:inlet?80:65,pn:16}]};
 // One gasket joins the mating faces. Its two ports belong to one bolt stack.
 const gasket={...base,id:"seal",position:origin,rotation:inlet?[0,0,180]:[0,-90,0],line:{role:"pump-gasket"},ports:[{id:"left",point:[0,0,0],axis:[-1,0,0],connection:"flanged"},{id:"right",point:[2,0,0],axis:[1,0,0],connection:"flanged"}]};
 return rebuildFasteners({version:1,sourceFingerprint:"measured-NIS-fixture",fastenerCatalog:hardware,components:[pump,flange,gasket],lineJoints:[{id:"pump-seal",a:{componentId:pump.id,portId:side},b:{componentId:gasket.id,portId:"left"},kind:"face",overlap:0,provisional:true},{id:"seal-flange",a:{componentId:gasket.id,portId:"right"},b:{componentId:flange.id,portId:"left"},kind:"face",overlap:0,provisional:true}]});
}

test("NIS native flange measurements generate inlet hardware and reject the actual 4/8 outlet mismatch",()=>{
 const inlet=joint("inlet").components.find(c=>c.fastener);
 assert.equal(inlet.fastener.status,"ready",inlet.fastener.issues.join("; "));assert.equal(inlet.fastener.count,8);assert.equal(inlet.fastener.grip,41);
 const mismatch=joint("outlet").components.find(c=>c.fastener);
 assert.equal(mismatch.fastener.status,"blocked");assert.match(mismatch.fastener.issues.join(" "),/Сверловка|Число отверстий/);
 const wrongSource=joint("inlet",8,"0".repeat(64)).components.find(c=>c.fastener);
 assert.equal(wrongSource.fastener.status,"blocked");assert.match(wrongSource.fastener.issues.join(" "),/нет подтверждённых отверстий/);
});

test("DN125 valve hardware matches CAD body and stamped seats in specification and 3D",async()=>{
 const {project,assembly}=await realStation("371",125,"aisi304",1);
 const rows=project.entities["station-spec"].items;
 const valveRows=rows.filter(r=>r.assemblyRole==="primary-valve-fasteners-bolts");
 assert.equal(valveRows.length,2);
 for(const row of valveRows){assert.match(row.name,/М16х140/);assert.equal(row.price,76.7);assert.equal(row.quantity,8);assert.match(row.details,/133 мм/);}
 const sets=assembly.components.filter(c=>c.fastener&&c.fastener.members.some(id=>assembly.components.find(m=>m.id===id)?.line?.role.match(/primary(?:Suction|Discharge)Valve/)));
 assert.equal(sets.length,2);
 for(const c of sets){assert.equal(c.fastener.status,"ready",c.fastener.issues.join("; "));assert.equal(c.fastener.dimensions.length,140);assert.ok(Math.abs(c.fastener.minimumLength-133)<1e-6);assert.equal(c.fastener.hardware.rod.id,"hardware-grover-bl03116140z");}
 const studs=rows.find(r=>r.assemblyRole==="primary-check-fasteners-studs");assert.match(studs.name,/М16х175/);
});

test("CAD length corrections apply only to the matching series, PN and nominal execution",()=>{
 const item={family:"Затвор 017W"};
 assert.equal(waferFastenerLength(item,125,16,55).thickness,56);
 assert.equal(waferFastenerLength(item,80,16,45).thickness,46);
 assert.equal(waferFastenerLength(item,125,25,55).thickness,55);
 assert.equal(waferFastenerLength(item,125,16,100).thickness,100);
 assert.equal(waferFastenerLength(item,125,16,null).thickness,null);
 assert.equal(waferFastenerLength({family:"Другая арматура"},125,16,55).thickness,55);
});
