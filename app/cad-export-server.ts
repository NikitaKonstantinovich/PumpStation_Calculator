import { snapshotKey } from "./cad-export";
import { env } from "cloudflare:workers";
import { currentUser, json } from "./auth-server";
import { geometryAccessError } from "./geometry-access-server";
import { guardDisabledBetaFeature } from "./release-server";

type CadEnv = { CAD_EXPORT_URL?: string; CAD_EXPORT_TOKEN?: string };
export const CAD_MAX_BYTES = 16_000_000;
export async function cadRequest(request: Request, path: string, body?: string, download = false) {
  const betaDenied = await guardDisabledBetaFeature(request); if (betaDenied) return betaDenied;
  const user = await currentUser(request);
  if (!user) return json({ error: "Для сохранения 3D требуется вход." }, 401);
  const denied = geometryAccessError(user); if (denied) return denied;
  if (body !== undefined && request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Недопустимый источник запроса." }, 403);
  const config = env as unknown as CadEnv;
  if (!config.CAD_EXPORT_URL || !config.CAD_EXPORT_TOKEN) return json({ error: "Сервис сборки SOLIDWORKS ещё не подключён." }, 503);
  try {
    // Limit the connection wait, not the time the user needs to download a large viewer.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 20_000);
    const response = await fetch(`${config.CAD_EXPORT_URL.replace(/\/$/, "")}${path}`, {
      method: body === undefined ? "GET" : "POST", redirect: "manual", signal: download ? abort.signal : AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${config.CAD_EXPORT_TOKEN}`, "X-Cad-Owner": user.id, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body }),
    }).finally(() => clearTimeout(timer));
    if (response.status === 401 || response.status === 403) return json({ error: "Сервис сборки отклонил подключение. Проверьте настройки сервера." }, 502);
    if (response.status >= 300 && response.status < 400) return json({ error: "Сервис сборки возвращает перенаправление." }, 502);
    if (download && response.ok) {
      const type = response.headers.get("content-type");
      const suffix = new URL(path, "http://cad.local").searchParams.get("format") === "edrawings-exe" ? "exe" : type === "application/zip" ? "zip" : type === "application/json" ? "json" : "easm";
      return new Response(response.body, { headers: { "Content-Type": type ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="pumpstation.${suffix}"`,
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    return json(await response.json(), response.status, { "Cache-Control": "no-store" });
  } catch {
    return json({ error: "Сервис сборки недоступен. Уже принятое задание продолжает выполняться; проверьте статус повторно." }, 503);
  }
}

export async function readCadBody(request: Request): Promise<string | Response> {
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "Не передана компоновка." }, 400);
  let bytes = 0, text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > CAD_MAX_BYTES) { await reader.cancel(); return json({ error: "Компоновка превышает 16 МБ." }, 413); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const data = JSON.parse(text);
    if (!data || data.manifest?.version !== 1 || !Array.isArray(data.manifest.instances) || data.manifest.instances.length > 30000 || data.snapshotKey !== await snapshotKey(data.manifest.instances)) throw new Error();
    return text;
  } catch { return json({ error: "Некорректное задание сборки." }, 400); }
  finally { reader.releaseLock(); }
}
