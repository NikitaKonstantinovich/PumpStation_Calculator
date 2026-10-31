"""Add five reviewed WERK PN16 flanges without overwriting existing catalogue data."""
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


def import_flanges(db, data):
    raise ValueError("WERK offers were retired; use import-bene-inox-flanges.py")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    args = parser.parse_args()
    data = json.loads((ROOT / "public/binding-components.json").read_text(encoding="utf-8"))
    with closing(sqlite3.connect(args.database.resolve(strict=True).as_uri() + "?mode=rw", uri=True, timeout=30)) as db:
        db.execute("PRAGMA foreign_keys=ON")
        backup = ROOT / "work/backups" / ("before-werk-flanges-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f") + ".sqlite")
        backup.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(backup)) as destination:
            db.backup(destination)
        result = import_flanges(db, data)
        if db.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Foreign key check failed")
        print(json.dumps({"import": result, "backup": str(backup), "integrity": db.execute("PRAGMA quick_check").fetchone()[0]}, ensure_ascii=True))
