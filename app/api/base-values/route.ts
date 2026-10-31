import { currentUser, json } from "../../auth-server";
import { BaseValuesError, baseAdminState, readBasePublication, writeBaseValues } from "../../base-values-server";
const reply=(data:unknown,status=200)=>json(data,status,{"Cache-Control":"no-store"});
export async function GET(request:Request) {
  try { const user=await currentUser(request);if(!user)return reply({error:"Требуется вход."},401);if(user.role!=="admin")return reply({error:"Доступ только для admin."},403);
    const state=await baseAdminState(),id=new URL(request.url).searchParams.get("version");
    return reply(id?{publication:await readBasePublication(id)}:state);
  }catch(error){return reply({error:error instanceof BaseValuesError?error.message:"Не удалось загрузить базовые значения. Сохранённые проекты не изменены."},error instanceof BaseValuesError?error.status:503);}
}
export async function PATCH(request:Request) {
  const reject=async(error:string,status:number)=>{if(request.body)await request.body.pipeTo(new WritableStream());return reply({error},status);};
  try { const user=await currentUser(request);if(!user)return reject("Требуется вход.",401);if(user.role!=="admin")return reject("Доступ только для admin.",403);
    if((request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)||request.headers.get("sec-fetch-site")==="cross-site")return reject("Недопустимый источник запроса.",403);
    const text=await request.text();if(text.length>1_500_000)return reply({error:"Слишком большой справочник."},413);
    let body;try{body=JSON.parse(text);}catch{return reply({error:"Некорректный JSON."},400);}
    if(!body||typeof body!=="object")return reply({error:"Некорректный запрос."},400);
    return reply(await writeBaseValues(user,body));
  }catch(error){return reply({error:error instanceof BaseValuesError?error.message:"Не удалось сохранить базовые значения."},error instanceof BaseValuesError?error.status:503);}
}
