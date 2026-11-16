import { currentUser, json } from "../../auth-server";
import { ManualPumpError } from "../../manual-pump";
import { PumpFileError } from "../../pump-files";
import { readManualPumps, saveManualPump } from "../../manual-pump-server";
const reply = (body: unknown, status = 200) => json(body, status, { "Cache-Control": "no-store" });

export async function GET(request: Request) {
  try {
    const user = await currentUser(request);
    if (!user) return reply({ error: "Требуется вход." }, 401);
    const manage = new URL(request.url).searchParams.get("manage") === "1";
    if (manage && user.role !== "admin") return reply({ error: "Заведение позиций доступно только администратору." }, 403);
    const records = await readManualPumps();
    return reply(manage ? { records } : { pumps: records.map(record => record.pump) });
  } catch { return reply({ error: "Не удалось загрузить вручную заведённые насосы." }, 503); }
}

async function write(request: Request, update: boolean) {
  const reject = async (error: string, status: number) => { if (request.body) await request.body.pipeTo(new WritableStream()); return reply({ error }, status); };
  try {
    const user = await currentUser(request);
    if (!user) return reject("Требуется вход.", 401);
    if (user.role !== "admin") return reject("Заведение позиций доступно только администратору.", 403);
    if ((request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") return reject("Недопустимый источник запроса.", 403);
    const text = await request.text();
    if (text.length > 256_000) return reply({ error: "Запись слишком большая." }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return reply({ error: "Некорректный JSON." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Некорректный запрос." }, 400);
    return reply({ record: await saveManualPump(user.id, body, update) }, update ? 200 : 201);
  } catch (error) { return reply({ error: error instanceof ManualPumpError || error instanceof PumpFileError ? error.message : "Не удалось сохранить насос. Введённые данные сохранены в форме." }, error instanceof ManualPumpError || error instanceof PumpFileError ? error.status : 503); }
}
export const POST = (request: Request) => write(request, false);
export const PATCH = (request: Request) => write(request, true);
