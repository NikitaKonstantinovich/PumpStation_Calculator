"""Add only the four researched insert parts; preserve all existing catalogue edits."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("supplement", ROOT / "scripts/import-binding-supplement.py")
supplement = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supplement)
IDS = {"thread-end:dnru-d270-17412", *[f"bkarm-gost-pn10:dn{dn}" for dn in [250, 300, 400]]}


def import_parts(db, data):
    scoped = {**data, "items": [row for row in data["items"] if row["id"] in IDS]}
    if {row["id"] for row in scoped["items"]} != IDS or len(scoped["items"]) != len(IDS):
        raise ValueError("Missing or duplicate researched parts; rebuild source first")
    db.execute("BEGIN IMMEDIATE")
    try:
        result = [supplement.import_supplement(db, scoped, table, add_only=True, manage_transaction=False)
                  for table in sorted({row["tableId"] for row in scoped["items"]})]
        if db.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Foreign key check failed")
        db.commit()
        return result
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
        backup = ROOT / "work/backups" / ("before-insert-error-fixes-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f") + ".sqlite")
        backup.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(backup)) as destination:
            db.backup(destination)
        print(json.dumps({"imports": import_parts(db, data), "backup": str(backup),
                          "integrity": db.execute("PRAGMA quick_check").fetchone()[0]}, ensure_ascii=True))
