import { json } from "../../auth-server";
import { converterRequest } from "../../model-converter-server";

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId || projectId.length > 240) return json({ error: "Не указан проект." }, 400);
  return converterRequest(request, `/v1/jobs?projectId=${encodeURIComponent(projectId)}`);
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    const text = await request.text();
    if (text.length > 200_000) return json({ error: "Слишком большая спецификация." }, 413);
    payload = JSON.parse(text);
  } catch { return json({ error: "Некорректный запрос подготовки моделей." }, 400); }
  return converterRequest(request, "/v1/jobs", payload);
}
