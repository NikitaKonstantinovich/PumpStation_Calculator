import copy
import importlib.util
import json
from pathlib import Path
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("replacement", ROOT / "scripts/import-standard-stainless-flanges.py")
replacement = importlib.util.module_from_spec(spec)
spec.loader.exec_module(replacement)

class StandardStainlessImportTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((ROOT / "public/binding-components.json").read_text(encoding="utf8"))
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript((ROOT / "drizzle/0000_burly_jackpot.sql").read_text(encoding="utf8"))
        before = copy.deepcopy(self.data)
        before["items"] = [r for r in before["items"] if r["tableId"] != replacement.REFERENCE["id"]]
        cat = next(c for c in before["catalogs"] if c["id"] == "фланцы")
        for file in ["werk-flanges.json", "bene-inox-flanges.json"]:
            old = json.loads((ROOT / "data" / file).read_text(encoding="utf8"))
            cat["tables"].append({"id": old["id"], "title": old["family"], "sourceRange": "Historical", "sourceUrls": [old["dimensionUrl"]]})
            for index, r in enumerate(old["rows"]):
                before["items"].append({"id":r["id"], "catalogId":cat["id"], "tableId":old["id"], "family":old["family"], "sourceRow":index+1,
                    "fields":[{"column":"name", "headerPath":["Наименование"], "value":r["name"]}],
                    "prices":[] if r["price"] is None else [{"label":r["priceLabel"],"amount":r["price"],"currency":"RUB","sourceColumn":"price"}], "sourceUrls":[r["url"]]})
        replacement.module.import_supplement(self.db, before, "lunda-ld-67-504")

    def dump(self):
        return list(self.db.iterdump())

    def test_create_retire_repeat_and_preserve(self):
        before = self.dump()
        result = replacement.import_flanges(self.db, self.data)
        self.assertEqual((result["created"],result["retired"]), (10,10))
        after = self.dump()
        removed = [s for s in before if s.startswith("INSERT") and s not in after and '"sqlite_sequence"' not in s]
        self.assertEqual(len(removed),10)
        self.assertTrue(all(s.startswith('INSERT INTO "components"') for s in removed))
        result = replacement.import_flanges(self.db,self.data)
        self.assertEqual((result["unchanged"],result["retired"]),(10,0))
        self.assertEqual(self.dump(),after)
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(),[])
        for r in replacement.REFERENCE["rows"]:
            price = self.db.execute("SELECT p.amount_microunits FROM components c JOIN component_prices p ON c.id=p.component_id WHERE c.source_id=? AND c.is_active=1",(r["id"],)).fetchone()
            self.assertEqual(price[0],round(r["price"]*1_000_000))

    def test_unknown_retired_record_rolls_back(self):
        self.db.execute("UPDATE components SET source_id='user-edited' WHERE source_id='bene-inox-5714:357142-20016'")
        self.db.commit()
        before=self.dump()
        with self.assertRaisesRegex(ValueError,"Unexpected retired"):
            replacement.import_flanges(self.db,self.data)
        self.assertEqual(self.dump(),before)

    def test_existing_price_edit_is_preserved(self):
        replacement.import_flanges(self.db,self.data)
        self.db.execute("UPDATE component_prices SET amount_microunits=123000000 WHERE component_id=(SELECT id FROM components WHERE source_id=?)",(replacement.REFERENCE["rows"][0]["id"],))
        self.db.commit()
        before=self.dump()
        with self.assertRaisesRegex(ValueError,"preserved without overwrite"):
            replacement.import_flanges(self.db,self.data)
        self.assertEqual(self.dump(),before)

if __name__ == "__main__":
    unittest.main()
