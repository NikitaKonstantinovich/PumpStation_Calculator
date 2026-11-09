"""Catalog identity and pinned CAD release regressions (no OCP required)."""
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("catalog_links", Path(__file__).resolve().parents[1] / "services/model-converter/catalog_links.py")
links = importlib.util.module_from_spec(spec)
spec.loader.exec_module(links)


class CatalogLinksTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "catalog.sqlite"
        self.db = sqlite3.connect(self.path)
        self.db.executescript("""
            CREATE TABLE variants(id TEXT,model_id TEXT);
            CREATE TABLE motor_configurations(variant_id TEXT,power_kw REAL);
            CREATE TABLE variant_cad_candidates(variant_id TEXT,binding_id TEXT);
            CREATE TABLE assets(id TEXT,sha256 TEXT);
            CREATE TABLE cad_bindings(id TEXT,model_id TEXT,asset_id TEXT,is_default INTEGER,execution_match_status TEXT,assembly_approved INTEGER,profile_json TEXT);
            CREATE TABLE cad_dimension_verifications(binding_id TEXT,declared_CAD_motor_power_kw REAL);
            INSERT INTO variants VALUES ('CNP:new','old'),('Wellmix:new','other');
            INSERT INTO motor_configurations VALUES ('CNP:new',5.5);
            INSERT INTO assets VALUES ('asset','hash');
        """)
        self.profile = {"key": "pump:old", "sourceHash": "hash", "pumpId": "old", "warnings": ["Review"], "ports": [{"point": [0, 0, 0]}]}
        self.db.execute("INSERT INTO cad_bindings VALUES ('binding','old','asset',1,'execution_review',0,?)", (json.dumps(self.profile),))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def resolve(self):
        self.db.commit()
        return links.catalog_links(self.path, ["pump:CNP:new", "pump:Wellmix:new", "equipment:old"])

    def test_explicit_model_relation_keeps_warnings_and_does_not_match_other_brand(self):
        mapping = self.resolve()
        self.assertEqual(list(mapping), ["pump:CNP:new"])
        library = {"pump:old": dict(self.profile)}
        links.apply_catalog_links(library, mapping)
        alias = library["pump:CNP:new"]
        self.assertEqual(alias["ports"], self.profile["ports"])
        self.assertEqual(alias["catalogBinding"]["scope"], "model_default")
        self.assertFalse(alias["catalogBinding"]["assemblyApproved"])
        self.assertEqual(len(alias["warnings"]), 2)
        self.assertEqual(self.profile["warnings"], ["Review"])

    def test_different_pinned_source_hash_is_not_replaced_by_latest_catalog(self):
        library = {"pump:old": {**self.profile, "sourceHash": "pinned-other"}}
        links.apply_catalog_links(library, self.resolve())
        self.assertNotIn("pump:CNP:new", library)

    def test_existing_variant_profile_has_priority(self):
        original = {"sourceHash": "exact-variant"}
        library = {"pump:old": self.profile, "pump:CNP:new": original}
        links.apply_catalog_links(library, self.resolve())
        self.assertIs(library["pump:CNP:new"], original)

    def test_rejected_binding_and_motor_conflict_remain_unbound(self):
        self.db.execute("UPDATE cad_bindings SET execution_match_status='rejected_wrong_motor'")
        self.assertEqual(self.resolve(), {})
        self.db.execute("UPDATE cad_bindings SET execution_match_status='execution_review'")
        self.db.execute("INSERT INTO cad_dimension_verifications VALUES ('binding',7.5)")
        self.assertEqual(self.resolve(), {})

    def test_variant_candidates_do_not_fall_back_to_another_default(self):
        self.db.execute("INSERT INTO variant_cad_candidates VALUES ('CNP:new','missing-binding')")
        self.assertEqual(self.resolve(), {})

    def test_ambiguous_geometry_is_not_chosen_arbitrarily(self):
        self.db.execute("INSERT INTO assets VALUES ('other','other-hash')")
        self.db.execute("INSERT INTO cad_bindings VALUES ('other','old','other',1,'execution_review',0,?)", (json.dumps({**self.profile, "sourceHash": "other-hash"}),))
        self.assertEqual(self.resolve(), {})


if __name__ == "__main__":
    unittest.main()
