import copy
import importlib.util
import json
from pathlib import Path
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("supplier_import", ROOT / "scripts/import-binding-supplement.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SupplierImportTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript((ROOT / "drizzle/0000_burly_jackpot.sql").read_text(encoding="utf-8"))
        self.data = json.loads((ROOT / "public/binding-components.json").read_text(encoding="utf-8"))

    def tearDown(self):
        self.db.close()

    def test_bootstrap_and_repeat_preserve_unrelated_prices(self):
        result = module.import_supplement(self.db, self.data, "lunda-ld-67-504")
        self.assertTrue(result["initializedCatalogue"])
        self.assertEqual(self.db.execute("SELECT count(*) FROM components").fetchone()[0], 1800)
        self.db.execute("UPDATE component_prices SET amount_microunits=123000000 WHERE component_id=(SELECT id FROM components WHERE article IS NULL LIMIT 1)")
        self.db.commit()
        before = self.db.execute("SELECT * FROM component_prices WHERE component_id=(SELECT id FROM components WHERE article IS NULL LIMIT 1)").fetchall()
        result = module.import_supplement(self.db, self.data, "lunda-ld-67-504")
        self.assertFalse(result["initializedCatalogue"])
        self.assertEqual(self.db.execute("SELECT count(*) FROM components").fetchone()[0], 1800)
        self.assertEqual(self.db.execute("SELECT count(*) FROM component_prices").fetchone()[0], 4232)
        self.assertEqual(self.db.execute("SELECT * FROM component_prices WHERE component_id=(SELECT id FROM components WHERE article IS NULL LIMIT 1)").fetchall(), before)
        self.assertEqual(self.db.execute("SELECT p.amount_microunits FROM component_prices p JOIN components c ON c.id=p.component_id WHERE c.article='LD.67.504.15'").fetchone()[0], 56120000)
        self.assertEqual(self.db.execute("SELECT count(*) FROM component_data_sources s JOIN components c ON c.id=s.component_id WHERE c.article LIKE 'LD.67.504.%'").fetchone()[0], 18)
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_invalid_price_rolls_back_entire_import(self):
        data = copy.deepcopy(self.data)
        next(v for v in data["items"] if v["tableId"] == "lunda-ld-67-504")["prices"][0]["amount"] = -1
        with self.assertRaises(sqlite3.IntegrityError):
            module.import_supplement(self.db, data, "lunda-ld-67-504")
        self.assertEqual(self.db.execute("SELECT count(*) FROM catalog_imports").fetchone()[0], 0)
        self.assertEqual(self.db.execute("SELECT count(*) FROM components").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
