"""End-to-end batch preparation with actual STEP, duplicate inputs and bad CAD."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
from model_assets import file_hash, valid_stl


@unittest.skipUnless(importlib.util.find_spec("OCP"), "Requires project cadquery-ocp runtime")
class LibraryTests(unittest.TestCase):
    def test_batch_units_deduplication_failure_isolation_and_resume(self):
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
        from OCP.gp import gp_Pnt
        with tempfile.TemporaryDirectory(prefix="cad-library-test-") as directory:
            root = Path(directory)
            piping, fittings = root / "Equipment/Piping", root / "Equipment/Fittings"
            piping.mkdir(parents=True); fittings.mkdir(parents=True)
            source = piping / "offset-box.step"
            writer = STEPControl_Writer()
            writer.Transfer(BRepPrimAPI_MakeBox(gp_Pnt(-20, 10, 30), 50, 60, 70).Shape(), STEPControl_AsIs)
            self.assertEqual(int(writer.Write(str(source))), 1)
            (fittings / "same-body.stp").write_bytes(source.read_bytes())
            (piping / "bad.step").write_text("not a STEP file")
            output, state = root / "browser", root / "state"
            original = file_hash(source)
            command = [sys.executable, str(SCRIPTS / "prepare-equipment-library.py"), "--root", str(root), "--output", str(output), "--state", str(state), "--workers", "2", "--timeout", "30"]
            subprocess.run(command, check=True, capture_output=True, timeout=90)
            index = json.loads((output / "library.json").read_text(encoding="utf-8"))
            self.assertEqual(index["summary"], {"sourceFiles": 3, "uniqueModels": 2, "duplicates": 1, "ready": 1, "errors": 1, "pending": 0})
            model = next(m for m in index["models"] if m["status"] == "ready")
            self.assertEqual(len(model["sources"]), 2)
            self.assertEqual(model["ports"], [])
            for actual, expected in zip(model["bounds"], [-20, 10, 30, 30, 70, 100]):
                self.assertAlmostEqual(actual, expected, places=4)
            mesh = output / model["meshUrl"].split("/")[-1]
            self.assertTrue(valid_stl(mesh))
            stamp = mesh.stat().st_mtime_ns
            subprocess.run(command, check=True, capture_output=True, timeout=90)
            self.assertEqual(mesh.stat().st_mtime_ns, stamp)
            self.assertEqual(file_hash(source), original)
            self.assertEqual(file_hash(mesh), model["meshHash"])
            mesh.write_bytes(b"damaged")
            subprocess.run(command, check=True, capture_output=True, timeout=90)
            self.assertTrue(valid_stl(mesh))
            self.assertEqual(file_hash(source), original)


if __name__ == "__main__":
    unittest.main()
