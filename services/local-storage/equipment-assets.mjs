import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { fileLocation } from './file-location.mjs';

const cad = /\.(sldprt|sldasm|step|stp|iges|igs|x_t|x_b|zip)$/i;
const drawing = /\.(png|jpe?g|webp|gif|bmp|pdf|dwg|dxf|svg)$/i;
const inside = (root,path) => { const rel=relative(root,path); return rel !== '' && !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..'+sep); };
export function equipmentAssetService({equipmentRoot, publicRoot, manifestPath, ...locationOptions}) {
  let manifestCache;
  async function manifest() {
    const info=await stat(manifestPath).catch(()=>null);
    if(!info)return {};
    if(!manifestCache || manifestCache.time!==info.mtimeMs)manifestCache={time:info.mtimeMs,data:JSON.parse(await readFile(manifestPath,'utf8'))};
    return manifestCache.data;
  }
  async function resolveFile(path,profile) {
    path=path.replaceAll('\\','/');
    let directory, suffix;
    if(path.startsWith('Equipment/')){directory=equipmentRoot;suffix=path.slice(10);}
    else if(path.startsWith('/')&&!path.startsWith('//')){directory=publicRoot;suffix=decodeURIComponent(path.slice(1));}
    else return null;
    if(!inside(resolve(directory),resolve(directory,suffix)))return null;
    let root, actual;
    try{root=await realpath(directory);actual=await realpath(resolve(root,suffix));}
    catch(error){
      const hash=profile?.sourceHash??profile?.hash;
      if(!['ENOENT','ENOTDIR'].includes(error?.code)||!/^[0-9a-f]{64}$/.test(hash??''))throw error;
      root=await realpath(resolve(dirname(manifestPath),'sources'));
      actual=await realpath(resolve(root,hash+extname(path).toLowerCase()));
    }
    if(!inside(root,actual))return null;
    const info=await stat(actual);
    return info.isFile()&&info.size>0?{actual,size:info.size,name:basename(path),note:profile?.note}:null;
  }
  async function locate(candidate) {
    const sources=[{path:candidate.path}];
    if(candidate.kind==='model'){
      if(Array.isArray(candidate.models))sources.push(...candidate.models.slice(0,100));
      const data=await manifest();
      const profile=candidate.key.startsWith('pump:')?data.profiles?.[candidate.key.slice(5)]:data.equipment?.[candidate.key];
      if(profile)sources.push({...profile,path:profile.source});
    }
    for(const profile of sources){
      if(typeof profile.path!=='string'||!(candidate.kind==='model'?cad:drawing).test(profile.path))continue;
      try{const file=await resolveFile(profile.path,profile);if(file)return file;}
      catch(error){if(!['ENOENT','ENOTDIR'].includes(error?.code))throw error;}
    }
    return null;
  }
  return async request => {
    try {
      const route=new URL(request.url).pathname;
      if(request.method!=='POST')return new Response(null,{status:405});
      const body=await request.json();
      if(route==='/inspect'){
        if(!Array.isArray(body.candidates)||body.candidates.length>100)return new Response(null,{status:400});
        const files=await Promise.all(body.candidates.map(async candidate=>{
          try { const file=await locate(candidate);return file?{key:candidate.key,kind:candidate.kind,available:true,name:file.name,size:file.size,path:file.actual,note:file.note,canReveal:locationOptions.allowReveal===true&&process.platform==='win32'}:{key:candidate.key,kind:candidate.kind,available:false}; }
          catch(error){if(['ENOENT','ENOTDIR'].includes(error?.code))return {key:candidate.key,kind:candidate.kind,available:false};throw error;}
        }));
        return Response.json({files});
      }
      if(!['/download','/location'].includes(route))return new Response(null,{status:404});
      const file=await locate(body);
      if(!file)return new Response(null,{status:404});
      if(route==='/location')return fileLocation(new Request(request.url,{method:body.reveal?'POST':'GET'}),file.actual,locationOptions);
      return new Response(body.head?null:Readable.toWeb(createReadStream(file.actual)),{headers:{'Content-Length':String(file.size),'Content-Type':'application/octet-stream','X-Equipment-File-Name':encodeURIComponent(file.name)}});
    }catch(error){
      if(['ENOENT','ENOTDIR'].includes(error?.code))return new Response(null,{status:404});
      console.error('Equipment file:',error?.code??error?.name);
      return Response.json({error:'Не удалось прочитать файл или открыть его расположение.'},{status:500});
    }
  };
}
