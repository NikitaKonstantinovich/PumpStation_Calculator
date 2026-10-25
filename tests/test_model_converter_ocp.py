"""Run with the converter's venv to verify real STEP units and failure handling."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from model_assets import convert_step, valid_stl


@unittest.skipUnless(importlib.util.find_spec("OCP"), "Install services/model-converter/requirements.txt")
class OpenCascadeTests(unittest.TestCase):
    def test_geometry_units_orientation_and_invalid_step(self):
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
        from OCP.gp import gp_Pnt
        with tempfile.TemporaryDirectory(prefix="ocp-mm-") as directory:
            folder = Path(directory)
            source, target = folder / "source.step", folder / "mesh.stl"
            writer = STEPControl_Writer()
            writer.Transfer(BRepPrimAPI_MakeBox(gp_Pnt(10, 20, 30), 40, 50, 60).Shape(), STEPControl_AsIs)
            self.assertEqual(int(writer.Write(str(source))), 1)
            metadata = convert_step(source, target)
            self.assertTrue(valid_stl(target))
            for expected, actual in zip([10, 20, 30, 50, 70, 90], metadata["bounds"]):
                self.assertAlmostEqual(expected, actual, places=4)
            text = source.read_text()
            self.assertIn(".MILLI.,.METRE.", text)
            source.write_text(text.replace(".MILLI.,.METRE.", "$,.METRE."))
            metric = convert_step(source, target)
            for expected, actual in zip([10000, 20000, 30000, 50000, 70000, 90000], metric["bounds"]):
                self.assertAlmostEqual(expected, actual, places=3)
            source.write_text("ISO-10303-21; broken STEP")
            with self.assertRaisesRegex(ValueError, "прочитать STEP"):
                convert_step(source, target)


if __name__ == "__main__":
    unittest.main()
