"""Add the reviewed ST20 concentric family to an existing local database; never overwrite edits."""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("binding_supplement", ROOT / "scripts/import-binding-supplement.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
FAMILY = "st20-concentric-reducers-20261028"


def import_reducers(db, data):
    return MODULE.import_supplement(db, data, FAMILY, add_only=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    args = parser.parse_args()
    path = args.database.resolve(strict=True)
    data = json.loads((ROOT / "public/binding-components.json").read_text(encoding="utf8"))
    with sqlite3.connect(path.as_uri() + "?mode=rw", uri=True, timeout=30) as db:
        db.execute("PRAGMA foreign_keys=ON")
        backup_dir = ROOT / "work/backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup = backup_dir / f"before-st20-concentric-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')}.sqlite"
        with sqlite3.connect(backup) as destination:
            db.backup(destination)
        result = import_reducers(db, data)
        result.update(backup=str(backup), integrity=db.execute("PRAGMA quick_check").fetchone()[0])
        if db.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Foreign key check failed")
        print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()
