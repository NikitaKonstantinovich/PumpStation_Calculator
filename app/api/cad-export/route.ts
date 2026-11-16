import { json } from "../../auth-server";
import { cadRequest, readCadBody } from "../../cad-export-server";

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId || projectId.length > 240) return json({ error: "Не указан проект." }, 400);
  return cadRequest(request, `/v1/jobs?projectId=${encodeURIComponent(projectId)}`);
}
export async function POST(request: Request) {
  const body = await readCadBody(request);
  return typeof body === "string" ? cadRequest(request, "/v1/jobs", body) : body;
}
