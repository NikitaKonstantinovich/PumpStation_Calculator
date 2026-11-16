import { currentUser, json } from "../../../../auth-server";
import { PumpFileError } from "../../../../pump-files";
import { readPumpFile } from "../../../../pump-files-server";
import { pumpFileStorage } from "../../../../pump-file-storage-server";
async function read(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!await currentUser(request)) return json({ error: "Требуется вход." }, 401);
    const file = await readPumpFile((await context.params).id), response = await pumpFileStorage(file.key, request.method === "HEAD" ? "HEAD" : "GET");
    if (!response.ok) return json({ error: "Файл недоступен." }, response.status === 404 ? 404 : 503);
    return new Response(request.method === "HEAD" ? null : response.body, { headers: {
      "Content-Type": file.contentType, "Content-Length": String(file.size), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": `${file.contentType.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    } });
  } catch (error) { return json({ error: error instanceof PumpFileError ? error.message : "Не удалось прочитать файл." }, error instanceof PumpFileError ? error.status : 503); }
}
export const GET = read;
export const HEAD = read;
