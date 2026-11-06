import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {copyFile,readFile,realpath} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const metadata=['instrument-mounts.json','tank-models.json','valve-control-mounts.json','dn65-project-fittings.json'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

/** These meshes are referenced directly by assembly code, independently of a
 * project's pinned library manifest. Publish immutable files only; never change
 * a saved project's catalogue version or replace a different existing mesh. */
export function runtimeModelAssets(documents){
  const assets=new Map();
  function visit(value){
    if(!value||typeof value!=='object')return;
    if(Object.hasOwn(value,'meshUrl')){
      if(!/^[a-f0-9]{64}$/.test(value.sourceHash??'')||!/^[a-f0-9]{64}$/.test(value.meshHash??'')
        ||![`/model-assets/model-${value.sourceHash}-v1.stl`,`/model-assets/stamped-${value.sourceHash}.stl`].includes(value.meshUrl))throw new Error('Invalid runtime CAD metadata');
      const name=value.meshUrl.slice('/model-assets/'.length),prior=assets.get(name);
      if(prior&&prior.meshHash!==value.meshHash)throw new Error(`Conflicting runtime CAD metadata: ${name}`);
      assets.set(name,{name,meshHash:value.meshHash});
    }
    for(const child of Object.values(value))visit(child);
  }
  for(const document of documents)visit(document);
  return [...assets.values()];
}

export async function syncRuntimeModelAssets({library,source=resolve(root,'public/model-assets'),documents}={}){
  if(typeof library!=='string'||!library)throw new Error('PROJECT_MODEL_LIBRARY is required');
  const sourceRoot=await realpath(source),targetRoot=await realpath(library);
  const assets=runtimeModelAssets(documents??await Promise.all(metadata.map(async name=>JSON.parse(await readFile(resolve(root,'data',name),'utf8')))));
  let copied=0;
  for(const asset of assets){
    const input=await realpath(resolve(sourceRoot,asset.name));
    if(dirname(input)!==sourceRoot)throw new Error(`Runtime CAD source escapes its directory: ${asset.name}`);
    const bytes=await readFile(input);
    if(hash(bytes)!==asset.meshHash)throw new Error(`Runtime CAD source checksum mismatch: ${asset.name}`);
    const target=resolve(targetRoot,asset.name);
    try{
      await realpath(target).then(path=>{if(dirname(path)!==targetRoot)throw new Error('Runtime CAD target escapes its directory');});
    }catch(error){
      if(error.code!=='ENOENT')throw error;
      try{await copyFile(input,target,constants.COPYFILE_EXCL);copied++;}
      catch(copyError){if(copyError.code!=='EEXIST')throw copyError;}
    }
    if(hash(await readFile(target))!==asset.meshHash)throw new Error(`Existing runtime CAD checksum mismatch: ${asset.name}`);
  }
  return {checked:assets.length,copied};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  console.log(await syncRuntimeModelAssets({library:process.env.PROJECT_MODEL_LIBRARY}));
}
