import { currentUser, db, ensureAuthSchema, hashPassword, json, normalizeEmail } from "../../auth-server";
import type { AccountUser, ManagedUser, UserForm } from "../../user-types";

const reply = (data: unknown, status = 200) => json(data, status, { "Cache-Control": "no-store" });
const columns = `u.id,u.email,u.name,u.role,u.revision,
  (u.email_verified_at IS NOT NULL) AS verified,
  EXISTS(SELECT 1 FROM sessions s WHERE s.user_id=u.id AND datetime(s.expires_at)>CURRENT_TIMESTAMP
    AND datetime(s.last_seen_at)>datetime('now','-2 minutes')) AS online`;
type Row = Omit<ManagedUser, "online" | "verified"> & { online: number; verified: number };
const present = (row: Row): ManagedUser => ({ ...row, online: Boolean(row.online), verified: Boolean(row.verified) });

async function authorize(request: Request): Promise<AccountUser | Response> {
  const origin = request.headers.get("origin");
  if (request.method !== "GET" && ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site")) return reply({ error: "Недопустимый источник запроса." }, 403);
  await ensureAuthSchema();
  const user = await currentUser(request);
  if (!user) return reply({ error: "Требуется вход." }, 401);
  return user.role === "admin" ? user : reply({ error: "Доступ только для admin." }, 403);
}

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch { return {}; }
}

function fields(body: Record<string, unknown>, creating: boolean): UserForm | string {
  if (typeof body.email !== "string" || typeof body.name !== "string" || typeof body.password !== "string") return "Заполните имя, почту и пароль.";
  const email = normalizeEmail(body.email), name = body.name.trim(), password = body.password;
  if (name.length < 2 || name.length > 120) return "Имя должно содержать от 2 до 120 символов.";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Укажите корректную почту.";
  if (body.role !== "admin" && body.role !== "user") return "Выберите уровень admin или user.";
  if ((creating || password.length > 0) && (password.length < 10 || password.length > 256)) return "Пароль должен содержать от 10 до 256 символов.";
  return { email, name, password, role: body.role };
}

export async function GET(request: Request) {
  const actor = await authorize(request); if (actor instanceof Response) return actor;
  const rows = await db().prepare(`SELECT ${columns} FROM users u ORDER BY u.created_at DESC,u.id`).all<Row>();
  return reply({ users: (rows.results ?? []).map(present) });
}

export async function POST(request: Request) {
  const actor = await authorize(request); if (actor instanceof Response) return actor;
  const body = await bodyOf(request), form = fields(body, true);
  if (typeof form === "string") return reply({ error: form }, 400);
  if (body.confirmed !== true) return reply({ error: "Подтвердите создание пользователя." }, 400);
  const id = crypto.randomUUID(), passwordHash = await hashPassword(form.password);
  try {
    await db().prepare("INSERT INTO users (id,email,name,role,password_hash,email_verified_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)")
      .bind(id, form.email, form.name, form.role, passwordHash).run();
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed: users.email")) return reply({ error: "Пользователь с такой почтой уже существует." }, 409);
    throw error;
  }
  const user = await db().prepare(`SELECT ${columns} FROM users u WHERE u.id=?`).bind(id).first<Row>();
  return reply({ user: present(user!) }, 201);
}

export async function PATCH(request: Request) {
  const actor = await authorize(request); if (actor instanceof Response) return actor;
  const body = await bodyOf(request), form = fields(body, false);
  if (typeof form === "string") return reply({ error: form }, 400);
  if (body.confirmed !== true) return reply({ error: "Подтвердите изменения." }, 400);
  if (typeof body.id !== "string" || !Number.isInteger(body.revision) || Number(body.revision) < 0) return reply({ error: "Обновите список пользователей." }, 400);
  if (body.id === actor.id && form.role !== "admin") return reply({ error: "Нельзя понизить собственный уровень admin. Это может сделать другой администратор." }, 400);
  const before = await db().prepare("SELECT email,role,revision FROM users WHERE id=?").bind(body.id).first<{ email: string; role: string; revision: number }>();
  if (!before) return reply({ error: "Пользователь не найден." }, 404);
  if (before.revision !== body.revision) return reply({ error: "Данные уже изменились. Обновите список и проверьте изменения заново." }, 409);
  const passwordHash = form.password ? await hashPassword(form.password) : null;
  const revoke = Boolean(passwordHash) || before.email !== form.email || before.role !== form.role;
  try {
    // D1 batches are transactions. Guard every write with the same revision;
    // a conflicting edit must neither overwrite data nor revoke sessions.
    const results = await db().batch([
      ...(revoke ? [
        db().prepare("UPDATE auth_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL AND EXISTS(SELECT 1 FROM users WHERE id=? AND revision=?)").bind(body.id, body.id, body.revision),
        db().prepare("DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND revision=?)").bind(body.id, body.id, body.revision),
      ] : []),
      db().prepare(`UPDATE users SET email=?,name=?,role=?,password_hash=COALESCE(?,password_hash),revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? RETURNING id`)
        .bind(form.email, form.name, form.role, passwordHash, body.id, body.revision),
    ]);
    if (!results[results.length - 1].results?.length) return reply({ error: "Данные уже изменились. Обновите список и проверьте изменения заново." }, 409);
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed: users.email")) return reply({ error: "Пользователь с такой почтой уже существует." }, 409);
    throw error;
  }
  const user = await db().prepare(`SELECT ${columns} FROM users u WHERE u.id=?`).bind(body.id).first<Row>();
  return reply({ user: present(user!), signedOut: revoke && body.id === actor.id });
}
