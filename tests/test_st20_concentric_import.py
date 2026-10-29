import copy
import importlib.util
import json
from pathlib import Path
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("st20_import", ROOT / "scripts/import-st20-concentric-reducers.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ConcentricImportTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript((ROOT / "drizzle/0000_burly_jackpot.sql").read_text(encoding="utf8"))
        self.data = json.loads((ROOT / "public/binding-components.json").read_text(encoding="utf8"))
        before = copy.deepcopy(self.data)
        before["items"] = [r for r in before["items"] if r["tableId"] != MODULE.FAMILY]
        MODULE.MODULE.import_supplement(self.db, before, "lunda-ld-67-504")
        self.before = list(self.db.iterdump())

    def tearDown(self):
        self.db.close()

    def test_add_repeat_preserve_every_existing_value(self):
        result = MODULE.import_reducers(self.db, self.data)
        self.assertEqual(result["created"], 162)
        after = list(self.db.iterdump())
        # All earlier inserts remain byte-for-byte in the database dump.
        after_set = set(after)
        for line in self.before:
            if line.startswith("INSERT") and '"sqlite_sequence"' not in line:
                self.assertTrue(line in after_set, line[:200])
        repeated = MODULE.import_reducers(self.db, self.data)
        self.assertEqual(repeated["created"], 0)
        self.assertEqual(repeated["unchanged"], 162)
        self.assertEqual(list(self.db.iterdump()), after)
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_conflict_preserves_user_edit_and_rolls_back_pending_additions(self):
        one = copy.deepcopy(self.data)
        targets = [r for r in one["items"] if r["tableId"] == MODULE.FAMILY]
        one["items"] = [targets[-1]]
        MODULE.import_reducers(self.db, one)
        self.db.execute("UPDATE component_prices SET amount_microunits=123000000 WHERE component_id=(SELECT id FROM components WHERE source_id=?)", (targets[-1]["id"],))
        self.db.commit()
        before = list(self.db.iterdump())
        with self.assertRaisesRegex(ValueError, "preserved without overwrite"):
            MODULE.import_reducers(self.db, self.data)
        self.assertEqual(list(self.db.iterdump()), before)

    def test_wrong_workbook_or_invalid_price_cannot_partially_import(self):
        changed = copy.deepcopy(self.data)
        changed["source"]["sha256"] = "different"
        with self.assertRaisesRegex(ValueError, "matching active workbook"):
            MODULE.import_reducers(self.db, changed)
        changed = copy.deepcopy(self.data)
        [r for r in changed["items"] if r["tableId"] == MODULE.FAMILY][-1]["prices"][0]["amount"] = -1
        with self.assertRaises(sqlite3.IntegrityError):
            MODULE.import_reducers(self.db, changed)
        self.assertEqual(list(self.db.iterdump()), self.before)


if __name__ == "__main__":
    unittest.main()
