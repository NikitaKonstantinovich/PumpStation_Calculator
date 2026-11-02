import { json } from "../../../../auth-server";
import { cadRequest } from "../../../../cad-export-server";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const query = new URL(request.url).searchParams;
  const format = query.get("format"), snapshotKey = query.get("snapshotKey") ?? "";
  if (!/^[a-f0-9-]{36}$/.test(id) || !format || !["solidworks", "edrawings", "edrawings-exe"].includes(format) || !/^[a-f0-9]{64}$/.test(snapshotKey)) {
    return json({ error: "Некорректный запрос экспорта." }, 400);
  }
  return cadRequest(request, `/v1/jobs/${id}/export/${format}`, JSON.stringify({ snapshotKey }));
}
