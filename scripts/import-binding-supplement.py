"""Import supplier rows into an existing local D1 SQLite database, with backup.

If no catalogue import exists, initialize components from the shipped workbook
snapshot first. An existing active catalogue keeps all unrelated rows and prices.
Schema changes belong to Drizzle migrations, never this importer.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3


def import_supplement(db, data, supplier_id):
    supplement = [row for row in data["items"] if row["tableId"] == supplier_id]
    if not supplement:
        raise ValueError("Supplier data missing; run npm run prebuild first")
    db.execute("BEGIN IMMEDIATE")
    try:
        active = db.execute("SELECT id FROM catalog_imports WHERE is_active=1 ORDER BY imported_at DESC,id DESC LIMIT 1").fetchone()
        bootstrap = active is None
        if bootstrap:
            source = data["source"]
            db.execute("""INSERT INTO catalog_imports (source_file,source_sha256,source_size_bytes,source_modified_at,imported_at)
                VALUES (?,?,?,?,?) ON CONFLICT(source_sha256) DO UPDATE SET is_active=1""",
                (source["file"], source["sha256"], source["sizeBytes"], source["modifiedAt"], source["importedAt"]))
            active = db.execute("SELECT id FROM catalog_imports WHERE source_sha256=?", (source["sha256"],)).fetchone()
        import_id = active[0]
        rows = data["items"] if bootstrap else supplement
        catalogs = {v["id"]: v for v in data["catalogs"]}
        for row in rows:
            catalog = catalogs[row["catalogId"]]
            db.execute("INSERT OR IGNORE INTO component_catalogs (import_id,source_id,name,source_sheet) VALUES (?,?,?,?)",
                       (import_id, catalog["id"], catalog["name"], catalog["sourceSheet"]))
            catalog_id = db.execute("SELECT id FROM component_catalogs WHERE import_id=? AND source_id=?", (import_id, catalog["id"])).fetchone()[0]
            table = next(v for v in catalog["tables"] if v["id"] == row["tableId"])
            db.execute("INSERT OR IGNORE INTO component_families (catalog_id,source_id,title,source_range,source_urls_json) VALUES (?,?,?,?,?)",
                       (catalog_id, table["id"], table["title"], table["sourceRange"], json.dumps(table["sourceUrls"], ensure_ascii=False)))
            family_id = db.execute("SELECT id FROM component_families WHERE catalog_id=? AND source_id=?", (catalog_id, table["id"])).fetchone()[0]
            fields = {v["headerPath"][-1]: v["value"] for v in row["fields"] if v["headerPath"]}
            existing = db.execute("SELECT id FROM components WHERE family_id=? AND source_id=?", (family_id, row["id"])).fetchone()
            # Preserve pre-existing workbook prices, even when reactivating a snapshot.
            if existing and row["tableId"] != supplier_id:
                continue
            db.execute("""INSERT INTO components (family_id,source_id,source_row,display_name,manufacturer,article)
                VALUES (?,?,?,?,?,?) ON CONFLICT(family_id,source_id) DO UPDATE SET
                display_name=excluded.display_name,manufacturer=excluded.manufacturer,article=excluded.article,is_active=1""",
                (family_id, row["id"], row["sourceRow"], fields.get("Наименование", row["family"]), fields.get("Производитель"), fields.get("Артикул")))
            component_id = db.execute("SELECT id FROM components WHERE family_id=? AND source_id=?", (family_id, row["id"])).fetchone()[0]
            for field in row["fields"]:
                value = field["value"]
                numeric = isinstance(value, (int, float)) and not isinstance(value, bool)
                kind = "number" if numeric else "text"
                label = field["headerPath"][-1] if field["headerPath"] else field["column"]
                db.execute("INSERT OR IGNORE INTO attribute_definitions (family_id,source_column,key,label,header_path_json,data_type) VALUES (?,?,?,?,?,?)",
                           (family_id, field["column"], field["column"], label, json.dumps(field["headerPath"], ensure_ascii=False), kind))
                attribute_id = db.execute("SELECT id FROM attribute_definitions WHERE family_id=? AND source_column=?", (family_id, field["column"])).fetchone()[0]
                db.execute("""INSERT INTO component_attribute_values (component_id,attribute_definition_id,value_type,numeric_value,text_value,number_format)
                    VALUES (?,?,?,?,?,?) ON CONFLICT(component_id,attribute_definition_id) DO UPDATE SET
                    value_type=excluded.value_type,numeric_value=excluded.numeric_value,text_value=excluded.text_value,number_format=excluded.number_format""",
                    (component_id, attribute_id, kind, value if numeric else None, None if numeric or value is None else str(value), field.get("numberFormat")))
            db.execute("DELETE FROM component_prices WHERE component_id=?", (component_id,))
            for price in row["prices"]:
                db.execute("INSERT INTO component_prices (component_id,label,amount_microunits,currency,source_column) VALUES (?,?,?,?,?)",
                           (component_id, price["label"], round(price["amount"] * 1_000_000), price["currency"], price["sourceColumn"]))
            for url in row["sourceUrls"]:
                db.execute("INSERT OR IGNORE INTO data_sources (url,source_type) VALUES (?,?)", (url, "reference" if url.endswith(".pdf") else "product"))
                source_id = db.execute("SELECT id FROM data_sources WHERE url=?", (url,)).fetchone()[0]
                roles = ["documentation"] if url.endswith(".pdf") else ["product", "price"]
                for role in roles:
                    db.execute("INSERT OR IGNORE INTO component_data_sources (component_id,data_source_id,role) VALUES (?,?,?)", (component_id, source_id, role))
        db.commit()
        return {"importId": import_id, "initializedCatalogue": bootstrap, "supplierRows": len(supplement)}
    except Exception:
        db.rollback()
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True, help="Exact existing local D1 .sqlite file")
    parser.add_argument("--catalog", type=Path, default=Path(__file__).resolve().parents[1] / "public/binding-components.json")
    parser.add_argument("--supplier", default="lunda-ld-67-504")
    args = parser.parse_args()
    path = args.database.resolve(strict=True)
    with sqlite3.connect(path.as_uri() + "?mode=rw", uri=True, timeout=30) as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("SELECT id FROM catalog_imports LIMIT 1")  # Fail before writing if migration 0000 is missing.
        backup_dir = path.parent / "backups"
        backup_dir.mkdir(exist_ok=True)
        backup = backup_dir / f"before-supplier-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')}.sqlite"
        with sqlite3.connect(backup) as destination:
            db.backup(destination)
        data = json.loads(args.catalog.read_text(encoding="utf-8"))
        result = import_supplement(db, data, args.supplier)
        result.update(backup=str(backup), integrity=db.execute("PRAGMA quick_check").fetchone()[0])
        print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()
