import { db } from "../auth-server";
import { collectorCode } from "../collector-calculations";
import type { SavedCollector } from "../collector-project";
import { collectorStateIdentity } from "./collector-validation";

type SavedRow = { id: string; code: string; configuration_json: string; calculation_json: string; cached_price_microunits: number; price_updated_at: string; source: string };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Validate client-held receipts against D1; the graph parameter is never a database authority. */
export async function verifyCollectorStateRecords(value: unknown): Promise<string[]> {
  const state = object(value), errors: string[] = [];
  for (const type of ["suction", "discharge"]) {
    const card = object(state[type]), submitted = object(card.database);
    if (card.databaseStatus !== "found" && !card.database) continue;
    if (typeof submitted.id !== "string" || !submitted.id || submitted.id.length > 200) { errors.push("Некорректное подтверждение коллектора из базы."); continue; }
    const row = await db().prepare("SELECT id,code,configuration_json,calculation_json,cached_price_microunits,price_updated_at,source FROM collectors WHERE id=?").bind(submitted.id).first<SavedRow>();
    if (!row) { errors.push("Коллектор не найден в базе. Проверьте базу в конструкторе коллекторов."); continue; }
    const configuration = JSON.parse(row.configuration_json), calculation = JSON.parse(row.calculation_json), code = collectorCode(configuration) ?? row.code;
    const actual: SavedCollector = { id: row.id, code, configuration, calculation: { ...calculation, code }, price: row.cached_price_microunits / 1_000_000, priceUpdatedAt: row.price_updated_at, source: row.source };
    if (collectorStateIdentity(submitted) !== collectorStateIdentity(actual)) errors.push("Подтверждение коллектора отличается от записи в базе. Обновите сведения в конструкторе коллекторов.");
  }
  return errors;
}
