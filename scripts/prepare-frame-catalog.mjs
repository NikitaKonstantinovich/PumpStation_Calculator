import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadTs} from '../tests/load-ts.mjs';
const {frameAnchors,frameVariants}=await loadTs(new URL('../app/frame-calculation/catalog.ts',import.meta.url));
const directory=resolve(process.argv[2]??'../../../../Equipment/Frames/Generated/bent-410-v1');
const manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));
const checked=JSON.parse(await readFile(join(directory,'verification.json'),'utf8'));
if(manifest.length!==90||checked.length!==90||new Set(manifest.map(v=>v.id)).size!==90)throw Error('Verify all 90 native variants before publishing');
const sha=b=>createHash('sha256').update(b).digest('hex');
const anchors=frameAnchors(JSON.parse(await readFile('public/binding-components.json','utf8')).items);
const rows=frameVariants(anchors,true),models=new Map();
await mkdir('public/model-assets',{recursive:true});
const items=[];
for(const variant of rows){
 const cad=manifest.find(v=>v.id===variant.id),reopened=checked.find(v=>v.id===variant.id);
 if(!cad||!reopened)throw Error('Missing reopened native model '+variant.id);
 const native=join(directory,cad.native),mesh=join(directory,cad.stl),step=join(directory,cad.step);
 if(sha(await readFile(native))!==cad.nativeHash)throw Error('Native hash mismatch');
 const bytes=await readFile(mesh),count=bytes.readUInt32LE(80);
 if(bytes.length!==84+50*count||!count||sha(bytes)!==cad.stlHash)throw Error('STL is invalid');
 const bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
 for(let i=0;i<count;i++)for(let v=0;v<3;v++)for(let a=0;a<3;a++){
   const x=bytes.readFloatLE(84+i*50+12+v*12+a*4);
   if(!Number.isFinite(x))throw Error('Invalid STL coordinate');
   bounds[a]=Math.min(bounds[a],x);bounds[a+3]=Math.max(bounds[a+3],x);
 }
 if([0,1,2].some(i=>Math.abs(bounds[i+3]-bounds[i]-(cad.boundsMm[i+3]-cad.boundsMm[i]))>.15))throw Error('STL units or envelope mismatch '+variant.id);
 // SOLIDWORKS may export STL in the positive octant. Restore the native origin,
 // applying translation only (no fitting, scaling or deformation).
 const translation=bounds.slice(0,3).map((v,i)=>cad.boundsMm[i]-v);
 for(let i=0;i<count;i++)for(let v=0;v<3;v++)for(let a=0;a<3;a++){
   const offset=84+i*50+12+v*12+a*4;bytes.writeFloatLE(bytes.readFloatLE(offset)+translation[a],offset);
 }
 const meshHash=sha(bytes);
 const sourceHash=sha(await readFile(step)),meshUrl=`/model-assets/model-${sourceHash}-v1.stl`;
 await writeFile('public'+meshUrl,bytes);
 models.set(sourceHash,{sourceHash,meshHash,meshUrl,bounds:cad.boundsMm,source:step,sourceMeshHash:cad.stlHash,translationMm:translation});
 const data={...variant,massKg:cad.massKg,cad:native.replaceAll('\\','/'),hash:cad.nativeHash,stl:meshUrl,boundsMm:cad.boundsMm,verified:true,drilling:'project-specific-separate',templateHash:cad.templateHash};
 const field=(column,value)=>({column,headerPath:[column],value});
 items.push({id:variant.id,catalogId:'рама',family:'Рамы гнутые 410 мм',fields:[field('Наименование',`Рама гнутая 410×${variant.lengthMm}×${variant.thicknessMm}, ${variant.color==='blue'?'синяя':'красная'}`),field('Масса, кг',cad.massKg),field('FRAME_VARIANT',data),field('Расчёт цены',variant.price)],prices:variant.price.value===null?[]:[{label:'Расчётная цена за шт.',amount:variant.price.value,currency:'RUB'}]});
}
await mkdir('data',{recursive:true});
await writeFile('data/frame-models.json',JSON.stringify([...models.values()],null,2));
await writeFile('data/frame-catalog-import.json',JSON.stringify({schema:1,prepared:new Date().toISOString(),items},null,2));
console.log(JSON.stringify({catalogItems:items.length,verifiedNative:checked.length,verifiedMeshes:models.size}));
