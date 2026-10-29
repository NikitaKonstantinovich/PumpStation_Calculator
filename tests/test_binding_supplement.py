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
        self.assertEqual(self.db.execute("SELECT count(*) FROM components").fetchone()[0], len(self.data["items"]))
        self.db.execute("UPDATE component_prices SET amount_microunits=123000000 WHERE component_id=(SELECT id FROM components WHERE article IS NULL LIMIT 1)")
        self.db.commit()
        before = self.db.execute("SELECT * FROM component_prices WHERE component_id=(SELECT id FROM components WHERE article IS NULL LIMIT 1)").fetchall()
        result = module.import_supplement(self.db, self.data, "lunda-ld-67-504")
        self.assertFalse(result["initializedCatalogue"])
        self.assertEqual(self.db.execute("SELECT count(*) FROM components").fetchone()[0], len(self.data["items"]))
        self.assertEqual(self.db.execute("SELECT count(*) FROM component_prices").fetchone()[0], sum(len(row["prices"]) for row in self.data["items"]))
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

    def test_newkey_prices_and_standard_geometry_persist_without_touching_existing_flanges(self):
        supplier = "newkey-flanges-20261026"
        module.import_supplement(self.db, self.data, supplier)
        before = self.db.execute("""SELECT c.id,p.* FROM components c JOIN component_prices p ON p.component_id=c.id
          JOIN component_families f ON f.id=c.family_id WHERE f.source_id<>? ORDER BY c.id,p.id""", (supplier,)).fetchall()
        self.assertEqual(module.import_supplement(self.db, self.data, supplier)["supplierRows"], 5)
        self.assertEqual(self.db.execute("""SELECT c.id,p.* FROM components c JOIN component_prices p ON p.component_id=c.id
          JOIN component_families f ON f.id=c.family_id WHERE f.source_id<>? ORDER BY c.id,p.id""", (supplier,)).fetchall(), before)
        for dn, price, od, thickness, bore in [(32, 1847, 42.4, 18, 43.1), (50, 2710, 60.3, 20, 61.1), (40, 2173, 48.3, 18, 49), (125, 7365, 139.7, 26, 141.6)]:
            source_id = f"newkey-din2503:NK-FDh{dn}-4"
            self.assertEqual(self.db.execute("SELECT count(*) FROM components WHERE source_id=?", (source_id,)).fetchone()[0], 1)
            self.assertEqual(self.db.execute("SELECT p.amount_microunits,p.currency FROM component_prices p JOIN components c ON c.id=p.component_id WHERE c.source_id=?", (source_id,)).fetchone(), (price * 1000000, "RUB"))
            attrs = dict(self.db.execute("""SELECT a.source_column,coalesce(v.numeric_value,v.text_value) FROM component_attribute_values v
              JOIN attribute_definitions a ON a.id=v.attribute_definition_id JOIN components c ON c.id=v.component_id WHERE c.source_id=?""", (source_id,)).fetchall())
            self.assertEqual(attrs["CALC_FLANGE_PIPE_OD"], od)
            self.assertEqual(attrs["pn"], 40)
            self.assertEqual(attrs["compatiblePns"], "25/40")
            self.assertEqual(attrs["geometryBasis"], "declared-standard-nominal")
            self.assertEqual(attrs["CALC_FLANGE_B"], thickness)
            self.assertEqual(attrs["CALC_FLANGE_BORE"], bore)
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_supplier_flange_create_repeat_update_preserves_workbook_rows(self):
        supplier = "supplier-flanges-20261026"
        module.import_supplement(self.db, self.data, supplier)
        unrelated = self.db.execute("""SELECT c.id,p.* FROM components c
          JOIN component_families f ON f.id=c.family_id JOIN component_prices p ON p.component_id=c.id
          WHERE f.source_id<>? ORDER BY c.id,p.id""", (supplier,)).fetchall()
        before_ids = self.db.execute("SELECT id FROM components ORDER BY id").fetchall()
        result = module.import_supplement(self.db, self.data, supplier)
        self.assertEqual(result["supplierRows"], 7)
        self.assertEqual(self.db.execute("SELECT id FROM components ORDER BY id").fetchall(), before_ids)
        self.assertEqual(self.db.execute("""SELECT c.id,p.* FROM components c
          JOIN component_families f ON f.id=c.family_id JOIN component_prices p ON p.component_id=c.id
          WHERE f.source_id<>? ORDER BY c.id,p.id""", (supplier,)).fetchall(), unrelated)
        changed = copy.deepcopy(self.data)
        next(row for row in changed["items"] if row["id"] == "ifitting-en01:1154")["prices"][0]["amount"] = 8800
        module.import_supplement(self.db, changed, supplier)
        self.assertEqual(self.db.execute("SELECT p.amount_microunits FROM component_prices p JOIN components c ON c.id=p.component_id WHERE c.source_id='ifitting-en01:1154'").fetchone()[0], 8800000000)
        self.assertEqual(self.db.execute("""SELECT v.numeric_value FROM component_attribute_values v
          JOIN attribute_definitions a ON a.id=v.attribute_definition_id JOIN components c ON c.id=v.component_id
          WHERE c.source_id='ifitting-en01:1154' AND a.source_column='CALC_FLANGE_BORE'""").fetchone()[0], 116)
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])


if __name__ == "__main__":
    unittest.main()
