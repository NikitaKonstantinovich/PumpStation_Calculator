import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {cadContents,cadTransform}=await loadTs(new URL('../app/cad-export.ts',import.meta.url));
const base={id:'insertion',name:'Вставка',kind:'equipment',position:[100,20,30],rotation:[0,90,0],hidden:false,locked:false,opacity:1,ports:[],parameters:{length:127,width:140,height:140,diameter:140,routeOffset:0}};
const collar={kind:'collar',lengthMm:30,outerMm:139.7,innerMm:133.7,lipOuterMm:188,lipThicknessMm:3};
const reducer={kind:'reducer-outline',lengthMm:127,outerMm:139.7,innerMm:127.1,smallOuterMm:88.9,smallInnerMm:77.7,offset:[0,0,25.4]};
const piece=(id,shape)=>({id,componentId:id,name:id,role:id,position:[4,0,0],rotation:[0,0,180],shape,ports:[],source:'Размеры расчёта',fidelity:'outline'});
test('dimensioned collar and eccentric reducer export as solids with original poses, subassembly and simplification notes',()=>{
  const pieces=[piece('collar',collar),piece('reducer',reducer)];
  const c={...base,insertion:{hiddenPieceIds:[],template:{geometry:{pieces},issues:[]}}};
  const r=cadContents({components:[c]});
  assert.deepEqual(r.instances.map(i=>i.geometry.kind),['collar','reducer']);
  for(let i=0;i<2;i++){
    assert.deepEqual(r.instances[i].transform,cadTransform(c,pieces[i]));
    assert.equal(r.instances[i].subassembly.id,c.id);
    assert.match(r.instances[i].geometry.modelNote,/упрощ/);
  }
  assert.equal(r.warnings.length,2);
});
test('unknown or incomplete geometry is still omitted',()=>{
  const pieces=[piece('missing-wall',{...collar,innerMm:undefined}),piece('missing-offset',{...reducer,offset:undefined}),piece('marker',{kind:'marker'})];
  const r=cadContents({components:[{...base,insertion:{hiddenPieceIds:[],template:{geometry:{pieces},issues:[]}}}]});
  assert.ok(r.instances.every(i=>i.geometry.kind==='unavailable'));
});
test('WAV 8 layout exports at the saved mounting pose and remains explicitly a layout model',()=>{
  const c={...base,id:'tank',tankMount:{role:'tank',volume:8},bounds:[-100,-100,0,100,100,311]};
  const r=cadContents({components:[c]});
  assert.equal(r.instances[0].geometry.kind,'tank-envelope');
  assert.equal(r.instances[0].geometry.diameterMm,200);
  assert.equal(r.instances[0].geometry.heightMm,311);
  assert.deepEqual(r.instances[0].transform,cadTransform(c));
  assert.match(r.warnings[0],/упрощ/);
});
