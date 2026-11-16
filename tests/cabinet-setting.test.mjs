import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const load=p=>loadTs(new URL('../app/'+p+'.ts',import.meta.url));
const {initialTools}=await load('node-tools/factory'),{upgradeDocument}=await load('node-tools/product'),{compileTools}=await load('node-tools/compiler'),{evaluateProduct}=await load('node-tools/runtime');
const {addCabinetProjectSetting,migrateCabinetProjectSetting}=await load('node-tools/cabinet-setting-upgrade');
test('cabinet setting is an equipment option with an editable boolean binding and survives explicit document upgrade',()=>{
 const doc=upgradeDocument(initialTools()),program=compileTools(doc,'cabinet-setting-test');assert.deepEqual(addCabinetProjectSetting(doc,'settings'),doc);
 const all=v=>[v,...(v.children??[]).flatMap(all)];
 for(const value of [false,true]){const result=evaluateProduct(program,'settings',{settings:{values:{cabinetSeparate:value},defaults:{},role:'admin'}});assert.equal(result.value.cabinetSeparate,value);const section=all(result.view).find(v=>v.kind==='section'&&v.label==='Комплектация'),binding=all(section).find(v=>v.binding?.key==='cabinetSeparate').binding;assert.equal(binding.value,value);assert.equal(binding.permission,'options');assert(binding.editable);}
});
test('legacy true and false migrate once; explicit project settings win and other frame inputs survive',()=>{
 const program={tools:[{id:'settings'},{id:'frame'}],plans:{settings:{steps:[{id:'settings/option',parameter:{key:'cabinetSeparate'}},{id:'settings/tank',parameter:{key:'membraneTank'}}]},frame:{steps:[{id:'frame/in',operation:'frame.inputs'}]}}};
 for(const value of [false,true])for(const explicit of [undefined,false,true]){const contexts={settings:{values:explicit===undefined?{}:{cabinetSeparate:explicit}},frame:{values:{channelInputs:{cabinetSeparate:value,cabinetEnclosureWidthMm:800},other:14}}};migrateCabinetProjectSetting(program,contexts);assert.equal(contexts.settings.values.cabinetSeparate,explicit??value);assert.deepEqual(contexts.frame.values,{channelInputs:{cabinetEnclosureWidthMm:800},other:14});const before=structuredClone(contexts);migrateCabinetProjectSetting(program,contexts);assert.deepEqual(contexts,before);}
});
