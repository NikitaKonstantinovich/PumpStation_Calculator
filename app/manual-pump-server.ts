import { db } from "./auth-server";
import { ManualPumpError, manualPumpIdentity, parseManualPump, type ManualPumpRecord } from "./manual-pump";
import type { Pump } from "./pump-catalog";
import { attachPumpFiles } from "./pump-files-server";

export async function ensureManualPumps() {
  await db().batch([
    db().prepare("CREATE TABLE IF NOT EXISTS manual_pumps (id TEXT PRIMARY KEY NOT NULL,identity_key TEXT NOT NULL,pump_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_by TEXT NOT NULL,updated_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db().prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_manual_pumps_identity ON manual_pumps(identity_key)"),
  ]);
}
type StoredPump = { json: string; revision: number; createdAt: string; updatedAt: string };
const decode = (row: StoredPump): ManualPumpRecord => ({ pump: JSON.parse(row.json) as Pump, revision: row.revision, createdAt: row.createdAt, updatedAt: row.updatedAt });
const columns = "pump_json AS json,revision,created_at AS createdAt,updated_at AS updatedAt";
export async function readManualPumps(): Promise<ManualPumpRecord[]> {
  await ensureManualPumps();
  const rows = await db().prepare(`SELECT ${columns} FROM manual_pumps ORDER BY updated_at DESC,id`).all<StoredPump>();
  return (rows.results ?? []).map(decode);
}
export async function saveManualPump(actorId: string, body: { id?: unknown; revision?: unknown; data?: unknown }, update = false): Promise<ManualPumpRecord> {
  if (update && (typeof body.id !== "string" || !/^manual-[0-9a-f-]{36}$/i.test(body.id) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 1)) throw new ManualPumpError("Укажите ID и ревизию сохранённой записи.");
  const id = update ? body.id as string : `manual-${crypto.randomUUID()}`;
  const pump = parseManualPump(body.data, id), identity = manualPumpIdentity(pump);
  await attachPumpFiles(pump);
  await ensureManualPumps();
  try {
    if (update) {
      const result = await db().prepare("UPDATE manual_pumps SET identity_key=?,pump_json=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?")
        .bind(identity, JSON.stringify(pump), actorId, id, body.revision).run();
      if (result.meta?.changes !== 1) throw new ManualPumpError("Запись изменена в другой вкладке или не найдена. Обновите список и откройте актуальную запись.", 409);
    } else {
      await db().prepare("INSERT INTO manual_pumps(id,identity_key,pump_json,created_by,updated_by) VALUES(?,?,?,?,?)").bind(id, identity, JSON.stringify(pump), actorId, actorId).run();
    }
  } catch (error) {
    if (/UNIQUE constraint failed: manual_pumps.identity_key/i.test(String(error))) throw new ManualPumpError("Насос с таким производителем, моделью и исполнением уже заведён. Откройте существующую запись.", 409);
    throw error;
  }
  const stored = await db().prepare(`SELECT ${columns} FROM manual_pumps WHERE id=?`).bind(id).first<StoredPump>();
  if (!stored) throw new Error("Сохранённая запись недоступна");
  return decode(stored);
}
