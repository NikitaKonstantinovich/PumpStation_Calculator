import { DatabaseSync } from "node:sqlite";
import { readFile, mkdir, realpath } from "node:fs/promises";
import { dirname, join, relative, isAbsolute } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const columns = ["CALC_COLLAR_C", "CALC_COLLAR_A", "CALC_COLLAR_E", "CALC_COLLAR_SOURCE", "CALC_COLLAR_REVIEW", "CALC_COLLAR_A_SOURCE", "CALC_COLLAR_CAD_A", "CALC_COLLAR_INSERT_SELECTION", "CALC_COLLAR_INSERT_ASSEMBLY"];
export async function verifyCollarCadSources(reference, root) {
  const resolvedRoot = await realpath(root);
  for (const row of reference.cadRows ?? []) {
    for (const [name, hash] of [[row.nativePath, row.nativeSha256], [row.modelPath, row.modelSha256]]) {
      const path = await realpath(join(resolvedRoot, name)), rel = relative(resolvedRoot, path);
      if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Collar model outside project root");
      if (createHash("sha256").update(await readFile(path)).digest("hex") !== hash) throw new Error(`Collar model changed: ${name}`);
    }
  }
}
function writeField(db, componentId, familyId, field) {
  const label = field.headerPath.at(-1), kind = typeof field.value === "number" ? "number" : "text";
  let attribute = db.prepare("SELECT id FROM attribute_definitions WHERE family_id=? AND source_column=?").get(familyId, field.column);
  if (!attribute) {
    db.prepare("INSERT INTO attribute_definitions(family_id,source_column,key,label,header_path_json,data_type,unit) VALUES(?,?,?,?,?,?,?)").run(familyId, field.column, field.column, label, JSON.stringify([label]), kind, kind === "number" && label.endsWith(", мм") ? "мм" : null);
    attribute = db.prepare("SELECT id FROM attribute_definitions WHERE family_id=? AND source_column=?").get(familyId, field.column);
  }
  const numeric = kind === "number" ? field.value : null, text = kind === "text" ? field.value : null;
  const existing = db.prepare("SELECT value_type,numeric_value,text_value,boolean_value,date_value,json_value FROM component_attribute_values WHERE component_id=? AND attribute_definition_id=?").get(componentId, attribute.id);
  if (existing && existing.value_type === kind && existing.numeric_value === numeric && existing.text_value === text && existing.boolean_value === null && existing.date_value === null && existing.json_value === null) return false;
  db.prepare(`INSERT INTO component_attribute_values(component_id,attribute_definition_id,value_type,numeric_value,text_value) VALUES(?,?,?,?,?)
    ON CONFLICT(component_id,attribute_definition_id) DO UPDATE SET value_type=excluded.value_type,numeric_value=excluded.numeric_value,text_value=excluded.text_value,boolean_value=NULL,date_value=NULL,json_value=NULL`).run(componentId, attribute.id, kind, numeric, text);
  return true;
}

/** Uses the same physical matching as the build/runtime adapter, under a D1 write lock. */
export function importCollarDimensions(db, reference, merge) {
  return importComponentDimensions(db, reference, merge, { catalogId: "воротники", columns, confirmedColumn: "CALC_COLLAR_C", reviewColumn: "CALC_COLLAR_REVIEW" });
}

export function importComponentDimensions(db, reference, merge, options) {
  const { columns, catalogId, confirmedColumn, reviewColumn } = options;
  db.exec("BEGIN IMMEDIATE");
  try {
    const active = db.prepare("SELECT id,source_sha256 AS sha256,imported_at AS importedAt FROM catalog_imports WHERE is_active=1 ORDER BY imported_at DESC,id DESC LIMIT 1").get();
    if (!active || active.sha256 !== reference.sourceSha256) throw new Error("Active workbook does not match the dimension reference; no changes were written");
    const rows = db.prepare(`SELECT c.id AS databaseId,c.source_id AS id,c.family_id AS familyId,c.source_row AS sourceRow,f.title AS family,f.source_id AS tableId,cat.source_sheet AS sourceSheet,cat.source_id AS catalogId
      FROM components c JOIN component_families f ON f.id=c.family_id JOIN component_catalogs cat ON cat.id=f.catalog_id
      WHERE cat.import_id=? AND cat.source_id=? AND c.is_active=1 ORDER BY c.id`).all(active.id, catalogId);
    const fields = db.prepare("SELECT a.source_column AS column,a.header_path_json AS header,v.numeric_value,v.text_value FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE v.component_id=? ORDER BY a.sort_order,a.id");
    const source = { source: active, items: rows.map(row => ({ ...row, prices: [], fields: fields.all(row.databaseId).map(field => ({ column: field.column, headerPath: JSON.parse(field.header), value: field.numeric_value ?? field.text_value })) })) };
    const enriched = merge(source, reference);
    let updated = 0, unchanged = 0, confirmed = 0;
    const pending = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index], original = source.items[index], item = enriched.items[index];
      const managed = item.fields.filter(field => columns.includes(field.column));
      if (!managed.length) continue;
      const hasLength = managed.some(field => field.column === confirmedColumn);
      if (hasLength) confirmed++;
      else pending.push({ componentId: row.id, reason: managed.find(field => field.column === reviewColumn)?.value });
      let changed = false;
      for (const old of original.fields.filter(field => columns.includes(field.column) && !managed.some(next => next.column === field.column))) {
        db.prepare("DELETE FROM component_attribute_values WHERE component_id=? AND attribute_definition_id IN (SELECT id FROM attribute_definitions WHERE family_id=? AND source_column=?)").run(row.databaseId, row.familyId, old.column);
        changed = true;
      }
      for (const field of managed) if (writeField(db, row.databaseId, row.familyId, field)) changed = true;
      if (changed) updated++; else unchanged++;
    }
    db.exec("COMMIT");
    return { updated, unchanged, confirmed, pending };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const index = process.argv.indexOf("--database");
  if (index < 0 || !process.argv[index + 1]) throw new Error("Usage: node --experimental-strip-types scripts/import-collar-dimensions.mjs --database path.sqlite");
  const path = await realpath(process.argv[index + 1]);
  const reference = JSON.parse(await readFile(new URL("../data/collar-dimensions.json", import.meta.url), "utf8"));
  const { mergeCollarDimensions } = await import("../app/component-collar-dimensions.ts");
  await verifyCollarCadSources(reference, fileURLToPath(new URL("../../", import.meta.url)));
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=30000");
    const backupDir = join(dirname(path), "backups");
    await mkdir(backupDir, { recursive: true });
    const backup = join(backupDir, `before-collar-dimensions-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`);
    db.prepare("VACUUM INTO ?").run(backup);
    const result = importCollarDimensions(db, reference, mergeCollarDimensions);
    console.log(JSON.stringify({ ...result, backup, integrity: db.prepare("PRAGMA quick_check").get() }));
  } finally { db.close(); }
}
