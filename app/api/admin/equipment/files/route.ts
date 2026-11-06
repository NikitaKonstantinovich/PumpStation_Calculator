import { equipmentAdmin, equipmentFailure, equipmentReply } from "../../../../equipment-admin-server";
import { readEquipmentCatalog } from "../../../../equipment-catalog-server";
import { downloadEquipmentFile, equipmentLocation, inspectEquipmentFiles, saveEquipmentFile } from "../../../../equipment-files-server";
import { PumpFileError } from "../../../../pump-files";
import type { EquipmentKind, EquipmentRow } from "../../../../equipment-admin";

async function selected(request:Request):Promise<{row:EquipmentRow;kind:EquipmentKind}>{
  const params=new URL(request.url).searchParams,kind=params.get("kind"),key=params.get("key");
  if(kind!=="model"&&kind!=="drawing")throw new PumpFileError("Укажите тип файла.");
  const row=(await readEquipmentCatalog()).rows.find(row=>row.key===key);
  if(!row)throw new PumpFileError("Позиция оборудования не найдена.",404);
  if(kind==="drawing"&&!row.pump)throw new PumpFileError("Чертежи доступны только для насосов.");
  return {row,kind};
}
export async function GET(request:Request){
  try{await equipmentAdmin(request);const {row,kind}=await selected(request);return await downloadEquipmentFile(row,kind,request.method==="HEAD");}catch(error){return equipmentFailure(error);}
}
export const HEAD=GET;
export async function PUT(request:Request){
  try{const user=await equipmentAdmin(request,true);const {row,kind}=await selected(request);const file=await saveEquipmentFile(request,row,kind,user.id);return equipmentReply({file},201);}catch(error){if(request.body&&!request.bodyUsed)await request.body.pipeTo(new WritableStream());return equipmentFailure(error);}
}
export async function POST(request:Request){
  try{
    await equipmentAdmin(request,true);
    const text=await request.text();if(text.length>20000)throw new PumpFileError("Запрос слишком большой.",413);
    const body=JSON.parse(text) as {action?:string;keys?:string[];key?:string};
    const catalog=await readEquipmentCatalog();
    if(body.action==="inspect"){
      if(!Array.isArray(body.keys)||body.keys.length>40||body.keys.some(key=>typeof key!=="string"))throw new PumpFileError("Не более 40 позиций за одну проверку.");
      const keys=new Set(body.keys),rows=catalog.rows.filter(row=>keys.has(row.key));
      return equipmentReply({files:await inspectEquipmentFiles(rows)});
    }
    if(body.action==="reveal"){
      if(!["localhost","127.0.0.1","[::1]"].includes(new URL(request.url).hostname))throw new PumpFileError("Проводник открывается только с локального адреса приложения.",409);
      const row=catalog.rows.find(row=>row.key===body.key);if(!row)throw new PumpFileError("Позиция не найдена.",404);
      return equipmentReply(await equipmentLocation(row,true));
    }
    throw new PumpFileError("Неизвестное действие.");
  }catch(error){return equipmentFailure(error);}
}
