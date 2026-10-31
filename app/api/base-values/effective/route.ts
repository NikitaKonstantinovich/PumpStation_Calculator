import { currentUser, json } from "../../../auth-server";
import { BaseValuesError, currentBasePublication, resolveBaseVersions } from "../../../base-values-server";
import { baseSnapshot } from "../../../base-values";
export async function GET(request:Request) {
  const reply=(data:unknown,status=200)=>json(data,status,{"Cache-Control":"no-store"});
  try {if(!await currentUser(request))return reply({error:"Требуется вход."},401);
    const raw=new URL(request.url).searchParams.get("versions");
    if(raw){let versions;try{versions=JSON.parse(raw);}catch{return reply({error:"Некорректные версии."},400);}return reply({applied:await resolveBaseVersions(versions)});}
    const publication=await currentBasePublication();return reply({applied:baseSnapshot(publication.id,publication.values),publishedAt:publication.createdAt});
  }catch(error){return reply({error:error instanceof BaseValuesError?error.message:"Базовые значения недоступны. Используемая версия не изменена."},error instanceof BaseValuesError?error.status:503);}
}
