import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join,basename} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(process.argv[2]??'../../../../Equipment/Frames/Generated/frame-hardware-v1');
const records=JSON.parse(await readFile(join(root,'hardware-manifest.json'),'utf8'));
const catalog=JSON.parse(await readFile('data/frame-catalog-import.json','utf8'));
const models=JSON.parse(await readFile('data/frame-models.json','utf8'));
const capacities={8:80,10:125,12:175,16:250,20:325,24:500,30:700,36:1000,42:1300,48:1650,56:2000,64:2500};
const sha=b=>createHash('sha256').update(b).digest('hex');
const field=(column,value)=>({column,headerPath:[column],value});
for(const record of records){
 const name=basename(record.path).replace(/\.SLDPRT$/i,''),thread=Number(name.match(/[МM](\d+)/)?.[1]);
 const fields=[field('Наименование',name),field('Паспортные сведения','Масса CAD сохранена как справочная; материал и заводское исполнение требуют подтверждения')];
 let meshUrl;
 if(record.geometryVerified){
   const bytes=await readFile(join(root,record.stl)),n=bytes.readUInt32LE(80);
   if(!n||bytes.length!==84+n*50||sha(bytes)!==record.stlHash)throw Error('Invalid hardware mesh '+record.id);
   meshUrl=`/model-assets/model-${record.sourceHash}-v1.stl`;
   await writeFile('public'+meshUrl,bytes);
   const model={source:record.path,sourceHash:record.sourceHash,meshHash:record.stlHash,meshUrl,bounds:record.boundsMm};
   if(!models.some(m=>m.sourceHash===model.sourceHash))models.push(model);
   fields.push(field('FRAME_CAD',model),field('Справочная масса CAD, кг',record.cadMassKg));
 }
 if(record.id.startsWith('frame-support-')){
   const twoStuds=/EC.*[АA]\s+[МM]/.test(name);
   fields.push(field('FRAME_SUPPORT',{id:record.id,name,threadMm:thread||null,capacityKg:null,massKg:null,priceRub:null,mounting:twoStuds?'two-studs':'other',verified:false,source:'Модель пользователя; паспортная нагрузка и твёрдость не подтверждены',model:meshUrl}));
 }else{
   fields.push(field('FRAME_EYELET',{id:record.id,name,threadMm:thread,capacity45Kg:capacities[thread],massKg:null,priceRub:null,verified:false,source:'Таблица пользователя: 45° в плоскости кольца. Соответствие конкретного DIN580 паспортной таблице требует подтверждения',baseDiameterMm:null}));
 }
 const item={id:record.id,catalogId:'метизы',family:name,fields,prices:[]};
 catalog.items=catalog.items.filter(i=>i.id!==item.id);catalog.items.push(item);
}
await writeFile('data/frame-catalog-import.json',JSON.stringify(catalog,null,2));
await writeFile('data/frame-models.json',JSON.stringify(models,null,2));
console.log({hardware:records.length,geometry:records.filter(r=>r.geometryVerified).length,automaticLoadSelection:'awaiting verified passport data'});
