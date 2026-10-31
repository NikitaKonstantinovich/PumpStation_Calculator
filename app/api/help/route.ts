import { currentUser, json } from "../../auth-server";
import { helpDocument, helpIndex } from "../../help-library-server";

// Reading all documentation is available to every authenticated role, in both profiles.
// Administrative actions described by an article retain their own endpoint checks.
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  try {
    if (!await currentUser(request)) return json({ error: "Требуется вход." }, 401, headers);
    const params = new URL(request.url).searchParams;
    if (params.has("document")) {
      const doc = helpDocument(params.get("document") ?? "");
      return doc ? json({ document: doc }, 200, headers) : json({ error: "Документ не найден." }, 404, headers);
    }
    const query = params.get("q") ?? "";
    if (query.length > 200) return json({ error: "Поисковый запрос должен быть не длиннее 200 символов." }, 400, headers);
    return json(helpIndex(query), 200, headers);
  } catch {
    return json({ error: "Не удалось загрузить документацию. Повторите попытку." }, 503, headers);
  }
}
