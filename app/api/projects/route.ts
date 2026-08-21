import { currentUser, db, ensureAuthSchema, json } from "../../auth-server";

export async function GET(request:Request){
  await ensureAuthSchema();
  const user=await currentUser(request); if(!user)return json({error:"Требуется вход."},401);
  const rows=await db().prepare("SELECT id,name,config_json AS configJson,created_at AS createdAt,updated_at AS updatedAt FROM user_projects WHERE user_id=? ORDER BY updated_at DESC").bind(user.id).all<{id:string;name:string;configJson:string;createdAt:string;updatedAt:string}>();
  return json({projects:(rows.results??[]).map(row=>({...row,config:JSON.parse(row.configJson),configJson:undefined}))});
}

export async function PUT(request:Request){
  await ensureAuthSchema();
  const user=await currentUser(request); if(!user)return json({error:"Требуется вход."},401);
  const body=await request.json() as {config?:unknown},config=body.config as {project?:{id?:string;name?:string}}|undefined;
  const id=config?.project?.id,name=config?.project?.name?.trim(); if(!id||!name)return json({error:"Некорректный проект."},400);
  const serialized=JSON.stringify(config); if(serialized.length>2_000_000)return json({error:"Проект слишком большой."},413);
  const existing=await db().prepare("SELECT id FROM user_projects WHERE id=? AND user_id=?").bind(id,user.id).first<{id:string}>();
  if(existing)await db().prepare("UPDATE user_projects SET name=?,config_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(name,serialized,id,user.id).run();
  else await db().prepare("INSERT INTO user_projects (id,user_id,name,config_json) VALUES (?,?,?,?)").bind(id,user.id,name,serialized).run();
  return json({ok:true});
}

export async function DELETE(request:Request){
  await ensureAuthSchema();
  const user=await currentUser(request); if(!user)return json({error:"Требуется вход."},401);
  const id=new URL(request.url).searchParams.get("id"); if(!id)return json({error:"Не указан проект."},400);
  await db().prepare("DELETE FROM user_projects WHERE id=? AND user_id=?").bind(id,user.id).run(); return json({ok:true});
}
