import { currentUser, json } from "../../auth-server";
import { guardDisabledBetaFeature } from "../../release-server";
import { currentInsertCatalog, currentInsertSource } from "../../component-insert-catalog-server";
import { readSavedInsertions } from "../../component-insert-store-server";
import { generateInsertCalculations, parseInsertRequest, type InsertCalculation } from "../../component-insert-calculations";
import { insertion3d } from "../../component-insert-3d-server";
const reply = (data: unknown, status = 200) => json(data, status, { "Cache-Control": "no-store" });
const angleValue = (v: unknown) => { const n = v === undefined || v === null ? 0 : Number(v); if (!Number.isFinite(n) || Math.abs(n) > 360) throw new Error("Угол должен быть от −360 до 360°."); return n; };

export async function GET(request: Request) {
  const denied = await guardDisabledBetaFeature(request); if (denied) return denied;
  if (!await currentUser(request)) return reply({ error: "Требуется вход." }, 401);
  try {
    const params = new URL(request.url).searchParams, saved = await readSavedInsertions();
    if (!params.has("id")) return reply({ items: saved.map(s => { const c = JSON.parse(s.calculation_json) as InsertCalculation; return { id: s.id, name: s.name, revision: s.revision, pn: c.pn, dnLarge: c.dnLarge, dnSmall: c.dnSmall, geometry: c.geometry, connections: `${c.leftConnection}/${c.rightConnection}`, sensor: c.withSensorNipple }; }) });
    const record = saved.find(s => s.id === params.get("id"));
    if (!record) return reply({ error: "Вставка не найдена в базе." }, 404);
    const source = await currentInsertSource(), catalog = await currentInsertCatalog(source);
    return reply({ template: await insertion3d(JSON.parse(record.calculation_json), source, catalog, record, angleValue(params.get("angle"))) });
  } catch (error) { return reply({ error: error instanceof Error ? error.message : "Не удалось подготовить геометрию вставки." }, 422); }
}

/** Preview is a calculator action: only admin, with fresh server calculation and no database write. */
export async function POST(request: Request) {
  const denied = await guardDisabledBetaFeature(request); if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return reply({ error: "Требуется вход." }, 401);
  if (user.role !== "admin") return reply({ error: "Предпросмотр расчёта доступен только admin." }, 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return reply({ error: "Недопустимый источник запроса." }, 403);
  try {
    const text = await request.text(); if (text.length > 100000) return reply({ error: "Запрос слишком большой." }, 413);
    const body = JSON.parse(text), input = parseInsertRequest(body.input);
    if (typeof body.identityKey !== "string" || body.identityKey.length > 30000) return reply({ error: "Не указана рассчитанная позиция." }, 400);
    const source = await currentInsertSource(), catalog = await currentInsertCatalog(source);
    if (body.catalogVersion !== catalog.version) return reply({ error: "Исходные данные изменились. Рассчитайте вставки заново.", stale: true }, 409);
    const row = generateInsertCalculations(input, catalog).find(r => r.identityKey === body.identityKey);
    if (!row) return reply({ error: "Позиция отсутствует в текущем расчёте." }, 404);
    return reply({ template: await insertion3d(row, source, catalog, null, angleValue(body.angle)) });
  } catch (error) { return reply({ error: error instanceof Error ? error.message : "Не удалось подготовить геометрию." }, 422); }
}
