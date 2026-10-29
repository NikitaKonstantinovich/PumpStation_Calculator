import importlib.util
from pathlib import Path
import struct
import sys
import tempfile
import unittest
import json

scripts = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(scripts))
spec = importlib.util.spec_from_file_location("cdm_prepare", scripts / "prepare-cdm-flow-review.py")
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
from model_assets import load_library


class CdmFlowPreparationTests(unittest.TestCase):
    def test_rigid_rotation_preserves_units_winding_and_attributes(self):
        raw = b"test".ljust(80, b" ") + struct.pack("<I12fH", 1, 0,1,0, 0,0,0, -5,0,0, 0,0,3, 42)
        turned = prepare.turn_stl(raw,365)
        values=struct.unpack_from("<12fH",turned,84)
        self.assertEqual(values[:3],(0,-1,0))
        self.assertEqual(values[3:12],(365,0,0,370,0,0,365,0,3))
        self.assertEqual(values[12],42)
        self.assertEqual(turned[:84],raw[:84])
        self.assertEqual(prepare.turn_stl(turned,365),raw)
        with self.assertRaises(ValueError):prepare.turn_stl(raw[:-1],365)

    def test_reviewed_registry_is_used_by_cli_and_background_loader(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); target=root/'frontend/data/cdm-flow-registry.json'; target.parent.mkdir(parents=True)
            row={'key':'pump:371','source':'Equipment/Pumps/3D_FlowVerified/test.step','sourceHash':'a'*64,
                 'units':'mm','mapping':'execution_review','ports':[{'id':'inlet','point':[0,0,0],'axis':[-1,0,0]}],
                 'warnings':['Проверить исполнение'], 'flowReview':{'status':'confirmed_corrected','previousNormalizedHash':'b'*64}}
            target.write_text(json.dumps({'version':1,'models':[row]}),encoding='utf8')
            loaded=load_library(root)['pump:371']
            self.assertEqual(loaded['source'],row['source'])
            self.assertEqual(loaded['flowReview'],row['flowReview'])
            self.assertIn('Проверить исполнение',loaded['warnings'])
            self.assertIn('Монтажная пригодность модели не подтверждена',loaded['warnings'])


if __name__=='__main__':unittest.main()
