import { currentUser, json } from "../../../auth-server";
import { IS_BETA } from "../../../release-policy";
import { command, editorState, GraphError, type EditorCommand } from "../../../engineering/storage-server";
import { equipmentSamples } from "../../../engineering/equipment-server";
const reply = (data: unknown, status = 200) => json(data, status, {
  "Cache-Control": "private, no-store"
});
async function guard(request: Request, write = false) {
  const user = await currentUser(request);
  if (!user) throw new GraphError("Требуется вход", 401);
  if (user.role !== "admin" || IS_BETA) throw new GraphError("Редактор доступен администратору в полной версии", 403);
  if (write && (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site")) throw new GraphError("Недопустимый источник запроса", 403);
  return user;
}
function failure(e: unknown) {
  if (!(e instanceof GraphError)) console.error("Geometry Nodes", e);
  return reply({
    location: e instanceof GraphError ? e.location : undefined,
    error: e instanceof GraphError ? e.message : "Редактор недоступен. Проверьте каталог и миграцию 0015."
  }, e instanceof GraphError ? e.status : 503);
}
export async function GET(request: Request) {
  try {
    await guard(request);
    const q = new URL(request.url).searchParams;
    return reply(q.has("category") ? await equipmentSamples(q.get("category")!, q.get("q") ?? "", q.get("id") ?? undefined) : await editorState());
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const user = await guard(request, true);
    const text = await request.text();
    if (text.length > 1_850_000) throw new GraphError("Документ слишком большой", 413);
    let body: EditorCommand;
    try {
      body = JSON.parse(text);
    } catch {
      throw new GraphError("Неверный JSON");
    }
    return reply(await command(body, user.name + " (" + user.id + ")"));
  } catch (e) {
    return failure(e);
  }
}
