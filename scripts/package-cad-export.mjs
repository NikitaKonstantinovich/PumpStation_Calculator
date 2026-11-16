import {access,cp,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const destination=process.argv[2]&&resolve(process.argv[2]);
if(!destination||process.argv.length!==3)throw Error('Usage: node scripts/package-cad-export.mjs <new-release-directory>');
const service=resolve(destination,'cad-service'),runner=resolve(destination,'cad-runner');
for(const path of [service,runner]){
  let exists=false;try{await access(path);exists=true;}catch{}
  if(exists)throw Error('CAD release destination already exists: '+path);
}
const compiled=resolve(root,'services/solidworks-export/runner/bin/Release/net9.0-windows');
await access(resolve(compiled,'SolidWorksExport.exe'));
const catalogs=['stamped-loose-flanges.json','solidworks-parts.json','solidworks-gaskets.json','flange-dimensions.json',
  'instrument-mounts.json','tank-models.json','tank-channel-models.json','valve-control-mounts.json','line-valve-models.json',
  'line-gasket-models.json','collar-cad-models.json','frame-cabinet-models.json'];
for(const name of catalogs)await access(resolve(root,'data',name));
await mkdir(resolve(service,'data'),{recursive:true});
for(const name of ['server.py','prepare.py'])await cp(resolve(root,'services/solidworks-export',name),resolve(service,name));
for(const name of catalogs)await cp(resolve(root,'data',name),resolve(service,'data',name));
await cp(resolve(root,'services/solidworks-export/acceptance'),resolve(service,'acceptance'),{recursive:true});
await cp(compiled,runner,{recursive:true});
console.log('CAD service, runner and matching catalogues packaged: '+destination);
