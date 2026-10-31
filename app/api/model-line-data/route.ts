import { currentUser, json, sha256 } from "../../auth-server";
import { guardDisabledBetaFeature } from "../../release-server";
import { currentInsertCatalog, currentInsertSource } from "../../component-insert-catalog-server";
import { insertion3d, insertionGeometryContext } from "../../component-insert-3d-server";
import { readSavedInsertions, savedInsertionComponent } from "../../component-insert-store-server";
import { suctionCatalogItems } from "../../suction-catalog";
import { lineGeometry } from "../../line-geometry-catalog";
import binding from "../../../public/binding-components.json";
import type { LineCatalog } from "../../model-editor/line-types";
import type { InsertCalculation } from "../../component-insert-calculations";
import { fastenerCatalog } from "../../fastener-catalog";

/** Read-only selected geometry. No calculation/export or client-supplied geometry is trusted. */
export async function POST(request: Request) {
  const denied = await guardDisabledBetaFeature(request); if (denied) return denied;
  if (!await currentUser(request)) return json({ error: "Требуется вход." }, 401);
  if (request.headers.get("sec-fetch-site") === "cross-site" || request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Недопустимый источник запроса." }, 403);
  try {
    const raw = await request.text(); if (raw.length > 100000) return json({ error: "Запрос слишком большой." }, 413);
    const body = JSON.parse(raw);
    if (!Array.isArray(body.ids) || body.ids.length > 1000 || body.ids.some((id: unknown) => typeof id !== "string" || !id || id.length > 240)) return json({ error: "Некорректный список оборудования." }, 400);
    const source = await currentInsertSource(), catalog = await currentInsertCatalog(source), context = insertionGeometryContext(source, catalog);
    const saved = await readSavedInsertions();
    const items = new Map([...binding.items, ...source.items, ...suctionCatalogItems, ...saved.map(savedInsertionComponent)].map(item => [item.id, item]));
    const result: LineCatalog = { version: 1, revision: catalog.version, items: {}, issues: [], fasteners: fastenerCatalog([...items.values()]) };
    for (const id of new Set<string>(body.ids)) {
      const item = items.get(id); if (!item) { result.issues.push(`Нет записи каталога: ${id}`); continue; }
      try {
      const geometry = lineGeometry(item, catalog, context);
      const record = saved.find(r => id === `calculated-insertion:${r.id}`);
      if (record) {
        try {
          const template = await insertion3d(JSON.parse(record.calculation_json) as InsertCalculation, source, catalog, record, 0);
          Object.assign(geometry, { template, shape: undefined, length: template.geometry.totalLengthMm, ports: template.geometry.ports, bounds: template.geometry.bounds, issues: [...template.issues, ...template.warnings], fidelity: template.status === "incomplete" ? "outline" : "parametric", source: `Сохранённый расчёт ${record.id}, ревизия ${record.revision}` });
        } catch (error) { geometry.issues.push(error instanceof Error ? error.message : "Не удалось восстановить сохранённую вставку"); }
      }
      result.items[id] = geometry;
      } catch (error) { result.issues.push(`${id}: ${error instanceof Error ? error.message : "Не удалось прочитать размеры"}`); }
    }
    result.revision = await sha256(JSON.stringify([catalog.version, result.items, result.issues, result.fasteners]));
    return json(result, 200, { "Cache-Control": "no-store" });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Не удалось загрузить геометрию обвязки." }, 503, { "Cache-Control": "no-store" }); }
}
