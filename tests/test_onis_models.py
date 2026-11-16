"""Identity and rigid mounting tests use measured STEP faces, not catalogue guesses."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest
import tempfile

FRONTEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(FRONTEND/'scripts'))
from model_assets import load_library
from onis_model_geometry import display_frame, dot, cross, transform_point
spec = importlib.util.spec_from_file_location('onis_import', FRONTEND/'scripts/import-onis-models.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)


class OnisModels(unittest.TestCase):
    def test_background_converter_reads_onis_registry_alongside_equipment(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/'frontend/data').mkdir(parents=True)
            (root/'Equipment').mkdir()
            def entry(key, path):
                return dict(key=key, source=path, units='mm', ports=[], warnings=[])
            onis = entry('pump:onis-id', 'Equipment/Pumps/3D_ONIS_Normalized/MH/a.step')
            valve = entry('equipment:valve', 'Equipment/Valves/b.step')
            (root/'frontend/data/onis-model-registry.json').write_text(json.dumps(dict(version=1,models=[onis])))
            (root/'Equipment/model-library.json').write_text(json.dumps(dict(version=1,models=[valve])))
            result = load_library(root)
            self.assertEqual(set(result), {'pump:onis-id','equipment:valve'})
            self.assertEqual(result['pump:onis-id']['source'], onis['source'])

    def test_exact_identity_and_voltage_no_substitution(self):
        pumps = [dict(id='a', manufacturer='ONIS', series='MH', model='MH 1-3', voltage='380'),
                 dict(id='b', manufacturer='ONIS', series='MH', model='MH 1-3', voltage='220'),
                 dict(id='c', manufacturer='ONIS', series='MV', model='MV 32-10-2', voltage='380')]
        self.assertEqual(module.match_pump('MH  1-3 (380V)', pumps)['id'], 'a')
        self.assertIsNone(module.match_pump('MV32-10', pumps))
        self.assertEqual(module.match_pump('MV32-10-2', pumps)['id'], 'c')
        self.assertIsNone(module.match_pump('MV32-10-20', pumps))
        self.assertIsNone(module.identity('MV32-10 backup'))
        with self.assertRaisesRegex(ValueError, 'Ambiguous'):
            module.match_pump('MH1-3', pumps)
        self.assertIsNone(module.match_pump('MV32-10-2', [{**pumps[2], 'manufacturer':'CNP'}]))

    def test_real_cad_orientations_are_rigid_and_keep_mv_flow_unassigned(self):
        rows = json.loads((FRONTEND/'tests/fixtures/onis-cad-faces.json').read_text())
        self.assertEqual(len(rows), 5)
        expected = {'MV1-10.stp': [250, 0, 0], 'MV32-10.stp': [320, 0, 0],
                    'MV90-2.stp': [380, 0, 0], 'MH 1-3 (380V).stp': [72, 0, 90], 'MH10-1 (380V).stp': [72, 0, 118]}
        for row in rows:
            series = row['file'][:2]; f = display_frame(series, row['bounds'], row['candidates'])
            rotation = f['rotation']
            self.assertAlmostEqual(dot(rotation[0], cross(rotation[1], rotation[2])), 1)
            self.assertEqual(f['ports'][0]['point'], [0, 0, 0])
            for a, b in zip(f['ports'][1]['point'], expected[row['file']]):
                self.assertAlmostEqual(a, b)
            self.assertEqual([p['id'] for p in f['ports']], ['port-a', 'port-b'] if series=='MV' else ['inlet','outlet'])
            if series=='MH': self.assertEqual(f['ports'][1]['axis'], [0,0,1])
            # Euclidean distances survive arbitrary translation/rotation, without scale.
            a, b = row['bounds'][:3], row['bounds'][3:]
            import math
            self.assertAlmostEqual(math.dist(a,b), math.dist(transform_point(rotation,f['origin'],a),transform_point(rotation,f['origin'],b)))

    def test_absent_and_ambiguous_nozzles_fail_closed(self):
        for series in ['MV','MH']:
            with self.assertRaises(ValueError): display_frame(series,[0,0,0,100,200,600],[])
        row = json.loads((FRONTEND/'tests/fixtures/onis-cad-faces.json').read_text())[0]
        import copy
        faces = copy.deepcopy(row['candidates'])
        # Duplicate the suction end on a different axis line.
        inlet = next(c for c in faces if c['center']==[0,0,149])
        faces.append({**inlet, 'center':[0,10,149]})
        with self.assertRaisesRegex(ValueError,'ambiguous'):
            display_frame('MH', row['bounds'], faces)


if __name__=='__main__': unittest.main()
