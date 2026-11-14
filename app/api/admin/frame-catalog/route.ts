import { currentUser, json } from "../../../auth-server";
import { IS_BETA } from "../../../release-policy";
import { readFrameCatalog, publishFrameCatalog } from "../../../frame-calculation/catalog-store-server";
import { ToolError } from "../../../node-tools/errors";
async function dispatch(request:Request) {
  try {
    const user=await currentUser(request);
    if(!user)throw new ToolError("Требуется вход",401);
    if(IS_BETA||user.role!=="admin")throw new ToolError("Каталог рам доступен администратору полной версии",403);
    if(request.method==="GET")return json(await readFrameCatalog(),200,{"Cache-Control":"no-store"});
    if(request.headers.get("sec-fetch-site")==="cross-site"||request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)throw new ToolError("Недопустимый источник запроса",403);
    const text=await request.text();if(text.length>8_000_000)throw new ToolError("Слишком большой каталог",413);
    const body=JSON.parse(text);
    return json(await publishFrameCatalog(body.items,body.revision,user.name),200,{"Cache-Control":"no-store"});
  }catch(error){return json({error:(error as Error).message},error instanceof ToolError?error.status:400,{"Cache-Control":"no-store"});}
}
export const GET=dispatch;
export const POST=dispatch;
