// Reproducible visual acceptance using the production channel mesh and drawing builders.
import {writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {build} from 'esbuild';
import {loadTs} from '../tests/load-ts.mjs';
import {pump,inputs} from '../tests/fixtures/channel-frame.mjs';
const output=resolve(process.argv[2]??'outputs/horizontal-channel-frame');await mkdir(output,{recursive:true});
const {calculateChannelFrame}=await loadTs(new URL('../app/frame-calculation/channel.ts',import.meta.url));
const {channelFrameSvg}=await loadTs(new URL('../app/frame-calculation/channel-drawing.ts',import.meta.url));
const result=calculateChannelFrame([pump],inputs),svg=channelFrameSvg(result);
await writeFile(join(output,'frame.svg'),svg);await writeFile(join(output,'calculation.json'),JSON.stringify(result,null,2));
const page=`import * as T from 'three';import {channelFrameObject} from './app/model-editor/channel-frame-renderer';
const g=${JSON.stringify(result.geometry)};
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1400,1000);renderer.setPixelRatio(1);document.querySelector('#scene').append(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color(0xf1f5f9);scene.add(new T.HemisphereLight(0xffffff,0x5f7183,2.5));
for(const p of [[-1200,2200,1200],[1200,1400,-1200]]){const l=new T.DirectionalLight(0xffffff,2);l.position.set(...p);scene.add(l);}
const c={channelFrame:g};const frame=channelFrameObject(c,new T.MeshStandardMaterial({color:0xb32932,roughness:.45,metalness:.35}));scene.add(frame);
const group=new T.Group();scene.add(group);
for(const p of g.pumps){const b=p.bounds;const outline=new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(b.maxY-b.minY,220,b.maxX-b.minX)),new T.LineBasicMaterial({color:0x627d8b}));outline.position.set((b.minY+b.maxY)/2,g.heightMm+110,-(b.minX+b.maxX)/2);group.add(outline);}
if(g.cabinet){const c=g.cabinet,b=c.data.mounting.bounds;for(const x of [b.minX+20,b.maxX-20]){const o=new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(b.maxY-b.minY,600,12)),new T.LineBasicMaterial({color:0x028577}));o.position.set(c.y+(b.minY+b.maxY)/2,g.heightMm+300,-c.x-x);group.add(o);}}
const center=new T.Vector3(g.widthMm/2,150,-g.lengthMm/2),camera=new T.PerspectiveCamera(38,1.4,1,20000);
async function capture(name){renderer.render(scene,camera);await fetch('/image/'+name,{method:'POST',body:renderer.domElement.toDataURL('image/png').split(',')[1]});}
async function run(){camera.position.copy(center).add(new T.Vector3(-1.3,1.5,1.45).multiplyScalar(Math.max(g.lengthMm,g.widthMm)));camera.lookAt(center);await capture('assembly');group.visible=false;await capture('frame');
const h=g.holes.find(h=>h.owner.startsWith('pump')&&h.valid);const focus=new T.Vector3(h.y,g.heightMm,-h.x);camera.position.copy(focus).add(new T.Vector3(-100,250,200));camera.lookAt(focus);await capture('holes');
const image=new Image();image.src='/frame.svg';await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);await fetch('/image/drawing',{method:'POST',body:canvas.toDataURL('image/png').split(',')[1]});await fetch('/result',{method:'POST',body:'ok'});}
run().catch(e=>fetch('/result',{method:'POST',body:String(e.stack||e)}));`;
const bundle=await build({stdin:{contents:page,resolveDir:process.cwd()},bundle:true,format:'iife',write:false});
await writeFile(join(output,'preview.js'),bundle.outputFiles[0].contents);
const html='<!doctype html><meta charset="utf-8"><title>Швеллерная рама — контрольная компоновка</title><style>body{font:16px Arial;background:#f1f5f9;margin:24px;color:#243448}h1{font-size:22px}p{max-width:1000px}</style><h1>Контрольная компоновка швеллерной рамы</h1><p>Проверка алгоритма на заданных тестовых данных. Серые контуры — основания насосов; зелёные — расположение стоек шкафа. Чертёж и 3D построены из одного результата. Прочность и соединения не проверены.</p><div id="scene"></div><script src="/preview.js"></script>';
await writeFile(join(output,'index.html'),html);
let finish;const done=new Promise(r=>finish=r);const server=createServer(async(req,res)=>{try{
 if(req.url==='/'){res.setHeader('content-type','text/html; charset=utf-8');res.end(html);return;}
 if(req.url==='/preview.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].contents);return;}
 if(req.url==='/frame.svg'){res.setHeader('content-type','image/svg+xml');res.end(svg);return;}
 const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks).toString();
 if(req.url.startsWith('/image/')&&/^[a-z]+$/.test(req.url.slice(7))){await writeFile(join(output,req.url.slice(7)+'.png'),Buffer.from(body,'base64'));res.end('ok');return;}
 if(req.url==='/result'){res.end('ok');finish(body);return;}res.writeHead(404).end();
 }catch(e){res.writeHead(500).end(String(e));finish(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=await mkdtemp(join(tmpdir(),'channel-frame-preview-'));
const browser=spawn(process.env.CHROME_BIN??'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--no-first-run','--disable-extensions','--enable-unsafe-swiftshader','--user-data-dir='+profile,'http://127.0.0.1:'+server.address().port],{windowsHide:true,stdio:'ignore'});
browser.on('error',e=>finish(String(e)));const timer=setTimeout(()=>finish('Browser timeout'),45000);
try{const outcome=await done;if(outcome!=='ok')throw Error(outcome);console.log('Visual acceptance rendered: '+output);}finally{clearTimeout(timer);browser.kill();server.closeAllConnections();server.close();}
