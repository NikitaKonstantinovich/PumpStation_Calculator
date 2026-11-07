import {verifyWorkspace,ToolError} from "../../node-tools/storage-server";
import type {ProjectConfig} from "../../project-config";
import { guardDisabledBetaFeature } from "../../release-server";
import { currentUser, json } from "../../auth-server";
import { parseProjectConfig, type SettingsEntity } from "../../project-config";
import { BaseValuesError, verifyAppliedBaseValues } from "../../base-values-server";
import { projectAccessError } from "../../project-access";
import { projectLimit, storageOperation } from "../../project-storage-server";

async function dispatch(request: Request) {
  const denied = await guardDisabledBetaFeature(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return json({error:"Требуется вход."},401);
  const origin=request.headers.get("origin");
  if(request.method!=="GET" && ((origin && origin!==new URL(request.url).origin) || request.headers.get("sec-fetch-site")==="cross-site"))return json({error:"Недопустимый источник запроса."},403);
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  if (request.method === "GET") {
    if (!id) return storageOperation(user.id,{action:"list",offset:Number(params.get("offset") ?? 0)});
    return storageOperation(user.id,{action:params.has("history")?"history":"load",id,revision:params.has("revision")?Number(params.get("revision")):null});
  }
  if (request.method === "DELETE") return storageOperation(user.id,{action:"delete",id,baseRevision:Number(params.get("base"))});
  const limit = projectLimit();
  const maxBody = limit + 4096;
  const reader = request.body?.getReader();
  if (!reader) return json({error:"Нет данных проекта."},400);
  try {
    const decoder=new TextDecoder("utf-8",{fatal:true,ignoreBOM:false});
    let bytes=0,text="";
    while(true) {
      const part=await reader.read();
      if(part.done) break;
      bytes+=part.value.byteLength;
      if(bytes>maxBody) { await reader.cancel(); return json({error:"Превышен предел размера JSON проекта."},413); }
      text+=decoder.decode(part.value,{stream:true});
    }
    const input=JSON.parse(text+decoder.decode());
    if (input.action==="pin") return storageOperation(user.id,{action:"pin",id,revision:input.revision,pinned:input.pinned});
    let raw=input.config;
    if (input.restore) {
      const result=await storageOperation(user.id,{action:"load",id,revision:input.restore});
      if (!result.ok) return result;
      raw=(await result.json() as {config:unknown}).config;
    }
    if (new TextEncoder().encode(JSON.stringify(raw)).length>limit) return json({error:"Превышен предел размера JSON проекта."},413);
    const config=parseProjectConfig(raw,true);
    if(id && id!==config.project.id) return json({error:"ID проекта не совпадает."},400);
    const error=projectAccessError(config,user.role);
    if(error) return json({error},403);
    const settings=config.entities["station-settings"] as SettingsEntity;
    try{settings.baseValues=await verifyAppliedBaseValues(settings.baseValues);}
    catch(error){return json({error:error instanceof BaseValuesError?error.message:"Справочник базовых значений недоступен. Проект не записан."},error instanceof BaseValuesError?error.status:503);}
    if(config.workspace2){let prior:ProjectConfig|undefined;if(input.baseRevision>0){const response=await storageOperation(user.id,{action:"load",id:config.project.id});if(!response.ok)return response;prior=(await response.json() as {config:ProjectConfig}).config;}await verifyWorkspace(config.workspace2,prior?.workspace2,user.role);}
    return storageOperation(user.id,{action:"save",config,operation:input.operation,baseRevision:input.baseRevision,restore:input.restore});
  } catch(error) {
    if(error instanceof ToolError)return json({error:error.message},error.status);
    if (error instanceof BaseValuesError) return json({error:error.message},error.status);
    if (error instanceof SyntaxError || error instanceof TypeError) return json({error:"Некорректный JSON проекта."},400);
    return json({error:error instanceof Error?error.message:"Не удалось сохранить проект."},400);
  }
}
export const GET=dispatch;
export const PUT=dispatch;
export const DELETE=dispatch;
