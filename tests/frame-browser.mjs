// Render the real component builders and native meshes in an isolated Chromium.
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
const dir=resolve(process.argv[2]??'outputs/frame-complete-20261111');
const names=['frame-600-direct','frame-800-direct','frame-800-profiles'];
const assemblies=Object.fromEntries(await Promise.all(names.map(async n=>[n,JSON.parse(await readFile(join(dir,n+'.json'),'utf8'))])));
const allowed=new Set(Object.values(assemblies).flatMap(a=>a.components.flatMap(c=>c.meshUrl?[c.meshUrl]:[])));
const page=`import * as T from 'three';import {STLLoader} from 'three/addons/loaders/STLLoader.js';import {componentObject,material} from './app/model-editor/geometry';import {drilledFrameGeometry} from './app/model-editor/frame-renderer';
const assemblies=${JSON.stringify(assemblies)};
async function run(){
 const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1200,1000);renderer.setPixelRatio(1);document.body.append(renderer.domElement);
 const loader=new STLLoader(),cache=new Map();
 for(const [name,a] of Object.entries(assemblies)){
  const scene=new T.Scene();scene.background=new T.Color(0xeff3f6);scene.add(new T.HemisphereLight(0xffffff,0x687688,2));
  for(const p of [[-1500,-1200,2500],[2000,500,1500]]){const light=new T.DirectionalLight(0xffffff,2);light.position.set(...p);scene.add(light);}
  const group=new T.Group();scene.add(group);
  for(const c of a.components.filter(c=>c.kind==='frame'||c.frameMount)){
   let object;
   if(c.meshUrl){if(!cache.has(c.meshUrl))cache.set(c.meshUrl,loader.parse(await (await fetch(c.meshUrl)).arrayBuffer()));const raw=cache.get(c.meshUrl);object=new T.Mesh(c.frameDrilling?drilledFrameGeometry(raw,c.frameDrilling):raw.clone(),material(c));}
   else object=componentObject(a,c);
   object.position.fromArray(c.position);object.rotation.set(...c.rotation.map(n=>n*Math.PI/180));object.userData.componentId=c.id;group.add(object);
  }
  const box=new T.Box3().setFromObject(group),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
  const camera=new T.PerspectiveCamera(40,1.2,1,20000);camera.up.set(0,0,1);camera.position.copy(center).add(new T.Vector3(-1.8,-2,1.05).multiplyScalar(Math.max(size.x,size.y,size.z)));camera.lookAt(center);renderer.render(scene,camera);
  await fetch('/image/'+name,{method:'POST',body:renderer.domElement.toDataURL('image/png').split(',')[1]});
  if(name==='frame-800-profiles'){
   camera.position.copy(center).add(new T.Vector3(1.8,-2,1.05).multiplyScalar(Math.max(size.x,size.y,size.z)));camera.lookAt(center);renderer.render(scene,camera);
   await fetch('/image/frame-profiles-rear',{method:'POST',body:renderer.domElement.toDataURL('image/png').split(',')[1]});
   const frame=a.components.find(c=>c.kind==='frame');const target=new T.Vector3(0,frame.position[1],65);camera.position.copy(target).add(new T.Vector3(-380,-320,650));camera.lookAt(target);renderer.render(scene,camera);
   await fetch('/image/frame-holes-detail',{method:'POST',body:renderer.domElement.toDataURL('image/png').split(',')[1]});
   for(const o of group.children)if(a.components.find(c=>c.id===o.userData.componentId)?.frameHardware)o.visible=false;
   renderer.render(scene,camera);await fetch('/image/frame-holes-open',{method:'POST',body:renderer.domElement.toDataURL('image/png').split(',')[1]});
  }
 }
 await fetch('/result',{method:'POST',body:'ok'});
}
run().catch(e=>fetch('/result',{method:'POST',body:String(e.stack||e)}));`;
const bundle=await build({stdin:{contents:page,resolveDir:process.cwd()},bundle:true,format:'iife',write:false});
let finish;const done=new Promise(r=>finish=r);
const server=createServer(async(req,res)=>{
 try{
  if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<body><script src="/preview.js"></script></body>');return;}
  if(req.url==='/preview.js'){res.setHeader('content-type','application/javascript');res.end(bundle.outputFiles[0].contents);return;}
  if(allowed.has(req.url)){res.end(await readFile(resolve('public'+req.url)));return;}
  const chunks=[];for await(const c of req)chunks.push(c);const data=Buffer.concat(chunks).toString();
  if(req.url.startsWith('/image/')&&/^[a-z0-9-]+$/.test(req.url.slice(7))){await writeFile(join(dir,req.url.slice(7)+'.png'),Buffer.from(data,'base64'));res.end('ok');return;}
  if(req.url==='/result'){res.end('ok');finish(data);return;}
  res.writeHead(404).end();
 }catch(e){res.writeHead(500).end(String(e));finish(String(e));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=await mkdtemp(join(tmpdir(),'frame-preview-'));
const browser=spawn(process.env.CHROME_BIN??'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--no-first-run','--disable-extensions','--enable-unsafe-swiftshader','--user-data-dir='+profile,'http://127.0.0.1:'+server.address().port],{windowsHide:true,stdio:'ignore'});
browser.on('error',e=>finish(String(e)));const timer=setTimeout(()=>finish('Browser timeout'),45000);
try{assert.equal(await done,'ok');console.log('PASS native CAD, cabinet mounts, C profiles, holes and fasteners: 6 PNG previews');}
finally{clearTimeout(timer);browser.kill();server.closeAllConnections();server.close();}
