import { currentUser, json } from "../../auth-server";
import { IS_BETA } from "../../release-policy";
import { initializeAlgorithms } from "../../node-tools/storage-server";
import { listAlgorithms } from "../../node-tools/algorithm-store-server";
export async function GET(request:Request) {
  const headers = {"Cache-Control":"private, no-store"};
  const user = await currentUser(request);
  if (!user) return json({error:"Требуется вход"},401,headers);
  if (IS_BETA) return json({error:"Продукты доступны в полной версии"},403,headers);
  try {
    await initializeAlgorithms();
    return json({algorithms:(await listAlgorithms(true)).map(({id,name}) => ({id,name}))},200,headers);
  } catch { return json({error:"Не удалось загрузить продукты"},503,headers); }
}
