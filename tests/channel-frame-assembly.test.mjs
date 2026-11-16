import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {pump,inputs} from './fixtures/channel-frame.mjs';
const bundled=await build({stdin:{resolveDir:fileURLToPath(new URL('../',import.meta.url)),contents:`
 export * from './app/model-editor/channel-frame-assembly';
 export {applyChannelFrame} from './app/model-editor/channel-frame';
 export {calculateChannelFrame} from './app/frame-calculation/channel';
 export {normalizeEditor,mergeAssembly,createHistory,execute,undo,redo} from './app/model-editor/model';
 export {componentObject,componentRenderState,sameComponentGeometry,updateComponentAppearance,disposeObject} from './app/model-editor/geometry';
 export {snapGeometry} from './app/model-editor/snap-geometry';
 export {cadContents} from './app/cad-export';
 `},bundle:true,platform:'node',format:'esm',write:false});
const api=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`);
function fixture(){
 const c={id:'frame',name:'Frame',kind:'frame',position:[0,0,0],rotation:[0,0,0],hidden:false,locked:false,opacity:1,ports:[],sourceNote:'test',parameters:{length:1,width:1,height:1,diameter:0,routeOffset:0}};
 api.applyChannelFrame(c,api.calculateChannelFrame([pump],inputs).geometry,'blue','test');return c;
}
const assembly=c=>({version:1,sourceFingerprint:'test',components:[c]});

test('frame pieces retain their selection, visibility and opacity through storage, undo and composition refresh',()=>{
 const initial=fixture(),geometry=structuredClone(initial.channelFrame);
 let c=api.setChannelFramePiece(initial,'pump-row-0',{hidden:true});c=api.setChannelFramePiece(c,'front',{opacity:.3});
 const saved=api.normalizeEditor({version:1,assembly:assembly(c),selectedId:c.id,selectedPieceId:'front'});
 assert.deepEqual(saved.assembly.components[0].channelFrameAssembly,c.channelFrameAssembly);assert.equal(saved.selectedPieceId,'front');
 assert.deepEqual(c.channelFrame,geometry);
 const merged=api.mergeAssembly(saved.assembly,assembly(fixture())).components[0];assert.deepEqual(merged.channelFrameAssembly,c.channelFrameAssembly);
 let history=api.execute(api.createHistory(assembly(initial)),assembly(c));history=api.undo(history);assert.equal(history.present.components[0].channelFrameAssembly,undefined);
 history=api.redo(history);assert.deepEqual(history.present.components[0].channelFrameAssembly,c.channelFrameAssembly);
 const parsed=api.parseChannelFrameAssembly({version:1,hiddenPieceIds:['front','missing','front'],pieceOpacities:{front:.4,rear:NaN,left:3,missing:.5}},geometry);
 assert.deepEqual(parsed,{version:1,hiddenPieceIds:['front'],pieceOpacities:{front:.4}});
});

test('each rendered channel has independent appearance; toggles preserve meshes and remove hidden drilling snaps',()=>{
 const before=fixture(),next=api.setChannelFramePiece(api.setChannelFramePiece(before,'pump-row-0',{hidden:true}),'front',{opacity:.3});
 const a=assembly(before),object=api.componentObject(a,before),pieces=new Map();object.traverse(o=>{if(o.userData.pieceId)pieces.set(o.userData.pieceId,o);});
 assert.equal(pieces.size,before.channelFrame.members.length);
 assert.equal(new Set([...pieces.values()].map(o=>o.material)).size,pieces.size);
 assert(api.sameComponentGeometry(api.componentRenderState(a,before),api.componentRenderState(assembly(next),next)));
 api.updateComponentAppearance(object,next,before);
 assert.equal(pieces.get('pump-row-0').visible,false);assert.equal(pieces.get('front').material.opacity,.3);assert.equal(pieces.get('rear').material.opacity,1);
 api.updateComponentAppearance(object,{...next,opacity:.5},next);assert.equal(pieces.get('front').material.opacity,.15);
 api.updateComponentAppearance(object,before,{...next,opacity:.5});assert.equal(pieces.get('pump-row-0').visible,true);assert.equal(pieces.get('front').material.opacity,1);
 const hiddenIds=before.channelFrame.holes.filter(h=>h.memberId==='pump-row-0').map(h=>h.id),snaps=api.snapGeometry(assembly(next),[]);
 assert(hiddenIds.length);assert(!snaps.points.some(p=>hiddenIds.some(id=>p.id.includes(id))));
 assert(snaps.points.some(p=>p.id.includes('pump-1-0-hole-2')));
 api.disposeObject(object);
});

test('CAD exports channels under one frame subassembly with stable part IDs and per-part visibility',()=>{
 const c=api.setChannelFramePiece(fixture(),'front',{hidden:true}),instances=api.cadContents(assembly(c)).instances;
 assert.equal(instances.length,c.channelFrame.members.length);
 assert.deepEqual(instances.map(p=>p.pieceId),c.channelFrame.members.map(m=>m.id));
 assert(instances.every(p=>p.subassembly?.id==='frame'&&p.subassembly.name===c.name));
 assert.equal(instances.filter(p=>p.hidden).length,1);assert(instances.find(p=>p.pieceId==='front').hidden);
 assert(instances.every(p=>p.geometry.kind==='channel-member'));
});
