import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

FRONTEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(FRONTEND / "scripts"))
from native_display_models import native_library_models


class NativeLibraryTests(unittest.TestCase):
    def test_registered_native_asset_is_preserved_and_changed_source_or_mesh_is_rejected(self):
        root = FRONTEND.parent
        registry = json.loads((root / "Equipment/native-display-library.json").read_text(encoding="utf-8"))
        entry = registry["models"][0]
        with tempfile.TemporaryDirectory() as directory:
            test_root = Path(directory)
            source = test_root / entry["source"]
            source.parent.mkdir(parents=True)
            shutil.copyfile(root / entry["source"], source)
            (test_root / "Equipment/native-display-library.json").write_text(json.dumps(registry), encoding="utf-8")
            output = test_root / "assets"
            output.mkdir()
            mesh = output / Path(entry["meshUrl"]).name
            shutil.copyfile(FRONTEND / "public" / entry["meshUrl"].lstrip("/"), mesh)
            self.assertEqual(native_library_models(test_root, output)[0]["status"], "ready")
            original = source.read_bytes()
            source.write_bytes(original + b"changed")
            self.assertNotIn("meshUrl", native_library_models(test_root, output)[0])
            source.write_bytes(original)
            mesh.write_bytes(b"bad")
            self.assertEqual(native_library_models(test_root, output)[0]["status"], "error")


if __name__ == "__main__":
    unittest.main()
