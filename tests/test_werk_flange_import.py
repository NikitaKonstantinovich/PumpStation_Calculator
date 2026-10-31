import importlib.util
from pathlib import Path
import unittest

class RetiredWerkTests(unittest.TestCase):
    def test_import_cannot_restore_retired_offers(self):
        path = Path(__file__).resolve().parents[1] / "scripts/import-werk-flanges.py"
        spec = importlib.util.spec_from_file_location("werk", path)
        werk = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(werk)
        with self.assertRaisesRegex(ValueError, "retired"):
            werk.import_flanges(None, None)

if __name__ == "__main__":
    unittest.main()
