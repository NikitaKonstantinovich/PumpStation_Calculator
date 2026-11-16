import { db } from "./auth-server";
import type { Pump } from "./pump-catalog";
import { PUMP_FILE_KINDS, PumpFileError, checkPumpFile, checkedPumpFileStream, pumpFilePathKey, pumpFileUrl, validPumpFileId, type PumpFileKind, type PumpFileReference } from "./pump-files";
type PumpFileStore = (key: string, method: "PUT" | "GET" | "HEAD" | "DELETE", body?: ReadableStream<Uint8Array>, size?: number) => Promise<Response>;

export async function ensurePumpFiles() {
  await db().prepare("CREATE TABLE IF NOT EXISTS manual_pump_files (id TEXT PRIMARY KEY NOT NULL,kind TEXT NOT NULL,storage_key TEXT NOT NULL UNIQUE,name TEXT NOT NULL,size INTEGER NOT NULL,content_type TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}
type StoredFile = PumpFileReference & { key: string };
export async function readPumpFile(id: string): Promise<StoredFile> {
  if (!validPumpFileId(id)) throw new PumpFileError("Файл не найден.", 404);
  await ensurePumpFiles();
  const row = await db().prepare("SELECT id,kind,storage_key AS key,name,size,content_type AS contentType FROM manual_pump_files WHERE id=?").bind(id).first<Omit<StoredFile, "url">>();
  if (!row) throw new PumpFileError("Файл не найден.", 404);
  return { ...row, url: pumpFileUrl(id) };
}
export async function uploadPumpFile(request: Pick<Request,"headers"|"body">, owner: string, storage: PumpFileStore, validate = checkPumpFile, checkedStream = checkedPumpFileStream): Promise<PumpFileReference> {
  const kind = request.headers.get("X-Pump-File-Kind");
  if (!PUMP_FILE_KINDS.includes(kind as PumpFileKind)) throw new PumpFileError("Выберите назначение файла.");
  let name: string;
  try { name = decodeURIComponent(request.headers.get("X-File-Name") ?? "").split(/[\\/]/).at(-1) ?? ""; } catch { throw new PumpFileError("Некорректное имя файла."); }
  const size = Number(request.headers.get("X-File-Size")), { extension, contentType } = validate(kind as PumpFileKind, name, size);
  if (!request.body) throw new PumpFileError("Выберите файл для загрузки.");
  const id = crypto.randomUUID(), key = `${kind}/${id}.${extension}`;
  await ensurePumpFiles();
  const response = await storage(key, "PUT", checkedStream(request.body, size, extension), size);
  if (!response.ok) {
    let message = "Не удалось загрузить файл. Повторите попытку.";
    try { const body = await response.json() as { error?: string }; if (body.error) message = body.error; } catch { /* Storage can return an empty error response. */ }
    throw new PumpFileError(message, response.status === 507 ? 507 : 502);
  }
  try {
    await db().prepare("INSERT INTO manual_pump_files(id,kind,storage_key,name,size,content_type,created_by) VALUES(?,?,?,?,?,?,?)").bind(id, kind, key, name, size, contentType, owner).run();
  } catch (error) { await storage(key, "DELETE").catch(() => {}); throw error; }
  return { id, kind: kind as PumpFileKind, name, size, contentType, url: pumpFileUrl(id) };
}
export async function attachPumpFiles(pump: Pump) {
  for (const kind of PUMP_FILE_KINDS) {
    const path = pump.assets?.[pumpFilePathKey(kind)];
    if (!path?.startsWith("/api/pumps/files/")) continue;
    const stored = await readPumpFile(path.slice("/api/pumps/files/".length));
    if (stored.kind !== kind || stored.url !== path) throw new PumpFileError("Файл не соответствует назначению поля.");
    const { id, name, size, contentType, url } = stored;
    const file: PumpFileReference = { id, kind, name, size, contentType, url };
    pump.assets!.files ??= {};
    pump.assets!.files[kind] = file;
  }
}
