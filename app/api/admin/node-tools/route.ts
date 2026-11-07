import { DiagramError } from "../../../engineering/engine";
import { currentUser, json } from "../../../auth-server";
import { IS_BETA } from "../../../release-policy";
import { toolCommand, toolState, ToolError } from "../../../node-tools/storage-server";
const reply = (v: unknown, status = 200) => json(v, status, {
  "Cache-Control": "private, no-store"
});
async function guard(request: Request) {
  const user = await currentUser(request);
  if (!user) throw new ToolError("Требуется вход", 401);
  if (IS_BETA || user.role !== "admin") throw new ToolError("Редактор доступен администратору полной версии", 403);
  if (request.method !== "GET" && (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site")) throw new ToolError("Недопустимый источник запроса", 403);
  return user;
}
export async function GET(request: Request) {
  try {
    await guard(request);
    return reply(await toolState());
  } catch (e) {
    return reply({
      error: (e as Error).message,
      location: e instanceof DiagramError ? {
        graph: e.diagram,
        node: e.node
      } : undefined
    }, e instanceof ToolError ? e.status : 400);
  }
}
export async function POST(request: Request) {
  try {
    const user = await guard(request);
    const text = await request.text();
    if (text.length > 2_000_000) throw new ToolError("Слишком большой документ", 413);
    return reply(await toolCommand(JSON.parse(text), user.name));
  } catch (e) {
    return reply({
      error: (e as Error).message,
      location: e instanceof DiagramError ? {
        graph: e.diagram,
        node: e.node
      } : undefined
    }, e instanceof ToolError ? e.status : 400);
  }
}
