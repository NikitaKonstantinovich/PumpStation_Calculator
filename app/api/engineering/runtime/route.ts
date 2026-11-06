import { currentUser, json } from "../../../auth-server";
import { readProgram, GraphError } from "../../../engineering/publication-server";
import { IS_BETA } from "../../../release-policy";
import { betaOperations as beta } from "../../../engineering/profile";
export async function GET(request: Request) {
  const reply = (data: unknown, status = 200) => json(data, status, {
    "Cache-Control": "private, no-store"
  });
  try {
    const user = await currentUser(request);
    if (!user) return reply({
      error: "Требуется вход"
    }, 401);
    const p = await readProgram(new URL(request.url).searchParams.get("version"));
    if (!IS_BETA) return reply(p);
    const allowed = (record: Record<string, unknown>) => Object.fromEntries(Object.entries(record).filter(([key]) => beta.has(key)));
    return reply({
      version: p.version,
      plans: allowed(p.plans),
      args: allowed(p.args)
    });
  } catch (e) {
    return reply({
      error: e instanceof GraphError ? e.message : "Не удалось загрузить версию графа. Проверьте миграцию 0015."
    }, e instanceof GraphError ? e.status : 503);
  }
}
