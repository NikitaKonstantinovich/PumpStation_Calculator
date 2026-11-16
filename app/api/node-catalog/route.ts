import { currentUser, json } from "../../auth-server";
import { IS_BETA } from "../../release-policy";
import { catalogSnapshot, CatalogError } from "../../node-tools/catalog-server";
import { PUMP_CATALOG_SOURCE } from "../../node-tools/catalog-schema";

export async function GET(request: Request) {
  const reply = (value: unknown, status = 200) => json(value, status, { "Cache-Control": "private, no-store" });
  try {
    if (!await currentUser(request)) return reply({ error: "Требуется вход" }, 401);
    if (IS_BETA) return reply({ error: "Новый каталог доступен в экспериментальном Workspace 2 полной версии" }, 403);
    const params = new URL(request.url).searchParams;
    if (params.get("source") !== PUMP_CATALOG_SOURCE || [...params.keys()].some(key => !["source", "snapshot"].includes(key))) return reply({ error: "Выберите зарегистрированный источник каталога" }, 400);
    return reply({ snapshot: await catalogSnapshot(params.get("snapshot")) });
  } catch (e) {
    return reply({ error: e instanceof CatalogError ? e.message : "Не удалось загрузить новый каталог насосов" }, e instanceof CatalogError ? e.status : 503);
  }
}
