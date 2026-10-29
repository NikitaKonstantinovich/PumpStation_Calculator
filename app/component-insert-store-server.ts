import { db } from "./auth-server";
import type { InsertCalculation } from "./component-insert-calculations";
import type { InsertResultRow } from "./component-insert-types";
import { suctionCatalogItems, type AssemblyComponent } from "./suction-catalog";
import { isLegacyNomenclature } from "./component-nomenclature";
import { insertionPrice, type CalculatedInsertion } from "./calculated-insertion";

export type SavedInsertion = {
  id: string; identity_key: string; name: string; configuration_json: string; calculation_json: string;
  catalog_version: string; cached_price_microunits: number; price_updated_at: string; revision: number;
};
const field = (item: AssemblyComponent, pattern: RegExp) => item.fields.find(value => pattern.test(value.headerPath.at(-1) ?? ""))?.value;
const number = (value: unknown) => { const match = String(value ?? "").match(/\d+(?:[.,]\d+)?/); return match ? Number(match[0].replace(",", ".")) : null; };

// Legacy rows have prices for bodies and lack the full physical assembly. A name
// is useful only to flag ambiguity; it can never authorize updating a record.
export function insertionLegacyConflict(row: InsertCalculation, items: AssemblyComponent[]): string | null {
  for (const item of items) {
    if (isLegacyNomenclature(item)) continue;
    const name = String(field(item, /^Наименование$/i) ?? item.family);
    if (!/вставк/i.test(name)) continue;
    const sizes = [...name.matchAll(/(?:DN|Dn|Ду)\s*(\d+)/gi)].map(value => Number(value[1]));
    const pair = name.match(/(?:DN|Dn|Ду)\s*(\d+)\s*[-–—]\s*(?:DN|Dn|Ду)?\s*(\d+)/i);
    const large = number(field(item, /^Больший DN$|^DN$/i)) ?? (pair ? Number(pair[1]) : sizes[0] ?? null);
    const small = number(field(item, /^Меньший DN$|^DN2$/i)) ?? (pair ? Number(pair[2]) : sizes[1] ?? null);
    // Unknown sizes cannot be treated as a wildcard matching every catalogue row.
    if (large === null || large !== row.dnLarge || (small !== null && small !== row.dnSmall)) continue;
    const pn = number(field(item, /^PN$/i));
    if (pn !== null && pn !== row.pn) continue;
    const material = String(field(item, /^Материал$/i) ?? name);
    if (/AISI\s*304/i.test(material) && row.material !== "aisi304") continue;
    if (/(?:СТ\.?\s*20|сталь\s*20)/i.test(material) && row.material !== "st20") continue;
    const geometry = String(field(item, /^Исполнение$|^Геометрия$/i) ?? "");
    if ((/эксцентр|eccentric|вставка\s+Э(?:\s|$)/i.test(`${geometry} ${name}`)) && row.geometry !== "eccentric") continue;
    if ((/^concentric$|концентр/i.test(geometry)) && row.geometry !== "concentric") continue;
    if (small === large && row.geometry !== "straight") continue;
    if (/(?:^|\s)ФФ(?:\s|$)/i.test(name) && (row.leftConnection === "threaded" || row.rightConnection === "threaded")) continue;
    const sensor = field(item, /^Сгон$|^Наличие сгона$/i);
    if (sensor !== undefined && sensor !== null && /^(?:да|нет|true|false|0|1)$/i.test(String(sensor))) {
      if (/^(?:да|true|1)$/i.test(String(sensor)) !== row.withSensorNipple) continue;
    }
    return `Конфликт с прежней позицией «${name}» (${item.id}): недостаточно характеристик для однозначного сопоставления полного изделия (основа, материал, концы, длины, сгон). Требуется уточнение; старая цена может относиться только к телу вставки.`;
  }
  return null;
}

export async function readSavedInsertions(): Promise<SavedInsertion[]> {
  const result = await db().prepare("SELECT * FROM component_insertions ORDER BY name,identity_key").all<SavedInsertion>();
  if (!result.success) throw new Error("Не удалось прочитать сохранённые вставки.");
  return result.results ?? [];
}

export function matchInsertionRows(rows: InsertCalculation[], saved: SavedInsertion[], imported: AssemblyComponent[] = []): InsertResultRow[] {
  const byIdentity = new Map(saved.map(row => [row.identity_key, row]));
  const legacy = [...suctionCatalogItems, ...imported];
  return rows.map(row => {
    const existing = byIdentity.get(row.identityKey);
    const conflict = existing ? null : insertionLegacyConflict(row, legacy);
    return { ...row, isNew: !existing && !conflict, existingId: existing?.id ?? null, conflict, exportable: row.complete && row.price !== null && row.price > 0 && !conflict };
  });
}

