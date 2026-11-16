// Reproducible read-only source import. No catalogue/snapshot is modified.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readCatalogSnapshot} from '../services/local-storage/node-catalog.mjs';
const app=fileURLToPath(new URL('../',import.meta.url)),root=resolve(app,'../../..');
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const snapshotArg=process.argv.find(a=>a.startsWith('--snapshot='))?.slice(11);
const catalog=snapshotArg?(await read(resolve(app,snapshotArg))).pump_catalog_v2:readCatalogSnapshot(resolve(root,'database/catalog-v2/pumps.sqlite'));
const normal=(await read(resolve(root,'Equipment/Pumps/3D_Normalized/normalization-index.json'))).models;
const prepared=(await read(resolve(app,'data/prepared-pump-cad-models.json'))).models;
const tables=await read(resolve(root,'outputs/horizontal-pump-mounting-audit-2026-11-14/xst-dimension-tables.json'));
// The high-power table has an explicitly blank C1 cell on several rows.
// Preserve that blank rather than shifting h1 and discarding complete port data.
for(const line of (await readFile(resolve(app,'outputs/pump-heights-round5/leo/XST-gt-7.5-page2.txt'),'utf8')).split('\n')){
 const cells=line.trim().split(/\s+/),model=cells.shift();if(!/^XST\d{2}-\d{3}K?\/\d+$/.test(model??''))continue;
 const nums=cells.map(Number);if(nums.length===18)nums.splice(8,0,null);if(nums.length!==19||nums.some(v=>v!==null&&!Number.isFinite(v)))throw Error('Invalid XST table row');
 const keys='DNM DNA a w x h2 B1 C C1 h1 m m1 n n1 s B H L K'.split(' ');
 tables[model]={path:'frontend/work/nodes-3001-d2696a2/outputs/pump-heights-round5/leo/XST-gt-7.5.pdf',page:2,values:Object.fromEntries(keys.map((k,i)=>[k,nums[i]]))};
}
const drawings=new Map((await read(resolve(app,'data/pump-drawings-reviewed.json'))).rows.map(r=>[r.variantId,r]));
const explicit=await read(resolve(app,'data/end-suction-port-reviews.json'));
const variants={},cad={},missing=[];
const identity=p=>({manufacturer:p.manufacturer,series:p.series,model:p.model,article:p.article??null,execution:p.execution??null,powerKw:p.power??null,frequencyHz:p.frequencyHz??null});
const signature=p=>JSON.stringify((p.dimensions?.sourceValues??[]).map(v=>[v.key,v.valueMm]).sort((a,b)=>a[0].localeCompare(b[0],'en')));
const near=(a,b)=>a?.length===b?.length&&a.every((v,i)=>Math.abs(v-b[i])<.01);
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const spatial=(p,v,source,rule)=>{
 const {x,z,base,l,w,h}=v;if(![x,z,base].every(finite)||l!=null&&!finite(l))throw Error('Invalid port dimensions '+p.id);
 return {version:1,units:'mm',coordinateSystem:'inlet',boundsMm:[0,w?-w/2:null,-base,l??null,w?w/2:null,h?h-base:null],
  ports:[{id:'inlet',point:[0,0,0],axis:[-1,0,0],source},{id:'outlet',point:[x,0,z],axis:[0,0,1],source}],source,rule,
  issues:['Координаты по справочному размерному чертежу. Соответствие заказному исполнению и монтажные зазоры проверяют отдельно.']};
};
for(const {pump:p} of catalog.items.filter(i=>i.pump.type==='end_suction')){
 const ident=identity(p),drawing=drawings.get(p.id)?.drawings[0],source=drawing?`${drawing.source}${drawing.page?' · PDF '+drawing.page:''} · SHA-256 ${drawing.fileId.split('.')[0]}`:null;
 const values=Object.fromEntries((p.dimensions?.sourceValues??[]).map(v=>[v.key,v.valueMm]));
 let frame,rule,v,origin=source;
 const m=prepared[p.id];
 if(m&&Object.entries(ident).every(([k,v])=>m[k]===v)){
  const n=normal.find(n=>n.outputSha256===m.profile.sourceHash);
  if(n&&n.series==='NIS'&&n.status==='normalized_verified'&&n.connectionPlaneAtOriginVerified&&n.inletRoleStatus==='assigned_by_family_and_connection_geometry'&&near(n.normalizedBboxMm,m.profile.bounds)&&n.outletNormalizedMm?.every(Number.isFinite)){
   if(await hash(resolve(root,n.outputFile))!==n.outputSha256)throw Error('Changed STEP '+n.outputFile);
   const evidence=`${n.metadataFile} · STEP SHA-256 ${n.outputSha256}`;
   cad[n.outputSha256]={boundsMm:n.normalizedBboxMm,outletMm:n.outletNormalizedMm,evidence};
   variants[p.id]={identity:ident,cadHash:n.outputSha256};
   continue;
  }
 }
 if(p.series==='MBL'||p.series==='MBL (2026)'){
  const large=p.series==='MBL (2026)'&&['H','K','M','W','X','Y'].every(k=>finite(values[k]));
  const face=large?values.H:values.H2;
  v={x:values.A,z:face-values.H1,base:values.H1,l:values.D,w:Math.max(values.F,values.K??0,values.Y??0),h:Math.max(face,values.H2)};
  rule=`ONIS ${p.series}: X=A; Z=${large?'H':'H2'}−H1. Начало — центр входного фланца; ось X к двигателю, Z вверх.`;
 }else if(p.series==='NBW'){
  v={x:values.a,z:values.h-values.h1,base:values.h1,l:values.f,w:null,h:Math.max(values.h,values.h2??0)};
  rule='Wellmix NBW: X=a, Z=h−h1; h — напорная плоскость, h1 — ось всасывания. Начало — входной фланец.';
 }else if(p.series==='NBS'){
  v={x:values.a,z:values.h2,base:values.h1,l:values.F,w:null,h:Math.max(values.H,values.h3)};
  rule='Wellmix NBS: X=a, Z=h2 — прямой размер от оси входа до напорной плоскости. Начало — входной фланец.';
  if(Math.abs(values.H-values.h1-values.h2)>.01){v.h=null;rule+=' В заводской таблице H не равен h1+h2; высота габарита не назначена, координата выхода использует прямой размер h2.';}
 }else if(p.series==='NBV'){
  if(!finite(values.a)){
   const match=/^NBV 150-(232-110|246-132|266-160|276-185)\/2 /.exec(p.execution??'');
   if(match){Object.assign(values,{a:180,h:280,H:875,H1:155,H2:965,L:({'232-110':1357,'246-132':1684,'266-160':1759,'276-185':1759})[match[1]]});
    origin='outputs/end-suction-import-2026-11-08/aqua-vandjord/NBV-catalogue.pdf · PDF 108, печатная 106; проверенная таблица NBV 150';}
  }
  v={x:values.a,z:values.H-values.h-values.H1,base:values.h+values.H1,l:values.L,w:null,h:Math.max(values.H,values.H2)};
  rule='VANDJORD NBV: X=a, Z=H−(h+H1). H1 — рама-основание, h — ось над её верхом; начало — входной фланец. Таблица NBV, не VNK.';
 }else if(p.series==='XST'&&tables[p.model]){
  const t=tables[p.model],d=Object.fromEntries(Object.entries(t.values).map(([k,v])=>[k,Number(v)]));
  if(d.DNA===p.inletDn&&d.DNM===p.outletDn){v={x:d.a,z:d.h2,base:d.h1,l:null,w:null,h:null};origin=`${t.path} · PDF ${t.page} · SHA-256 ${await hash(resolve(root,t.path))}`;rule='LEO XST: a — от входной плоскости до оси выхода; h2 — выход над осью входа, h1 — ось над основанием. Габариты с ответными фланцами не используются как габариты насоса.';}
 }
 const review=explicit.variants?.[p.id];
 if(review){
  if(!Object.entries(ident).every(([k,v])=>review.identity[k]===v))throw Error('Review identity changed '+p.id);
  if(review.drawingFile!==drawing?.fileId||await hash(resolve(root,'database/catalog-v2/drawing-files',review.drawingFile))!==review.drawingFile.split('.')[0])throw Error('Reviewed drawing changed '+p.id);
  v=review.dimensions;origin=review.source;rule=review.rule;
 }
 if(v&&[v.x,v.z,v.base].every(finite)&&origin){frame=spatial(p,v,origin,rule);variants[p.id]={identity:ident,dimensionSignature:signature(p),drawingFile:drawing?.fileId??null,spatial:frame};}
 else missing.push({id:p.id,...ident,drawing,reason:'Нет проверенной координатной схемы'});
}
const revision=createHash('sha256').update(JSON.stringify({variants,cad})).digest('hex');
const output={version:'end-suction-ports-2026-11-14-v1',revision,snapshotId:catalog.id,variants,cad};
await writeFile(resolve(app,'data/end-suction-ports.json'),JSON.stringify(output,null,2)+'\n');
const out=resolve(app,'outputs/end-suction-ports');await mkdir(out,{recursive:true});
await writeFile(resolve(out,'missing.json'),JSON.stringify(missing,null,2)+'\n');
console.log(JSON.stringify({total:catalog.items.filter(i=>i.pump.type==='end_suction').length,connected:Object.keys(variants).length,cadHashes:Object.keys(cad).length,missing:missing.length,missingBySeries:Object.fromEntries([...new Set(missing.map(r=>r.series))].map(s=>[s,missing.filter(r=>r.series===s).length]))},null,2));
