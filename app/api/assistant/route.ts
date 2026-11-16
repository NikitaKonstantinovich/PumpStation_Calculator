import { currentUser, json } from "../../auth-server";
import { RELEASE_PROFILE } from "../../release-policy";
import { answerAssistant, AssistantError, assistantConfig, readAssistantRequest } from "../../assistant-server";
import { reserveAssistantRequest, releaseAssistantRequest } from "../../assistant-rate-limit-server";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: Request) {
  try {
    if (!await currentUser(request)) return json({ error: "Требуется вход." }, 401, headers);
    return json({ enabled: assistantConfig().enabled }, 200, headers);
  } catch { return json({ error: "Не удалось проверить доступность помощника." }, 503, headers); }
}
export async function POST(request: Request) {
  let reservation: { userId: string; lease: string } | undefined;
  try {
    const user = await currentUser(request);
    if (!user) return json({ error: "Требуется вход." }, 401, headers);
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Недопустимый источник запроса." }, 403, headers);
    const { messages, context } = await readAssistantRequest(request);
    if (!assistantConfig().enabled) throw new AssistantError("Pump-ик пока не подключён. Обратитесь в поддержку: bnk@wenard.ru.", 503);
    const lease = await reserveAssistantRequest(user.id);
    if (!lease) return json({ error: "Дождитесь текущего ответа или повторите позже. Лимит: 6 вопросов в минуту и 60 в сутки." }, 429, headers);
    reservation = { userId: user.id, lease };
    return json(await answerAssistant(messages, { userId: user.id, role: user.role, profile: RELEASE_PROFILE, context }, request.signal), 200, headers);
  } catch (error) {
    return json({ error: error instanceof AssistantError ? error.message : "Не удалось получить ответ. Попробуйте ещё раз." }, error instanceof AssistantError ? error.status : 503, headers);
  } finally {
    if (reservation) await releaseAssistantRequest(reservation.userId, reservation.lease).catch(() => {});
  }
}
