import { json } from "../../../../auth-server";
import { cadRequest } from "../../../../cad-export-server";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return json({ error: "Неизвестное задание." }, 404);
  const query = new URL(request.url).searchParams;
  const format = query.get("format");
  if (!format) return cadRequest(request, `/v1/jobs/${id}/download`, undefined, true); // Previously issued links.
  const key = query.get("snapshotKey") ?? "";
  if (!["solidworks", "edrawings", "edrawings-exe", "report"].includes(format) || !/^[a-f0-9]{64}$/.test(key)) return json({ error: "Некорректный запрос скачивания." }, 400);
  return cadRequest(request, `/v1/jobs/${id}/download?format=${format}&snapshotKey=${key}`, undefined, true);
}
