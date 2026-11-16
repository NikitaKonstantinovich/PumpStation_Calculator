import { env } from "cloudflare:workers";
import { db } from "./auth-server";
import { cadSource, type EquipmentFile, type EquipmentFiles, type EquipmentKind, type EquipmentRow } from "./equipment-admin";
import { equipmentAsset } from "./equipment-catalog-server";
import { pumpFileStorage } from "./pump-file-storage-server";
import { ensurePumpFiles, readPumpFile, uploadPumpFile } from "./pump-files-server";
import { PumpFileError } from "./pump-files";
import { checkEquipmentFile, checkedEquipmentStream } from "./equipment-files";

type Link = {equipmentKey:string;kind:EquipmentKind;fileId:string};
const bindings=()=>env as unknown as {EQUIPMENT_ASSETS?:Fetcher;PUMP_FILES?:Fetcher};
export async function ensureEquipmentFiles() {
  await ensurePumpFiles();
  await db().prepare("CREATE TABLE IF NOT EXISTS equipment_files (equipment_key TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('drawing','model')),file_id TEXT NOT NULL REFERENCES manual_pump_files(id),updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(equipment_key,kind))").run();
}
async function links() {
  await ensureEquipmentFiles();
  const result=await db().prepare("SELECT equipment_key AS equipmentKey,kind,file_id AS fileId FROM equipment_files").all<Link>();
  if(!result.success)throw new Error("Не удалось прочитать связи файлов.");
  return new Map((result.results??[]).map(link=>[`${link.equipmentKey}|${link.kind}`,link.fileId]));
}
async function local(path:string,body:unknown) {
  const service=bindings().EQUIPMENT_ASSETS;
  return service?.fetch(`http://equipment-assets.internal${path}`,{method:"POST",body:JSON.stringify(body),headers:{"Content-Type":"application/json"}});
}
function candidate(row:EquipmentRow,kind:EquipmentKind) {return {key:row.key,kind,path:row.sources[kind],...(kind==="model"?{models:row.cadModels}:{})};}
function originalId(row:EquipmentRow,kind:EquipmentKind,attachments:Map<string,string>) {
  return attachments.get(`${row.key}|${kind}`) ?? row.sources[kind]?.match(/^\/api\/pumps\/files\/([0-9a-f-]{36})$/i)?.[1];
}
function publicSource(row:EquipmentRow,kind:EquipmentKind) {
  const path=row.sources[kind];
  return path && /^\/(?!\/|api\/)[^?#]+\.(?:png|jpe?g|gif|bmp|webp|pdf|dwg|dxf|svg|sldprt|sldasm|step|stp|iges|igs|x_t|x_b|zip)$/i.test(path) && (kind!=="model"||cadSource(path)) ? path : undefined;
}
function validAsset(response:Response) {return response.ok && response.headers.get("content-type") !== null && !response.headers.get("content-type")!.includes("text/html");}
export async function inspectEquipmentFiles(rows:EquipmentRow[]):Promise<Record<string,EquipmentFiles>> {
  const attachments=await links(), result:Record<string,EquipmentFiles>={}, originals:Array<ReturnType<typeof candidate>>=[];
  for(const row of rows){
    result[row.key]={};
    for(const kind of (row.pump?["drawing","model"]:["model"]) as EquipmentKind[]){
      const id=originalId(row,kind,attachments);
      if(!id){ originals.push(candidate(row,kind)); continue; }
      try{
        const stored=await readPumpFile(id),response=await pumpFileStorage(stored.key,"HEAD");
        const available=response.ok&&Number(response.headers.get("Content-Length"))===stored.size&&stored.kind===kind&&(kind!=="model"||cadSource(stored.name));
        const metadata=available?await bindings().PUMP_FILES?.fetch(`http://pump-files.internal/${stored.key}?location=1`):undefined;
        const location=metadata?.ok?await metadata.json() as {path?:string;canReveal?:boolean}:{};
        result[row.key][kind]={available,name:stored.name,size:stored.size,...location};
      }catch(error){result[row.key][kind]={available:false,...(error instanceof PumpFileError&&error.status===404?{}:{error:"Хранилище файла недоступно. Повторите проверку."})};}
    }
  }
  const response=originals.length?await local("/inspect",{candidates:originals}):undefined;
  if(response){
    if(!response.ok)throw new PumpFileError("Не удалось проверить исходные файлы оборудования.",503);
    const data=await response.json() as {files:Array<EquipmentFile&{key:string;kind:EquipmentKind}>};
    for(const {key,kind,...file} of data.files)result[key][kind]=file;
  }else{
    // Hosted builds verify only the requested page, with bounded subrequests.
    for(const item of originals){
      const row=rows.find(row=>row.key===item.key)!,path=publicSource(row,item.kind);
      const file=path?await equipmentAsset(path,"HEAD"):null;
      result[row.key][item.kind]={available:!!file&&validAsset(file),name:path?.split("/").at(-1),size:file?.ok?Number(file.headers.get("Content-Length"))||undefined:undefined,path:row.sources[item.kind],canReveal:false};
    }
  }
  return result;
}
export async function saveEquipmentFile(request:Request,row:EquipmentRow,kind:EquipmentKind,actor:string) {
  if(kind==="drawing"&&!row.pump)throw new PumpFileError("Чертежи доступны только для насосов.");
  await ensureEquipmentFiles();
  const headers=new Headers(request.headers);headers.set("X-Pump-File-Kind",kind);
  // vinext may supply a Request from a different realm than workerd's constructor.
  // Pass the stream through instead of reconstructing that Request as a URL.
  const file=await uploadPumpFile({headers,body:request.body},actor,pumpFileStorage,checkEquipmentFile,checkedEquipmentStream);
  try{
    await db().prepare("INSERT INTO equipment_files(equipment_key,kind,file_id,updated_by) VALUES(?,?,?,?) ON CONFLICT(equipment_key,kind) DO UPDATE SET file_id=excluded.file_id,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(row.key,kind,file.id,actor).run();
  }catch(error){
    const stored=await readPumpFile(file.id);await pumpFileStorage(stored.key,"DELETE").catch(()=>{});
    await db().prepare("DELETE FROM manual_pump_files WHERE id=?").bind(file.id).run();throw error;
  }
  return file;
}
export async function downloadEquipmentFile(row:EquipmentRow,kind:EquipmentKind,head=false) {
  const attachment=originalId(row,kind,await links());
  let response:Response|undefined,name:string|undefined;
  if(attachment){
    const stored=await readPumpFile(attachment);
    if(stored.kind!==kind || kind==="model"&&!cadSource(stored.name))throw new PumpFileError("Исходный CAD-файл отсутствует.",404);
    response=await pumpFileStorage(stored.key,head?"HEAD":"GET");name=stored.name;
  }else{
    response=await local("/download",{...candidate(row,kind),head});
    name=row.sources[kind]?.split(/[\\/]/).at(-1);
    if(response?.headers.has("X-Equipment-File-Name"))name=decodeURIComponent(response.headers.get("X-Equipment-File-Name")!);
    if(!response){const path=publicSource(row,kind);if(path){response=await equipmentAsset(path,head?"HEAD":"GET");if(!validAsset(response))response=undefined;}}
    if(response?.ok && !name){const info=(await inspectEquipmentFiles([row]))[row.key][kind];name=info?.name;}
  }
  if(!response?.ok)throw new PumpFileError("Файл отсутствует или недоступен. Обновите строку и загрузите файл.",404);
  const headers=new Headers({"Content-Type":response.headers.get("Content-Type")??"application/octet-stream","Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(name??(kind==="model"?"model.step":"drawing.pdf"))}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"});
  const length=response.headers.get("Content-Length");if(length)headers.set("Content-Length",length);
  return new Response(head?null:response.body,{headers});
}
export async function equipmentLocation(row:EquipmentRow,reveal:boolean) {
  const attachment=originalId(row,"model",await links());
  let response:Response|undefined;
  if(attachment){const stored=await readPumpFile(attachment);response=await bindings().PUMP_FILES?.fetch(`http://pump-files.internal/${stored.key}?location=1`,{method:reveal?"POST":"GET"});}
  else response=await local("/location",{...candidate(row,"model"),reveal});
  if(!response)throw new PumpFileError("Открытие Проводника недоступно в этой среде.",409);
  if(!response.ok)throw new PumpFileError(response.status===404?"Файл модели не найден.":"Не удалось открыть расположение модели.",response.status);
  return response.json();
}
