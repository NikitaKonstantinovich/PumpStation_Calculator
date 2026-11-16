import copy
import importlib.util
import json
from pathlib import Path
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("reducer_import", ROOT / "scripts/import-reducer-dimensions.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReducerDimensionImportTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript((ROOT / "drizzle/0000_burly_jackpot.sql").read_text(encoding="utf-8"))
        self.db.execute("INSERT INTO catalog_imports(id,source_file,source_sha256,source_size_bytes,source_modified_at) VALUES(1,'fixture',?,1,'fixture')", ("a" * 64,))
        self.db.execute("INSERT INTO component_catalogs(id,import_id,source_id,name,source_sheet) VALUES(1,1,'переходы','Переходы','Переходы')")
        self.db.execute("INSERT INTO component_families(id,catalog_id,source_id,title,source_range) VALUES(1,1,'fixture-family','Переходы концентрические Сталь 20 ГОСТ 17378','B1:J3')")
        for component_id in [1, 2]:
            self.db.execute("INSERT INTO components(id,family_id,source_id,source_row) VALUES(?,1,?,?)", (component_id, f"fixture-{component_id}", component_id + 1))
            self.db.execute("INSERT INTO component_prices(component_id,label,amount_microunits,source_column) VALUES(?,'Цена',123456000,'I')", (component_id,))
        for attr_id, label, value in [(1, "Диаметр, мм", 60.3), (2, "Диаметр меньший, мм", 48.3), (3, "Толщина 1, мм", 2.9), (4, "Толщина 2, мм", 2.6)]:
            self.db.execute("INSERT INTO attribute_definitions(id,family_id,source_column,key,label,header_path_json,data_type) VALUES(?,1,?,?,?,?, 'number')", (attr_id, str(attr_id), str(attr_id), label, json.dumps([label])))
            for component_id in [1, 2]:
                self.db.execute("INSERT INTO component_attribute_values(component_id,attribute_definition_id,value_type,numeric_value) VALUES(?,?,'number',?)", (component_id, attr_id, value))
        self.db.commit()
        self.db.executescript((ROOT / "drizzle/0009_component_source_revision.sql").read_text(encoding="utf-8"))
        self.data = {"sourceSha256": "a" * 64, "reducerLengths": [{"componentId": "fixture-1", "material": "st20", "outerDiameter": 60.3, "outerDiameterSmall": 48.3, "wallThickness": 2.9, "wallThicknessSmall": 2.6, "lengthMm": 76, "source": "Explicit fixture standard reference"}]}

    def tearDown(self):
        self.db.close()

    def reviewed(self, **patch):
        data = copy.deepcopy(self.data)
        data["reducerLengthReviews"] = [{**data["reducerLengths"][0], "geometry": "concentric", "status": "confirmed", "candidateLengthsMm": [76], "reason": "Exact dimensions and specified execution confirmed.", "verifiedAt": "2026-10-04", **patch}]
        return data

    def fields(self, component_id=1):
        return dict(self.db.execute("SELECT a.source_column,COALESCE(v.numeric_value,v.text_value) FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE v.component_id=?", (component_id,)).fetchall())

    def revision(self):
        return self.db.execute("SELECT revision FROM component_calculator_source_revision WHERE id=1").fetchone()[0]

    def native_length(self, length):
        for column, label, value in [("native-L", "Длина перехода, мм", length), ("native-source", "Источник длины", "User drawing")]:
            attribute = self.db.execute("INSERT INTO attribute_definitions(family_id,source_column,key,label,header_path_json,data_type) VALUES(1,?,?,?,?, 'text') RETURNING id", (column, column, label, json.dumps([label]))).fetchone()[0]
            self.db.execute("INSERT INTO component_attribute_values(component_id,attribute_definition_id,value_type,text_value) VALUES(1,?,'text',?)", (attribute, str(value)))
        self.db.commit()

    def test_idempotent_dimensions_and_sources_preserve_all_prices(self):
        prices = self.db.execute("SELECT * FROM component_prices").fetchall()
        first = module.import_dimensions(self.db, self.data)
        self.assertEqual(first, {"updated": 1, "unchanged": 0, "auditUpdated": 0, "auditUnchanged": 0, "skipped": []})
        revision, changes = self.revision(), self.db.total_changes
        repeated = module.import_dimensions(self.db, self.data)
        self.assertEqual(repeated, {"updated": 0, "unchanged": 1, "auditUpdated": 0, "auditUnchanged": 0, "skipped": []})
        self.assertEqual(self.revision(), revision)
        self.assertEqual(self.db.total_changes, changes)
        values = self.db.execute("SELECT a.source_column,v.numeric_value,v.text_value FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE v.component_id=1 AND a.source_column LIKE 'CALC_INSERT_%'").fetchall()
        self.assertEqual(len(values), 2)
        self.assertIn((module.LENGTH_COLUMN, 76, None), values)
        self.assertIn((module.SOURCE_COLUMN, None, "Explicit fixture standard reference"), values)
        self.assertEqual(self.db.execute("SELECT * FROM component_prices").fetchall(), prices)
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_reviews_persist_all_evidence_and_repeated_import_has_no_writes(self):
        first = module.import_dimensions(self.db, self.reviewed())
        self.assertEqual((first["updated"], first["auditUpdated"]), (1, 1))
        values = self.fields()
        self.assertEqual(values[module.REVIEW_COLUMNS["status"]], "confirmed")
        self.assertEqual(values[module.REVIEW_COLUMNS["options"]], "[76]")
        self.assertEqual(values[module.REVIEW_COLUMNS["source"]], "Explicit fixture standard reference")
        self.assertEqual(values[module.REVIEW_COLUMNS["checkedAt"]], "2026-10-04")
        self.assertIn("Exact dimensions", values[module.REVIEW_COLUMNS["reason"]])
        revision, changes = self.revision(), self.db.total_changes
        result = module.import_dimensions(self.db, self.reviewed())
        self.assertEqual(result, {"updated": 0, "unchanged": 1, "auditUpdated": 0, "auditUnchanged": 1, "skipped": []})
        self.assertEqual((self.revision(), self.db.total_changes), (revision, changes))

    def test_ambiguous_or_unconfirmed_review_revokes_only_managed_length(self):
        prices = self.db.execute("SELECT * FROM component_prices").fetchall()
        for status, candidates in [("ambiguous", [75, 55]), ("unconfirmed", []), ("invalid", [])]:
            module.import_dimensions(self.db, self.reviewed())
            data = self.reviewed(status=status, candidateLengthsMm=candidates)
            data["reducerLengths"] = []
            result = module.import_dimensions(self.db, data)
            self.assertEqual((result["updated"], result["auditUpdated"]), (1, 1))
            values = self.fields()
            self.assertNotIn(module.LENGTH_COLUMN, values)
            self.assertNotIn(module.SOURCE_COLUMN, values)
            self.assertEqual(values[module.REVIEW_COLUMNS["status"]], status)
            self.assertEqual(json.loads(values[module.REVIEW_COLUMNS["options"]]), sorted(candidates))
            self.assertEqual(values["1"], 60.3)
            revision, changes = self.revision(), self.db.total_changes
            result = module.import_dimensions(self.db, data)
            self.assertEqual((result["updated"], result["auditUpdated"], result["auditUnchanged"]), (0, 0, 1))
            self.assertEqual((self.revision(), self.db.total_changes), (revision, changes))
        self.assertEqual(self.db.execute("SELECT * FROM component_prices").fetchall(), prices)

    def test_tampered_review_cannot_remove_fields_outside_exact_geometry_and_material_scope(self):
        module.import_dimensions(self.db, self.reviewed())
        fields, revision, changes = self.fields(), self.revision(), self.db.total_changes
        for patch in [{"material": "aisi304"}, {"geometry": "eccentric"}, {"outerDiameter": 61}, {"outerDiameterSmall": 49}, {"wallThickness": 3}, {"wallThicknessSmall": 3}]:
            data = self.reviewed(status="unconfirmed", candidateLengthsMm=[], **patch)
            data["reducerLengths"] = []
            result = module.import_dimensions(self.db, data)
            self.assertEqual((result["updated"], result["auditUpdated"], len(result["skipped"])), (0, 0, 1))
            self.assertEqual(self.fields(), fields)
            self.assertEqual((self.revision(), self.db.total_changes), (revision, changes))

    def test_native_length_survives_without_false_confirmation_or_stale_managed_length(self):
        module.import_dimensions(self.db, self.reviewed())
        self.native_length(90)
        result = module.import_dimensions(self.db, self.reviewed())
        self.assertEqual((result["updated"], result["auditUpdated"], len(result["skipped"])), (1, 1, 1))
        values = self.fields()
        self.assertEqual(values["native-L"], "90")
        self.assertEqual(values["native-source"], "User drawing")
        self.assertNotIn(module.LENGTH_COLUMN, values)
        self.assertNotIn(module.SOURCE_COLUMN, values)
        self.assertEqual(values[module.REVIEW_COLUMNS["status"]], "invalid")
        self.assertIn("90 мм", values[module.REVIEW_COLUMNS["reason"]])
        revision, changes = self.revision(), self.db.total_changes
        repeated = module.import_dimensions(self.db, self.reviewed())
        self.assertEqual((repeated["updated"], repeated["auditUpdated"], repeated["auditUnchanged"]), (0, 0, 1))
        self.assertEqual((self.revision(), self.db.total_changes), (revision, changes))

    def test_equal_native_length_is_preserved_and_reviewed_without_creating_numeric_duplicate(self):
        self.native_length(76)
        result = module.import_dimensions(self.db, self.reviewed())
        self.assertEqual((result["updated"], result["auditUpdated"]), (0, 1))
        self.assertEqual(self.fields()["native-L"], "76")
        self.assertNotIn(module.LENGTH_COLUMN, self.fields())
        self.assertEqual(self.fields()[module.REVIEW_COLUMNS["status"]], "confirmed")

    def test_changed_revision_or_geometry_cannot_inherit_standard_lengths(self):
        different = copy.deepcopy(self.data)
        different["sourceSha256"] = "b" * 64
        with self.assertRaisesRegex(ValueError, "revision"):
            module.import_dimensions(self.db, different)
        for patch in [{"wallThickness": 3}, {"material": "aisi304"}, {"outerDiameterSmall": 42.4}]:
            different = copy.deepcopy(self.data)
            different["reducerLengths"][0].update(patch)
            result = module.import_dimensions(self.db, different)
            self.assertEqual(result["updated"], 0)
            self.assertEqual(len(result["skipped"]), 1)

    def test_invalid_later_dimension_rolls_back_prior_changes(self):
        different = copy.deepcopy(self.data)
        different["reducerLengths"].append({**different["reducerLengths"][0], "componentId": "fixture-2", "lengthMm": 0})
        with self.assertRaisesRegex(ValueError, "Invalid"):
            module.import_dimensions(self.db, different)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM attribute_definitions WHERE source_column LIKE 'CALC_INSERT_%'").fetchone()[0], 0)

    def test_failed_later_sql_write_rolls_back_all_lengths_reviews_and_source_revision(self):
        data = self.reviewed()
        data["reducerLengths"].append({**data["reducerLengths"][0], "componentId": "fixture-2"})
        data["reducerLengthReviews"].append({**data["reducerLengthReviews"][0], "componentId": "fixture-2"})
        self.db.executescript("CREATE TRIGGER fixture_fail_second BEFORE INSERT ON component_attribute_values WHEN NEW.component_id=2 BEGIN SELECT RAISE(ABORT,'fixture second write rejected'); END;")
        before, revision = self.fields(), self.revision()
        with self.assertRaisesRegex(sqlite3.IntegrityError, "second write rejected"):
            module.import_dimensions(self.db, data)
        self.assertEqual(self.fields(), before)
        self.assertEqual(self.revision(), revision)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM attribute_definitions WHERE source_column LIKE 'CALC_INSERT_%'").fetchone()[0], 0)

    def test_malformed_duplicate_and_contradictory_reviews_are_rejected_before_writes(self):
        for patch in [{"status": "invented"}, {"status": "ambiguous", "candidateLengthsMm": [76]}, {"candidateLengthsMm": [0]}, {"candidateLengthsMm": [76, 76]}, {"material": "brass"}, {"verifiedAt": "yesterday"}, {"source": ""}, {"wallThicknessSmall": 0}, {"candidateLengthsMm": [80]}, {"outerDiameter": 63}]:
            with self.assertRaises(ValueError):
                module.import_dimensions(self.db, self.reviewed(**patch))
        data = self.reviewed()
        data["reducerLengths"] = []
        with self.assertRaisesRegex(ValueError, "lacks verified length"):
            module.import_dimensions(self.db, data)
        data = self.reviewed()
        data["reducerLengthReviews"].append(data["reducerLengthReviews"][0])
        with self.assertRaisesRegex(ValueError, "duplicate"):
            module.import_dimensions(self.db, data)
        self.assertEqual(self.revision(), 0)

    def test_stainless_length_requires_native_standard_and_execution(self):
        self.db.execute("UPDATE component_families SET title='Переходы концентрические AISI304' WHERE id=1")
        self.db.commit()
        data = self.reviewed(material="aisi304")
        data["reducerLengths"][0].update(material="aisi304", geometry="concentric", standard="DIN 2616-1")
        module.import_dimensions(self.db, data)
        self.assertNotIn(module.LENGTH_COLUMN, self.fields())
        self.assertEqual(self.fields()[module.REVIEW_COLUMNS["status"]], "invalid")
        self.db.execute("INSERT INTO attribute_definitions(id,family_id,source_column,key,label,header_path_json,data_type) VALUES(99,1,'standard','standard','Стандарт',?,'text')", (json.dumps(["Стандарт"]),))
        self.db.execute("INSERT INTO component_attribute_values(component_id,attribute_definition_id,value_type,text_value) VALUES(1,99,'text','DIN 2616-1')")
        self.db.commit()
        result = module.import_dimensions(self.db, data)
        self.assertEqual(result["updated"], 1)
        self.assertEqual(self.fields()[module.LENGTH_COLUMN], 76)
        data["reducerLengths"][0]["standard"] = "ГОСТ 17378-2001"
        module.import_dimensions(self.db, data)
        self.assertNotIn(module.LENGTH_COLUMN, self.fields())
        self.assertEqual(self.fields()[module.REVIEW_COLUMNS["status"]], "invalid")

    def test_explicitly_adopted_geometry_is_required_and_imported_without_repricing(self):
        self.db.execute("UPDATE component_families SET title='Переходы концентрические AISI304' WHERE id=1")
        self.db.commit()
        data = self.reviewed(material="aisi304")
        data["reducerLengthPolicy"] = {"id": "fixture-approved-geometry", "standard": "ГОСТ 17378-2001", "materials": ["aisi304"], "source": "Explicit fixture instruction"}
        data["reducerLengths"][0].update(material="aisi304", geometry="concentric", standard="ГОСТ 17378-2001", execution=1, basis="adopted-standard-geometry", adoptionId="fixture-approved-geometry")
        data["referenceGroups"] = [{"execution": 1, "outerDiameter": 60.3, "outerDiameterSmall": 48.3, "lengthMm": 76, "wallPairs": [[2.9, 2.6]]}]
        for field in ["reducerLengthPolicy", "referenceGroups"]:
            invalid = copy.deepcopy(data)
            del invalid[field]
            with self.assertRaisesRegex(ValueError, "Invalid adopted"):
                module.import_dimensions(self.db, invalid)
        prices = self.db.execute("SELECT * FROM component_prices").fetchall()
        self.assertEqual(module.import_dimensions(self.db, data)["updated"], 1)
        self.assertEqual(self.fields()[module.LENGTH_COLUMN], 76)
        revision = self.revision()
        self.assertEqual(module.import_dimensions(self.db, data)["updated"], 0)
        self.assertEqual(self.revision(), revision)
        self.assertEqual(self.db.execute("SELECT * FROM component_prices").fetchall(), prices)


if __name__ == "__main__":
    unittest.main()
