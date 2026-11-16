import { env } from "cloudflare:workers";
import { PumpFileError } from "./pump-files";

export async function pumpFileStorage(key: string, method: "PUT" | "GET" | "HEAD" | "DELETE", body?: ReadableStream<Uint8Array>, size?: number) {
  const storage = (env as unknown as { PUMP_FILES?: Fetcher }).PUMP_FILES;
  if (!storage) throw new PumpFileError("Каталог загружаемых файлов не подключён к серверу.", 503);
  return storage.fetch(`http://pump-files.internal/${key}`, { method, ...(body ? { body, headers: { "X-File-Size": String(size) } } : {}) });
}
