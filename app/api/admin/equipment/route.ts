import { equipmentAdmin, equipmentFailure, equipmentReply } from "../../../equipment-admin-server";
import { readEquipmentCatalog } from "../../../equipment-catalog-server";
export async function GET(request:Request){
  try{await equipmentAdmin(request);return equipmentReply(await readEquipmentCatalog(true));}catch(error){return equipmentFailure(error);}
}
