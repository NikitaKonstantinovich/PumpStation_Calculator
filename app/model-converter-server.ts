import { env } from "cloudflare:workers";
import { currentUser, json } from "./auth-server";

type ConverterEnv = { MODEL_CONVERTER_URL?: string; MODEL_CONVERTER_TOKEN?: string };

/** Workers only forward short requests/streams; Python never runs inside Workers. */
export async function converterRequest(request: Request, path: string, body?: unknown) {
  const user = await currentUser(request);
  if (!user) return json({ error: "Для подготовки 3D-моделей требуется вход." }, 401);
  if (body !== undefined && request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Недопустимый источник запроса." }, 403);
  const config = env as unknown as ConverterEnv;
  if (!config.MODEL_CONVERTER_URL || !config.MODEL_CONVERTER_TOKEN) return json({ error: "Сервис подготовки 3D-моделей не подключён. Настройте MODEL_CONVERTER_URL и MODEL_CONVERTER_TOKEN на сервере приложения; инструкция: docs/model-converter.md." }, 503);
  try {
    const response = await fetch(`${config.MODEL_CONVERTER_URL.replace(/\/$/, "")}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${config.MODEL_CONVERTER_TOKEN}`, "X-Model-Owner": user.id, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000), redirect: "manual",
    });
    if (response.status === 401 || response.status === 403) return json({ error: "Сервис конвертации отклонил подключение. Проверьте серверный MODEL_CONVERTER_TOKEN." }, 502);
    if (response.status >= 300 && response.status < 400) return json({ error: "Адрес сервиса конвертации возвращает перенаправление. Укажите конечный URL сервиса." }, 502);
    if (path.startsWith("/v1/assets/") && response.ok) return new Response(response.body, {
      headers: { "Content-Type": "model/stl", "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    });
    const data = await response.json();
    return json(data, response.status, { "Cache-Control": "no-store" });
  } catch (error) {
    console.error("Model converter connection:", error instanceof Error ? error.message : "transport failed");
    return json({ error: "Сервис конвертации недоступен. Проверьте его запуск и адрес; уже принятое задание продолжает выполняться. Статус будет запрошен повторно." }, 503);
  }
}
