import { env } from "cloudflare:workers";

type D1Result<T> = { results?: T[]; success: boolean };
type D1Statement = { bind(...values: unknown[]): D1Statement; first<T>(): Promise<T | null>; run(): Promise<D1Result<unknown>>; all<T>(): Promise<D1Result<T>> };
type D1Database = { prepare(sql: string): D1Statement; batch(statements: D1Statement[]): Promise<D1Result<unknown>[]> };
type RuntimeEnv = { DB: D1Database; RESEND_API_KEY?: string; EMAIL_FROM?: string; APP_BASE_URL?: string };

const runtime = () => env as unknown as RuntimeEnv;
const encoder = new TextEncoder();

export const SESSION_COOKIE = "ps_session";
export const normalizeEmail = (value: string) => value.trim().toLocaleLowerCase("en-US");
export const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64url(bytes);
};
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const sha256 = async (value: string) => base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const iterations = 310_000;
  const derived = new Uint8Array(await crypto.subtle.deriveBits({ name:"PBKDF2", hash:"SHA-256", salt, iterations }, key, 256));
  return `pbkdf2_sha256$${iterations}$${base64url(salt)}$${base64url(derived)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, count, saltText, expected] = stored.split("$");
  if (algorithm !== "pbkdf2_sha256" || !count || !saltText || !expected) return false;
  const fromBase64url = (value:string) => Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=")), char=>char.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const actual = base64url(new Uint8Array(await crypto.subtle.deriveBits({ name:"PBKDF2", hash:"SHA-256", salt:fromBase64url(saltText), iterations:Number(count) }, key, 256)));
  if (actual.length !== expected.length) return false;
  let difference = 0; for (let i=0;i<actual.length;i++) difference |= actual.charCodeAt(i)^expected.charCodeAt(i);
  return difference === 0;
}

export const json = (data: unknown, status=200, headers?: HeadersInit) => Response.json(data, { status, headers });
export const getCookie = (request: Request, name: string) => request.headers.get("cookie")?.split(";").map(part=>part.trim()).find(part=>part.startsWith(`${name}=`))?.slice(name.length+1) ?? null;
export const sessionCookie = (token: string, maxAge=60*60*24*30) => `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}`;

export async function currentUser(request: Request) {
  const token = getCookie(request, SESSION_COOKIE); if (!token) return null;
  const tokenHash = await sha256(token);
  return runtime().DB.prepare(`SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND datetime(s.expires_at)>CURRENT_TIMESTAMP AND u.email_verified_at IS NOT NULL`).bind(tokenHash).first<{id:string;email:string;name:string}>();
}

export async function createSession(userId: string) {
  const token=randomToken(),hash=await sha256(token),expiresAt=new Date(Date.now()+30*86400_000).toISOString();
  await runtime().DB.prepare("INSERT INTO sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)").bind(crypto.randomUUID(),userId,hash,expiresAt).run();
  return token;
}

export async function issueToken(userId: string, purpose: "verify_email"|"reset_password") {
  const token=randomToken(),hash=await sha256(token),hours=purpose==="verify_email"?24:1,expiresAt=new Date(Date.now()+hours*3600_000).toISOString();
  await runtime().DB.prepare("INSERT INTO auth_tokens (id,user_id,token_hash,purpose,expires_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),userId,hash,purpose,expiresAt).run();
  return token;
}

export async function sendAuthEmail(email:string, name:string, purpose:"verify_email"|"reset_password", token:string, request:Request) {
  const settings=runtime(),origin=settings.APP_BASE_URL?.replace(/\/$/,"") ?? new URL(request.url).origin;
  const path=purpose==="verify_email"?`/?auth=verify&token=${encodeURIComponent(token)}`:`/?auth=reset&token=${encodeURIComponent(token)}`;
  const subject=purpose==="verify_email"?"Подтвердите почту — Pump Station Calculator":"Сброс пароля — Pump Station Calculator";
  const action=purpose==="verify_email"?"Подтвердить почту":"Задать новый пароль";
  const text=`Здравствуйте, ${name}!\n\n${action}: ${origin}${path}\n\nСсылка действует ${purpose==="verify_email"?"24 часа":"1 час"}. Если вы не запрашивали это письмо, просто проигнорируйте его.`;
  if (!settings.RESEND_API_KEY || !settings.EMAIL_FROM) {
    if (new URL(request.url).hostname === "localhost") return { delivered:false, developmentLink:`${origin}${path}` };
    throw new Error("Почтовая отправка не настроена");
  }
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${settings.RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:settings.EMAIL_FROM,to:[email],subject,text})});
  if(!response.ok) throw new Error("Почтовый сервис отклонил отправку");
  return { delivered:true };
}

export const db = () => runtime().DB;

let schemaReady:Promise<void>|null=null;
export function ensureAuthSchema(){
  schemaReady??=(async()=>{const database=db();await database.batch([
    database.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY NOT NULL,email TEXT NOT NULL,name TEXT NOT NULL,password_hash TEXT NOT NULL,email_verified_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users(email)"),
    database.prepare("CREATE TABLE IF NOT EXISTS auth_tokens (id TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,token_hash TEXT NOT NULL,purpose TEXT NOT NULL,expires_at TEXT NOT NULL,used_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_tokens_hash ON auth_tokens(token_hash)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_purpose ON auth_tokens(user_id,purpose)"),
    database.prepare("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,token_hash TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_token_hash ON sessions(token_hash)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS user_projects (id TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,config_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_user_projects_user_updated ON user_projects(user_id,updated_at)"),
  ]);await database.prepare("PRAGMA optimize").run();})();
  return schemaReady;
}
