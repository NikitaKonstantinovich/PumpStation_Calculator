import copy
import importlib.util
import json
from pathlib import Path
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[1]
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
FIX = load("insert_fix", "scripts/import-insert-error-fixes.py")
LENGTHS = load("insert_lengths", "scripts/import-reducer-dimensions.py")


class InsertErrorFixTests(unittest.TestCase):
    def test_scoped_atomic_import_and_lengths_repeat_without_repricing(self):
        data = json.loads((ROOT / "public/binding-components.json").read_text(encoding="utf8"))
        standards = json.loads((ROOT / "data/component-insert-standards.json").read_text(encoding="utf8"))
        before = copy.deepcopy(data)
        before["items"] = [row for row in before["items"] if row["id"] not in FIX.IDS]
        targets = {row["componentId"] for row in standards["reducerAnalogueLengthPolicy"]["rows"]}
        for row in before["items"]:
            if row["id"] in targets:
                row["fields"] = [f for f in row["fields"] if not f["column"].startswith("CALC_INSERT_LENGTH")]
        with sqlite3.connect(":memory:") as db:
            db.execute("PRAGMA foreign_keys=ON")
            db.executescript((ROOT / "drizzle/0000_burly_jackpot.sql").read_text(encoding="utf8"))
            FIX.supplement.import_supplement(db, before, "lunda-ld-67-504")
            prices = db.execute("SELECT * FROM component_prices ORDER BY id").fetchall()
            self.assertEqual(sum(r["created"] for r in FIX.import_parts(db, data)),4)
            self.assertTrue(set(prices).issubset(db.execute("SELECT * FROM component_prices ORDER BY id").fetchall()))
            after = list(db.iterdump())
            self.assertEqual(sum(r["unchanged"] for r in FIX.import_parts(db, data)),4)
            self.assertEqual(list(db.iterdump()),after)
            scoped = {**standards,"reducerLengths":[r for r in standards["reducerLengths"] if r["componentId"] in targets],
                      "reducerLengthReviews":[r for r in standards["reducerLengthReviews"] if r["componentId"] in targets]}
            prices = db.execute("SELECT * FROM component_prices ORDER BY id").fetchall()
            self.assertEqual(LENGTHS.import_dimensions(db,scoped)["updated"],12)
            self.assertEqual(LENGTHS.import_dimensions(db,scoped)["updated"],0)
            self.assertEqual(db.execute("SELECT * FROM component_prices ORDER BY id").fetchall(),prices)
            changed = copy.deepcopy(scoped)
            changed["reducerLengths"][0]["wallThickness"] += 1
            with self.assertRaisesRegex(ValueError,"project analogue"):
                LENGTHS.import_dimensions(db,changed)
            db.execute("UPDATE component_prices SET amount_microunits=1 WHERE component_id=(SELECT id FROM components WHERE source_id='thread-end:dnru-d270-17412')")
            db.commit()
            edited=list(db.iterdump())
            with self.assertRaisesRegex(ValueError,"preserved without overwrite"):
                FIX.import_parts(db,data)
            self.assertEqual(list(db.iterdump()),edited)
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(),[])


if __name__ == "__main__":
    unittest.main()
