import { currentUser, json } from "../../auth-server";
import { IS_BETA } from "../../release-policy";
import { CatalogError } from "../../node-tools/catalog-server";
import { stationCatalogSnapshot } from "../../node-tools/station-catalog-server";
export async function GET(request: Request) {
  const reply = (body: unknown, status = 200) => json(body, status, { "Cache-Control": "private, no-store" });
  try {
    if (!await currentUser(request)) return reply({ error: "Требуется вход" }, 401);
    if (IS_BETA) return reply({ error: "Доступно в полной версии" }, 403);
    const params = new URL(request.url).searchParams;
    return reply({ snapshot: await stationCatalogSnapshot(params.get("snapshot") || undefined, params.has("base") ? JSON.parse(params.get("base")!) : undefined) });
  } catch (error) { return reply({ error: (error as Error).message }, error instanceof CatalogError ? error.status : 503); }
}