export function savedInsertionComponent(saved: SavedInsertion, currentCatalogVersion: string | null | number = null): AssemblyComponent {
  const calculation = JSON.parse(saved.calculation_json) as InsertCalculation;
  const snapshot: CalculatedInsertion = { version: 1, id: saved.id, identityKey: saved.identity_key, revision: saved.revision,
    // Array.map's numeric index is never a catalogue revision.
    catalogVersion: saved.catalog_version, currentCatalogVersion: typeof currentCatalogVersion === "string" ? currentCatalogVersion : null, pricedAt: saved.price_updated_at, calculation };
  // Header/cache inconsistencies are not a current complete product price.
  if (calculation.identityKey !== saved.identity_key || calculation.catalogVersion !== saved.catalog_version ||
    JSON.stringify(calculation.configuration) !== JSON.stringify(JSON.parse(saved.configuration_json))) snapshot.currentCatalogVersion = null;
  const amount = insertionPrice(snapshot);
  if (amount !== null && Math.abs(amount - saved.cached_price_microunits / 1_000_000) > .01) snapshot.calculation = { ...calculation, price: null };
  const values: Record<string, unknown> = {
    Наименование: saved.name, DN: calculation.dnLarge, "Меньший DN": calculation.dnSmall,
    "Резьба слева": calculation.threadLeft, "Резьба справа": calculation.threadRight,
    PN: calculation.pn, Материал: calculation.material === "aisi304" ? "AISI304" : "СТ20",
    "Длина основы, мм": calculation.baseLengthMm, "Общая длина, мм": calculation.totalLengthMm,
    ...(calculation.extension ? { "Длина удлиняющей трубы, мм": calculation.extension.lengthMm, "Сторона удлиняющей трубы": "Больший DN", "ID удлиняющей трубы": calculation.extension.componentId } : {}),
    Исполнение: { straight: "Прямое", concentric: "Концентрическое", eccentric: "Эксцентрическое" }[calculation.geometry],
    "Соединение слева": calculation.leftConnection, "Соединение справа": calculation.rightConnection,
    Сгон: calculation.withSensorNipple ? "Да" : "Нет", Описание: calculation.description,
    ...(calculation.assumptions?.length ? { "Допущения расчёта": calculation.assumptions.map(item => `${item.message} Основание: ${item.source}`).join("\n") } : {}),
    ...(calculation.assemblyDecisions?.length ? { "Принятые решения сборки": calculation.assemblyDecisions.map(item => `${item.message} Основание: ${item.source}`).join("\n") } : {}),
    "Длина сварных швов, мм": calculation.weldLengthMm, "Дата цены": saved.price_updated_at,
    ...(calculation.selection ? { "Выбор комплектующих": `${calculation.selection.reason} Рассмотрено вариантов: ${calculation.selection.candidateCount}. ${calculation.selection.source}` } : {}),
    Источник: "Расчёт комплектующих", "Идентичность изделия": saved.identity_key,
    "Версия исходных данных": saved.catalog_version,
  };
  return {
    id: `calculated-insertion:${saved.id}`, catalogId: "ответные-части", family: saved.name,
    calculatedInsertion: snapshot,
    fields: Object.entries(values).map(([column, value]) => ({ column, headerPath: [column], value })),
    prices: amount !== null && Math.abs(amount - saved.cached_price_microunits / 1_000_000) <= .01 ? [{ label: "Цена, ₽/шт", amount, currency: "RUB" }] : [],
  };
}

export class InsertionSourceChanged extends Error {}

export async function saveInsertion(row: InsertResultRow, userId: string, expectedSourceRevision: number): Promise<"created" | "updated"> {
  if (!row.exportable || !row.complete || row.pn === null || row.price === null || row.baseLengthMm === null || row.totalLengthMm === null || row.weldLengthMm === null || row.weldCost === null) throw new Error(row.conflict ?? (row.warnings.join("; ") || "Расчёт неполный."));
  const database = db(), timestamp = new Date().toISOString(), micro = (value: number) => Math.round(value * 1_000_000);
  const statements = [
    // This NOT NULL assertion runs inside the same D1 transaction as all writes.
    // Source triggers increment the revision even for edits from other tools.
    database.prepare("INSERT INTO component_calculator_source_revision(id,revision) VALUES(1,(SELECT CASE WHEN revision=? THEN revision ELSE NULL END FROM component_calculator_source_revision WHERE id=1)) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision RETURNING revision").bind(expectedSourceRevision),
    database.prepare(`INSERT INTO component_insertions (id,identity_key,name,configuration_json,calculation_json,catalog_version,cached_price_microunits,base_length_mm,total_length_mm,weld_length_mm,weld_cost_microunits,created_by_user_id,price_updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(identity_key) DO UPDATE SET name=excluded.name,configuration_json=excluded.configuration_json,calculation_json=excluded.calculation_json,catalog_version=excluded.catalog_version,cached_price_microunits=excluded.cached_price_microunits,base_length_mm=excluded.base_length_mm,total_length_mm=excluded.total_length_mm,weld_length_mm=excluded.weld_length_mm,weld_cost_microunits=excluded.weld_cost_microunits,price_updated_at=excluded.price_updated_at,revision=component_insertions.revision+1 RETURNING id,revision`)
      .bind(crypto.randomUUID(), row.identityKey, row.name, JSON.stringify(row.configuration), JSON.stringify(row), row.catalogVersion, micro(row.price), row.baseLengthMm, row.totalLengthMm, row.weldLengthMm, micro(row.weldCost), userId, timestamp),
    database.prepare("DELETE FROM component_insertion_items WHERE insertion_id=(SELECT id FROM component_insertions WHERE identity_key=?)").bind(row.identityKey),
    ...row.bom.map((item, index) => database.prepare("INSERT INTO component_insertion_items (insertion_id,sort_order,item_json) SELECT id,?,? FROM component_insertions WHERE identity_key=?").bind(index, JSON.stringify(item), row.identityKey)),
  ];
  // D1 batches are transactions: header, full audit snapshot, price, and BOM
  // either change together or remain at the previous revision.
  let result;
  try { result = await database.batch(statements); }
  catch (error) {
    const current = await database.prepare("SELECT revision FROM component_calculator_source_revision WHERE id=1").first<{ revision: number }>();
    if (!current || current.revision !== expectedSourceRevision) throw new InsertionSourceChanged("Исходный каталог изменился перед записью. Выполните расчёт заново.");
    throw error;
  }
  if (result.some(value => !value.success)) throw new Error("Транзакция записи вставки не выполнена.");
  const saved = result[1].results?.[0] as { revision: number } | undefined;
  if (!saved) throw new Error("База не подтвердила запись вставки.");
  return saved.revision === 0 ? "created" : "updated";
}
