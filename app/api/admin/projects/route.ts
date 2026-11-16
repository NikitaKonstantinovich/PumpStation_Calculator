import {currentUser,db,json} from "../../../auth-server";
import {guardDisabledBetaFeature} from "../../../release-server";
import {storageOperation} from "../../../project-storage-server";
import {initializeAlgorithms} from "../../../node-tools/storage-server";
import type {ManagedProject,ProjectOwner,ProjectAlgorithm} from "../../../project-manager-types";

const reply=(value:unknown,status=200)=>json(value,status,{"Cache-Control":"private, no-store"});
async function authorize(request:Request) {
  const reject=async(response:Response)=>{if(request.body)await request.body.pipeTo(new WritableStream());return response;};
  const disabled=await guardDisabledBetaFeature(request);if(disabled)return reject(disabled);
  const user=await currentUser(request);
  if(!user)return reject(reply({error:"Требуется вход."},401));
  if(user.role!=="admin")return reject(reply({error:"Доступ только для администратора."},403));
  if(request.method!=="GET"&&(request.headers.get("sec-fetch-site")==="cross-site"||request.headers.has("origin")&&request.headers.get("origin")!==new URL(request.url).origin))return reject(reply({error:"Недопустимый источник запроса."},403));
  return user;
}
export async function GET(request:Request) {
  const user=await authorize(request);if(user instanceof Response)return user;
  const q=new URL(request.url).searchParams;
  try {
    await initializeAlgorithms();
    const [response,owners,products]=await Promise.all([
      storageOperation(user.id,{action:"admin-list",admin:true,query:q.get("q")??"",userId:q.get("user")??"",algorithmId:q.get("algorithm")??"",offset:Number(q.get("offset")??0)}),
      db().prepare("SELECT id,name,email FROM users ORDER BY name,email,id").all<ProjectOwner>(),
      db().prepare("SELECT id,name,connected FROM node_algorithms ORDER BY name,id").all<{id:string;name:string;connected:number}>()
    ]);
    if(!response.ok)return response;
    const data=await response.json() as {projects:ManagedProject[];ownerIds:string[];algorithmIds:string[];total:number;next:number|null};
    const users=new Map((owners.results??[]).map(owner=>[owner.id,owner]));
    const algorithms=new Map<string,ProjectAlgorithm>((products.results??[]).map(p=>[p.id,{...p,connected:!!p.connected}]));
    for(const id of data.ownerIds)if(!users.has(id))users.set(id,{id,name:"Пользователь отсутствует в базе",email:""});
    for(const id of data.algorithmIds)if(!algorithms.has(id))algorithms.set(id,{id,name:id,connected:false});
    return reply({projects:data.projects.map(p=>({...p,owner:users.get(p.ownerId),algorithm:algorithms.get(p.algorithmId)})),
      users:[...users.values()],algorithms:[...algorithms.values()],total:data.total,next:data.next});
  }catch(error){return reply({error:error instanceof Error?error.message:"Не удалось загрузить проекты."},503);}
}
export async function POST(request:Request) {
  const user=await authorize(request);if(user instanceof Response)return user;
  try {
    // Only a small identity command is accepted, never a client-supplied project or owner.
    const reader=request.body?.getReader();if(!reader)return reply({error:"Нет данных проекта."},400);
    let size=0,text="";const decoder=new TextDecoder("utf-8",{fatal:true,ignoreBOM:false});
    for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096){await reader.cancel();return reply({error:"Превышен размер команды."},413);}text+=decoder.decode(part.value,{stream:true});}
    const body=JSON.parse(text+decoder.decode());
    if(!body||typeof body!=="object"||Array.isArray(body))return reply({error:"Некорректная команда копирования."},400);
    return storageOperation(user.id,{action:"admin-copy",admin:true,id:body.id,revision:body.revision,operation:body.operation});
  }catch{return reply({error:"Некорректная команда копирования."},400);}
}
