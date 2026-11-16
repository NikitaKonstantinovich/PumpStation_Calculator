import { guardDisabledBetaFeature } from "../../../../release-server";
import { json } from "../../../../auth-server";
import { converterRequest } from "../../../../model-converter-server";

export async function GET(request: Request, context: { params: Promise<{ filename: string }> }) {
  const betaDenied = await guardDisabledBetaFeature(request); if (betaDenied) return betaDenied;
  const { filename } = await context.params;
  if (!/^model-[a-f0-9]{64}-v1\.stl$/.test(filename)) return json({ error: "Некорректное имя модели." }, 400);
  return converterRequest(request, `/v1/assets/${filename}`);
}
