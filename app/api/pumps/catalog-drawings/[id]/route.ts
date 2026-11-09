import { currentUser, json } from "../../../../auth-server";
import { catalogService } from "../../../../node-tools/catalog-binding-server";

async function read(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await currentUser(request)) return json({ error: "Требуется вход." }, 401);
  const id = (await context.params).id;
  if (!/^[a-f0-9]{64}\.(png|jpe?g|webp|pdf|dwg|dxf)$/.test(id)) return json({ error: "Чертёж не найден." }, 404);
  const service = catalogService();
  if (!service) return json({ error: "Хранилище чертежей не подключено." }, 503);
  try {
    const response = await service.fetch("http://node-catalog.internal/files/" + id, { method: request.method === "HEAD" ? "HEAD" : "GET" });
    if (!response.ok) return json({ error: "Чертёж недоступен." }, response.status === 404 ? 404 : 503);
    return new Response(request.method === "HEAD" ? null : response.body, { headers: response.headers });
  } catch { return json({ error: "Не удалось прочитать чертёж." }, 503); }
}
export const GET = read;
export const HEAD = read;
