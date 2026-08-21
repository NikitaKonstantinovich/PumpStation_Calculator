import { createSession, currentUser, db, ensureAuthSchema, hashPassword, issueToken, json, normalizeEmail, sendAuthEmail, sessionCookie, sha256, verifyPassword, SESSION_COOKIE } from "../../auth-server";

const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const parseBody=async(request:Request)=>{try{return await request.json() as Record<string,unknown>;}catch{return {};}};

export async function GET(request:Request) {
  await ensureAuthSchema();
  const user=await currentUser(request);
  return user?json({user}):json({user:null},401);
}

export async function POST(request:Request) {
  await ensureAuthSchema();
  const body=await parseBody(request),action=String(body.action??"");
  if(action==="register"){
    const name=String(body.name??"").trim(),email=normalizeEmail(String(body.email??"")),password=String(body.password??""),confirmation=String(body.passwordConfirmation??"");
    if(name.length<2||!emailPattern.test(email)||password.length<10)return json({error:"Укажите имя, корректную почту и пароль не короче 10 символов."},400);
    if(password!==confirmation)return json({error:"Пароли не совпадают."},400);
    const existing=await db().prepare("SELECT id,email_verified_at AS verified FROM users WHERE email=?").bind(email).first<{id:string;verified:string|null}>();
    if(existing?.verified)return json({error:"Пользователь с такой почтой уже зарегистрирован."},409);
    const userId=existing?.id??crypto.randomUUID(),passwordHash=await hashPassword(password);
    if(existing)await db().prepare("UPDATE users SET name=?,password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(name,passwordHash,userId).run();
    else await db().prepare("INSERT INTO users (id,email,name,password_hash) VALUES (?,?,?,?)").bind(userId,email,name,passwordHash).run();
    const token=await issueToken(userId,"verify_email"),mail=await sendAuthEmail(email,name,"verify_email",token,request);
    return json({ok:true,...mail});
  }
  if(action==="verify"){
    const tokenHash=await sha256(String(body.token??""));
    const record=await db().prepare("SELECT id,user_id AS userId FROM auth_tokens WHERE token_hash=? AND purpose='verify_email' AND used_at IS NULL AND datetime(expires_at)>CURRENT_TIMESTAMP").bind(tokenHash).first<{id:string;userId:string}>();
    if(!record)return json({error:"Ссылка недействительна или срок её действия истёк."},400);
    await db().batch([db().prepare("UPDATE auth_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=?").bind(record.id),db().prepare("UPDATE users SET email_verified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(record.userId)]);
    const session=await createSession(record.userId); return json({ok:true},200,{"Set-Cookie":sessionCookie(session)});
  }
  if(action==="login"){
    const email=normalizeEmail(String(body.email??"")),password=String(body.password??"");
    const user=await db().prepare("SELECT id,name,password_hash AS passwordHash,email_verified_at AS verified FROM users WHERE email=?").bind(email).first<{id:string;name:string;passwordHash:string;verified:string|null}>();
    if(!user||!await verifyPassword(password,user.passwordHash))return json({error:"Неверная почта или пароль."},401);
    if(!user.verified)return json({error:"Сначала подтвердите почту по ссылке из письма."},403);
    const session=await createSession(user.id); return json({ok:true},200,{"Set-Cookie":sessionCookie(session)});
  }
  if(action==="forgot"){
    const email=normalizeEmail(String(body.email??""));
    const user=await db().prepare("SELECT id,name FROM users WHERE email=? AND email_verified_at IS NOT NULL").bind(email).first<{id:string;name:string}>();
    let developmentLink:string|undefined;
    if(user){const token=await issueToken(user.id,"reset_password"),mail=await sendAuthEmail(email,user.name,"reset_password",token,request);developmentLink=mail.developmentLink;}
    return json({ok:true,developmentLink});
  }
  if(action==="reset"){
    const password=String(body.password??""); if(password.length<10)return json({error:"Пароль должен содержать не менее 10 символов."},400);
    const tokenHash=await sha256(String(body.token??""));
    const record=await db().prepare("SELECT id,user_id AS userId FROM auth_tokens WHERE token_hash=? AND purpose='reset_password' AND used_at IS NULL AND datetime(expires_at)>CURRENT_TIMESTAMP").bind(tokenHash).first<{id:string;userId:string}>();
    if(!record)return json({error:"Ссылка недействительна или срок её действия истёк."},400);
    const passwordHash=await hashPassword(password);
    await db().batch([db().prepare("UPDATE users SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(passwordHash,record.userId),db().prepare("UPDATE auth_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=?").bind(record.id),db().prepare("DELETE FROM sessions WHERE user_id=?").bind(record.userId)]);
    const session=await createSession(record.userId); return json({ok:true},200,{"Set-Cookie":sessionCookie(session)});
  }
  if(action==="logout"){
    const token=request.headers.get("cookie")?.split(";").map(v=>v.trim()).find(v=>v.startsWith(`${SESSION_COOKIE}=`))?.split("=")[1];
    if(token)await db().prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
    return json({ok:true},200,{"Set-Cookie":sessionCookie("",0)});
  }
  return json({error:"Неизвестная операция."},400);
}
