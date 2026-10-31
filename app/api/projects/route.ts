import { guardDisabledBetaFeature } from "../../release-server";
import { currentUser, db, ensureAuthSchema, json } from "../../auth-server";
import { parseProjectConfig } from "../../project-config";
import { BaseValuesError, verifyAppliedBaseValues } from "../../base-values-server";
import type { SettingsEntity } from "../../project-config";
import { projectAccessError } from "../../project-access";

export async function GET(request:Request){
  const betaDenied = await guardDisabledBetaFeature(request); if (betaDenied) return betaDenied;
  await ensureAuthSchema();
  const user=await currentUser(request); if(!user)return json({error:"Требуется вход."},401);
  const rows=await db().prepare("SELECT id,name,config_json AS configJson,created_at AS createdAt,updated_at AS updatedAt FROM user_projects WHERE user_id=? ORDER BY updated_at DESC").bind(user.id).all<{id:string;name:string;configJson:string;createdAt:string;updatedAt:string}>();
  return json({projects:(rows.results??[]).map(row=>({...row,config:JSON.parse(row.configJson),configJson:undefined}))});
}

export async function PUT(request:Request){
  const betaDenied = await guardDisabledBetaFeature(request); if (betaDenied) return betaDenied;
  await ensureAuthSchema();
  const user=await currentUser(request); if(!user)return json({error:"Требуется вход."},401);
  let config;
  try {
    const text = await request.text(); if(text.length>2_000_000)return json({error:"Проект слишком большой."},413);
    config = parseProjectConfig(JSON.parse(text)?.config);
  } catch { return json({error:"Некорректный проект."},400); }
  try { const settings=config.entities["station-settings"] as SettingsEntity; settings.baseValues=await verifyAppliedBaseValues(settings.baseValues); }
  catch(error){return json({error:error instanceof BaseValuesError?error.message:"Не удалось проверить версию базовых значений. Проект не записан."},error instanceof BaseValuesError?error.status:503);}
  const accessError=projectAccessError(config,user.role); if(accessError)return json({error:accessError},403);
  const id=config.project.id,name=config.project.name,serialized=JSON.stringify(config);
  const existing=await db().prepare("SELECT id FROM user_projects WHERE id=? AND user_id=?").bind(id,user.id).first<{id:string}>();
  if(existing)await db().prepare("UPDATE user_projects SET name=?,config_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(name,serialized,id,user.id).run();
  else await db().prepare("INSERT INTO user_projects (id,user_id,name,config_json) VALUES (?,?,?,?)").bind(id,user.id,name,serialized).run();
  return json({ok:true});
}

export async function DELETE(request:Request){
  const betaDenied = await guardDisabledBetaFeature(request); if (betaDenied) return betaDenied;
  await ensureAuthSchema();
  const user=await currentUser(request); if(!user)return json({error:"Требуется вход."},401);
  const id=new URL(request.url).searchParams.get("id"); if(!id)return json({error:"Не указан проект."},400);
  await db().prepare("DELETE FROM user_projects WHERE id=? AND user_id=?").bind(id,user.id).run(); return json({ok:true});
}
