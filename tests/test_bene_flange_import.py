import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location("retired", Path(__file__).resolve().parents[1] / "scripts/import-bene-inox-flanges.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class RetiredBeneTests(unittest.TestCase):
    def test_retired_import_cannot_reactivate_old_offers(self):
        with self.assertRaisesRegex(ValueError, "retired"):
            module.import_flanges(None, None)

if __name__ == "__main__":
    unittest.main()
