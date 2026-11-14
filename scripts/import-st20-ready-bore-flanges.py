"""Add the nine sourced insert flange records and correct the matching B face heights."""
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


def read(relative_path):
    return json.loads((ROOT / relative_path).read_text(encoding="utf-8"))


def import_flanges(db, data, reference, dimensions):
    expected = {row["id"] for row in reference["rows"]}
    rows = [row for row in data["items"] if row["tableId"] == reference["id"]]
    if len(rows) != len(expected) or {row["id"] for row in rows} != expected:
        raise ValueError("Missing or duplicate insert flange records; rebuild the source first")
    verified = {row["componentId"]: row for row in dimensions["rows"]}
    db.execute("BEGIN IMMEDIATE")
    try:
        result = supplement.import_supplement(db, data, reference["id"], add_only=True, manage_transaction=False)
        corrected = 0
        for row in reference["rows"]:
            baseline = verified[row["baselineId"]]
            current = db.execute("""SELECT c.id,c.display_name,c.is_active,f.source_id,f.title
                FROM components c JOIN component_families f ON f.id=c.family_id
                JOIN component_catalogs cat ON cat.id=f.catalog_id
                WHERE cat.import_id=? AND cat.source_id='фланцы' AND c.source_id=?""",
                (result["importId"], baseline["componentId"])).fetchall()
            if len(current) != 1 or current[0][1:] != (baseline["name"], 1, baseline["tableId"], baseline["family"]):
                raise ValueError(f"Reference flange was edited or deactivated: {baseline['componentId']}")
            component_id = current[0][0]
            values = db.execute("""SELECT a.source_column,a.id,v.value_type,v.numeric_value,v.text_value
                FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id
                WHERE v.component_id=? AND a.source_column IN ('CALC_FLANGE_FACE_HEIGHT','CALC_FLANGE_SOURCE')""",
                (component_id,)).fetchall()
            values = {column: (attribute_id, kind, number, value) for column, attribute_id, kind, number, value in values}
            height = values.get("CALC_FLANGE_FACE_HEIGHT")
            target = baseline["dimensions"]["faceHeightMm"]
            if height is None or height[1:3] == ("number", target):
                continue
            if height[1:3] != ("number", 4) or values.get("CALC_FLANGE_SOURCE", (None,)*4)[3] != baseline["source"]:
                raise ValueError(f"Nonstandard face height was preserved: {baseline['componentId']}")
            corrected += db.execute("""UPDATE component_attribute_values SET numeric_value=?
                WHERE component_id=? AND attribute_definition_id=?""", (target, component_id, height[0])).rowcount
        if db.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Foreign key check failed")
        db.commit()
        return {**result, "correctedBFaceHeights": corrected}
    except Exception:
        db.rollback()
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    args = parser.parse_args()
    data = read("public/binding-components.json")
    reference = read("data/st20-ready-bore-flanges.json")
    dimensions = read("data/flange-dimensions.json")
    if len({data["source"]["sha256"], reference["sourceSha256"], dimensions["sourceSha256"]}) != 1:
        raise ValueError("Flange source workbook mismatch")
    with closing(sqlite3.connect(args.database.resolve(strict=True).as_uri() + "?mode=rw", uri=True, timeout=30)) as db:
        db.execute("PRAGMA foreign_keys=ON")
        backup = ROOT / "work/backups" / ("before-st20-ready-bore-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f") + ".sqlite")
        backup.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(backup)) as destination:
            db.backup(destination)
        result = import_flanges(db, data, reference, dimensions)
        print(json.dumps({"import": result, "backup": str(backup), "integrity": db.execute("PRAGMA quick_check").fetchone()[0]}))
