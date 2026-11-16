import { currentUser, json } from "./auth-server";
import { PumpFileError } from "./pump-files";
export const equipmentReply=(body:unknown,status=200)=>json(body,status,{"Cache-Control":"no-store"});
export async function equipmentAdmin(request:Request,write=false){
  const user=await currentUser(request);
  if(!user)throw new PumpFileError("Требуется вход.",401);
  if(user.role!=="admin")throw new PumpFileError("База комплектующих доступна только admin.",403);
  if(write&&((request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)||request.headers.get("sec-fetch-site")==="cross-site"))throw new PumpFileError("Недопустимый источник запроса.",403);
  return user;
}
export function equipmentFailure(error:unknown){
  if(!(error instanceof PumpFileError))console.error("Equipment API failed:",error);
  return equipmentReply({error:error instanceof PumpFileError?error.message:"Не удалось прочитать базу оборудования или файловое хранилище. Проверьте подключение и миграции."},error instanceof PumpFileError?error.status:503);
}
