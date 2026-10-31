import copy
from contextlib import closing
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
ENDS = load("thread_ends", "scripts/import-thread-ends.py")
RATES = load("thread_rates", "scripts/import-thread-cutting-rates.py")

class ThreadImportTests(unittest.TestCase):
    def test_add_repeat_and_preserve_user_edits(self):
        data = json.loads((ROOT / "public/binding-components.json").read_text(encoding="utf8"))
        before = copy.deepcopy(data)
        before["items"] = [r for r in before["items"] if not r["id"].startswith("thread-end:")]
        with sqlite3.connect(":memory:") as db:
            db.execute("PRAGMA foreign_keys=ON")
            db.executescript((ROOT / "drizzle/0000_burly_jackpot.sql").read_text(encoding="utf8"))
            ENDS.module.import_supplement(db, before, "lunda-ld-67-504")
            original = [s for s in db.iterdump() if s.startswith("INSERT") and '"sqlite_sequence"' not in s]
            self.assertEqual(sum(r["created"] for r in ENDS.import_ends(db, data)), 13)
            after = list(db.iterdump())
            self.assertTrue(set(original).issubset(after))
            self.assertEqual(sum(r["unchanged"] for r in ENDS.import_ends(db, data)), 13)
            self.assertEqual(list(db.iterdump()), after)
            db.execute("UPDATE component_prices SET amount_microunits=999000000 WHERE component_id=(SELECT id FROM components WHERE source_id='thread-end:dnru-d270-18510')")
            db.commit()
            edited = list(db.iterdump())
            with self.assertRaisesRegex(ValueError, "preserved without overwrite"):
                ENDS.import_ends(db, data)
            self.assertEqual(list(db.iterdump()), edited)
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_tariff_publication_preserves_old_version_and_unpublished_edits(self):
        with tempfile.TemporaryDirectory(dir=ROOT / "work") as folder:
            root=Path(folder); (root/"data").mkdir()
            (root/"data/thread-cutting-prices.json").write_bytes((ROOT/"data/thread-cutting-prices.json").read_bytes())
            previousRoot=RATES.ROOT; RATES.ROOT=root
            self.addCleanup(setattr,RATES,"ROOT",previousRoot)
            path=root/"test.sqlite"
            original={"welding":{"aisi304":5000},"other":"preserve"}
            draft=copy.deepcopy(original);draft["welding"]["aisi304"]=7777
            with closing(sqlite3.connect(path)) as db, db:
                db.executescript((ROOT/"drizzle/0011_base_values.sql").read_text(encoding="utf8"))
                db.execute("INSERT INTO base_value_versions(id,values_json,author) VALUES(?,?,?)",("original",json.dumps(original),"user"))
                db.execute("INSERT INTO base_value_state(id,active_id,draft_json,draft_author,revision) VALUES(1,?,?,?,0)",("original",json.dumps(draft),"user"))
            self.assertTrue(RATES.publish(path)["preview"])
            self.assertTrue(RATES.publish(path,True)["created"])
            self.assertFalse(RATES.publish(path,True)["created"])
            with closing(sqlite3.connect(path)) as db:
                self.assertEqual(json.loads(db.execute("SELECT values_json FROM base_value_versions WHERE id='original'").fetchone()[0]),original)
                current=json.loads(db.execute("SELECT v.values_json FROM base_value_state s JOIN base_value_versions v ON s.active_id=v.id").fetchone()[0])
                pending=json.loads(db.execute("SELECT draft_json FROM base_value_state").fetchone()[0])
                self.assertEqual(current["welding"]["aisi304"],5000)
                self.assertEqual(pending["welding"]["aisi304"],7777)
                self.assertEqual(len(current["welding"]["threadCutting"]),12)
                self.assertEqual(current["other"],"preserve")
                self.assertEqual(db.execute("SELECT COUNT(*) FROM base_value_versions").fetchone()[0],2)

if __name__ == "__main__":
    unittest.main()
