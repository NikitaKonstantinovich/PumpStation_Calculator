"""Atomically add standard stainless PN16 flanges and retire prior supplier series in the active catalogue."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("supplement", ROOT / "scripts/import-binding-supplement.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
REFERENCE = json.loads((ROOT / "data/standard-stainless-flanges.json").read_text(encoding="utf-8"))


def import_flanges(db, data):
    db.execute("BEGIN IMMEDIATE")
    try:
        result = module.import_supplement(db, data, REFERENCE["id"], add_only=True, manage_transaction=False)
        rows = db.execute("""SELECT c.id,c.source_id,c.is_active,f.source_id,f.title FROM components c
            JOIN component_families f ON f.id=c.family_id
            JOIN component_catalogs cat ON cat.id=f.catalog_id WHERE cat.import_id=?""", (result["importId"],)).fetchall()
        retire_ids = []
        for component_id, source_id, active, family_id, title in rows:
            if family_id == REFERENCE["id"] and not active:
                raise ValueError(f"Replacement was deactivated by user; preserved: {source_id}")
            for retired in REFERENCE["replaces"]:
                if family_id == retired["tableId"] or source_id in retired["componentIds"]:
                    if family_id != retired["tableId"] or title != retired["family"] or source_id not in retired["componentIds"]:
                        raise ValueError(f"Unexpected retired flange record; replacement aborted: {source_id}")
                    if active:
                        retire_ids.append((component_id,))
        db.executemany("UPDATE components SET is_active=0 WHERE id=?", retire_ids)
        if db.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Foreign key check failed")
        db.commit()
        return {**result, "retired": len(retire_ids)}
    except Exception:
        db.rollback()
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    args = parser.parse_args()
    data = json.loads((ROOT / "public/binding-components.json").read_text(encoding="utf-8"))
    with closing(sqlite3.connect(args.database.resolve(strict=True).as_uri() + "?mode=rw", uri=True, timeout=30)) as db:
        db.execute("PRAGMA foreign_keys=ON")
        backup = ROOT / "work/backups" / ("before-standard-stainless-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f") + ".sqlite")
        backup.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(backup)) as destination:
            db.backup(destination)
        result = import_flanges(db, data)
        print(json.dumps({"import": result, "backup": str(backup), "integrity": db.execute("PRAGMA quick_check").fetchone()[0]}, ensure_ascii=True))
