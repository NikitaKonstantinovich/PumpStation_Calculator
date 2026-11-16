import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {load} from './fixtures/station-specification.mjs';
import {catalogMass} from '../services/local-storage/node-masses.mjs';
const completion=JSON.parse(readFileSync(new URL('../data/component-mass-completion.json',import.meta.url),'utf8'));
const pumps=JSON.parse(readFileSync(new URL('../data/pump-mass-completion.json',import.meta.url),'utf8'));
const {withComponentMasses}=await load('component-mass-catalog'),{readComponentMass}=await load('component-mass');
const fixture=row=>({id:row.id,catalogId:row.identity.catalogId,family:row.identity.family,prices:[],fields:row.identity.article?[{column:'article',headerPath:['Артикул'],value:row.identity.article}]:[]});
const context=row=>({variant:{id:row.variantId,designation:row.designation,manufacturer_article:row.article,mass_kg:null},model:{id:row.modelId},motor:{...row.motor},manufacturer:row.manufacturer,series:row.series});

test('completion covers the reviewed component identities, remains idempotent, and keeps physical values positive',()=>{
 assert.equal(completion.rows.length,1290);assert.equal(new Set(completion.rows.map(r=>r.id)).size,1290);
 const input=completion.rows.map(fixture),output=withComponentMasses(input,false);
 for(const [i,row]of completion.rows.entries()){
  assert(row.kg>0&&Number.isFinite(row.kg));assert(row.source&&row.basis);
  assert.equal(readComponentMass(output[i]).kg,row.kg,row.id);
 }
 assert.deepEqual(withComponentMasses(output,false),output);
 assert(input.every(x=>x.fields.every(f=>!f.column.startsWith('COMPONENT_MASS_'))));
});
test('a reused component ID cannot inherit another article or family mass; explicit user values win',()=>{
 const row=completion.rows.find(r=>r.identity.article),original=fixture(row);
 const changed=structuredClone(original);changed.fields[0].value='another execution';
 assert.equal(readComponentMass(withComponentMasses([changed],false)[0]),null);
 assert.equal(readComponentMass(withComponentMasses([{...original,family:'another family'}],false)[0]),null);
 original.fields.push({column:'manual',headerPath:['Масса, кг'],value:.123});
 assert.equal(readComponentMass(withComponentMasses([original],false)[0]).kg,.123);
 original.fields.at(-1).value=0;
 assert.equal(readComponentMass(original),null);
 assert.equal(readComponentMass(withComponentMasses([original],false)[0]).kg,row.kg);
});
test('pump mass binds the complete execution; existing mass and other model data are never replaced',()=>{
 assert.equal(pumps.rows.length,203);assert.equal(new Set(pumps.rows.map(r=>r.variantId)).size,203);
 for(const row of pumps.rows){const c=context(row),copy=structuredClone(c);assert.equal(catalogMass(c).kg,row.kg);assert.deepEqual(c,copy);}
 const c=context(pumps.rows[0]);
 assert.equal(catalogMass({...c,motor:{...c.motor,power_kw:999}}),undefined);
 assert.equal(catalogMass({...c,variant:{...c.variant,manufacturer_article:'different'}}),undefined);
 assert.deepEqual(catalogMass({...c,variant:{...c.variant,mass_kg:42}}),{kg:42});
});
test('gross values have no estimated badge, package quantities and named pump analogues retain their basis',()=>{
 const r=completion.rows.find(r=>r.basis==='gross');assert.equal(readComponentMass(withComponentMasses([fixture(r)],false)[0]).estimated,false);
 assert.equal(completion.rows.find(r=>r.id==='frame-support-7').kg,.085);
 assert.equal(pumps.rows.filter(r=>r.basis==='gross').length,11);
 assert(pumps.rows.filter(r=>r.basis==='gross').every(r=>!r.estimated));
 assert.equal(pumps.rows.filter(r=>r.estimated).length,4);
 assert(pumps.rows.filter(r=>r.estimated).every(r=>r.evidence.analogueVariantIds.length));
});
