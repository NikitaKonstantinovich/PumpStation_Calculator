import {readFile,writeFile} from 'node:fs/promises';
import {catalogNozzle} from './build-pump-nozzles.mjs';
const pumps=JSON.parse(await readFile('public/pumps.json','utf8'));
const metadata=Object.fromEntries(pumps.map(p=>[p.id,{
  ...Object.fromEntries(['manufacturer','series','model','type','nominalFlow','power'].map(k=>[k,p[k]??null])),
  inletDn:catalogNozzle(p,'inlet')?.dn??null,outletDn:catalogNozzle(p,'outlet')?.dn??null,
  active:p.active!==false,selectable:p.selectable!==false,
}]));
await writeFile('data/base-values-pumps.json',JSON.stringify(metadata));
