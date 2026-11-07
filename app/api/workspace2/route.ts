import { currentUser, json } from "../../auth-server";
import { IS_BETA } from "../../release-policy";
import { toolProgram, toolDefaults, ToolError } from "../../node-tools/storage-server";
export async function GET(request: Request) {
  const reply = (v: unknown, status = 200) => json(v, status, {
    "Cache-Control": "private, no-store"
  });
  try {
    const user = await currentUser(request);
    if (!user) return reply({
      error: "Требуется вход"
    }, 401);
    if (IS_BETA) return reply({
      error: "Workspace 2 доступно в полной версии"
    }, 403);
    const q = new URL(request.url).searchParams,
      raw = q.get("base"),
      versions = raw ? JSON.parse(raw) : undefined;
    return reply({
      program: await toolProgram(q.get("version")),
      ...(await toolDefaults(versions)),
      role: user.role
    });
  } catch (e) {
    return reply({
      error: (e as Error).message
    }, e instanceof ToolError ? e.status : 400);
  }
}
