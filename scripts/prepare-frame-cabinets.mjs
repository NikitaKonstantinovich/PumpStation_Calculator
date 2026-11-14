// Consume FrameCad's read-only hardware export. Restore native origins, never scale.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const directory=resolve(process.argv[2]??'outputs/frame-complete-20261111/cad');
const records=JSON.parse(await readFile(join(directory,'hardware-manifest.json'),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex'),assets={};
for(const record of records.filter(r=>/^cabinet-(600-800-250|800-1000-300)$/.test(r.id))){
 if(!record.geometryVerified)throw Error('Unverified cabinet');
 const bytes=await readFile(join(directory,record.stl)),count=bytes.readUInt32LE(80),box=record.boundsMm;
 if(bytes.length!==84+50*count||hash(bytes)!==record.stlHash)throw Error('Invalid export');
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<count;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++){
  const n=bytes.readFloatLE(84+i*50+12+j*12+k*4);lo[k]=Math.min(lo[k],n);hi[k]=Math.max(hi[k],n);
 }
 for(let k=0;k<3;k++)if(Math.abs(hi[k]-lo[k]-box[k+3]+box[k])>.01)throw Error('Mesh dimensions differ from CAD');
 for(let i=0;i<count;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++){
  const offset=84+i*50+12+j*12+k*4;bytes.writeFloatLE(bytes.readFloatLE(offset)+box[k]-lo[k],offset);
 }
 const meshUrl=`/model-assets/model-${record.sourceHash}-v1.stl`,target='public'+meshUrl;
 try{if(hash(await readFile(target))!==hash(bytes))throw Error('Published mesh is immutable: '+target);}
 catch(error){if(error.code!=='ENOENT')throw error;await writeFile(target,bytes);}
 // Audited circular rear holes in the exported STEP; independent of enclosure size.
 const width=record.id.startsWith('cabinet-600')?600:800,x=width===600?279:379,y=width===600?279:479;
 assets[width]={source:record.path.replace('E:/PumpStation_Calculator/',''),sourceHash:record.sourceHash,meshUrl,meshHash:hash(bytes),bounds:box.map(n=>Math.round(n*1e6)/1e6),mountingPoints:[[-x,-y,0],[-x,y,0],[x,-y,0],[x,y,0]],widthMm:width,heightMm:width===600?800:1000};
}
if(Object.keys(assets).length!==2)throw Error('Both cabinet sizes are required');
await writeFile('data/frame-cabinet-models.json',JSON.stringify({version:1,revision:'frame-cabinets-v1',assets},null,2)+'\n');
console.log('Prepared two native cabinet models');
