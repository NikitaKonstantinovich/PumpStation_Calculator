import { readFileSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

const manifest = JSON.parse(readFileSync(new URL("../../data/pump-drawings-reviewed.json", import.meta.url), "utf8"));
const rows = new Map(manifest.rows.map(row => [row.variantId, row]));
const TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", pdf: "application/pdf", dwg: "application/octet-stream", dxf: "application/octet-stream" };
export const validDrawingFile = id => typeof id === "string" && /^[a-f0-9]{64}\.(png|jpe?g|webp|pdf|dwg|dxf)$/.test(id);
const url = id => validDrawingFile(id) ? "/api/pumps/catalog-drawings/" + id : undefined;

/** Reviewed full execution identity. Never select files by similar model or family names. */
export function catalogDrawings({ variant, model, motor, manufacturer, series }, bindings = rows) {
  const row = bindings.get(String(variant.id));
  if (!row || row.modelId !== String(model.id) || row.designation !== variant.designation || row.article !== variant.manufacturer_article || row.manufacturer !== manufacturer || row.series !== series || !Object.entries(row.motor).every(([key, value]) => (motor?.[key] ?? null) === value)) return [];
  return row.drawings.filter(d => url(d.fileId)).map(d => ({
    url: url(d.fileId), name: d.name, contentType: TYPES[d.fileId.split(".").at(-1)],
    ...(url(d.previewId) ? { previewUrl: url(d.previewId) } : {}),
    scope: d.scope, note: d.note, ...(d.page ? { page: d.page } : {}), source: d.source,
  }));
}

/** Only prepared, content-addressed catalogue files; caller input never becomes an arbitrary path. */
export async function readDrawingFile(databasePath, id, method = "GET") {
  if (!validDrawingFile(id)) return new Response(null, { status: 404 });
  if (!["GET", "HEAD"].includes(method)) return new Response(null, { status: 405 });
  try {
    const root = await realpath(resolve(dirname(databasePath), "drawing-files"));
    const file = await realpath(resolve(root, id));
    if (dirname(file) !== root) return new Response(null, { status: 404 });
    const data = await readFile(file);
    if (createHash("sha256").update(data).digest("hex") !== id.split(".")[0]) return new Response(null, { status: 409 });
    const type = TYPES[id.split(".").at(-1)];
    return new Response(method === "HEAD" ? null : data, { headers: {
      "Content-Type": type, "Content-Length": String(data.length), "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": `${type.startsWith("image/") ? "inline" : "attachment"}; filename="${id}"`,
    } });
  } catch { return new Response(null, { status: 404 }); }
}
