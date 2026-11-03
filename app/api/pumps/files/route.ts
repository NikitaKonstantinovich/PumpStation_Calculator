import { currentUser, json } from "../../../auth-server";
import { PumpFileError } from "../../../pump-files";
import { uploadPumpFile } from "../../../pump-files-server";
import { pumpFileStorage } from "../../../pump-file-storage-server";
export async function POST(request: Request) {
  const reply = (error: string, status: number) => json({ error }, status, { "Cache-Control": "no-store" });
  try {
    const user = await currentUser(request);
    if (!user) return reply("Требуется вход.", 401);
    if (user.role !== "admin") return reply("Загрузка файлов доступна только администратору.", 403);
    if ((request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") return reply("Недопустимый источник запроса.", 403);
    return json({ file: await uploadPumpFile(request, user.id, pumpFileStorage) }, 201, { "Cache-Control": "no-store" });
  } catch (error) { return reply(error instanceof PumpFileError ? error.message : "Не удалось загрузить файл. Повторите попытку.", error instanceof PumpFileError ? error.status : 503); }
}
