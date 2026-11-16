import { db } from "./auth-server";

let ready: Promise<unknown> | undefined;
export async function reserveAssistantRequest(userId: string, now = Date.now()) {
  const database = db();
  ready ??= database.prepare(`CREATE TABLE IF NOT EXISTS ai_assistant_usage (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    minute INTEGER NOT NULL, minute_count INTEGER NOT NULL,
    day INTEGER NOT NULL, day_count INTEGER NOT NULL,
    lease TEXT NOT NULL, lease_until INTEGER NOT NULL
  )`).run().catch(error => { ready = undefined; throw error; });
  await ready;
  const minute = Math.floor(now / 60000), day = Math.floor(now / 86400000), lease = crypto.randomUUID();
  // One atomic statement enforces limits across requests and Worker instances.
  const result = await database.prepare(`INSERT INTO ai_assistant_usage (user_id,minute,minute_count,day,day_count,lease,lease_until)
    VALUES (?,?,1,?,1,?,?) ON CONFLICT(user_id) DO UPDATE SET
    minute=excluded.minute, minute_count=CASE WHEN ai_assistant_usage.minute=excluded.minute THEN ai_assistant_usage.minute_count+1 ELSE 1 END,
    day=excluded.day, day_count=CASE WHEN ai_assistant_usage.day=excluded.day THEN ai_assistant_usage.day_count+1 ELSE 1 END,
    lease=excluded.lease, lease_until=excluded.lease_until
    WHERE ai_assistant_usage.lease_until<=? AND (ai_assistant_usage.minute<>excluded.minute OR ai_assistant_usage.minute_count<6)
      AND (ai_assistant_usage.day<>excluded.day OR ai_assistant_usage.day_count<60)
    RETURNING lease`).bind(userId, minute, day, lease, now + 120000, now).first<{ lease: string }>();
  return result?.lease ?? null;
}
export async function releaseAssistantRequest(userId: string, lease: string) {
  await db().prepare("UPDATE ai_assistant_usage SET lease_until=0 WHERE user_id=? AND lease=?").bind(userId, lease).run();
}
