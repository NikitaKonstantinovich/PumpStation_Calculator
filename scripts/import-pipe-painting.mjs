import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mergePipePainting } from "./pipe-painting-supplement.mjs";

/** Only the managed painting family is written. Source pipe dimensions come from this database. */
export function importPipePainting(db, binding, reference) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const active = db.prepare("SELECT id FROM catalog_imports WHERE is_active=1 ORDER BY imported_at DESC,id DESC LIMIT 1").get();
    if (!active) throw new Error("Import the base component catalogue before painting prices");
    const pipes = db.prepare(`SELECT c.id,c.source_id,f.title,k.source_sheet,c.source_row FROM components c
      JOIN component_families f ON f.id=c.family_id JOIN component_catalogs k ON k.id=f.catalog_id
      WHERE k.import_id=? AND k.source_id='трубы' AND c.is_active=1`).all(active.id).map(row => ({
      id: row.source_id, catalogId: "трубы", tableId: "database-pipes", family: row.title, sourceSheet: row.source_sheet, sourceRow: row.source_row,
      fields: db.prepare(`SELECT d.source_column,d.header_path_json,v.text_value,v.numeric_value,v.value_type
        FROM component_attribute_values v JOIN attribute_definitions d ON d.id=v.attribute_definition_id WHERE v.component_id=?`).all(row.id)
        .map(value => ({ column: value.source_column, headerPath: JSON.parse(value.header_path_json), value: value.value_type === "number" ? value.numeric_value : value.text_value })), prices: [],
    }));
    const merged = mergePipePainting({ ...binding, items: pipes }, reference);
    const rows = merged.items.filter(row => row.tableId === reference.id);
    const catalog = merged.catalogs.find(catalog => catalog.id === "работы");
    const table = catalog.tables.find(table => table.id === reference.id);
    db.prepare("INSERT OR IGNORE INTO component_catalogs (import_id,source_id,name,source_sheet) VALUES (?,?,?,?)").run(active.id, catalog.id, catalog.name, catalog.sourceSheet);
    const catalogId = db.prepare("SELECT id FROM component_catalogs WHERE import_id=? AND source_id=?").get(active.id, catalog.id).id;
    db.prepare("INSERT OR IGNORE INTO component_families (catalog_id,source_id,title,source_range) VALUES (?,?,?,?)").run(catalogId, table.id, table.title, table.sourceRange);
    const familyId = db.prepare("SELECT id FROM component_families WHERE catalog_id=? AND source_id=?").get(catalogId, table.id).id;
    const result = { created: 0, updated: 0, unchanged: 0, deactivated: 0 };
    for (const row of rows) {
      const name = row.fields.find(field => field.column === "NAME").value;
      const existing = db.prepare("SELECT id,display_name,source_row,is_active FROM components WHERE family_id=? AND source_id=?").get(familyId, row.id);
      let changed = !existing;
      if (!existing) db.prepare("INSERT INTO components (family_id,source_id,source_row,display_name) VALUES (?,?,?,?)").run(familyId, row.id, row.sourceRow, name);
      else if (existing.display_name !== name || existing.source_row !== row.sourceRow || !existing.is_active) {
        db.prepare("UPDATE components SET display_name=?,source_row=?,is_active=1 WHERE id=?").run(name, row.sourceRow, existing.id);
        changed = true;
      }
      const componentId = existing?.id ?? db.prepare("SELECT id FROM components WHERE family_id=? AND source_id=?").get(familyId, row.id).id;
      for (const field of row.fields) {
        const numeric = typeof field.value === "number", kind = numeric ? "number" : "text";
        db.prepare("INSERT OR IGNORE INTO attribute_definitions (family_id,source_column,key,label,header_path_json,data_type) VALUES (?,?,?,?,?,?)")
          .run(familyId, field.column, field.column, field.headerPath.at(-1), JSON.stringify(field.headerPath), kind);
        const definitionId = db.prepare("SELECT id FROM attribute_definitions WHERE family_id=? AND source_column=?").get(familyId, field.column).id;
        const before = db.prepare("SELECT value_type,numeric_value,text_value FROM component_attribute_values WHERE component_id=? AND attribute_definition_id=?").get(componentId, definitionId);
        const number = numeric ? field.value : null, text = numeric ? null : String(field.value);
        if (!before || before.value_type !== kind || before.numeric_value !== number || before.text_value !== text) {
          db.prepare(`INSERT INTO component_attribute_values (component_id,attribute_definition_id,value_type,numeric_value,text_value) VALUES (?,?,?,?,?)
            ON CONFLICT(component_id,attribute_definition_id) DO UPDATE SET value_type=excluded.value_type,numeric_value=excluded.numeric_value,text_value=excluded.text_value`)
            .run(componentId, definitionId, kind, number, text);
          changed = true;
        }
      }
      const price = row.prices[0], amount = Math.round(price.amount * 1_000_000);
      const beforePrices = db.prepare("SELECT * FROM component_prices WHERE component_id=?").all(componentId);
      if (beforePrices.length !== 1 || beforePrices[0].amount_microunits !== amount || beforePrices[0].scale !== 1_000_000 || beforePrices[0].currency !== price.currency || beforePrices[0].label !== price.label || beforePrices[0].source_column !== price.sourceColumn) {
        db.prepare("DELETE FROM component_prices WHERE component_id=?").run(componentId);
        db.prepare("INSERT INTO component_prices (component_id,label,amount_microunits,currency,source_column) VALUES (?,?,?,?,?)").run(componentId, price.label, amount, price.currency, price.sourceColumn);
        changed = true;
      }
      result[!existing ? "created" : changed ? "updated" : "unchanged"]++;
    }
    const ids = new Set(rows.map(row => row.id));
    for (const row of db.prepare("SELECT id,source_id FROM components WHERE family_id=? AND is_active=1").all(familyId)) {
      if (!ids.has(row.source_id)) { db.prepare("UPDATE components SET is_active=0 WHERE id=?").run(row.id); result.deactivated++; }
    }
    db.exec("COMMIT");
    return result;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const index = process.argv.indexOf("--database"), path = index >= 0 && process.argv[index + 1];
  if (!path || !existsSync(path)) throw new Error("Pass --database with the existing local D1 SQLite file");
  const databasePath = resolve(path), db = new DatabaseSync(databasePath);
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=30000");
    const backupDir = join(dirname(databasePath), "backups"); mkdirSync(backupDir, { recursive: true });
    const backup = join(backupDir, `before-painting-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`);
    db.prepare("VACUUM INTO ?").run(backup);
    const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
    const result = importPipePainting(db, read("../public/binding-components.json"), read("../data/pipe-painting-prices.json"));
    console.log(JSON.stringify({ ...result, backup, integrity: db.prepare("PRAGMA quick_check").get(), foreignKeys: db.prepare("PRAGMA foreign_key_check").all() }));
  } finally { db.close(); }
}
