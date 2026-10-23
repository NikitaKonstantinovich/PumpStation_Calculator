import { currentUser, json } from "../../auth-server";
import { currentInsertCatalog, currentInsertSource } from "../../component-insert-catalog-server";
import { generateInsertCalculations, insertCatalogMetadata, parseInsertRequest } from "../../component-insert-calculations";
import { InsertionSourceChanged, matchInsertionRows, readSavedInsertions, saveInsertion } from "../../component-insert-store-server";

const reply = (data: unknown, status = 200) => json(data, status, { "Cache-Control": "no-store" });
async function authorize(request: Request) {
  const user = await currentUser(request);
  if (!user) return reply({ error: "Требуется вход." }, 401);
  if (user.role !== "admin") return reply({ error: "Расчёт комплектующих доступен только admin." }, 403);
  const origin = request.headers.get("origin");
  if (request.method !== "GET" && ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site")) return reply({ error: "Недопустимый источник запроса." }, 403);
  return user;
}

export async function GET(request: Request) {
  try {
    const actor = await authorize(request); if (actor instanceof Response) return actor;
    const catalog = await currentInsertCatalog(), metadata = insertCatalogMetadata(catalog);
    // Ensure the storage migration exists before presenting an operational form.
    await readSavedInsertions();
    return reply({ catalogVersion: catalog.version, meta: metadata });
  } catch (error) {
    console.error("Insertion catalog unavailable", error);
    return reply({ error: "Не удалось загрузить исходные данные или базу вставок. Проверьте подключение и миграции 0008–0009." }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authorize(request); if (actor instanceof Response) return actor;
    let body: Record<string, unknown>;
    try {
      const text = await request.text();
      if (text.length > 8_000_000) return reply({ error: "Запрос слишком большой." }, 413);
      const value: unknown = JSON.parse(text);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("body");
      body = value as Record<string, unknown>;
    } catch { return reply({ error: "Некорректный JSON." }, 400); }
    if (body.action !== "calculate" && body.action !== "export") return reply({ error: "Неизвестное действие." }, 400);
    let input;
    try { input = parseInsertRequest(body.input); }
    catch (error) { return reply({ error: error instanceof Error ? error.message : "Некорректные параметры расчёта." }, 400); }
    if (body.action === "export" && (typeof body.catalogVersion !== "string" || !Array.isArray(body.keys) || !body.keys.length || body.keys.length > 5000 || body.keys.some(key => typeof key !== "string" || !key || key.length > 10000))) return reply({ error: "Выберите от 1 до 5000 рассчитанных позиций и укажите версию каталога." }, 400);
    const source = await currentInsertSource(), catalog = await currentInsertCatalog(source);
    if (body.action === "export" && body.catalogVersion !== catalog.version) return reply({ error: "Исходные цены, размеры или правила изменились. Выполните расчёт заново перед выгрузкой.", stale: true, catalogVersion: catalog.version }, 409);
    const calculated = generateInsertCalculations(input, catalog);
    const rows = matchInsertionRows(calculated, await readSavedInsertions(), source.items);
    if (body.action === "calculate") return reply({ catalogVersion: catalog.version, rows });

    const keys = [...new Set(body.keys as string[])], byKey = new Map(rows.map(row => [row.identityKey, row]));
    let created = 0, updated = 0, stale = false;
    const failed: Array<{ key: string; reason: string }> = [];
    for (const key of keys) {
      if (stale) { failed.push({ key, reason: "Исходный каталог изменился во время выгрузки. Выполните расчёт заново." }); continue; }
      const row = byKey.get(key);
      if (!row) { failed.push({ key, reason: "Позиция отсутствует в текущем серверном расчёте. Рассчитайте варианты заново." }); continue; }
      if (!row.exportable) { failed.push({ key, reason: row.conflict ?? (row.warnings.join("; ") || "Расчёт неполный; достоверная цена отсутствует.") }); continue; }
      try {
        const result = await saveInsertion(row, actor.id, source.databaseRevision);
        if (result === "created") created++; else updated++;
      } catch (error) {
        if (error instanceof InsertionSourceChanged) {
          stale = true;
          failed.push({ key, reason: error.message });
          continue;
        }
        console.error("Insertion export failed", key, error);
        failed.push({ key, reason: "Не удалось сохранить позицию: транзакция базы отменена. Повторите выгрузку после проверки базы." });
      }
    }
    return reply({ created, updated, failed, stale, catalogVersion: catalog.version, rows: matchInsertionRows(calculated, await readSavedInsertions(), source.items) });
  } catch (error) {
    console.error("Insertion operation failed", error);
    return reply({ error: "Не удалось выполнить операцию с базой вставок. Проверьте подключение и миграции 0008–0009." }, 503);
  }
}
